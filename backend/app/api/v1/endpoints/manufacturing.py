from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func, or_
from typing import Any, List, Optional
from decimal import Decimal

from app.api import deps
from app.models.core import Currency, ExchangeRate, Facility, User
from app.models.inventory import (
    Warehouse,
    Product,
    ProductVariant,
    ProductFacilityPrice,
    InventorySnapshot,
    Category,
)
from app.models.manufacturing import (
    WorkCenter,
    BOMHeader,
    BOMInput,
    BOMOutput,
    ProductionPlan,
    ProductionOrder,
)
from app.schemas.manufacturing import (
    WorkCenterCreate,
    WorkCenterUpdate,
    WorkCenterResponse,
    BOMHeaderCreate,
    BOMHeaderUpdate,
    BOMHeaderResponse,
    BOMInputResponse,
    BOMOutputResponse,
    SimulateCostRequest,
    AdHocOrderInputCreate,
    AdHocOrderOutputCreate,
    SaveOrderAsBOMRequest,
    ExplodePreviewRequest,
    ProductionOrderCreate,
    CompleteOrderRequest,
    ButcherySimulateSettlementRequest,
)

router = APIRouter()


def get_active_bcv_rate(db: Session, override_rate: Optional[float] = None) -> dict:
    """
    Obtiene la tasa de cambio activa en Bs/USD desde core.currencies / core.exchange_rates.
    """
    if override_rate and override_rate > 0:
        return {"rate": float(override_rate), "effective_date": None, "currency_code": "VES"}

    ves = db.query(Currency).filter(Currency.code == "VES").first()
    if ves:
        latest = (
            db.query(ExchangeRate)
            .filter(ExchangeRate.currency_id == ves.id)
            .order_by(ExchangeRate.effective_date.desc(), ExchangeRate.id.desc())
            .first()
        )
        rate_val = float(ves.exchange_rate) if ves.exchange_rate and float(ves.exchange_rate) > 0 else (
            float(latest.rate) if latest and float(latest.rate) > 0 else 40.0
        )
        eff_date = latest.effective_date.isoformat() if latest and latest.effective_date else None
        return {"rate": rate_val, "effective_date": eff_date, "currency_code": "VES"}

    return {"rate": 40.0, "effective_date": None, "currency_code": "VES"}


def get_variant_unit_cost_usd(db: Session, variant: ProductVariant, facility_id: Optional[int] = None) -> float:
    """
    Obtiene el costo unitario en USD de una variante priorizando:
    1) InventorySnapshot (replacement_cost -> current_cost -> avg_cost) de la sede si existe
    2) ProductVariant (replacement_cost -> average_cost -> standard_cost -> last_cost)
    """
    if not variant:
        return 0.0

    if facility_id:
        snap = (
            db.query(InventorySnapshot)
            .filter(
                InventorySnapshot.variant_id == variant.id,
                InventorySnapshot.facility_id == facility_id,
            )
            .first()
        )
        if snap:
            for val in [snap.replacement_cost, snap.current_cost, snap.avg_cost]:
                if val is not None and float(val) > 0:
                    return float(val)

    for val in [variant.replacement_cost, variant.average_cost, variant.standard_cost, variant.last_cost]:
        if val is not None and float(val) > 0:
            return float(val)

    # Si no tiene costo cargado pero tiene precio de venta, estimar 60% del PVP como fallback seguro para simulación
    if variant.sales_price and float(variant.sales_price) > 0:
        return round(float(variant.sales_price) * 0.60, 4)

    return 0.0


def get_variant_sales_price_usd(db: Session, variant: ProductVariant, facility_id: Optional[int] = None) -> float:
    """
    Obtiene el PVP actual en USD desde inv.product_facility_prices o inv.product_variants.sales_price.
    """
    if not variant:
        return 0.0

    if facility_id:
        fp = (
            db.query(ProductFacilityPrice)
            .filter(
                ProductFacilityPrice.variant_id == variant.id,
                ProductFacilityPrice.facility_id == facility_id,
                ProductFacilityPrice.is_active == True,
            )
            .first()
        )
        if fp and fp.sales_price and float(fp.sales_price) > 0:
            return float(fp.sales_price)

    # Si no se especificó sede, buscar si hay algún precio de sucursal activo o usar sales_price maestro
    if variant.sales_price and float(variant.sales_price) > 0:
        return float(variant.sales_price)

    any_fp = (
        db.query(ProductFacilityPrice)
        .filter(
            ProductFacilityPrice.variant_id == variant.id,
            ProductFacilityPrice.is_active == True,
        )
        .first()
    )
    if any_fp and any_fp.sales_price and float(any_fp.sales_price) > 0:
        return float(any_fp.sales_price)

    return 0.0


def simulate_bom_cost_calculation(db: Session, req: SimulateCostRequest) -> dict:
    """
    Motor de Simulación Bimonetaria en Vivo (USD y Bs.):
    Soporta tanto Fórmulas Convergentes (Panadería / Gastronomía N -> 1)
    como Plantillas Divergentes de Desposte Cárnico (1 -> N bajo NIC 2).
    """
    rate_info = get_active_bcv_rate(db, req.exchange_rate_override)
    rate = rate_info["rate"]

    work_center = None
    facility_id = req.facility_id
    if req.work_center_id:
        work_center = db.query(WorkCenter).filter(WorkCenter.id == req.work_center_id).first()
        if work_center and not facility_id:
            facility_id = work_center.facility_id

    primary_variant = None
    if req.primary_product_variant_id:
        primary_variant = (
            db.query(ProductVariant)
            .options(selectinload(ProductVariant.product))
            .filter(ProductVariant.id == req.primary_product_variant_id)
            .first()
        )

    direct_material_net_cost_usd = 0.0
    scrap_cleaning_cost_usd = 0.0
    packaging_cost_usd = 0.0
    semi_finished_cost_usd = 0.0
    total_input_mass_base = 0.0
    flour_base_qty = 0.0

    def _recipe_mass_kg(qty: float, uom: str, conv_factor: float) -> float:
        u = (uom or "KG").strip().upper()
        if u in ("G", "ML", "GR"):
            return qty * 0.001
        if u in ("KG", "LT", "L"):
            return qty
        return qty * conv_factor

    # Primero detectar masa de harina base (100% panadero) si aplica
    for inp in req.inputs:
        if inp.bakers_percentage and abs(float(inp.bakers_percentage) - 100.0) < 0.01:
            flour_base_qty += _recipe_mass_kg(
                float(inp.quantity or 0.0),
                inp.recipe_uom,
                float(inp.conversion_factor_to_base or 1.0),
            )

    input_Breakdown = []
    for inp in req.inputs:
        comp_var = (
            db.query(ProductVariant)
            .options(selectinload(ProductVariant.product))
            .filter(ProductVariant.id == inp.component_variant_id)
            .first()
        )
        unit_cost_usd = (
            float(inp.unit_cost_override_usd)
            if inp.unit_cost_override_usd is not None and inp.unit_cost_override_usd >= 0
            else get_variant_unit_cost_usd(db, comp_var, facility_id)
        )
        conv = float(inp.conversion_factor_to_base or 1.0)
        net_qty_base = float(inp.quantity or 0.0) * conv

        scrap_pct = max(0.0, min(95.0, float(inp.scrap_tolerance_pct or 0.0)))
        scrap_divisor = 1.0 - (scrap_pct / 100.0)
        gross_qty_base = net_qty_base / scrap_divisor if scrap_divisor > 0 else net_qty_base
        scrap_extra_qty = gross_qty_base - net_qty_base

        net_cost_usd = net_qty_base * unit_cost_usd
        scrap_cost_line_usd = scrap_extra_qty * unit_cost_usd
        line_total_usd = gross_qty_base * unit_cost_usd

        role = (inp.input_role or "INGREDIENT").upper()
        if role == "PACKAGING":
            packaging_cost_usd += line_total_usd
        elif role == "SEMI_FINISHED":
            semi_finished_cost_usd += net_cost_usd
            scrap_cleaning_cost_usd += scrap_cost_line_usd
            total_input_mass_base += gross_qty_base
        else:
            direct_material_net_cost_usd += net_cost_usd
            scrap_cleaning_cost_usd += scrap_cost_line_usd
            total_input_mass_base += gross_qty_base

        calc_bakers_pct = inp.bakers_percentage
        if calc_bakers_pct is None and flour_base_qty > 0 and role != "PACKAGING":
            inp_mass_kg = _recipe_mass_kg(float(inp.quantity or 0.0), inp.recipe_uom, conv)
            calc_bakers_pct = round((inp_mass_kg / flour_base_qty) * 100.0, 2)

        input_Breakdown.append({
            "component_variant_id": inp.component_variant_id,
            "component_sku": comp_var.sku if comp_var else f"VAR-{inp.component_variant_id}",
            "component_name": comp_var.product.name if comp_var and comp_var.product else "Insumo",
            "component_uom_base": comp_var.product.uom_base if comp_var and comp_var.product else inp.recipe_uom,
            "input_role": role,
            "quantity": round(float(inp.quantity), 4),
            "recipe_uom": inp.recipe_uom,
            "conversion_factor_to_base": conv,
            "net_qty_base": round(net_qty_base, 4),
            "scrap_tolerance_pct": round(scrap_pct, 2),
            "gross_qty_base": round(gross_qty_base, 4),
            "bakers_percentage": calc_bakers_pct,
            "unit_cost_usd": round(unit_cost_usd, 4),
            "unit_cost_ves": round(unit_cost_usd * rate, 2),
            "net_cost_usd": round(net_cost_usd, 4),
            "scrap_cost_usd": round(scrap_cost_line_usd, 4),
            "line_cost_usd": round(line_total_usd, 4),
            "line_cost_ves": round(line_total_usd * rate, 2),
        })

    # Mano de Obra Directa (MOD) y Costos Indirectos de Fabricación (CIF)
    labor_hours = max(0.0, float(req.standard_labor_hours or 0.0))
    hourly_labor_rate = float(work_center.hourly_labor_rate) if work_center and work_center.hourly_labor_rate else 0.0
    hourly_overhead_rate = float(work_center.hourly_overhead_rate) if work_center and work_center.hourly_overhead_rate else 0.0
    overhead_per_kg = float(work_center.overhead_per_kg) if work_center and work_center.overhead_per_kg else 0.0

    direct_labor_cost_usd = labor_hours * hourly_labor_rate
    # Para el CIF por kg usamos la masa procesada o base_qty
    mass_for_cif = total_input_mass_base if total_input_mass_base > 0 else max(0.0, float(req.base_qty or 1.0))
    indirect_overhead_cost_usd = (labor_hours * hourly_overhead_rate) + (mass_for_cif * overhead_per_kg)

    total_batch_cost_usd = (
        direct_material_net_cost_usd
        + semi_finished_cost_usd
        + scrap_cleaning_cost_usd
        + packaging_cost_usd
        + direct_labor_cost_usd
        + indirect_overhead_cost_usd
    )
    total_batch_cost_ves = total_batch_cost_usd * rate

    base_qty = max(0.0001, float(req.base_qty or 1.0))
    expected_shrinkage_pct = max(0.0, min(95.0, float(req.expected_shrinkage_pct or 0.0)))

    # Merma térmica / natural (NIC 2):
    # En recetas convergentes (Panadería / Gastronomía), la merma de cocción/horneado
    # reduce el rendimiento neto de unidades/kg buenos (effective_good_qty = base_qty * (1 - merma)),
    # por lo que las unidades buenas absorben orgánicamente el costo de la merma natural.
    if req.bom_type == "CONVERGENT_RECIPE":
        effective_good_qty = max(0.0001, base_qty * (1.0 - expected_shrinkage_pct / 100.0))
    else:
        effective_good_qty = base_qty

    cost_before_thermal_shrinkage_unit_usd = total_batch_cost_usd / base_qty
    unit_cost_usd = total_batch_cost_usd / effective_good_qty
    thermal_shrinkage_impact_unit_usd = max(0.0, unit_cost_usd - cost_before_thermal_shrinkage_unit_usd)
    unit_cost_ves = unit_cost_usd * rate

    current_pvp_usd = get_variant_sales_price_usd(db, primary_variant, facility_id) if primary_variant else 0.0
    current_pvp_ves = current_pvp_usd * rate

    gross_margin_pct = 0.0
    gross_profit_unit_usd = 0.0
    if current_pvp_usd > 0:
        gross_profit_unit_usd = current_pvp_usd - unit_cost_usd
        gross_margin_pct = round((gross_profit_unit_usd / current_pvp_usd) * 100.0, 2)

    # Si es DIVERGENT_DISASSEMBLY (Sala de Desposte 1 -> N) o tiene múltiples salidas en outputs:
    outputs_breakdown = []
    byproduct_credit_usd = 0.0
    total_market_value_coproducts_usd = 0.0
    total_coproducts_weight = 0.0

    # Primera pasada de salidas para calcular créditos de subproductos (BY_PRODUCT) y valor de mercado total
    temp_outputs = []
    for out in req.outputs:
        out_var = (
            db.query(ProductVariant)
            .options(selectinload(ProductVariant.product))
            .filter(ProductVariant.id == out.output_variant_id)
            .first()
        )
        pvp_ref = (
            float(out.standard_reference_price)
            if out.standard_reference_price is not None and float(out.standard_reference_price) > 0
            else get_variant_sales_price_usd(db, out_var, facility_id)
        )
        exp_qty = float(out.expected_qty or 0.0)
        out_type = (out.output_type or "PRIMARY_PRODUCT").upper()
        method = (out.cost_allocation_method or "MARKET_VALUE_INDEX").upper()
        weight_factor = float(getattr(out, "cost_allocation_factor", 1.0) or 1.0) * float(out.expected_yield_pct or 100.0)

        if out_type == "BY_PRODUCT" or method == "FIXED_NRV":
            byproduct_credit_usd += exp_qty * pvp_ref
        else:
            total_market_value_coproducts_usd += exp_qty * pvp_ref
            total_coproducts_weight += weight_factor

        temp_outputs.append((out, out_var, pvp_ref, exp_qty, out_type, method, weight_factor))

    joint_cost_to_allocate_usd = max(0.0, total_batch_cost_usd - byproduct_credit_usd)
    num_coproducts = sum(1 for x in temp_outputs if not (x[4] == "BY_PRODUCT" or x[5] == "FIXED_NRV"))

    for out, out_var, pvp_ref, exp_qty, out_type, method, weight_factor in temp_outputs:
        market_val = exp_qty * pvp_ref
        if out_type == "BY_PRODUCT" or method == "FIXED_NRV":
            alloc_pct = 0.0
            alloc_total_usd = market_val
            alloc_unit_usd = pvp_ref
        else:
            if method != "PERCENTAGE" and total_market_value_coproducts_usd > 0:
                alloc_pct = (market_val / total_market_value_coproducts_usd) * 100.0
            elif total_coproducts_weight > 0:
                alloc_pct = (weight_factor / total_coproducts_weight) * 100.0
            else:
                alloc_pct = (100.0 / num_coproducts) if num_coproducts > 0 else 100.0
            alloc_total_usd = joint_cost_to_allocate_usd * (alloc_pct / 100.0)
            # En recetas convergentes con 1 salida primaria, considerar el rendimiento neto tras merma térmica
            effective_out_qty = (
                effective_good_qty
                if (req.bom_type == "CONVERGENT_RECIPE" and num_coproducts == 1)
                else exp_qty
            )
            alloc_unit_usd = (alloc_total_usd / effective_out_qty) if effective_out_qty > 0 else 0.0

        out_margin_pct = round(((pvp_ref - alloc_unit_usd) / pvp_ref) * 100.0, 2) if pvp_ref > 0 else 0.0

        outputs_breakdown.append({
            "output_variant_id": out.output_variant_id,
            "output_sku": out_var.sku if out_var else f"VAR-{out.output_variant_id}",
            "output_name": out_var.product.name if out_var and out_var.product else "Corte / Producto",
            "output_type": out_type,
            "expected_qty": round(exp_qty, 4),
            "uom_id": out.uom_id,
            "expected_yield_pct": round(float(out.expected_yield_pct or 0.0), 3),
            "cost_allocation_method": out.cost_allocation_method,
            "reference_price_usd": round(pvp_ref, 4),
            "reference_price_ves": round(pvp_ref * rate, 2),
            "market_value_usd": round(market_val, 4),
            "cost_allocation_pct": round(alloc_pct, 4),
            "allocated_total_cost_usd": round(alloc_total_usd, 4),
            "allocated_total_cost_ves": round(alloc_total_usd * rate, 2),
            "calculated_unit_cost_usd": round(alloc_unit_usd, 4),
            "calculated_unit_cost_ves": round(alloc_unit_usd * rate, 2),
            "projected_margin_pct": out_margin_pct,
        })

    # Si es DIVERGENT_DISASSEMBLY y tiene outputs, calcular el margen global sobre el valor comercial total generado
    total_commercial_value_usd = total_market_value_coproducts_usd + byproduct_credit_usd
    if req.bom_type == "DIVERGENT_DISASSEMBLY" and total_commercial_value_usd > 0:
        gross_margin_pct = round(
            ((total_commercial_value_usd - total_batch_cost_usd) / total_commercial_value_usd) * 100.0, 2
        )

    total_output_yield_pct = (
        sum(float(o.expected_yield_pct or 0.0) for o in req.outputs)
        if (req.bom_type == "DIVERGENT_DISASSEMBLY" and req.outputs)
        else (100.0 - expected_shrinkage_pct)
    )

    return {
        "exchange_rate": round(rate, 4),
        "exchange_rate_effective_date": rate_info["effective_date"],
        "bom_type": req.bom_type,
        "base_qty": round(base_qty, 4),
        "effective_good_qty": round(effective_good_qty, 4),
        "uom_id": req.uom_id,
        "expected_shrinkage_pct": round(expected_shrinkage_pct, 2),
        "cost_buckets": {
            "direct_materials_usd": round(direct_material_net_cost_usd, 4),
            "direct_materials_ves": round(direct_material_net_cost_usd * rate, 2),
            "semi_finished_usd": round(semi_finished_cost_usd, 4),
            "semi_finished_ves": round(semi_finished_cost_usd * rate, 2),
            "scrap_cleaning_usd": round(scrap_cleaning_cost_usd, 4),
            "scrap_cleaning_ves": round(scrap_cleaning_cost_usd * rate, 2),
            "packaging_usd": round(packaging_cost_usd, 4),
            "packaging_ves": round(packaging_cost_usd * rate, 2),
            "direct_labor_mod_usd": round(direct_labor_cost_usd, 4),
            "direct_labor_mod_ves": round(direct_labor_cost_usd * rate, 2),
            "indirect_overhead_cif_usd": round(indirect_overhead_cost_usd, 4),
            "indirect_overhead_cif_ves": round(indirect_overhead_cost_usd * rate, 2),
            "byproduct_credit_usd": round(byproduct_credit_usd, 4),
            "byproduct_credit_ves": round(byproduct_credit_usd * rate, 2),
            "joint_cost_to_allocate_usd": round(joint_cost_to_allocate_usd, 4),
            "joint_cost_to_allocate_ves": round(joint_cost_to_allocate_usd * rate, 2),
        },
        "totals": {
            "batch_cost_usd": round(total_batch_cost_usd, 4),
            "batch_cost_ves": round(total_batch_cost_ves, 2),
            "effective_good_qty": round(effective_good_qty, 4),
            "cost_before_thermal_shrinkage_unit_usd": round(cost_before_thermal_shrinkage_unit_usd, 4),
            "unit_cost_usd": round(unit_cost_usd, 4),
            "unit_cost_ves": round(unit_cost_ves, 2),
            "thermal_shrinkage_impact_unit_usd": round(thermal_shrinkage_impact_unit_usd, 4),
            "current_pvp_usd": round(current_pvp_usd, 4),
            "current_pvp_ves": round(current_pvp_ves, 2),
            "gross_profit_unit_usd": round(gross_profit_unit_usd, 4),
            "gross_margin_pct": gross_margin_pct,
            "total_commercial_value_usd": round(total_commercial_value_usd, 4),
            "total_commercial_value_ves": round(total_commercial_value_usd * rate, 2),
            "total_output_yield_pct": round(total_output_yield_pct, 3),
        },
        "inputs_breakdown": input_Breakdown,
        "outputs_breakdown": outputs_breakdown,
    }


def serialize_bom(db: Session, bom: BOMHeader) -> dict:
    """
    Serializa un BOMHeader con su simulación de costos en vivo adjunta.
    """
    sim_req = SimulateCostRequest(
        bom_type=bom.bom_type,
        work_center_id=bom.work_center_id,
        primary_product_variant_id=bom.primary_product_variant_id,
        facility_id=bom.work_center.facility_id if bom.work_center else None,
        base_qty=float(bom.base_qty or 1.0),
        uom_id=bom.uom_id,
        expected_shrinkage_pct=float(bom.expected_shrinkage_pct or 0.0),
        standard_labor_hours=float(bom.standard_labor_hours or 0.0),
        inputs=[
            {
                "component_variant_id": i.component_variant_id,
                "input_role": i.input_role,
                "quantity": float(i.quantity),
                "recipe_uom": i.recipe_uom,
                "conversion_factor_to_base": float(i.conversion_factor_to_base or 1.0),
                "bakers_percentage": float(i.bakers_percentage) if i.bakers_percentage is not None else None,
                "scrap_tolerance_pct": float(i.scrap_tolerance_pct or 0.0),
            }
            for i in bom.inputs
        ],
        outputs=[
            {
                "output_variant_id": o.output_variant_id,
                "output_type": o.output_type,
                "expected_qty": float(o.expected_qty),
                "uom_id": o.uom_id,
                "expected_yield_pct": float(o.expected_yield_pct or 100.0),
                "cost_allocation_method": o.cost_allocation_method,
                "standard_reference_price": float(o.standard_reference_price) if o.standard_reference_price is not None else None,
                "cost_allocation_factor": float(o.cost_allocation_factor or 1.0),
            }
            for o in bom.outputs
        ],
    )
    sim = simulate_bom_cost_calculation(db, sim_req)

    inputs_enriched = []
    for idx, i in enumerate(bom.inputs):
        b_line = sim["inputs_breakdown"][idx] if idx < len(sim["inputs_breakdown"]) else {}
        inputs_enriched.append({
            "id": i.id,
            "bom_id": i.bom_id,
            "component_variant_id": i.component_variant_id,
            "component_sku": b_line.get("component_sku"),
            "component_name": b_line.get("component_name"),
            "component_uom_base": b_line.get("component_uom_base"),
            "input_role": i.input_role,
            "quantity": float(i.quantity),
            "recipe_uom": i.recipe_uom,
            "conversion_factor_to_base": float(i.conversion_factor_to_base or 1.0),
            "bakers_percentage": float(i.bakers_percentage) if i.bakers_percentage is not None else b_line.get("bakers_percentage"),
            "scrap_tolerance_pct": float(i.scrap_tolerance_pct or 0.0),
            "is_fixed_qty": i.is_fixed_qty,
            "backflush": i.backflush,
            "unit_cost_usd": b_line.get("unit_cost_usd", 0.0),
            "unit_cost_ves": b_line.get("unit_cost_ves", 0.0),
            "gross_qty_base": b_line.get("gross_qty_base", 0.0),
            "line_cost_usd": b_line.get("line_cost_usd", 0.0),
            "line_cost_ves": b_line.get("line_cost_ves", 0.0),
        })

    outputs_enriched = []
    for idx, o in enumerate(bom.outputs):
        o_line = sim["outputs_breakdown"][idx] if idx < len(sim["outputs_breakdown"]) else {}
        outputs_enriched.append({
            "id": o.id,
            "bom_id": o.bom_id,
            "output_variant_id": o.output_variant_id,
            "output_sku": o_line.get("output_sku"),
            "output_name": o_line.get("output_name"),
            "output_type": o.output_type,
            "expected_qty": float(o.expected_qty),
            "uom_id": o.uom_id,
            "expected_yield_pct": float(o.expected_yield_pct or 0.0),
            "cost_allocation_method": o.cost_allocation_method,
            "standard_reference_price": float(o.standard_reference_price) if o.standard_reference_price is not None else o_line.get("reference_price_usd"),
            "cost_allocation_factor": float(o.cost_allocation_factor or 1.0),
            "current_sales_price_usd": o_line.get("reference_price_usd", 0.0),
            "calculated_unit_cost_usd": o_line.get("calculated_unit_cost_usd", 0.0),
            "calculated_unit_cost_ves": o_line.get("calculated_unit_cost_ves", 0.0),
            "allocated_total_cost_usd": o_line.get("allocated_total_cost_usd", 0.0),
            "cost_allocation_pct": o_line.get("cost_allocation_pct", 0.0),
            "projected_margin_pct": o_line.get("projected_margin_pct", 0.0),
        })

    return {
        "id": bom.id,
        "code": bom.code,
        "name": bom.name,
        "bom_type": bom.bom_type,
        "sector": bom.sector,
        "work_center_id": bom.work_center_id,
        "work_center_name": bom.work_center.name if bom.work_center else None,
        "primary_product_variant_id": bom.primary_product_variant_id,
        "primary_product_sku": bom.primary_variant.sku if bom.primary_variant else None,
        "primary_product_name": bom.primary_variant.product.name if bom.primary_variant and bom.primary_variant.product else None,
        "primary_product_price_usd": sim["totals"]["current_pvp_usd"],
        "total_commercial_value_usd": sim["totals"]["total_commercial_value_usd"],
        "effective_good_qty": sim["totals"]["effective_good_qty"],
        "base_qty": float(bom.base_qty),
        "uom_id": bom.uom_id,
        "expected_shrinkage_pct": float(bom.expected_shrinkage_pct or 0.0),
        "max_allowed_shrinkage_pct": float(bom.max_allowed_shrinkage_pct or 0.0),
        "standard_labor_hours": float(bom.standard_labor_hours or 0.0),
        "shelf_life_days": bom.shelf_life_days,
        "instructions": bom.instructions,
        "is_active": bom.is_active,
        "created_at": bom.created_at,
        "estimated_batch_cost_usd": sim["totals"]["batch_cost_usd"],
        "estimated_batch_cost_ves": sim["totals"]["batch_cost_ves"],
        "estimated_unit_cost_usd": sim["totals"]["unit_cost_usd"],
        "estimated_unit_cost_ves": sim["totals"]["unit_cost_ves"],
        "estimated_margin_pct": sim["totals"]["gross_margin_pct"],
        "cost_simulation": sim,
        "inputs": inputs_enriched,
        "outputs": outputs_enriched,
    }


# ==============================================================================
# 0. INFRAESTRUCTURA DE SEDES, ALMACENES Y ESTACIONES (/api/v1/mfg/facilities-and-warehouses)
# ==============================================================================
@router.get("/facilities-and-warehouses")
@router.get("/facilities-options")
def get_mfg_facilities_and_warehouses(
    db: Session = Depends(deps.get_db),
) -> Any:
    from app.services.production_service import ProductionService

    ProductionService.ensure_mfg_wms_infrastructure(db, commit=True)

    facilities = db.query(Facility).order_by(Facility.id.asc()).all()
    fac_map = {f.id: f.name for f in facilities}
    warehouses = (
        db.query(Warehouse)
        .filter(Warehouse.code != "VIRTUAL")
        .order_by(Warehouse.facility_id.asc(), Warehouse.id.asc())
        .all()
    )
    work_centers = (
        db.query(WorkCenter)
        .options(
            selectinload(WorkCenter.facility),
            selectinload(WorkCenter.warehouse_wip),
            selectinload(WorkCenter.boms),
        )
        .order_by(WorkCenter.facility_id.asc(), WorkCenter.id.asc())
        .all()
    )

    return {
        "facilities": [
            {
                "id": f.id,
                "code": f.code,
                "name": f.name,
                "is_active": bool(f.is_active) if f.is_active is not None else True,
            }
            for f in facilities
        ],
        "warehouses": [
            {
                "id": w.id,
                "facility_id": w.facility_id,
                "facility_name": fac_map.get(w.facility_id, f"Sucursal #{w.facility_id}"),
                "code": w.code,
                "name": w.name,
                "is_scrap": bool(w.is_scrap),
                "is_scrap_warehouse": bool(w.is_scrap),
            }
            for w in warehouses
        ],
        "work_centers": [
            {
                "id": wc.id,
                "facility_id": wc.facility_id,
                "facility_name": wc.facility.name if wc.facility else f"Sucursal #{wc.facility_id}",
                "warehouse_wip_id": wc.warehouse_wip_id,
                "warehouse_wip_name": wc.warehouse_wip.name if wc.warehouse_wip else None,
                "code": wc.code,
                "name": wc.name,
                "sector": wc.sector,
                "capacity_per_batch": float(wc.capacity_per_batch or 0),
                "capacity_uom": wc.capacity_uom or "KG",
                "hourly_labor_rate": float(wc.hourly_labor_rate or 0),
                "hourly_overhead_rate": float(wc.hourly_overhead_rate or 0),
                "overhead_per_kg": float(wc.overhead_per_kg or 0),
                "is_active": bool(wc.is_active),
                "boms_count": len(wc.boms) if wc.boms else 0,
            }
            for wc in work_centers
        ],
    }


# ==============================================================================
# 1. CENTROS DE TRABAJO (/api/v1/mfg/work-centers)
# ==============================================================================
@router.get("/work-centers", response_model=List[WorkCenterResponse])
def list_work_centers(
    sector: Optional[str] = None,
    facility_id: Optional[int] = None,
    active_only: bool = False,
    db: Session = Depends(deps.get_db),
) -> Any:
    from app.services.production_service import ProductionService

    ProductionService.ensure_mfg_wms_infrastructure(db, commit=True)

    query = db.query(WorkCenter).options(
        selectinload(WorkCenter.facility),
        selectinload(WorkCenter.warehouse_wip),
        selectinload(WorkCenter.boms),
    )
    if sector:
        query = query.filter(WorkCenter.sector == sector)
    if facility_id:
        query = query.filter(WorkCenter.facility_id == facility_id)
    if active_only:
        query = query.filter(WorkCenter.is_active == True)

    centers = query.order_by(WorkCenter.id.asc()).all()
    result = []
    for wc in centers:
        result.append({
            "id": wc.id,
            "facility_id": wc.facility_id,
            "facility_name": wc.facility.name if wc.facility else "Sede Principal",
            "warehouse_wip_id": wc.warehouse_wip_id,
            "warehouse_wip_name": wc.warehouse_wip.name if wc.warehouse_wip else None,
            "code": wc.code,
            "name": wc.name,
            "sector": wc.sector,
            "capacity_per_batch": float(wc.capacity_per_batch or 0),
            "capacity_uom": wc.capacity_uom or "KG",
            "hourly_labor_rate": float(wc.hourly_labor_rate or 0),
            "hourly_overhead_rate": float(wc.hourly_overhead_rate or 0),
            "overhead_per_kg": float(wc.overhead_per_kg or 0),
            "is_active": wc.is_active,
            "boms_count": len(wc.boms) if wc.boms else 0,
            "created_at": wc.created_at,
        })
    return result


@router.post("/work-centers", response_model=WorkCenterResponse)
def create_work_center(
    *,
    db: Session = Depends(deps.get_db),
    wc_in: WorkCenterCreate,
) -> Any:
    existing = db.query(WorkCenter).filter(WorkCenter.code == wc_in.code.strip().upper()).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Ya existe un Centro de Trabajo con el código {wc_in.code}")

    fac = db.query(Facility).filter(Facility.id == wc_in.facility_id).first()
    if not fac:
        fac = db.query(Facility).order_by(Facility.id.asc()).first()
    wh = db.query(Warehouse).filter(Warehouse.id == wc_in.warehouse_wip_id).first() if wc_in.warehouse_wip_id else None

    wc = WorkCenter(
        facility_id=fac.id if fac else wc_in.facility_id,
        warehouse_wip_id=wh.id if wh else None,
        code=wc_in.code.strip().upper(),
        name=wc_in.name.strip(),
        sector=wc_in.sector.strip().upper(),
        capacity_per_batch=Decimal(str(wc_in.capacity_per_batch)),
        capacity_uom=wc_in.capacity_uom.strip().upper(),
        hourly_labor_rate=Decimal(str(wc_in.hourly_labor_rate)),
        hourly_overhead_rate=Decimal(str(wc_in.hourly_overhead_rate)),
        overhead_per_kg=Decimal(str(wc_in.overhead_per_kg)),
        is_active=wc_in.is_active,
    )
    db.add(wc)
    db.commit()
    db.refresh(wc)
    return {
        "id": wc.id,
        "facility_id": wc.facility_id,
        "facility_name": wc.facility.name if wc.facility else None,
        "warehouse_wip_id": wc.warehouse_wip_id,
        "warehouse_wip_name": wc.warehouse_wip.name if wc.warehouse_wip else None,
        "code": wc.code,
        "name": wc.name,
        "sector": wc.sector,
        "capacity_per_batch": float(wc.capacity_per_batch or 0),
        "capacity_uom": wc.capacity_uom,
        "hourly_labor_rate": float(wc.hourly_labor_rate or 0),
        "hourly_overhead_rate": float(wc.hourly_overhead_rate or 0),
        "overhead_per_kg": float(wc.overhead_per_kg or 0),
        "is_active": wc.is_active,
        "boms_count": 0,
        "created_at": wc.created_at,
    }


@router.put("/work-centers/{wc_id}", response_model=WorkCenterResponse)
def update_work_center(
    *,
    db: Session = Depends(deps.get_db),
    wc_id: int,
    wc_in: WorkCenterUpdate,
) -> Any:
    wc = db.query(WorkCenter).filter(WorkCenter.id == wc_id).first()
    if not wc:
        raise HTTPException(status_code=404, detail="Centro de Trabajo no encontrado")

    update_data = wc_in.model_dump(exclude_unset=True)
    if "code" in update_data and update_data["code"]:
        update_data["code"] = update_data["code"].strip().upper()
        dup = db.query(WorkCenter).filter(WorkCenter.code == update_data["code"], WorkCenter.id != wc_id).first()
        if dup:
            raise HTTPException(status_code=400, detail=f"El código {update_data['code']} ya está en uso")

    for field, value in update_data.items():
        setattr(wc, field, value)

    db.add(wc)
    db.commit()
    db.refresh(wc)
    return {
        "id": wc.id,
        "facility_id": wc.facility_id,
        "facility_name": wc.facility.name if wc.facility else None,
        "warehouse_wip_id": wc.warehouse_wip_id,
        "warehouse_wip_name": wc.warehouse_wip.name if wc.warehouse_wip else None,
        "code": wc.code,
        "name": wc.name,
        "sector": wc.sector,
        "capacity_per_batch": float(wc.capacity_per_batch or 0),
        "capacity_uom": wc.capacity_uom,
        "hourly_labor_rate": float(wc.hourly_labor_rate or 0),
        "hourly_overhead_rate": float(wc.hourly_overhead_rate or 0),
        "overhead_per_kg": float(wc.overhead_per_kg or 0),
        "is_active": wc.is_active,
        "boms_count": len(wc.boms) if wc.boms else 0,
        "created_at": wc.created_at,
    }


@router.delete("/work-centers/{wc_id}")
def delete_work_center(
    *,
    db: Session = Depends(deps.get_db),
    wc_id: int,
) -> Any:
    wc = db.query(WorkCenter).filter(WorkCenter.id == wc_id).first()
    if not wc:
        raise HTTPException(status_code=404, detail="Centro de Trabajo no encontrado")

    if wc.boms and len(wc.boms) > 0:
        wc.is_active = False
        db.add(wc)
        db.commit()
        return {"message": "Centro de trabajo desactivado porque posee recetas asociadas.", "deactivated": True}

    db.delete(wc)
    db.commit()
    return {"message": "Centro de trabajo eliminado exitosamente", "deleted": True}


# ==============================================================================
# 2. FÓRMULAS / RECETAS / ESCANDALLOS (/api/v1/mfg/boms)
# ==============================================================================
@router.get("/boms")
def list_boms(
    sector: Optional[str] = None,
    bom_type: Optional[str] = None,
    work_center_id: Optional[int] = None,
    search: Optional[str] = None,
    db: Session = Depends(deps.get_db),
) -> Any:
    query = db.query(BOMHeader).options(
        selectinload(BOMHeader.work_center),
        selectinload(BOMHeader.primary_variant).selectinload(ProductVariant.product),
        selectinload(BOMHeader.inputs).selectinload(BOMInput.component_variant).selectinload(ProductVariant.product),
        selectinload(BOMHeader.outputs).selectinload(BOMOutput.output_variant).selectinload(ProductVariant.product),
    )
    if sector:
        query = query.filter(BOMHeader.sector == sector)
    if bom_type:
        query = query.filter(BOMHeader.bom_type == bom_type)
    if work_center_id:
        query = query.filter(BOMHeader.work_center_id == work_center_id)
    if search:
        s = f"%{search.strip()}%"
        query = query.filter(or_(BOMHeader.name.ilike(s), BOMHeader.code.ilike(s)))

    boms = query.order_by(BOMHeader.id.desc()).all()
    return [serialize_bom(db, b) for b in boms]


@router.get("/boms/{bom_id}")
def get_bom(
    bom_id: int,
    db: Session = Depends(deps.get_db),
) -> Any:
    bom = (
        db.query(BOMHeader)
        .options(
            selectinload(BOMHeader.work_center),
            selectinload(BOMHeader.primary_variant).selectinload(ProductVariant.product),
            selectinload(BOMHeader.inputs).selectinload(BOMInput.component_variant).selectinload(ProductVariant.product),
            selectinload(BOMHeader.outputs).selectinload(BOMOutput.output_variant).selectinload(ProductVariant.product),
        )
        .filter(BOMHeader.id == bom_id)
        .first()
    )
    if not bom:
        raise HTTPException(status_code=404, detail="Fórmula / Receta no encontrada")
    return serialize_bom(db, bom)


@router.post("/boms")
def create_bom(
    *,
    db: Session = Depends(deps.get_db),
    bom_in: BOMHeaderCreate,
) -> Any:
    existing = db.query(BOMHeader).filter(BOMHeader.code == bom_in.code.strip().upper()).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Ya existe una fórmula con el código {bom_in.code}")

    bom = BOMHeader(
        code=bom_in.code.strip().upper(),
        name=bom_in.name.strip(),
        bom_type=bom_in.bom_type,
        sector=bom_in.sector,
        work_center_id=bom_in.work_center_id,
        primary_product_variant_id=bom_in.primary_product_variant_id,
        base_qty=Decimal(str(bom_in.base_qty)),
        uom_id=bom_in.uom_id.strip().upper(),
        expected_shrinkage_pct=Decimal(str(bom_in.expected_shrinkage_pct)),
        max_allowed_shrinkage_pct=Decimal(str(bom_in.max_allowed_shrinkage_pct)),
        standard_labor_hours=Decimal(str(bom_in.standard_labor_hours)),
        shelf_life_days=bom_in.shelf_life_days,
        instructions=bom_in.instructions,
        is_active=bom_in.is_active,
    )
    db.add(bom)
    db.flush()

    for inp in bom_in.inputs:
        db.add(
            BOMInput(
                bom_id=bom.id,
                component_variant_id=inp.component_variant_id,
                input_role=inp.input_role,
                quantity=Decimal(str(inp.quantity)),
                recipe_uom=inp.recipe_uom,
                conversion_factor_to_base=Decimal(str(inp.conversion_factor_to_base)),
                bakers_percentage=Decimal(str(inp.bakers_percentage)) if inp.bakers_percentage is not None else None,
                scrap_tolerance_pct=Decimal(str(inp.scrap_tolerance_pct)),
                is_fixed_qty=inp.is_fixed_qty,
                backflush=inp.backflush,
            )
        )

    # Si no se enviaron outputs explícitos en una receta convergente, crear la salida primaria por defecto
    if not bom_in.outputs and bom_in.bom_type == "CONVERGENT_RECIPE":
        db.add(
            BOMOutput(
                bom_id=bom.id,
                output_variant_id=bom_in.primary_product_variant_id,
                output_type="PRIMARY_PRODUCT",
                expected_qty=Decimal(str(bom_in.base_qty)),
                uom_id=bom_in.uom_id.strip().upper(),
                expected_yield_pct=Decimal(str(100.0 - float(bom_in.expected_shrinkage_pct or 0.0))),
                cost_allocation_method="PERCENTAGE",
                cost_allocation_factor=Decimal("1.0000"),
            )
        )
    else:
        for out in bom_in.outputs:
            db.add(
                BOMOutput(
                    bom_id=bom.id,
                    output_variant_id=out.output_variant_id,
                    output_type=out.output_type,
                    expected_qty=Decimal(str(out.expected_qty)),
                    uom_id=out.uom_id.strip().upper(),
                    expected_yield_pct=Decimal(str(out.expected_yield_pct)),
                    cost_allocation_method=out.cost_allocation_method,
                    standard_reference_price=Decimal(str(out.standard_reference_price)) if out.standard_reference_price is not None else None,
                    cost_allocation_factor=Decimal(str(out.cost_allocation_factor)),
                )
            )

    db.commit()
    return get_bom(bom.id, db)


@router.put("/boms/{bom_id}")
def update_bom(
    *,
    db: Session = Depends(deps.get_db),
    bom_id: int,
    bom_in: BOMHeaderUpdate,
) -> Any:
    bom = db.query(BOMHeader).filter(BOMHeader.id == bom_id).first()
    if not bom:
        raise HTTPException(status_code=404, detail="Fórmula / Receta no encontrada")

    update_data = bom_in.model_dump(exclude_unset=True, exclude={"inputs", "outputs"})
    if "code" in update_data and update_data["code"]:
        update_data["code"] = update_data["code"].strip().upper()
        dup = db.query(BOMHeader).filter(BOMHeader.code == update_data["code"], BOMHeader.id != bom_id).first()
        if dup:
            raise HTTPException(status_code=400, detail=f"El código {update_data['code']} ya está en uso")

    for field, value in update_data.items():
        setattr(bom, field, value)

    if bom_in.inputs is not None:
        db.query(BOMInput).filter(BOMInput.bom_id == bom.id).delete()
        for inp in bom_in.inputs:
            db.add(
                BOMInput(
                    bom_id=bom.id,
                    component_variant_id=inp.component_variant_id,
                    input_role=inp.input_role,
                    quantity=Decimal(str(inp.quantity)),
                    recipe_uom=inp.recipe_uom,
                    conversion_factor_to_base=Decimal(str(inp.conversion_factor_to_base)),
                    bakers_percentage=Decimal(str(inp.bakers_percentage)) if inp.bakers_percentage is not None else None,
                    scrap_tolerance_pct=Decimal(str(inp.scrap_tolerance_pct)),
                    is_fixed_qty=inp.is_fixed_qty,
                    backflush=inp.backflush,
                )
            )

    if bom_in.outputs is not None:
        db.query(BOMOutput).filter(BOMOutput.bom_id == bom.id).delete()
        if not bom_in.outputs and bom.bom_type == "CONVERGENT_RECIPE":
            db.add(
                BOMOutput(
                    bom_id=bom.id,
                    output_variant_id=bom.primary_product_variant_id,
                    output_type="PRIMARY_PRODUCT",
                    expected_qty=Decimal(str(bom.base_qty)),
                    uom_id=(bom.uom_id or "KG").strip().upper(),
                    expected_yield_pct=Decimal(str(100.0 - float(bom.expected_shrinkage_pct or 0.0))),
                    cost_allocation_method="PERCENTAGE",
                    cost_allocation_factor=Decimal("1.0000"),
                )
            )
        else:
            for out in bom_in.outputs:
                db.add(
                    BOMOutput(
                        bom_id=bom.id,
                        output_variant_id=out.output_variant_id,
                        output_type=out.output_type,
                        expected_qty=Decimal(str(out.expected_qty)),
                        uom_id=out.uom_id.strip().upper(),
                        expected_yield_pct=Decimal(str(out.expected_yield_pct)),
                        cost_allocation_method=out.cost_allocation_method,
                        standard_reference_price=Decimal(str(out.standard_reference_price)) if out.standard_reference_price is not None else None,
                        cost_allocation_factor=Decimal(str(out.cost_allocation_factor)),
                    )
                )

    db.add(bom)
    db.commit()
    return get_bom(bom.id, db)


@router.delete("/boms/{bom_id}")
def delete_bom(
    *,
    db: Session = Depends(deps.get_db),
    bom_id: int,
) -> Any:
    bom = db.query(BOMHeader).filter(BOMHeader.id == bom_id).first()
    if not bom:
        raise HTTPException(status_code=404, detail="Fórmula / Receta no encontrada")

    db.delete(bom)
    db.commit()
    return {"message": "Fórmula eliminada exitosamente", "deleted": True}


# ==============================================================================
# 3. SIMULADOR DE COSTO BIMONETARIO EN VIVO (/api/v1/mfg/boms/simulate-cost)
# ==============================================================================
@router.post("/boms/simulate-cost")
def simulate_bom_cost(
    *,
    db: Session = Depends(deps.get_db),
    sim_in: SimulateCostRequest,
) -> Any:
    return simulate_bom_cost_calculation(db, sim_in)


# ==============================================================================
# 4. BUSCADOR LIGERO DE VARIANTES PARA EL CONSTRUCTOR DE RECETAS
# ==============================================================================
@router.get("/catalog-variants")
def search_catalog_variants_for_mfg(
    search: Optional[str] = Query(None),
    ids: Optional[str] = Query(None, description="Lista separada por comas de IDs de variantes a incluir"),
    facility_id: Optional[int] = Query(None, description="Sucursal/Sede para consultar stock y costos específicos"),
    limit: int = Query(40, le=200),
    db: Session = Depends(deps.get_db),
) -> Any:
    rate_info = get_active_bcv_rate(db)
    rate = rate_info["rate"]

    query = (
        db.query(ProductVariant)
        .join(Product, ProductVariant.product_id == Product.id)
        .outerjoin(Category, Product.category_id == Category.id)
        .options(selectinload(ProductVariant.product).selectinload(Product.category))
        .filter(ProductVariant.is_active == True)
    )
    if ids and ids.strip():
        parsed_ids = [int(x.strip()) for x in ids.split(",") if x.strip().isdigit()]
        if parsed_ids:
            query = query.filter(ProductVariant.id.in_(parsed_ids))
    elif search and search.strip():
        tokens = [tok.strip() for tok in search.strip().split() if tok.strip()]
        for tok in tokens:
            s = f"%{tok}%"
            query = query.filter(
                or_(
                    Product.name.ilike(s),
                    ProductVariant.sku.ilike(s),
                    ProductVariant.barcode.ilike(s),
                    Category.name.ilike(s),
                )
            )

    variants = query.order_by(Product.name.asc()).limit(limit).all()
    variant_ids = [v.id for v in variants]
    stock_by_variant: dict[int, float] = {}
    if variant_ids:
        snap_q = db.query(
            InventorySnapshot.variant_id,
            func.coalesce(func.sum(InventorySnapshot.stock_qty), 0),
        ).filter(InventorySnapshot.variant_id.in_(variant_ids))
        if facility_id:
            snap_q = snap_q.filter(InventorySnapshot.facility_id == facility_id)
        for vid, total_stock in snap_q.group_by(InventorySnapshot.variant_id).all():
            stock_by_variant[int(vid)] = float(total_stock or 0.0)

    results = []
    for v in variants:
        unit_cost_usd = get_variant_unit_cost_usd(db, v, facility_id=facility_id)
        pvp_usd = get_variant_sales_price_usd(db, v, facility_id=facility_id)
        results.append({
            "id": v.id,
            "sku": v.sku,
            "barcode": v.barcode,
            "name": v.product.name if v.product else v.sku,
            "category_name": v.product.category.name if v.product and v.product.category else "General",
            "uom_base": v.product.uom_base if v.product else "UND",
            "facility_id": facility_id,
            "stock_qty": round(stock_by_variant.get(v.id, 0.0), 4),
            "unit_cost_usd": round(unit_cost_usd, 4),
            "unit_cost_ves": round(unit_cost_usd * rate, 2),
            "sales_price_usd": round(pvp_usd, 4),
            "sales_price_ves": round(pvp_usd * rate, 2),
        })
    return results


@router.get("/catalog/variants")
def search_catalog_variants_for_mfg_v2(
    search: Optional[str] = Query(None),
    ids: Optional[str] = Query(None, description="Lista separada por comas de IDs de variantes a incluir"),
    facility_id: Optional[int] = Query(None, description="Sucursal/Sede para consultar stock y costos específicos"),
    limit: int = Query(40, le=200),
    db: Session = Depends(deps.get_db),
) -> Any:
    items = search_catalog_variants_for_mfg(
        search=search, ids=ids, facility_id=facility_id, limit=limit, db=db
    )
    return {"items": items, "total": len(items)}


# ==============================================================================
# 5. DASHBOARD SUMMARY / KPIS DE NEO PRODUCCIÓN (/api/v1/mfg/dashboard-summary)
# ==============================================================================
@router.get("/dashboard-summary")
def get_mfg_dashboard_summary(
    db: Session = Depends(deps.get_db),
) -> Any:
    from app.services.production_service import ProductionService

    ProductionService.ensure_initial_sample_orders(db)

    rate_info = get_active_bcv_rate(db)
    rate = rate_info["rate"]

    work_centers = db.query(WorkCenter).all()
    active_wc = [w for w in work_centers if w.is_active]

    boms = (
        db.query(BOMHeader)
        .options(
            selectinload(BOMHeader.work_center),
            selectinload(BOMHeader.primary_variant).selectinload(ProductVariant.product),
            selectinload(BOMHeader.inputs).selectinload(BOMInput.component_variant).selectinload(ProductVariant.product),
            selectinload(BOMHeader.outputs).selectinload(BOMOutput.output_variant).selectinload(ProductVariant.product),
        )
        .all()
    )

    convergent_count = sum(1 for b in boms if b.bom_type == "CONVERGENT_RECIPE")
    divergent_count = sum(1 for b in boms if b.bom_type == "DIVERGENT_DISASSEMBLY")

    serialized_boms = [serialize_bom(db, b) for b in boms]
    avg_margin_pct = (
        round(sum(b["estimated_margin_pct"] for b in serialized_boms) / len(serialized_boms), 2)
        if serialized_boms
        else 0.0
    )
    avg_shrinkage_pct = (
        round(sum(b["expected_shrinkage_pct"] for b in serialized_boms) / len(serialized_boms), 2)
        if serialized_boms
        else 0.0
    )

    orders_list_res = ProductionService.list_orders(db)
    order_kpis = orders_list_res["kpis"]
    butchery_kpis = orders_list_res.get("butchery_kpis", {})

    return {
        "exchange_rate": round(rate, 4),
        "exchange_rate_effective_date": rate_info["effective_date"],
        "kpis": {
            "total_work_centers": len(work_centers),
            "active_work_centers": len(active_wc),
            "total_boms": len(boms),
            "convergent_recipes_count": convergent_count,
            "divergent_butchery_count": divergent_count,
            "average_projected_margin_pct": avg_margin_pct,
            "average_expected_shrinkage_pct": avg_shrinkage_pct,
            "active_production_orders": order_kpis["total_orders"],
            "in_progress_orders": order_kpis["in_progress_count"],
            "completed_orders": order_kpis["completed_count"],
            "completed_value_usd": order_kpis["completed_value_usd"],
            "completed_value_ves": order_kpis["completed_value_ves"],
            "total_butchery_orders": butchery_kpis.get("total_butchery_orders", 0),
            "in_progress_butchery_orders": butchery_kpis.get("in_progress_butchery_orders", 0),
            "completed_butchery_orders": butchery_kpis.get("completed_butchery_orders", 0),
            "carcass_weight_processed_kg": butchery_kpis.get("carcass_weight_processed_kg", 0.0),
            "average_meat_yield_pct": butchery_kpis.get("average_meat_yield_pct", 88.0),
            "settled_cuts_value_usd": butchery_kpis.get("settled_cuts_value_usd", 0.0),
            "settled_cuts_value_ves": butchery_kpis.get("settled_cuts_value_ves", 0.0),
        },
        "butchery_kpis": butchery_kpis,
        "sectors_breakdown": {
            "BAKERY": sum(1 for b in boms if b.sector == "BAKERY"),
            "GASTRONOMY": sum(1 for b in boms if b.sector == "GASTRONOMY"),
            "MEAT_PROCESSING": sum(1 for b in boms if b.sector == "MEAT_PROCESSING"),
        },
        "work_centers": [
            {
                "id": w.id,
                "code": w.code,
                "name": w.name,
                "sector": w.sector,
                "capacity_per_batch": float(w.capacity_per_batch or 0),
                "capacity_uom": w.capacity_uom,
                "hourly_labor_rate": float(w.hourly_labor_rate or 0),
                "hourly_overhead_rate": float(w.hourly_overhead_rate or 0),
                "overhead_per_kg": float(w.overhead_per_kg or 0),
                "is_active": w.is_active,
            }
            for w in work_centers
        ],
        "recent_boms": serialized_boms[:10],
        "recent_orders": orders_list_res["items"][:10],
    }


# ==============================================================================
# 6. FASE 2 & 3: EXPLOSIÓN FEFO, ÓRDENES DE PRODUCCIÓN Y SALA DE DESPOSTE
# ==============================================================================
@router.post("/orders/explode-preview")
def explode_bom_preview_endpoint(
    *,
    db: Session = Depends(deps.get_db),
    req: ExplodePreviewRequest,
) -> Any:
    from app.services.production_service import ProductionService

    return ProductionService.explode_bom_preview(db, req)


@router.post("/butchery/simulate-settlement")
def simulate_butchery_settlement_endpoint(
    *,
    db: Session = Depends(deps.get_db),
    req: ButcherySimulateSettlementRequest,
) -> Any:
    from app.services.production_service import ProductionService

    return ProductionService.simulate_butchery_settlement(db, req)


@router.get("/orders")
def list_production_orders(
    state: Optional[str] = None,
    sector: Optional[str] = None,
    order_type: Optional[str] = None,
    facility_id: Optional[int] = None,
    search: Optional[str] = None,
    db: Session = Depends(deps.get_db),
) -> Any:
    from app.services.production_service import ProductionService

    return ProductionService.list_orders(
        db=db,
        state=state,
        sector=sector,
        order_type=order_type,
        facility_id=facility_id,
        search=search,
    )


@router.get("/orders/{order_id}")
def get_production_order_detail(
    order_id: int,
    db: Session = Depends(deps.get_db),
) -> Any:
    from app.services.production_service import ProductionService

    return ProductionService.get_order_detail(db, order_id)


@router.post("/orders")
def create_production_order(
    *,
    db: Session = Depends(deps.get_db),
    req: ProductionOrderCreate,
) -> Any:
    from app.services.production_service import ProductionService

    return ProductionService.create_order(db, req)


@router.post("/orders/{order_id}/start")
def start_production_order(
    *,
    db: Session = Depends(deps.get_db),
    order_id: int,
) -> Any:
    from app.services.production_service import ProductionService

    return ProductionService.start_order(db, order_id)


@router.post("/orders/{order_id}/complete")
def complete_production_order(
    *,
    db: Session = Depends(deps.get_db),
    order_id: int,
    req: Optional[CompleteOrderRequest] = None,
) -> Any:
    from app.services.production_service import ProductionService

    payload = req or CompleteOrderRequest()
    return ProductionService.complete_order(db, order_id, payload)


@router.post("/orders/{order_id}/cancel")
def cancel_production_order(
    *,
    db: Session = Depends(deps.get_db),
    order_id: int,
    notes: Optional[str] = Query(None),
) -> Any:
    from app.services.production_service import ProductionService

    return ProductionService.cancel_order(db, order_id, notes)


@router.post("/orders/{order_id}/inputs")
def add_production_order_input(
    *,
    db: Session = Depends(deps.get_db),
    order_id: int,
    req: AdHocOrderInputCreate,
) -> Any:
    from app.services.production_service import ProductionService

    return ProductionService.add_order_input(db, order_id, req)


@router.post("/orders/{order_id}/outputs")
def add_production_order_output(
    *,
    db: Session = Depends(deps.get_db),
    order_id: int,
    req: AdHocOrderOutputCreate,
) -> Any:
    from app.services.production_service import ProductionService

    return ProductionService.add_order_output(db, order_id, req)


@router.post("/orders/{order_id}/save-as-bom")
def save_production_order_as_bom(
    *,
    db: Session = Depends(deps.get_db),
    order_id: int,
    req: Optional[SaveOrderAsBOMRequest] = None,
) -> Any:
    from app.services.production_service import ProductionService

    payload = req or SaveOrderAsBOMRequest()
    return ProductionService.save_order_as_bom(db, order_id, payload)


