from datetime import datetime, date, timedelta, timezone
from decimal import Decimal
import math
from typing import Any, Dict, List, Optional, Union
from fastapi import HTTPException
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import and_, or_, text

from app.core.uom import is_weight_uom, resolve_mfg_uom_base, resolve_recipe_conversion_factor
from app.models.core import Facility
from app.models.inventory import (
    Warehouse,
    Location,
    Product,
    ProductVariant,
    InventorySnapshot,
    Batch,
    StockPickingType,
    StockPicking,
    StockMove,
    AdjustmentReason,
)
from app.models.manufacturing import (
    WorkCenter,
    BOMHeader,
    BOMInput,
    BOMOutput,
    ProductionPlan,
    ProductionPlanLine,
    ProductionOrder,
    ProductionOrderInput,
    ProductionOrderOutput,
)
from app.schemas.manufacturing import (
    AdHocOrderInputCreate,
    AdHocOrderOutputCreate,
    UpdateOrderInputsRequest,
    SaveOrderAsBOMRequest,
    ExplodePreviewRequest,
    ProductionOrderCreate,
    CompleteOrderRequest,
    CompleteOrderOutputLine,
    ButcherySimulateSettlementRequest,
    ButcherySimulateOutputItem,
    BatchRunLinePreviewRequest,
    BatchRunExplodePreviewRequest,
    BatchRunLineExecuteRequest,
    BatchRunExecuteRequest,
)
from app.api.v1.endpoints.manufacturing import (
    get_active_bcv_rate,
    get_variant_unit_cost_usd,
    get_variant_sales_price_usd,
)


class ProductionService:
    """
    Servicio Transaccional de Neo Producción (Fase 2 & Transformaciones Libres Ad-Hoc):
    - Infraestructura WMS/Kardex (MFG_CONSUME / MFG_OUT, MFG_PRODUCE / MFG_IN, VIRT_PRODUCTION, VIRT_LOSS, MERMA_PROD_ANORMAL)
    - Explosión de Materiales con sugerencia de lotes bajo regla FEFO y semáforo de stock (con o sin BOM)
    - Ciclo de vida de Órdenes de Producción Convergentes, Divergentes y Transformaciones Libres Ad-Hoc (bom_id = NULL)
    - Liquidación Atómica al Kardex bajo NIC 2 (Párrafo 16) y actualización de Costo Promedio Ponderado (WAVG) sin doble conteo
    """

    _INFRA_SEEDED: bool = False
    _SAMPLE_ORDERS_SEEDED: bool = False

    @staticmethod
    def ensure_mfg_wms_infrastructure(db: Session, commit: bool = False) -> Dict[str, Any]:
        """
        Garantiza que existan en la base de datos:
        1. Columna mfg.production_orders.bom_id anulable (DROP NOT NULL) para Transformaciones Libres Ad-Hoc
        2. Ubicaciones virtuales con warehouse_id = NULL: VIRT_PRODUCTION y VIRT_LOSS
        3. Tipos de operación en inv.stock_picking_types:
           - MFG_CONSUME ("Consumo de Producción", sequence_prefix="MFG_OUT")
           - MFG_PRODUCE ("Entrada de Producción", sequence_prefix="MFG_IN")
        4. Motivo de ajuste en inv.adjustment_reasons:
           - MERMA_PROD_ANORMAL ("Merma Anormal de Producción")
        5. Lotes FEFO iniciales para insumos de recetas maestras si aún no tienen lotes.
        """
        dirty = False
        current_db_name = (db.execute(text("SELECT current_database()")).scalar() or "").strip()
        is_prod_db = current_db_name == "morpheus_prod"

        if not ProductionService._INFRA_SEEDED:
            for seq_tbl in [
                "inv.locations",
                "inv.stock_picking_types",
                "inv.adjustment_reasons",
                "inv.batches",
                "inv.stock_pickings",
                "inv.stock_moves",
                "mfg.work_centers",
                "mfg.bom_headers",
                "mfg.bom_inputs",
                "mfg.bom_outputs",
                "mfg.production_plans",
                "mfg.production_plan_lines",
                "mfg.production_orders",
                "mfg.production_order_inputs",
                "mfg.production_order_outputs",
            ]:
                db.execute(
                    text(
                        f"""
                        SELECT setval(
                            pg_get_serial_sequence('{seq_tbl}', 'id'),
                            COALESCE((SELECT MAX(id) FROM {seq_tbl}), 1),
                            (SELECT MAX(id) IS NOT NULL FROM {seq_tbl})
                        )
                        WHERE pg_get_serial_sequence('{seq_tbl}', 'id') IS NOT NULL
                        """
                    )
                )

            col_exists = db.execute(
                text(
                    """
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'inv'
                      AND table_name = 'stock_moves'
                      AND column_name = 'adjustment_reason_id'
                    """
                )
            ).fetchone()
            if not col_exists:
                db.execute(
                    text(
                        "ALTER TABLE inv.stock_moves ADD COLUMN IF NOT EXISTS adjustment_reason_id INTEGER REFERENCES inv.adjustment_reasons(id)"
                    )
                )
                db.flush()
                dirty = True

            bom_col_not_null = db.execute(
                text(
                    """
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'mfg'
                      AND table_name = 'production_orders'
                      AND column_name = 'bom_id'
                      AND is_nullable = 'NO'
                    """
                )
            ).fetchone()
            if bom_col_not_null:
                db.execute(
                    text("ALTER TABLE mfg.production_orders ALTER COLUMN bom_id DROP NOT NULL")
                )
                db.flush()
                dirty = True

            db.execute(
                text(
                    """
                    CREATE OR REPLACE VIEW mfg.v_fact_production_costing AS
                    SELECT
                        po.id AS production_order_id,
                        po.order_number,
                        po.completed_at::DATE AS date_id,
                        po.facility_id,
                        po.work_center_id,
                        po.bom_id,
                        po.supplier_maquila_id AS supplier_id,
                        out.output_variant_id AS variant_id,
                        out.generated_batch_id AS batch_id,
                        out.output_type,
                        po.actual_input_weight_kg,
                        out.planned_qty,
                        out.actual_good_qty,
                        out.explicit_damaged_qty,
                        po.natural_shrinkage_qty,
                        out.expected_yield_pct,
                        out.actual_yield_pct,
                        (out.actual_yield_pct - out.expected_yield_pct) AS yield_variance_pct,
                        po.total_direct_material_cost,
                        po.total_packaging_cost,
                        po.total_direct_labor_cost,
                        po.total_indirect_overhead_cost,
                        po.total_maquila_service_cost,
                        po.total_explicit_waste_cost,
                        out.cost_allocation_pct,
                        out.allocated_total_cost,
                        out.calculated_unit_cost,
                        out.market_reference_price,
                        COALESCE(bh.code, 'TRANSF-LIBRE') AS bom_code,
                        COALESCE(bh.name, 'Transformación Libre de Materiales') AS bom_name
                    FROM mfg.production_orders po
                    JOIN mfg.production_order_outputs out ON out.production_order_id = po.id
                    LEFT OUTER JOIN mfg.bom_headers bh ON bh.id = po.bom_id
                    WHERE po.state = 'COMPLETED';
                    """
                )
            )

        virt_prod = (
            db.query(Location)
            .filter(Location.code.in_(["VIRT_PRODUCTION", "VIRTUAL-PRODUCTION"]))
            .first()
        )
        if not virt_prod:
            virt_prod = Location(
                name="Producción",
                code="VIRT_PRODUCTION",
                barcode="LOC-VIRT-PRODUCTION",
                location_type="PRODUCTION",
                usage="EXTERNAL",
                warehouse_id=None,
            )
            db.add(virt_prod)
            db.flush()
            dirty = True
        elif virt_prod.warehouse_id is not None:
            virt_prod.warehouse_id = None
            db.add(virt_prod)
            db.flush()
            dirty = True

        virt_loss = (
            db.query(Location)
            .filter(Location.code.in_(["VIRT_LOSS", "VIRTUAL-LOSS"]))
            .first()
        )
        if not virt_loss:
            virt_loss = Location(
                name="Pérdida de Inventario",
                code="VIRT_LOSS",
                barcode="LOC-VIRT-LOSS",
                location_type="LOSS",
                usage="EXTERNAL",
                warehouse_id=None,
            )
            db.add(virt_loss)
            db.flush()
            dirty = True
        elif virt_loss.warehouse_id is not None:
            virt_loss.warehouse_id = None
            db.add(virt_loss)
            db.flush()
            dirty = True

        picking_consume = (
            db.query(StockPickingType)
            .filter(StockPickingType.code.in_(["MFG_CONSUME", "MFG_OUT"]))
            .first()
        )
        if not picking_consume:
            picking_consume = StockPickingType(
                name="Consumo de Producción",
                code="MFG_CONSUME",
                sequence_prefix="MFG_OUT",
                default_location_dest_id=virt_prod.id,
            )
            db.add(picking_consume)
            db.flush()
            dirty = True

        picking_produce = (
            db.query(StockPickingType)
            .filter(StockPickingType.code.in_(["MFG_PRODUCE", "MFG_IN"]))
            .first()
        )
        if not picking_produce:
            picking_produce = StockPickingType(
                name="Entrada de Producción",
                code="MFG_PRODUCE",
                sequence_prefix="MFG_IN",
                default_location_src_id=virt_prod.id,
            )
            db.add(picking_produce)
            db.flush()
            dirty = True

        abnormal_reason = (
            db.query(AdjustmentReason)
            .filter(AdjustmentReason.code == "MERMA_PROD_ANORMAL")
            .first()
        )
        if not abnormal_reason:
            abnormal_reason = AdjustmentReason(
                code="MERMA_PROD_ANORMAL",
                name="Merma Anormal de Producción",
                default_type="OUT",
                account_code="6.1.02.08",
                is_active=True,
            )
            db.add(abnormal_reason)
            db.flush()
            dirty = True

        if not ProductionService._INFRA_SEEDED:
            # Garantizar que cada sucursal activa en core.facilities tenga al menos un almacén seleccionable en inv.warehouses
            all_facilities = db.query(Facility).order_by(Facility.id.asc()).all()
            for fac_item in all_facilities:
                has_wh = (
                    db.query(Warehouse)
                    .filter(
                        Warehouse.facility_id == fac_item.id,
                        Warehouse.is_scrap == False,
                        Warehouse.code != "VIRTUAL",
                    )
                    .first()
                )
                if not has_wh:
                    base_wh_code = f"WH-{fac_item.id:02d}"
                    wh_code = base_wh_code
                    suffix = 1
                    while (
                        db.query(Warehouse)
                        .filter(Warehouse.facility_id == fac_item.id, Warehouse.code == wh_code)
                        .first()
                    ):
                        suffix += 1
                        wh_code = f"{base_wh_code}-{suffix}"
                    new_wh = Warehouse(
                        facility_id=fac_item.id,
                        name=f"Almacén General {fac_item.name}",
                        code=wh_code,
                        is_scrap=False,
                        is_transit=False,
                    )
                    db.add(new_wh)
                    db.flush()
                    dirty = True

            if not is_prod_db:
                # Sembrar múltiples estaciones (WorkCenters) por sucursal en QA/Dev para demostrar soporte 1..N estaciones por sede
                today = date.today()
                default_fac = db.query(Facility).order_by(Facility.id.asc()).first()
                default_fac_id = default_fac.id if default_fac else 1
                default_wh = (
                    db.query(Warehouse)
                    .filter(
                        Warehouse.facility_id == default_fac_id,
                        Warehouse.is_scrap == False,
                        Warehouse.code != "VIRTUAL",
                    )
                    .order_by(Warehouse.id.asc())
                    .first()
                )
                default_wh_id = default_wh.id if default_wh else 1

                # Segunda sucursal real (ej. CUMBOTO id=10) para pruebas multi-sede
                secondary_fac = (
                    db.query(Facility)
                    .filter(
                        Facility.id != default_fac_id,
                        Facility.is_active == True,
                        ~Facility.code.ilike("%TEST%"),
                    )
                    .order_by(Facility.id.asc())
                    .first()
                )
                if not secondary_fac:
                    secondary_fac = (
                        db.query(Facility)
                        .filter(Facility.id != default_fac_id)
                        .order_by(Facility.id.asc())
                        .first()
                    )
                sec_fac_id = secondary_fac.id if secondary_fac else default_fac_id
                sec_wh = (
                    db.query(Warehouse)
                    .filter(
                        Warehouse.facility_id == sec_fac_id,
                        Warehouse.is_scrap == False,
                        Warehouse.code != "VIRTUAL",
                    )
                    .order_by(Warehouse.id.asc())
                    .first()
                )
                sec_wh_id = sec_wh.id if sec_wh else default_wh_id

                extra_stations = [
                    {
                        "code": "PANADERIA_HORNO_PISO",
                        "name": "Horno de Piso Artesanal #2",
                        "sector": "BAKERY",
                        "facility_id": default_fac_id,
                        "warehouse_wip_id": default_wh_id,
                        "capacity_per_batch": Decimal("60.00"),
                        "capacity_uom": "KG",
                        "hourly_labor_rate": Decimal("5.00"),
                        "hourly_overhead_rate": Decimal("3.20"),
                        "overhead_per_kg": Decimal("0.0500"),
                    },
                    {
                        "code": "DESPOSTE_MESA_VACIO_2",
                        "name": "Mesa de Corte y Empaque al Vacío #2",
                        "sector": "MEAT_PROCESSING",
                        "facility_id": default_fac_id,
                        "warehouse_wip_id": default_wh_id,
                        "capacity_per_batch": Decimal("120.00"),
                        "capacity_uom": "KG",
                        "hourly_labor_rate": Decimal("5.80"),
                        "hourly_overhead_rate": Decimal("3.60"),
                        "overhead_per_kg": Decimal("0.0600"),
                    },
                ]
                if sec_fac_id != default_fac_id:
                    sec_name = secondary_fac.name.title() if secondary_fac else "Sucursal 2"
                    extra_stations.extend([
                        {
                            "code": "CUMBOTO_PANADERIA_1",
                            "name": f"Horno Rotativo {sec_name} #1",
                            "sector": "BAKERY",
                            "facility_id": sec_fac_id,
                            "warehouse_wip_id": sec_wh_id,
                            "capacity_per_batch": Decimal("80.00"),
                            "capacity_uom": "KG",
                            "hourly_labor_rate": Decimal("4.60"),
                            "hourly_overhead_rate": Decimal("2.90"),
                            "overhead_per_kg": Decimal("0.0400"),
                        },
                        {
                            "code": "CUMBOTO_DESPOSTE_1",
                            "name": f"Sala de Desposte {sec_name} #1",
                            "sector": "MEAT_PROCESSING",
                            "facility_id": sec_fac_id,
                            "warehouse_wip_id": sec_wh_id,
                            "capacity_per_batch": Decimal("150.00"),
                            "capacity_uom": "KG",
                            "hourly_labor_rate": Decimal("5.40"),
                            "hourly_overhead_rate": Decimal("3.40"),
                            "overhead_per_kg": Decimal("0.0500"),
                        },
                    ])

                for st_def in extra_stations:
                    exists_wc = (
                        db.query(WorkCenter)
                        .filter(
                            or_(
                                WorkCenter.code == st_def["code"],
                                WorkCenter.code.like(f"{st_def['code'][:18]}__DEL_%"),
                            )
                        )
                        .first()
                    )
                    if not exists_wc:
                        db.add(
                            WorkCenter(
                                facility_id=st_def["facility_id"],
                                warehouse_wip_id=st_def["warehouse_wip_id"],
                                code=st_def["code"],
                                name=st_def["name"],
                                sector=st_def["sector"],
                                capacity_per_batch=st_def["capacity_per_batch"],
                                capacity_uom=st_def["capacity_uom"],
                                hourly_labor_rate=st_def["hourly_labor_rate"],
                                hourly_overhead_rate=st_def["hourly_overhead_rate"],
                                overhead_per_kg=st_def["overhead_per_kg"],
                                is_active=True,
                            )
                        )
                        db.flush()
                        dirty = True

                # Sembrar lotes FEFO iniciales para los insumos de BOM en QA/Dev si no tienen lotes registrados
                bom_inputs = db.query(BOMInput).all()
                for idx, bi in enumerate(bom_inputs):
                    existing_batch = (
                        db.query(Batch)
                        .filter(Batch.product_variant_id == bi.component_variant_id)
                        .first()
                    )
                    if not existing_batch:
                        comp_var = db.query(ProductVariant).filter(ProductVariant.id == bi.component_variant_id).first()
                        sku_short = (comp_var.sku[-6:] if comp_var and comp_var.sku else str(bi.component_variant_id)).upper()
                        b1 = Batch(
                            product_variant_id=bi.component_variant_id,
                            batch_number=f"L-MP-{sku_short}-A",
                            manufacturing_date=today - timedelta(days=20),
                            expiry_date=today + timedelta(days=25 + (idx % 5) * 10),
                            is_quarantined=False,
                        )
                        b2 = Batch(
                            product_variant_id=bi.component_variant_id,
                            batch_number=f"L-MP-{sku_short}-B",
                            manufacturing_date=today - timedelta(days=5),
                            expiry_date=today + timedelta(days=75 + (idx % 5) * 10),
                            is_quarantined=False,
                        )
                        db.add_all([b1, b2])
                        db.flush()
                        dirty = True

                    # Asegurar que el snapshot del insumo tenga su avg_cost inicializado si está en None/0
                    snap = (
                        db.query(InventorySnapshot)
                        .filter(
                            InventorySnapshot.variant_id == bi.component_variant_id,
                            InventorySnapshot.facility_id == default_fac_id,
                        )
                        .first()
                    )
                    if snap and (snap.avg_cost is None or float(snap.avg_cost or 0) <= 0):
                        comp_var = db.query(ProductVariant).filter(ProductVariant.id == bi.component_variant_id).first()
                        c_usd = get_variant_unit_cost_usd(db, comp_var, default_fac_id)
                        if c_usd > 0:
                            snap.avg_cost = Decimal(str(round(c_usd, 4)))
                            snap.current_cost = Decimal(str(round(c_usd, 4)))
                            snap.replacement_cost = Decimal(str(round(c_usd, 4)))
                            db.add(snap)
                            dirty = True

                    # Si existe segunda sucursal en QA/Dev y no tiene snapshot del insumo de receta, crear snapshot inicial de prueba
                    if sec_fac_id != default_fac_id:
                        sec_snap = (
                            db.query(InventorySnapshot)
                            .filter(
                                InventorySnapshot.variant_id == bi.component_variant_id,
                                InventorySnapshot.facility_id == sec_fac_id,
                            )
                            .first()
                        )
                        if not sec_snap:
                            comp_var = db.query(ProductVariant).filter(ProductVariant.id == bi.component_variant_id).first()
                            c_usd = get_variant_unit_cost_usd(db, comp_var, default_fac_id)
                            base_stock = float(snap.stock_qty) if (snap and snap.stock_qty and float(snap.stock_qty) > 0) else 250.0
                            db.add(
                                InventorySnapshot(
                                    facility_id=sec_fac_id,
                                    variant_id=bi.component_variant_id,
                                    stock_qty=Decimal(str(round(base_stock, 4))),
                                    avg_cost=Decimal(str(round(c_usd, 4))),
                                    current_cost=Decimal(str(round(c_usd, 4))),
                                    replacement_cost=Decimal(str(round(c_usd, 4))),
                                )
                            )
                            dirty = True

            ProductionService._INFRA_SEEDED = True

        if commit and dirty:
            db.commit()
        elif dirty:
            db.flush()

        return {
            "virt_production": virt_prod,
            "virt_loss": virt_loss,
            "picking_consume": picking_consume,
            "picking_produce": picking_produce,
            "abnormal_reason": abnormal_reason,
        }

    @staticmethod
    def get_warehouse_internal_location(db: Session, warehouse_id: int) -> Location:
        """
        Obtiene la ubicación física interna (usage='INTERNAL', location_type!='LOSS') de un almacén.
        """
        loc = (
            db.query(Location)
            .filter(
                Location.warehouse_id == warehouse_id,
                Location.usage == "INTERNAL",
                Location.location_type != "LOSS",
            )
            .order_by(Location.id.asc())
            .first()
        )
        if not loc:
            wh = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
            wh_code = wh.code if wh else f"WH{warehouse_id}"
            loc = Location(
                warehouse_id=warehouse_id,
                name=f"Existencias {wh_code}",
                code=f"{wh_code}/STOCK",
                barcode=f"LOC-{wh_code}-STOCK",
                location_type="SHELF",
                usage="INTERNAL",
            )
            db.add(loc)
            db.flush()
        return loc

    @staticmethod
    def explode_bom_preview(
        db: Session,
        req: ExplodePreviewRequest,
        commit_infra: bool = True,
    ) -> Dict[str, Any]:
        """
        Motor de Explosión de Materiales y Sugerencia FEFO en Vivo (con o sin BOM):
        - Soporta órdenes basadas en Fórmula (req.bom_id != None) y Transformaciones Libres Ad-Hoc (req.bom_id == None)
        - Calcula requerimientos brutos en unidad base (con factor de merma de limpieza y CEIL para discretos)
        - Consulta stock en inv.inventory_snapshots por (variant_id, facility_id)
        - Sugiere lote activo bajo FEFO estricto (expiry_date ASC, is_quarantined=False)
        - Calcula semáforo de disponibilidad (AVAILABLE, PARTIAL, SHORTAGE)
        - Proyecta costos NIC 2 (Materiales, Empaque, MOD, CIF, Merma Natural y Nuevo Costo Promedio Ponderado WAVG)
        """
        ProductionService.ensure_mfg_wms_infrastructure(db, commit=commit_infra)

        bom: Optional[BOMHeader] = None
        if req.bom_id is not None:
            bom = (
                db.query(BOMHeader)
                .options(
                    selectinload(BOMHeader.work_center),
                    selectinload(BOMHeader.primary_variant).selectinload(ProductVariant.product),
                    selectinload(BOMHeader.inputs).selectinload(BOMInput.component_variant).selectinload(ProductVariant.product),
                    selectinload(BOMHeader.outputs).selectinload(BOMOutput.output_variant).selectinload(ProductVariant.product),
                )
                .filter(BOMHeader.id == req.bom_id)
                .first()
            )
            if not bom:
                raise HTTPException(status_code=404, detail="Fórmula / Receta (BOM) no encontrada")
        else:
            if not req.inputs or not req.outputs:
                raise HTTPException(
                    status_code=400,
                    detail="Para una Transformación Libre sin fórmula (bom_id=null) debe especificar al menos un insumo (inputs) y al menos un producto resultante (outputs).",
                )

        rate_info = get_active_bcv_rate(db, req.exchange_rate_override)
        rate = rate_info["rate"]

        wc: Optional[WorkCenter] = None
        if req.work_center_id:
            wc = db.query(WorkCenter).filter(WorkCenter.id == req.work_center_id).first()

        # 1. Resolve facility_id first
        cand_fac_id = req.facility_id or (wc.facility_id if wc else None)
        fac = db.query(Facility).filter(Facility.id == cand_fac_id).first() if cand_fac_id else None
        if not fac and req.source_warehouse_id:
            req_src_wh = db.query(Warehouse).filter(Warehouse.id == req.source_warehouse_id).first()
            if req_src_wh and req_src_wh.facility_id:
                fac = db.query(Facility).filter(Facility.id == req_src_wh.facility_id).first()
        if not fac and bom and bom.work_center and bom.work_center.facility_id:
            fac = db.query(Facility).filter(Facility.id == bom.work_center.facility_id).first()
        if not fac:
            fac = db.query(Facility).order_by(Facility.id.asc()).first()
        facility_id = fac.id if fac else 1

        # 2. Prevent cross-facility work_center mismatch and resolve work_center for facility_id
        wc_had_mismatch = False
        mismatched_sector: Optional[str] = None
        if wc and req.facility_id and wc.facility_id and wc.facility_id != facility_id:
            wc_had_mismatch = True
            mismatched_sector = wc.sector
            wc = None

        if not wc and (bom or wc_had_mismatch):
            target_sector = bom.sector if bom else (mismatched_sector or req.sector)
            if bom and bom.work_center and (
                not req.facility_id or bom.work_center.facility_id == facility_id
            ):
                wc = bom.work_center
            else:
                wc = (
                    (
                        db.query(WorkCenter)
                        .filter(
                            WorkCenter.facility_id == facility_id,
                            WorkCenter.sector == target_sector,
                            WorkCenter.is_active.is_(True),
                        )
                        .order_by(WorkCenter.id.asc())
                        .first()
                        if target_sector
                        else None
                    )
                    or (
                        db.query(WorkCenter)
                        .filter(
                            WorkCenter.facility_id == facility_id,
                            WorkCenter.is_active.is_(True),
                        )
                        .order_by(WorkCenter.id.asc())
                        .first()
                    )
                    or (bom.work_center if bom else None)
                )

        # 3. Resolve source_warehouse_id and dest_warehouse_id matching facility_id
        src_wh: Optional[Warehouse] = None
        if req.source_warehouse_id:
            cand_wh = db.query(Warehouse).filter(Warehouse.id == req.source_warehouse_id).first()
            if cand_wh and (not req.facility_id or cand_wh.facility_id == facility_id):
                src_wh = cand_wh
        if not src_wh and wc and wc.warehouse_wip_id:
            cand_wh = db.query(Warehouse).filter(Warehouse.id == wc.warehouse_wip_id).first()
            if cand_wh and cand_wh.facility_id == facility_id:
                src_wh = cand_wh
        if not src_wh:
            src_wh = (
                db.query(Warehouse)
                .filter(
                    Warehouse.facility_id == facility_id,
                    Warehouse.is_scrap == False,
                    Warehouse.code != "VIRTUAL",
                )
                .order_by(Warehouse.id.asc())
                .first()
                or db.query(Warehouse)
                .filter(Warehouse.facility_id == facility_id)
                .order_by(Warehouse.id.asc())
                .first()
                or db.query(Warehouse).order_by(Warehouse.id.asc()).first()
            )
        source_warehouse_id = src_wh.id if src_wh else 1

        dest_wh: Optional[Warehouse] = None
        if req.dest_warehouse_id:
            cand_dest = db.query(Warehouse).filter(Warehouse.id == req.dest_warehouse_id).first()
            if cand_dest and (not req.facility_id or cand_dest.facility_id == facility_id):
                dest_wh = cand_dest
        if not dest_wh:
            dest_wh = src_wh
        dest_warehouse_id = dest_wh.id if dest_wh else source_warehouse_id

        src_facility_id = src_wh.facility_id if (src_wh and src_wh.facility_id) else facility_id
        dest_facility_id = dest_wh.facility_id if (dest_wh and dest_wh.facility_id) else facility_id

        today = date.today()
        exploded_inputs = []
        direct_materials_cost_usd = 0.0
        packaging_cost_usd = 0.0
        total_input_mass_kg = 0.0

        has_shortage = False
        has_partial = False

        if bom is not None:
            base_qty = max(0.0001, float(bom.base_qty or 1.0))
            if req.scale_factor is not None and float(req.scale_factor) > 0:
                if req.planned_base_qty is None or (
                    abs(float(req.planned_base_qty) - base_qty) < 1e-4
                    and abs(float(req.scale_factor) - 1.0) > 1e-4
                ):
                    scale_factor = float(req.scale_factor)
                    planned_base_qty = round(max(0.0001, base_qty * scale_factor), 4)
                else:
                    planned_base_qty = max(0.0001, float(req.planned_base_qty))
                    scale_factor = planned_base_qty / base_qty
            else:
                planned_base_qty = max(0.0001, float(req.planned_base_qty or base_qty))
                scale_factor = planned_base_qty / base_qty
            bom_type = bom.bom_type
            sector = bom.sector

            raw_overrides = list(req.input_overrides or []) + list(req.inputs or [])
            overrides_by_bom_input_id: Dict[int, AdHocOrderInputCreate] = {}
            overrides_by_variant_id: Dict[int, AdHocOrderInputCreate] = {}
            for ov in raw_overrides:
                if ov.bom_input_id is not None:
                    overrides_by_bom_input_id[int(ov.bom_input_id)] = ov
                if ov.component_variant_id is not None:
                    overrides_by_variant_id[int(ov.component_variant_id)] = ov

            bom_variant_ids = set()

            for inp in bom.inputs:
                bom_variant_ids.add(inp.component_variant_id)
                comp_var = inp.component_variant
                prod = comp_var.product if comp_var else None
                uom_base = resolve_mfg_uom_base(
                    prod.uom_base if prod else None,
                    inp.recipe_uom,
                    prod.name if prod else None,
                )

                scaled_recipe_qty = float(inp.quantity) if inp.is_fixed_qty else float(inp.quantity) * scale_factor
                conv = resolve_recipe_conversion_factor(inp.recipe_uom, uom_base, inp.conversion_factor_to_base)
                net_qty_base = scaled_recipe_qty * conv

                scrap_pct = max(0.0, min(95.0, float(inp.scrap_tolerance_pct or 0.0)))
                scrap_divisor = 1.0 - (scrap_pct / 100.0)
                raw_gross_qty_base = net_qty_base / scrap_divisor if scrap_divisor > 0 else net_qty_base

                is_discrete = not is_weight_uom(uom_base)
                if is_discrete:
                    standard_scaled_qty_base = float(math.ceil(round(raw_gross_qty_base, 2) - 1e-6))
                else:
                    standard_scaled_qty_base = round(raw_gross_qty_base, 4)

                ov = overrides_by_bom_input_id.get(inp.id) or overrides_by_variant_id.get(inp.component_variant_id)
                ov_qty_raw = None
                if ov is not None:
                    if ov.consumed_base_qty is not None:
                        ov_qty_raw = ov.consumed_base_qty
                    elif ov.planned_base_qty is not None:
                        ov_qty_raw = ov.planned_base_qty
                    elif ov.planned_qty is not None:
                        ov_qty_raw = ov.planned_qty
                    elif ov.quantity is not None:
                        ov_qty_raw = ov.quantity

                if ov_qty_raw is not None:
                    ov_val = max(0.0, float(ov_qty_raw))
                    if is_discrete and ov_val > 0:
                        gross_qty_base = float(math.ceil(round(ov_val, 2) - 1e-6))
                    else:
                        gross_qty_base = round(ov_val, 4)
                    is_overridden = abs(gross_qty_base - standard_scaled_qty_base) > 1e-4
                else:
                    gross_qty_base = standard_scaled_qty_base
                    is_overridden = False

                snap = (
                    db.query(InventorySnapshot)
                    .filter(
                        InventorySnapshot.variant_id == inp.component_variant_id,
                        InventorySnapshot.facility_id == src_facility_id,
                    )
                    .first()
                )
                available_stock_qty = float(snap.stock_qty or 0.0) if snap else 0.0

                if available_stock_qty >= gross_qty_base:
                    availability_status = "AVAILABLE"
                    shortage_qty = 0.0
                elif available_stock_qty > 0:
                    availability_status = "PARTIAL"
                    shortage_qty = round(gross_qty_base - available_stock_qty, 4)
                    has_partial = True
                else:
                    availability_status = "SHORTAGE"
                    shortage_qty = round(gross_qty_base, 4)
                    has_shortage = True

                # Lotes bajo regla FEFO (First Expired, First Out)
                batches = (
                    db.query(Batch)
                    .filter(
                        Batch.product_variant_id == inp.component_variant_id,
                        Batch.is_quarantined == False,
                    )
                    .order_by(Batch.expiry_date.asc().nullslast(), Batch.id.asc())
                    .all()
                )
                valid_batches = [b for b in batches if not b.expiry_date or b.expiry_date >= today]
                chosen_batch = None
                if ov is not None and ov.batch_id:
                    chosen_batch = next((b for b in batches if b.id == ov.batch_id), None)
                    if not chosen_batch:
                        chosen_batch = db.query(Batch).filter(Batch.id == ov.batch_id).first()
                if not chosen_batch:
                    chosen_batch = valid_batches[0] if valid_batches else (batches[0] if batches else None)

                days_to_expiry = (
                    (chosen_batch.expiry_date - today).days
                    if (chosen_batch and chosen_batch.expiry_date)
                    else None
                )

                unit_cost_usd = (
                    float(ov.unit_cost_override_usd)
                    if (ov is not None and ov.unit_cost_override_usd is not None and ov.unit_cost_override_usd >= 0)
                    else get_variant_unit_cost_usd(db, comp_var, facility_id)
                )
                line_cost_usd = gross_qty_base * unit_cost_usd
                standard_cost_usd = standard_scaled_qty_base * unit_cost_usd
                delta_qty_base = round(gross_qty_base - standard_scaled_qty_base, 4)
                delta_pct = (
                    round(((gross_qty_base - standard_scaled_qty_base) / standard_scaled_qty_base) * 100.0, 2)
                    if standard_scaled_qty_base > 0
                    else 0.0
                )
                delta_cost_usd = round(line_cost_usd - standard_cost_usd, 4)

                role = (
                    (ov.input_role if (ov is not None and ov.input_role) else inp.input_role) or "INGREDIENT"
                ).upper()
                if role == "PACKAGING":
                    packaging_cost_usd += line_cost_usd
                else:
                    direct_materials_cost_usd += line_cost_usd
                    total_input_mass_kg += gross_qty_base

                exploded_inputs.append({
                    "bom_input_id": inp.id,
                    "component_variant_id": inp.component_variant_id,
                    "component_sku": comp_var.sku if comp_var else f"VAR-{inp.component_variant_id}",
                    "component_name": prod.name if prod else "Insumo",
                    "input_role": role,
                    "recipe_qty": round(scaled_recipe_qty, 4),
                    "recipe_uom": inp.recipe_uom,
                    "conversion_factor_to_base": conv,
                    "scrap_tolerance_pct": round(scrap_pct, 2),
                    "uom_base": uom_base,
                    "is_discrete_uom": is_discrete,
                    "net_qty_base": round(net_qty_base, 4),
                    "raw_gross_qty_base": round(raw_gross_qty_base, 4),
                    "standard_scaled_qty_base": standard_scaled_qty_base,
                    "planned_base_qty": gross_qty_base,
                    "consumed_base_qty": gross_qty_base,
                    "delta_qty_base": delta_qty_base,
                    "delta_pct": delta_pct,
                    "standard_cost_usd": round(standard_cost_usd, 4),
                    "delta_cost_usd": delta_cost_usd,
                    "delta_cost_ves": round(delta_cost_usd * rate, 2),
                    "is_overridden": is_overridden,
                    "is_extra_input": False,
                    "available_stock_qty": round(available_stock_qty, 4),
                    "shortage_qty": shortage_qty,
                    "availability_status": availability_status,
                    "suggested_batch_id": chosen_batch.id if chosen_batch else None,
                    "suggested_batch_number": chosen_batch.batch_number if chosen_batch else None,
                    "suggested_batch_expiry_date": chosen_batch.expiry_date.isoformat() if (chosen_batch and chosen_batch.expiry_date) else None,
                    "days_to_expiry": days_to_expiry,
                    "available_batches": [
                        {
                            "id": b.id,
                            "batch_number": b.batch_number,
                            "expiry_date": b.expiry_date.isoformat() if b.expiry_date else None,
                            "manufacturing_date": b.manufacturing_date.isoformat() if b.manufacturing_date else None,
                            "days_to_expiry": (b.expiry_date - today).days if b.expiry_date else None,
                        }
                        for b in batches
                    ],
                    "unit_cost_usd": round(unit_cost_usd, 4),
                    "unit_cost_ves": round(unit_cost_usd * rate, 2),
                    "total_cost_usd": round(line_cost_usd, 4),
                    "total_cost_ves": round(line_cost_usd * rate, 2),
                })

            # Insumos adicionales fuera de la receta estándar (Extra Ingredients para esta orden puntual)
            added_extra_variants = set()
            for extra_inp in raw_overrides:
                if extra_inp.bom_input_id is not None and extra_inp.bom_input_id in overrides_by_bom_input_id:
                    if any(bi.id == extra_inp.bom_input_id for bi in bom.inputs):
                        continue
                if extra_inp.component_variant_id in bom_variant_ids or extra_inp.component_variant_id in added_extra_variants:
                    continue

                comp_var = (
                    db.query(ProductVariant)
                    .options(selectinload(ProductVariant.product))
                    .filter(ProductVariant.id == extra_inp.component_variant_id)
                    .first()
                )
                if not comp_var:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Insumo extra (variant_id={extra_inp.component_variant_id}) no encontrado en el catálogo",
                    )
                added_extra_variants.add(extra_inp.component_variant_id)
                prod = comp_var.product
                uom_base = resolve_mfg_uom_base(
                    extra_inp.uom_base or (prod.uom_base if prod else None),
                    None,
                    prod.name if prod else None,
                )

                raw_q = (
                    extra_inp.consumed_base_qty
                    if extra_inp.consumed_base_qty is not None
                    else (
                        extra_inp.planned_base_qty
                        if extra_inp.planned_base_qty is not None
                        else (extra_inp.planned_qty if extra_inp.planned_qty is not None else (extra_inp.quantity or 0.0))
                    )
                )
                raw_gross_qty_base = max(0.0001, float(raw_q))
                is_discrete = not is_weight_uom(uom_base)
                if is_discrete:
                    gross_qty_base = float(math.ceil(round(raw_gross_qty_base, 2) - 1e-6))
                else:
                    gross_qty_base = round(raw_gross_qty_base, 4)

                snap = (
                    db.query(InventorySnapshot)
                    .filter(
                        InventorySnapshot.variant_id == extra_inp.component_variant_id,
                        InventorySnapshot.facility_id == src_facility_id,
                    )
                    .first()
                )
                available_stock_qty = float(snap.stock_qty or 0.0) if snap else 0.0

                if available_stock_qty >= gross_qty_base:
                    availability_status = "AVAILABLE"
                    shortage_qty = 0.0
                elif available_stock_qty > 0:
                    availability_status = "PARTIAL"
                    shortage_qty = round(gross_qty_base - available_stock_qty, 4)
                    has_partial = True
                else:
                    availability_status = "SHORTAGE"
                    shortage_qty = round(gross_qty_base, 4)
                    has_shortage = True

                batches = (
                    db.query(Batch)
                    .filter(
                        Batch.product_variant_id == extra_inp.component_variant_id,
                        Batch.is_quarantined == False,
                    )
                    .order_by(Batch.expiry_date.asc().nullslast(), Batch.id.asc())
                    .all()
                )
                valid_batches = [b for b in batches if not b.expiry_date or b.expiry_date >= today]
                chosen_batch = None
                if extra_inp.batch_id:
                    chosen_batch = next((b for b in batches if b.id == extra_inp.batch_id), None)
                    if not chosen_batch:
                        chosen_batch = db.query(Batch).filter(Batch.id == extra_inp.batch_id).first()
                if not chosen_batch:
                    chosen_batch = valid_batches[0] if valid_batches else (batches[0] if batches else None)

                days_to_expiry = (
                    (chosen_batch.expiry_date - today).days
                    if (chosen_batch and chosen_batch.expiry_date)
                    else None
                )

                unit_cost_usd = (
                    float(extra_inp.unit_cost_override_usd)
                    if (extra_inp.unit_cost_override_usd is not None and extra_inp.unit_cost_override_usd >= 0)
                    else get_variant_unit_cost_usd(db, comp_var, facility_id)
                )
                line_cost_usd = gross_qty_base * unit_cost_usd
                raw_role = (extra_inp.input_role or "INGREDIENT").upper()
                role = "PRIMARY_RAW_MATERIAL" if raw_role in ("PRIMARY_MATRIX", "PRIMARY_RAW_MATERIAL") else raw_role
                if role == "PACKAGING":
                    packaging_cost_usd += line_cost_usd
                else:
                    direct_materials_cost_usd += line_cost_usd
                    total_input_mass_kg += gross_qty_base

                exploded_inputs.append({
                    "bom_input_id": None,
                    "component_variant_id": extra_inp.component_variant_id,
                    "component_sku": comp_var.sku if comp_var else f"VAR-{extra_inp.component_variant_id}",
                    "component_name": prod.name if prod else "Insumo Extra",
                    "input_role": role,
                    "recipe_qty": gross_qty_base,
                    "recipe_uom": uom_base,
                    "conversion_factor_to_base": 1.0,
                    "scrap_tolerance_pct": 0.0,
                    "uom_base": uom_base,
                    "is_discrete_uom": is_discrete,
                    "net_qty_base": gross_qty_base,
                    "raw_gross_qty_base": gross_qty_base,
                    "standard_scaled_qty_base": 0.0,
                    "planned_base_qty": gross_qty_base,
                    "consumed_base_qty": gross_qty_base,
                    "delta_qty_base": gross_qty_base,
                    "delta_pct": 100.0,
                    "standard_cost_usd": 0.0,
                    "delta_cost_usd": round(line_cost_usd, 4),
                    "delta_cost_ves": round(line_cost_usd * rate, 2),
                    "is_overridden": True,
                    "is_extra_input": True,
                    "available_stock_qty": round(available_stock_qty, 4),
                    "shortage_qty": shortage_qty,
                    "availability_status": availability_status,
                    "suggested_batch_id": chosen_batch.id if chosen_batch else None,
                    "suggested_batch_number": chosen_batch.batch_number if chosen_batch else None,
                    "suggested_batch_expiry_date": chosen_batch.expiry_date.isoformat() if (chosen_batch and chosen_batch.expiry_date) else None,
                    "days_to_expiry": days_to_expiry,
                    "available_batches": [
                        {
                            "id": b.id,
                            "batch_number": b.batch_number,
                            "expiry_date": b.expiry_date.isoformat() if b.expiry_date else None,
                            "manufacturing_date": b.manufacturing_date.isoformat() if b.manufacturing_date else None,
                            "days_to_expiry": (b.expiry_date - today).days if b.expiry_date else None,
                        }
                        for b in batches
                    ],
                    "unit_cost_usd": round(unit_cost_usd, 4),
                    "unit_cost_ves": round(unit_cost_usd * rate, 2),
                    "total_cost_usd": round(line_cost_usd, 4),
                    "total_cost_ves": round(line_cost_usd * rate, 2),
                })
        else:
            # MODO TRANSFORMACIÓN LIBRE / AD-HOC (SIN FÓRMULA BOM)
            bom_type = (
                "DIVERGENT_DISASSEMBLY"
                if (req.order_type == "MEAT_DISASSEMBLY" or (req.outputs and len(req.outputs) > 1))
                else "CONVERGENT_RECIPE"
            )
            sector = (
                req.sector
                or (wc.sector if wc else ("MEAT_PROCESSING" if bom_type == "DIVERGENT_DISASSEMBLY" else "BAKERY"))
            )

            for inp in (req.inputs or []):
                comp_var = (
                    db.query(ProductVariant)
                    .options(selectinload(ProductVariant.product))
                    .filter(ProductVariant.id == inp.component_variant_id)
                    .first()
                )
                if not comp_var:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Insumo (variant_id={inp.component_variant_id}) no encontrado en el catálogo",
                    )
                prod = comp_var.product
                uom_base = (inp.uom_base or (prod.uom_base if prod and prod.uom_base else "UND") or "UND").strip().upper()
                inp_qty_val = inp.planned_base_qty if inp.planned_base_qty is not None else (inp.planned_qty or 0.0)
                raw_gross_qty_base = max(0.0001, float(inp_qty_val))
                is_discrete = not is_weight_uom(uom_base)
                if is_discrete:
                    gross_qty_base = float(math.ceil(round(raw_gross_qty_base, 2) - 1e-6))
                else:
                    gross_qty_base = round(raw_gross_qty_base, 4)

                snap = (
                    db.query(InventorySnapshot)
                    .filter(
                        InventorySnapshot.variant_id == inp.component_variant_id,
                        InventorySnapshot.facility_id == src_facility_id,
                    )
                    .first()
                )
                available_stock_qty = float(snap.stock_qty or 0.0) if snap else 0.0

                if available_stock_qty >= gross_qty_base:
                    availability_status = "AVAILABLE"
                    shortage_qty = 0.0
                elif available_stock_qty > 0:
                    availability_status = "PARTIAL"
                    shortage_qty = round(gross_qty_base - available_stock_qty, 4)
                    has_partial = True
                else:
                    availability_status = "SHORTAGE"
                    shortage_qty = round(gross_qty_base, 4)
                    has_shortage = True

                batches = (
                    db.query(Batch)
                    .filter(
                        Batch.product_variant_id == inp.component_variant_id,
                        Batch.is_quarantined == False,
                    )
                    .order_by(Batch.expiry_date.asc().nullslast(), Batch.id.asc())
                    .all()
                )
                valid_batches = [b for b in batches if not b.expiry_date or b.expiry_date >= today]
                chosen_batch = None
                if inp.batch_id:
                    chosen_batch = next((b for b in batches if b.id == inp.batch_id), None)
                    if not chosen_batch:
                        chosen_batch = db.query(Batch).filter(Batch.id == inp.batch_id).first()
                if not chosen_batch:
                    chosen_batch = valid_batches[0] if valid_batches else (batches[0] if batches else None)

                days_to_expiry = (
                    (chosen_batch.expiry_date - today).days
                    if (chosen_batch and chosen_batch.expiry_date)
                    else None
                )

                unit_cost_usd = (
                    float(inp.unit_cost_override_usd)
                    if (inp.unit_cost_override_usd is not None and inp.unit_cost_override_usd >= 0)
                    else get_variant_unit_cost_usd(db, comp_var, facility_id)
                )
                line_cost_usd = gross_qty_base * unit_cost_usd
                raw_role = (
                    inp.input_role
                    or ("PRIMARY_RAW_MATERIAL" if bom_type == "DIVERGENT_DISASSEMBLY" else "INGREDIENT")
                ).upper()
                role = "PRIMARY_RAW_MATERIAL" if raw_role in ("PRIMARY_MATRIX", "PRIMARY_RAW_MATERIAL") else raw_role
                if role == "PACKAGING":
                    packaging_cost_usd += line_cost_usd
                else:
                    direct_materials_cost_usd += line_cost_usd
                    total_input_mass_kg += gross_qty_base

                exploded_inputs.append({
                    "bom_input_id": None,
                    "component_variant_id": inp.component_variant_id,
                    "component_sku": comp_var.sku if comp_var else f"VAR-{inp.component_variant_id}",
                    "component_name": prod.name if prod else "Insumo",
                    "input_role": role,
                    "recipe_qty": gross_qty_base,
                    "recipe_uom": uom_base,
                    "conversion_factor_to_base": 1.0,
                    "scrap_tolerance_pct": 0.0,
                    "uom_base": uom_base,
                    "is_discrete_uom": is_discrete,
                    "net_qty_base": gross_qty_base,
                    "raw_gross_qty_base": gross_qty_base,
                    "standard_scaled_qty_base": gross_qty_base,
                    "planned_base_qty": gross_qty_base,
                    "consumed_base_qty": gross_qty_base,
                    "delta_qty_base": 0.0,
                    "delta_pct": 0.0,
                    "standard_cost_usd": round(line_cost_usd, 4),
                    "delta_cost_usd": 0.0,
                    "delta_cost_ves": 0.0,
                    "is_overridden": False,
                    "is_extra_input": False,
                    "available_stock_qty": round(available_stock_qty, 4),
                    "shortage_qty": shortage_qty,
                    "availability_status": availability_status,
                    "suggested_batch_id": chosen_batch.id if chosen_batch else None,
                    "suggested_batch_number": chosen_batch.batch_number if chosen_batch else None,
                    "suggested_batch_expiry_date": chosen_batch.expiry_date.isoformat() if (chosen_batch and chosen_batch.expiry_date) else None,
                    "days_to_expiry": days_to_expiry,
                    "available_batches": [
                        {
                            "id": b.id,
                            "batch_number": b.batch_number,
                            "expiry_date": b.expiry_date.isoformat() if b.expiry_date else None,
                            "manufacturing_date": b.manufacturing_date.isoformat() if b.manufacturing_date else None,
                            "days_to_expiry": (b.expiry_date - today).days if b.expiry_date else None,
                        }
                        for b in batches
                    ],
                    "unit_cost_usd": round(unit_cost_usd, 4),
                    "unit_cost_ves": round(unit_cost_usd * rate, 2),
                    "total_cost_usd": round(line_cost_usd, 4),
                    "total_cost_ves": round(line_cost_usd * rate, 2),
                })

            if req.planned_base_qty is not None and float(req.planned_base_qty) > 0:
                planned_base_qty = round(float(req.planned_base_qty), 4)
            elif bom_type == "DIVERGENT_DISASSEMBLY":
                planned_base_qty = round(
                    max(0.0001, total_input_mass_kg if total_input_mass_kg > 0 else sum(i["planned_base_qty"] for i in exploded_inputs)),
                    4,
                )
            else:
                planned_base_qty = round(max(0.0001, float(req.outputs[0].planned_qty or 1.0)), 4)
            base_qty = planned_base_qty
            scale_factor = 1.0

        if has_shortage:
            overall_semaphore = "SHORTAGE"
        elif has_partial:
            overall_semaphore = "PARTIAL"
        else:
            overall_semaphore = "AVAILABLE"

        standard_labor_hours = (
            float(req.actual_labor_hours)
            if req.actual_labor_hours is not None
            else (
                float(req.standard_labor_hours)
                if req.standard_labor_hours is not None
                else (float(bom.standard_labor_hours or 0.0) * scale_factor if bom else (0.5 if wc else 0.0))
            )
        )
        hourly_labor_rate = float(wc.hourly_labor_rate or 0.0) if wc else 0.0
        hourly_overhead_rate = float(wc.hourly_overhead_rate or 0.0) if wc else 0.0
        overhead_per_kg = float(wc.overhead_per_kg or 0.0) if wc else 0.0

        direct_labor_cost_usd = standard_labor_hours * hourly_labor_rate
        mass_for_cif = total_input_mass_kg if total_input_mass_kg > 0 else planned_base_qty
        indirect_overhead_cost_usd = (standard_labor_hours * hourly_overhead_rate) + (mass_for_cif * overhead_per_kg)

        total_batch_cost_usd = (
            direct_materials_cost_usd
            + packaging_cost_usd
            + direct_labor_cost_usd
            + indirect_overhead_cost_usd
        )

        if bom is not None:
            expected_shrinkage_pct = max(0.0, min(95.0, float(bom.expected_shrinkage_pct or 0.0)))
            expected_byproduct_qty = 0.0
            if bom.bom_type == "CONVERGENT_RECIPE":
                raw_expected_good_qty = planned_base_qty * (1.0 - expected_shrinkage_pct / 100.0)
                primary_uom = (bom.uom_id or "UND").strip().upper()
                if not is_weight_uom(primary_uom):
                    expected_good_qty = float(max(1, round(raw_expected_good_qty)))
                else:
                    expected_good_qty = round(max(0.0001, raw_expected_good_qty), 4)
                expected_natural_shrinkage_qty = round(max(0.0, planned_base_qty - expected_good_qty), 4)
            else:
                if bom.outputs:
                    expected_good_qty = round(
                        sum(
                            float(o.expected_qty or 0.0) * scale_factor
                            for o in bom.outputs
                            if (o.output_type or "").upper() != "BY_PRODUCT"
                            and (o.cost_allocation_method or "").upper() != "FIXED_NRV"
                        ),
                        4,
                    )
                    expected_byproduct_qty = round(
                        sum(
                            float(o.expected_qty or 0.0) * scale_factor
                            for o in bom.outputs
                            if (o.output_type or "").upper() == "BY_PRODUCT"
                            or (o.cost_allocation_method or "").upper() == "FIXED_NRV"
                        ),
                        4,
                    )
                    expected_natural_shrinkage_qty = round(
                        max(0.0, planned_base_qty - expected_good_qty - expected_byproduct_qty),
                        4,
                    )
                else:
                    expected_good_qty = round(planned_base_qty * (1.0 - expected_shrinkage_pct / 100.0), 4)
                    expected_natural_shrinkage_qty = round(max(0.0, planned_base_qty - expected_good_qty), 4)

            primary_variant = bom.primary_variant
            primary_variant_id = bom.primary_product_variant_id
            primary_uom_id = bom.uom_id
            shelf_life_days = int(bom.shelf_life_days or 1)
            max_allowed_shrinkage_pct = round(float(bom.max_allowed_shrinkage_pct or 0.0), 2)
        else:
            # Transformación Libre (Ad-Hoc)
            has_non_byproduct = any(
                (o.output_type or "").upper() not in ("BY_PRODUCT", "BYPRODUCT")
                and (o.cost_allocation_method or "").upper() != "FIXED_NRV"
                for o in (req.outputs or [])
            )
            expected_good_qty = 0.0
            expected_byproduct_qty = 0.0
            for idx_o, o in enumerate(req.outputs or []):
                o_var = (
                    db.query(ProductVariant)
                    .options(selectinload(ProductVariant.product))
                    .filter(ProductVariant.id == o.output_variant_id)
                    .first()
                )
                o_uom = (
                    o.uom_base
                    or (o_var.product.uom_base if o_var and o_var.product else "UND")
                    or "UND"
                ).strip().upper()
                o_qty = max(0.0001, float(o.planned_qty or 0.0))
                if not is_weight_uom(o_uom):
                    o_qty = float(max(1, round(o_qty)))
                else:
                    o_qty = round(o_qty, 4)

                is_byp_item = (
                    (o.output_type or "").upper() in ("BY_PRODUCT", "BYPRODUCT")
                    or (o.cost_allocation_method or "").upper() == "FIXED_NRV"
                )
                if not has_non_byproduct and idx_o == 0:
                    is_byp_item = False
                if is_byp_item:
                    expected_byproduct_qty += o_qty
                else:
                    expected_good_qty += o_qty

            expected_good_qty = round(expected_good_qty, 4)
            expected_byproduct_qty = round(expected_byproduct_qty, 4)

            if bom_type == "DIVERGENT_DISASSEMBLY":
                ref_in_mass = total_input_mass_kg if total_input_mass_kg > 0 else planned_base_qty
                expected_natural_shrinkage_qty = round(
                    max(0.0, ref_in_mass - expected_good_qty - expected_byproduct_qty),
                    4,
                )
                expected_shrinkage_pct = (
                    round((expected_natural_shrinkage_qty / ref_in_mass) * 100.0, 2)
                    if ref_in_mass > 0
                    else 0.0
                )
                primary_variant_id = req.inputs[0].component_variant_id
            else:
                expected_shrinkage_pct = max(0.0, min(95.0, float(req.expected_shrinkage_pct or 0.0)))
                expected_natural_shrinkage_qty = round(max(0.0, planned_base_qty - expected_good_qty - expected_byproduct_qty), 4)
                primary_variant_id = req.outputs[0].output_variant_id

            primary_variant = (
                db.query(ProductVariant)
                .options(selectinload(ProductVariant.product))
                .filter(ProductVariant.id == primary_variant_id)
                .first()
            )
            primary_uom_id = (
                (primary_variant.product.uom_base if primary_variant and primary_variant.product else "UND")
                or "UND"
            ).strip().upper()
            shelf_life_days = int(req.shelf_life_days or 7)
            max_allowed_shrinkage_pct = round(max(expected_shrinkage_pct + 2.0, 5.0), 2)

        projected_unit_cost_usd = total_batch_cost_usd / expected_good_qty if expected_good_qty > 0 else 0.0

        # Proyección de Nuevo Costo Promedio Ponderado (WAVG) del producto primario
        primary_snap = (
            db.query(InventorySnapshot)
            .filter(
                InventorySnapshot.variant_id == primary_variant_id,
                InventorySnapshot.facility_id == dest_facility_id,
            )
            .first()
        )
        current_pt_stock = max(0.0, float(primary_snap.stock_qty or 0.0)) if primary_snap else 0.0
        current_pt_avg_cost = get_variant_unit_cost_usd(db, primary_variant, dest_facility_id)
        if (current_pt_stock + expected_good_qty) > 0 and expected_good_qty > 0:
            projected_new_wavg_usd = (
                (current_pt_stock * current_pt_avg_cost) + (expected_good_qty * projected_unit_cost_usd)
            ) / (current_pt_stock + expected_good_qty)
        else:
            projected_new_wavg_usd = projected_unit_cost_usd

        current_pvp_usd = get_variant_sales_price_usd(db, primary_variant, dest_facility_id)
        projected_margin_pct = (
            round(((current_pvp_usd - projected_unit_cost_usd) / current_pvp_usd) * 100.0, 2)
            if current_pvp_usd > 0
            else 0.0
        )

        # Explosión / Implosión de salidas esperadas con distribución de Costos Conjuntos NIC 2
        exploded_outputs = []
        byproduct_credit_usd = 0.0
        total_coproducts_market_value_usd = 0.0

        if bom is not None and bom.outputs:
            temp_out_items = []
            for out in bom.outputs:
                out_var = out.output_variant
                out_pvp = (
                    float(out.standard_reference_price)
                    if out.standard_reference_price and float(out.standard_reference_price) > 0
                    else get_variant_sales_price_usd(db, out_var, dest_facility_id)
                )
                if bom.bom_type == "CONVERGENT_RECIPE" and len(bom.outputs) == 1:
                    out_planned_qty = expected_good_qty
                else:
                    out_planned_qty = round(float(out.expected_qty or 0.0) * scale_factor, 4)

                out_type = (out.output_type or "PRIMARY_PRODUCT").upper()
                method = (out.cost_allocation_method or "MARKET_VALUE_INDEX").upper()
                is_byproduct = out_type in ("BY_PRODUCT", "BYPRODUCT") or method == "FIXED_NRV"
                if is_byproduct:
                    byproduct_credit_usd += out_planned_qty * out_pvp
                else:
                    total_coproducts_market_value_usd += out_planned_qty * out_pvp
                temp_out_items.append((
                    out.output_variant_id,
                    out_var,
                    out_pvp,
                    out_planned_qty,
                    out_type,
                    method,
                    is_byproduct,
                    out.uom_id,
                    float(out.expected_yield_pct or (100.0 - expected_shrinkage_pct)),
                ))
        elif bom is None and req.outputs:
            temp_out_items = []
            has_non_byproduct = any(
                (o.output_type or "").upper() not in ("BY_PRODUCT", "BYPRODUCT")
                and (o.cost_allocation_method or "").upper() != "FIXED_NRV"
                for o in req.outputs
            )
            for idx_out, out_in in enumerate(req.outputs):
                out_var = (
                    db.query(ProductVariant)
                    .options(selectinload(ProductVariant.product))
                    .filter(ProductVariant.id == out_in.output_variant_id)
                    .first()
                )
                if not out_var:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Producto resultante (variant_id={out_in.output_variant_id}) no encontrado en el catálogo",
                    )
                out_uom = (
                    out_in.uom_base
                    or (out_var.product.uom_base if out_var and out_var.product else "UND")
                    or "UND"
                ).strip().upper()
                out_planned_qty = max(0.0001, float(out_in.planned_qty or 0.0))
                if not is_weight_uom(out_uom):
                    out_planned_qty = float(max(1, round(out_planned_qty)))
                else:
                    out_planned_qty = round(out_planned_qty, 4)

                out_pvp = (
                    float(out_in.market_reference_price)
                    if out_in.market_reference_price is not None and out_in.market_reference_price > 0
                    else get_variant_sales_price_usd(db, out_var, dest_facility_id)
                )
                raw_out_type = (
                    out_in.output_type
                    or ("PRIMARY_PRODUCT" if len(req.outputs) == 1 else "CO_PRODUCT")
                ).upper()
                if raw_out_type in ("BYPRODUCT", "BY_PRODUCT"):
                    out_type = "BY_PRODUCT"
                elif raw_out_type in ("MAIN_CUT", "CO_PRODUCT"):
                    out_type = "CO_PRODUCT"
                else:
                    out_type = raw_out_type

                raw_method = (
                    out_in.cost_allocation_method
                    or ("FIXED_NRV" if out_type == "BY_PRODUCT" else ("PERCENTAGE" if len(req.outputs) == 1 else "MARKET_VALUE_INDEX"))
                ).upper()
                method = "MARKET_VALUE_INDEX" if raw_method == "SALES_VALUE_NRV" else raw_method
                is_byproduct = out_type == "BY_PRODUCT" or method == "FIXED_NRV"
                if not has_non_byproduct and idx_out == 0:
                    is_byproduct = False
                    out_type = "PRIMARY_PRODUCT"
                    method = "PERCENTAGE" if len(req.outputs) == 1 else "MARKET_VALUE_INDEX"
                if is_byproduct:
                    byproduct_credit_usd += out_planned_qty * out_pvp
                else:
                    total_coproducts_market_value_usd += out_planned_qty * out_pvp

                exp_y_pct = (
                    float(out_in.expected_yield_pct)
                    if out_in.expected_yield_pct is not None
                    else (
                        round((out_planned_qty / planned_base_qty) * 100.0, 3)
                        if planned_base_qty > 0
                        else 100.0
                    )
                )
                temp_out_items.append((
                    out_in.output_variant_id,
                    out_var,
                    out_pvp,
                    out_planned_qty,
                    out_type,
                    method,
                    is_byproduct,
                    out_uom,
                    exp_y_pct,
                ))
        else:
            temp_out_items = []

        if temp_out_items:
            joint_cost_to_allocate_usd = max(0.0, total_batch_cost_usd - byproduct_credit_usd)
            if expected_good_qty > 0:
                projected_unit_cost_usd = joint_cost_to_allocate_usd / expected_good_qty
                if (current_pt_stock + expected_good_qty) > 0:
                    projected_new_wavg_usd = (
                        (current_pt_stock * current_pt_avg_cost) + (expected_good_qty * projected_unit_cost_usd)
                    ) / (current_pt_stock + expected_good_qty)
                else:
                    projected_new_wavg_usd = projected_unit_cost_usd
                projected_margin_pct = (
                    round(((current_pvp_usd - projected_unit_cost_usd) / current_pvp_usd) * 100.0, 2)
                    if current_pvp_usd > 0
                    else 0.0
                )
            use_pct_method = any(
                m == "PERCENTAGE" and not is_byp
                for (_, _, _, _, _, m, is_byp, _, _) in temp_out_items
            )
            active_coprod_indices: List[int] = []
            for idx_item, (out_var_id, out_var, out_pvp, out_planned_qty, out_type, method, is_byproduct, out_uom, exp_y_pct) in enumerate(temp_out_items):
                market_val = round(out_planned_qty * out_pvp, 4)
                if is_byproduct:
                    alloc_pct = 0.0
                    alloc_total_usd = market_val
                elif len(temp_out_items) == 1 and bom_type == "CONVERGENT_RECIPE":
                    active_coprod_indices.append(idx_item)
                    alloc_pct = 100.0
                    alloc_total_usd = round(joint_cost_to_allocate_usd, 4)
                else:
                    active_coprod_indices.append(idx_item)
                    alloc_pct = round(
                        (
                            (market_val / total_coproducts_market_value_usd) * 100.0
                            if (not use_pct_method and total_coproducts_market_value_usd > 0)
                            else (out_planned_qty / max(0.0001, expected_good_qty)) * 100.0
                        ),
                        4,
                    )
                    alloc_total_usd = round(joint_cost_to_allocate_usd * (alloc_pct / 100.0), 4)

                exploded_outputs.append({
                    "output_variant_id": out_var_id,
                    "out_var": out_var,
                    "output_sku": out_var.sku if out_var else f"VAR-{out_var_id}",
                    "output_name": out_var.product.name if out_var and out_var.product else "Producto Terminado",
                    "output_type": out_type,
                    "cost_allocation_method": method,
                    "is_byproduct": is_byproduct,
                    "planned_qty": out_planned_qty,
                    "uom_base": out_uom,
                    "expected_yield_pct": round(exp_y_pct, 3),
                    "market_reference_price_usd": round(out_pvp, 4),
                    "market_reference_price_ves": round(out_pvp * rate, 2),
                    "market_value_usd": market_val,
                    "commercial_value_usd": market_val,
                    "commercial_value_ves": round(market_val * rate, 2),
                    "cost_allocation_pct": round(alloc_pct, 4),
                    "allocated_total_cost_usd": round(alloc_total_usd, 4),
                })

            if active_coprod_indices and joint_cost_to_allocate_usd > 0:
                sum_alloc_usd = round(sum(exploded_outputs[i]["allocated_total_cost_usd"] for i in active_coprod_indices), 4)
                sum_alloc_pct = round(sum(exploded_outputs[i]["cost_allocation_pct"] for i in active_coprod_indices), 4)
                diff_usd = round(joint_cost_to_allocate_usd - sum_alloc_usd, 4)
                diff_pct = round(100.0 - sum_alloc_pct, 4)
                anchor_idx = max(active_coprod_indices, key=lambda i: exploded_outputs[i]["allocated_total_cost_usd"])
                if abs(diff_usd) > 0:
                    exploded_outputs[anchor_idx]["allocated_total_cost_usd"] = round(
                        exploded_outputs[anchor_idx]["allocated_total_cost_usd"] + diff_usd,
                        4,
                    )
                if abs(diff_pct) > 0:
                    exploded_outputs[anchor_idx]["cost_allocation_pct"] = round(
                        exploded_outputs[anchor_idx]["cost_allocation_pct"] + diff_pct,
                        4,
                    )

            for item in exploded_outputs:
                out_var = item.pop("out_var")
                is_byproduct = item.pop("is_byproduct")
                out_var_id = item["output_variant_id"]
                out_planned_qty = item["planned_qty"]
                out_pvp = item["market_reference_price_usd"]
                alloc_total_usd = item["allocated_total_cost_usd"]
                if is_byproduct:
                    calc_unit_usd = round(out_pvp, 4)
                elif len(exploded_outputs) == 1 and bom_type == "CONVERGENT_RECIPE":
                    calc_unit_usd = round(projected_unit_cost_usd, 4)
                else:
                    calc_unit_usd = round(alloc_total_usd / out_planned_qty, 4) if out_planned_qty > 0 else 0.0

                out_snap = (
                    db.query(InventorySnapshot)
                    .filter(
                        InventorySnapshot.variant_id == out_var_id,
                        InventorySnapshot.facility_id == dest_facility_id,
                    )
                    .first()
                )
                out_curr_stock = max(0.0, float(out_snap.stock_qty or 0.0)) if out_snap else 0.0
                out_curr_wavg = (
                    float(out_snap.avg_cost)
                    if (out_snap and out_snap.avg_cost and float(out_snap.avg_cost) > 0)
                    else get_variant_unit_cost_usd(db, out_var, dest_facility_id)
                )
                if (out_curr_stock + out_planned_qty) > 0 and out_planned_qty > 0:
                    out_proj_wavg = (
                        ((out_curr_stock * out_curr_wavg) + (out_planned_qty * calc_unit_usd))
                        / (out_curr_stock + out_planned_qty)
                        if out_curr_stock > 0 and out_curr_wavg > 0
                        else calc_unit_usd
                    )
                else:
                    out_proj_wavg = calc_unit_usd

                out_margin_pct = (
                    round(((out_pvp - calc_unit_usd) / out_pvp) * 100.0, 2) if out_pvp > 0 else 0.0
                )
                item["allocated_total_cost_ves"] = round(alloc_total_usd * rate, 2)
                item["calculated_unit_cost_usd"] = round(calc_unit_usd, 4)
                item["calculated_unit_cost_ves"] = round(calc_unit_usd * rate, 2)
                item["current_wavg_cost_usd"] = round(out_curr_wavg, 4)
                item["projected_wavg_cost_usd"] = round(out_proj_wavg, 4)
                item["projected_margin_pct"] = out_margin_pct
                item["gross_margin_pct"] = out_margin_pct
        else:
            joint_cost_to_allocate_usd = total_batch_cost_usd
            market_val = round(expected_good_qty * current_pvp_usd, 4)
            exploded_outputs.append({
                "output_variant_id": primary_variant_id,
                "output_sku": primary_variant.sku if primary_variant else f"VAR-{primary_variant_id}",
                "output_name": primary_variant.product.name if primary_variant and primary_variant.product else (bom.name if bom else "Producto Terminado"),
                "output_type": "PRIMARY_PRODUCT",
                "cost_allocation_method": "PERCENTAGE",
                "planned_qty": expected_good_qty,
                "uom_base": primary_uom_id,
                "expected_yield_pct": round(100.0 - expected_shrinkage_pct, 3),
                "market_reference_price_usd": round(current_pvp_usd, 4),
                "market_reference_price_ves": round(current_pvp_usd * rate, 2),
                "market_value_usd": market_val,
                "commercial_value_usd": market_val,
                "commercial_value_ves": round(market_val * rate, 2),
                "cost_allocation_pct": 100.0,
                "allocated_total_cost_usd": round(total_batch_cost_usd, 4),
                "allocated_total_cost_ves": round(total_batch_cost_usd * rate, 2),
                "calculated_unit_cost_usd": round(projected_unit_cost_usd, 4),
                "calculated_unit_cost_ves": round(projected_unit_cost_usd * rate, 2),
                "current_wavg_cost_usd": round(current_pt_avg_cost, 4),
                "projected_wavg_cost_usd": round(projected_new_wavg_usd, 4),
                "projected_margin_pct": projected_margin_pct,
                "gross_margin_pct": projected_margin_pct,
            })

        total_commercial_value_usd = round(total_coproducts_market_value_usd + byproduct_credit_usd, 4)
        if bom_type == "DIVERGENT_DISASSEMBLY" and total_commercial_value_usd > 0:
            projected_margin_pct = round(
                ((total_commercial_value_usd - total_batch_cost_usd) / total_commercial_value_usd) * 100.0,
                2,
            )

        return {
            "bom_id": bom.id if bom else None,
            "bom_code": bom.code if bom else "TRANSF-LIBRE",
            "bom_name": bom.name if bom else "Transformación Libre de Materiales",
            "bom_type": bom_type,
            "sector": sector,
            "facility_id": facility_id,
            "facility_name": fac.name if fac else f"Sucursal #{facility_id}",
            "source_warehouse_id": source_warehouse_id,
            "source_warehouse_name": src_wh.name if src_wh else f"Almacén #{source_warehouse_id}",
            "dest_warehouse_id": dest_warehouse_id,
            "dest_warehouse_name": dest_wh.name if dest_wh else f"Almacén #{dest_warehouse_id}",
            "work_center_id": wc.id if wc else (bom.work_center_id if bom else None),
            "work_center_code": wc.code if wc else None,
            "work_center_name": wc.name if wc else None,
            "work_center_capacity_per_batch": round(float(wc.capacity_per_batch or 0.0), 4) if wc else 0.0,
            "work_center_capacity_uom": wc.capacity_uom if wc else None,
            "estimated_machine_batches": (
                int(math.ceil(planned_base_qty / float(wc.capacity_per_batch)))
                if (wc and wc.capacity_per_batch and float(wc.capacity_per_batch) > 0)
                else 1
            ),
            "exceeds_work_center_capacity": bool(
                wc
                and wc.capacity_per_batch
                and float(wc.capacity_per_batch) > 0
                and planned_base_qty > float(wc.capacity_per_batch)
            ),
            "hourly_labor_rate": round(float(wc.hourly_labor_rate or 0.0), 4) if wc else 0.0,
            "hourly_overhead_rate": round(float(wc.hourly_overhead_rate or 0.0), 4) if wc else 0.0,
            "overhead_per_kg": round(float(wc.overhead_per_kg or 0.0), 4) if wc else 0.0,
            "primary_product_variant_id": primary_variant_id,
            "primary_product_sku": primary_variant.sku if primary_variant else None,
            "primary_product_name": (
                primary_variant.product.name
                if primary_variant and primary_variant.product
                else (bom.name if bom else "Transformación Libre de Materiales")
            ),
            "exchange_rate": round(rate, 4),
            "base_qty": round(base_qty, 4),
            "planned_base_qty": round(planned_base_qty, 4),
            "scale_factor": round(scale_factor, 4),
            "uom_id": primary_uom_id,
            "expected_shrinkage_pct": round(expected_shrinkage_pct, 2),
            "max_allowed_shrinkage_pct": max_allowed_shrinkage_pct,
            "expected_natural_shrinkage_qty": expected_natural_shrinkage_qty,
            "expected_byproduct_qty": expected_byproduct_qty,
            "expected_good_qty": expected_good_qty,
            "standard_labor_hours": round(standard_labor_hours, 4),
            "shelf_life_days": shelf_life_days,
            "stock_semaphore": overall_semaphore,
            "cost_projection": {
                "direct_materials_usd": round(direct_materials_cost_usd, 4),
                "direct_materials_ves": round(direct_materials_cost_usd * rate, 2),
                "packaging_usd": round(packaging_cost_usd, 4),
                "packaging_ves": round(packaging_cost_usd * rate, 2),
                "direct_labor_mod_usd": round(direct_labor_cost_usd, 4),
                "direct_labor_mod_ves": round(direct_labor_cost_usd * rate, 2),
                "indirect_overhead_cif_usd": round(indirect_overhead_cost_usd, 4),
                "indirect_overhead_cif_ves": round(indirect_overhead_cost_usd * rate, 2),
                "gross_production_cost_usd": round(total_batch_cost_usd, 4),
                "gross_production_cost_ves": round(total_batch_cost_usd * rate, 2),
                "total_batch_cost_usd": round(total_batch_cost_usd, 4),
                "total_batch_cost_ves": round(total_batch_cost_usd * rate, 2),
                "byproduct_credit_usd": round(byproduct_credit_usd, 4),
                "byproduct_credit_ves": round(byproduct_credit_usd * rate, 2),
                "joint_cost_to_allocate_usd": round(joint_cost_to_allocate_usd, 4),
                "joint_cost_to_allocate_ves": round(joint_cost_to_allocate_usd * rate, 2),
                "net_joint_cost_to_distribute_usd": round(joint_cost_to_allocate_usd, 4),
                "net_joint_cost_to_distribute_ves": round(joint_cost_to_allocate_usd * rate, 2),
                "total_commercial_value_usd": total_commercial_value_usd,
                "total_commercial_value_ves": round(total_commercial_value_usd * rate, 2),
                "projected_unit_cost_usd": round(projected_unit_cost_usd, 4),
                "projected_unit_cost_ves": round(projected_unit_cost_usd * rate, 2),
                "current_stock_qty": round(current_pt_stock, 4),
                "current_wavg_cost_usd": round(current_pt_avg_cost, 4),
                "projected_new_wavg_cost_usd": round(projected_new_wavg_usd, 4),
                "projected_new_wavg_cost_ves": round(projected_new_wavg_usd * rate, 2),
                "current_pvp_usd": round(current_pvp_usd, 4),
                "current_pvp_ves": round(current_pvp_usd * rate, 2),
                "projected_margin_pct": projected_margin_pct,
            },
            "inputs": exploded_inputs,
            "outputs": exploded_outputs,
        }

    @staticmethod
    def _generate_order_number(db: Session) -> str:
        year = datetime.now().year
        prefix = f"OP-{year}-"
        last_order = (
            db.query(ProductionOrder)
            .filter(ProductionOrder.order_number.like(f"{prefix}%"))
            .order_by(ProductionOrder.id.desc())
            .first()
        )
        next_seq = 1
        if last_order and last_order.order_number:
            tail = last_order.order_number.replace(prefix, "")
            if tail.isdigit():
                next_seq = int(tail) + 1
            else:
                next_seq = db.query(ProductionOrder).count() + 1
        return f"{prefix}{next_seq:04d}"

    @staticmethod
    def _generate_plan_number(db: Session) -> str:
        year = datetime.now().year
        prefix = f"PLAN-{year}-"
        last_plan = (
            db.query(ProductionPlan)
            .filter(ProductionPlan.plan_number.like(f"{prefix}%"))
            .order_by(ProductionPlan.id.desc())
            .first()
        )
        next_seq = 1
        if last_plan and last_plan.plan_number:
            tail = last_plan.plan_number.replace(prefix, "")
            if tail.isdigit():
                next_seq = int(tail) + 1
            else:
                next_seq = db.query(ProductionPlan).count() + 1
        return f"{prefix}{next_seq:04d}"

    @staticmethod
    def create_order(
        db: Session,
        req: ProductionOrderCreate,
        user_id: Optional[int] = None,
        plan_line_id: Optional[int] = None,
        commit: bool = True,
    ) -> Dict[str, Any]:
        """
        Crea una Orden de Producción (con BOM o Transformación Libre Ad-Hoc con bom_id=NULL)
        con explosión automática de production_order_inputs (con lote FEFO asignado) y production_order_outputs.
        """
        preview = ProductionService.explode_bom_preview(
            db,
            ExplodePreviewRequest(
                bom_id=req.bom_id,
                planned_base_qty=req.planned_base_qty,
                scale_factor=req.scale_factor,
                facility_id=req.facility_id,
                work_center_id=req.work_center_id,
                source_warehouse_id=req.source_warehouse_id,
                dest_warehouse_id=req.dest_warehouse_id,
                sector=req.sector,
                order_type=req.order_type,
                shelf_life_days=req.shelf_life_days,
                standard_labor_hours=req.standard_labor_hours,
                expected_shrinkage_pct=req.expected_shrinkage_pct,
                inputs=req.inputs,
                input_overrides=req.input_overrides,
                outputs=req.outputs,
            ),
            commit_infra=commit,
        )

        bom = db.query(BOMHeader).filter(BOMHeader.id == req.bom_id).first() if req.bom_id else None
        if req.order_type:
            order_type = req.order_type
        elif bom and bom.bom_type == "DIVERGENT_DISASSEMBLY":
            order_type = "MEAT_DISASSEMBLY"
        elif preview["bom_type"] == "DIVERGENT_DISASSEMBLY" or len(preview["outputs"]) > 1:
            order_type = "MEAT_DISASSEMBLY"
        else:
            order_type = "CONVERGENT_PRODUCTION"

        now = datetime.now(timezone.utc)
        initial_state = "IN_PROGRESS" if req.start_immediately else "PLANNED"

        cp = preview["cost_projection"]
        order = ProductionOrder(
            order_number=ProductionService._generate_order_number(db),
            plan_line_id=plan_line_id,
            facility_id=preview["facility_id"],
            work_center_id=preview["work_center_id"],
            bom_id=req.bom_id,
            order_type=order_type,
            state=initial_state,
            planned_base_qty=Decimal(str(preview["planned_base_qty"])),
            actual_input_weight_kg=Decimal(str(sum(i.get("consumed_base_qty", i["planned_base_qty"]) for i in preview["inputs"] if i["input_role"] != "PACKAGING"))),
            actual_good_output_weight_kg=Decimal(str(preview["expected_good_qty"])),
            actual_byproduct_weight_kg=Decimal(str(preview.get("expected_byproduct_qty", 0.0))),
            natural_shrinkage_qty=Decimal(str(preview["expected_natural_shrinkage_qty"])),
            explicit_waste_qty=Decimal("0.0000"),
            total_direct_material_cost=Decimal(str(cp["direct_materials_usd"])),
            total_packaging_cost=Decimal(str(cp["packaging_usd"])),
            total_direct_labor_cost=Decimal(str(cp["direct_labor_mod_usd"])),
            total_indirect_overhead_cost=Decimal(str(cp["indirect_overhead_cif_usd"])),
            total_byproduct_credit=Decimal(str(cp.get("byproduct_credit_usd", 0.0))),
            total_explicit_waste_cost=Decimal("0.0000"),
            net_production_cost=Decimal(str(cp.get("joint_cost_to_allocate_usd", cp["total_batch_cost_usd"]))),
            source_warehouse_id=preview["source_warehouse_id"],
            dest_warehouse_id=preview["dest_warehouse_id"],
            scheduled_date=req.scheduled_date or now,
            started_at=now if req.start_immediately else None,
            created_by_id=user_id,
            notes=req.notes,
        )
        db.add(order)
        db.flush()

        for inp in preview["inputs"]:
            std_qty = inp.get("standard_scaled_qty_base", inp["planned_base_qty"]) if req.bom_id is not None else inp["planned_base_qty"]
            cons_qty = inp.get("consumed_base_qty", inp["planned_base_qty"])
            db.add(
                ProductionOrderInput(
                    production_order_id=order.id,
                    component_variant_id=inp["component_variant_id"],
                    batch_id=inp["suggested_batch_id"],
                    input_role=inp["input_role"],
                    planned_base_qty=Decimal(str(std_qty)),
                    consumed_base_qty=Decimal(str(cons_qty)),
                    uom_base=inp["uom_base"],
                    unit_cost=Decimal(str(inp["unit_cost_usd"])),
                    total_cost=Decimal(str(inp["total_cost_usd"])),
                )
            )

        for out in preview["outputs"]:
            db.add(
                ProductionOrderOutput(
                    production_order_id=order.id,
                    output_variant_id=out["output_variant_id"],
                    output_type=out["output_type"],
                    planned_qty=Decimal(str(out["planned_qty"])),
                    actual_good_qty=Decimal(str(out["planned_qty"])),
                    explicit_damaged_qty=Decimal("0.0000"),
                    uom_base=out["uom_base"],
                    expected_yield_pct=Decimal(str(out["expected_yield_pct"])),
                    actual_yield_pct=Decimal(str(out["expected_yield_pct"])),
                    market_reference_price=Decimal(str(out["market_reference_price_usd"])),
                    cost_allocation_pct=Decimal(str(out.get("cost_allocation_pct", 100.0 if len(preview["outputs"]) == 1 else 0.0))),
                    allocated_total_cost=Decimal(str(out.get("allocated_total_cost_usd", cp["total_batch_cost_usd"] if len(preview["outputs"]) == 1 else 0.0))),
                    calculated_unit_cost=Decimal(str(out["calculated_unit_cost_usd"])),
                )
            )

        if commit:
            db.commit()
        else:
            db.flush()
        return ProductionService.get_order_detail(db, order.id)

    @staticmethod
    def start_order(db: Session, order_id: int, user_id: Optional[int] = None) -> Dict[str, Any]:
        order = (
            db.query(ProductionOrder)
            .filter(ProductionOrder.id == order_id)
            .with_for_update()
            .first()
        )
        if not order:
            raise HTTPException(status_code=404, detail="Orden de Producción no encontrada")
        if order.state in ("COMPLETED", "CANCELLED"):
            raise HTTPException(
                status_code=400,
                detail=f"No se puede iniciar una orden en estado {order.state}",
            )

        order.state = "IN_PROGRESS"
        if not order.started_at:
            order.started_at = datetime.now(timezone.utc)
        db.add(order)
        db.commit()
        return ProductionService.get_order_detail(db, order.id)

    @staticmethod
    def cancel_order(db: Session, order_id: int, notes: Optional[str] = None) -> Dict[str, Any]:
        order = (
            db.query(ProductionOrder)
            .filter(ProductionOrder.id == order_id)
            .with_for_update()
            .first()
        )
        if not order:
            raise HTTPException(status_code=404, detail="Orden de Producción no encontrada")
        if order.state == "COMPLETED":
            raise HTTPException(
                status_code=400,
                detail="No se puede cancelar una Orden de Producción que ya fue liquidada en el Kardex (COMPLETED).",
            )

        order.state = "CANCELLED"
        if notes:
            order.notes = f"{order.notes or ''}\n[Cancelada]: {notes}".strip()
        db.add(order)
        db.commit()
        return ProductionService.get_order_detail(db, order.id)

    @staticmethod
    def delete_order(db: Session, order_id: int) -> Dict[str, Any]:
        order = (
            db.query(ProductionOrder)
            .filter(ProductionOrder.id == order_id)
            .with_for_update()
            .first()
        )
        if not order:
            raise HTTPException(status_code=404, detail="Orden de Producción no encontrada")
        if order.state == "COMPLETED":
            raise HTTPException(
                status_code=400,
                detail="No se puede eliminar una orden ya liquidada en Kardex (COMPLETED) porque ya generó lotes y movimientos contables de inventario.",
            )

        order_num = order.order_number
        db.delete(order)
        db.commit()
        return {
            "id": order_id,
            "order_number": order_num,
            "deleted": True,
            "message": f"Orden de Producción {order_num} eliminada exitosamente.",
        }

    @staticmethod
    def simulate_butchery_settlement(
        db: Session,
        req: ButcherySimulateSettlementRequest,
    ) -> Dict[str, Any]:
        """
        Motor de Simulación de Liquidación de Sala de Desposte en Vivo (NIC 2 - Costos Conjuntos y Subproductos):
        1. Balance de Masa al 100%:
           W_entrada = W_cortes_buenos + W_subproductos + W_merma_natural + W_merma_explicita
           Devuelve unaccounted_weight_kg y suggested_natural_shrinkage_qty para nivelación con 1 clic.
        2. Cascada Financiera NIC 2:
           - Costo Total Bruto: C_bruto = C_MP_Canal + C_Empaque + C_MOD + C_CIF
           - Crédito por Subproductos (BY_PRODUCT / FIXED_NRV): C_subproductos = sum(Q_b * P_ref_b)
           - Costo Conjunto antes de merma anormal: C_conj = C_bruto - C_subproductos
           - Segregación de Merma Explícita / Anormal: C_merma_anormal -> Gasto (VIRT_LOSS) sin inflar cortes buenos
           - Costo Conjunto Neto a Distribuir: C_neto = C_conj - C_merma_anormal
           - Prorrateo por Valor Relativo de Mercado: V_i = Q_i * P_i, alpha_i = V_i / sum(V_k), C_i = C_neto * alpha_i
           - Reconciliación exacta al 100% (Delta = $0.0000) y proyección de Nuevo WAVG por corte.
        """
        rate_info = get_active_bcv_rate(db, req.exchange_rate_override)
        rate = rate_info["rate"]

        order: Optional[ProductionOrder] = None
        bom: Optional[BOMHeader] = None

        if req.order_id:
            order = (
                db.query(ProductionOrder)
                .options(
                    selectinload(ProductionOrder.bom).selectinload(BOMHeader.work_center),
                    selectinload(ProductionOrder.bom).selectinload(BOMHeader.inputs).selectinload(BOMInput.component_variant).selectinload(ProductVariant.product),
                    selectinload(ProductionOrder.bom).selectinload(BOMHeader.outputs).selectinload(BOMOutput.output_variant).selectinload(ProductVariant.product),
                    selectinload(ProductionOrder.work_center),
                    selectinload(ProductionOrder.inputs).selectinload(ProductionOrderInput.component_variant).selectinload(ProductVariant.product),
                    selectinload(ProductionOrder.outputs).selectinload(ProductionOrderOutput.output_variant).selectinload(ProductVariant.product),
                )
                .filter(ProductionOrder.id == req.order_id)
                .first()
            )
            if not order:
                raise HTTPException(status_code=404, detail="Orden de Desposte no encontrada")
            bom = order.bom

        if not bom and req.bom_id:
            bom = (
                db.query(BOMHeader)
                .options(
                    selectinload(BOMHeader.work_center),
                    selectinload(BOMHeader.inputs).selectinload(BOMInput.component_variant).selectinload(ProductVariant.product),
                    selectinload(BOMHeader.outputs).selectinload(BOMOutput.output_variant).selectinload(ProductVariant.product),
                )
                .filter(BOMHeader.id == req.bom_id)
                .first()
            )
        if not bom and not order and not req.inputs and not req.outputs:
            bom = (
                db.query(BOMHeader)
                .options(
                    selectinload(BOMHeader.work_center),
                    selectinload(BOMHeader.inputs).selectinload(BOMInput.component_variant).selectinload(ProductVariant.product),
                    selectinload(BOMHeader.outputs).selectinload(BOMOutput.output_variant).selectinload(ProductVariant.product),
                )
                .filter(BOMHeader.bom_type == "DIVERGENT_DISASSEMBLY")
                .order_by(BOMHeader.id.asc())
                .first()
            )

        cand_dest_wh_id = (
            req.dest_warehouse_id
            or (order.dest_warehouse_id if order else None)
            or (bom.work_center.warehouse_wip_id if bom and bom.work_center and bom.work_center.warehouse_wip_id else 1)
        )
        dest_wh = db.query(Warehouse).filter(Warehouse.id == cand_dest_wh_id).first()
        if not dest_wh:
            dest_wh = db.query(Warehouse).order_by(Warehouse.id.asc()).first()
        dest_warehouse_id = dest_wh.id if dest_wh else 1

        cand_fac_id = (
            order.facility_id
            if order
            else (req.facility_id or (bom.work_center.facility_id if bom and bom.work_center else None))
        )
        fac = db.query(Facility).filter(Facility.id == cand_fac_id).first() if cand_fac_id else None
        if not fac and bom and bom.work_center and bom.work_center.facility_id:
            fac = db.query(Facility).filter(Facility.id == bom.work_center.facility_id).first()
        if not fac and dest_wh and dest_wh.facility_id:
            fac = db.query(Facility).filter(Facility.id == dest_wh.facility_id).first()
        if not fac:
            fac = db.query(Facility).order_by(Facility.id.asc()).first()
        facility_id = fac.id if fac else 1

        dest_facility_id = dest_wh.facility_id if (dest_wh and dest_wh.facility_id) else facility_id

        wc = (order.work_center if order and order.work_center else None) or (bom.work_center if bom else None)
        base_qty_bom = max(0.0001, float(bom.base_qty or 100.0)) if bom else 100.0

        # 1. Determinar Peso de Entrada de la Canal (W_entrada) y Costos de Materiales + Empaque
        if req.actual_input_weight_kg is not None and req.actual_input_weight_kg > 0:
            input_weight_kg = round(float(req.actual_input_weight_kg), 4)
        elif order and float(order.actual_input_weight_kg or 0) > 0:
            input_weight_kg = round(float(order.actual_input_weight_kg), 4)
        elif order and float(order.planned_base_qty or 0) > 0:
            input_weight_kg = round(float(order.planned_base_qty), 4)
        else:
            input_weight_kg = round(base_qty_bom, 4)

        scale_factor = input_weight_kg / base_qty_bom if base_qty_bom > 0 else 1.0

        direct_materials_cost_usd = 0.0
        packaging_cost_usd = 0.0

        if req.raw_material_cost_usd is not None:
            direct_materials_cost_usd = float(req.raw_material_cost_usd)
            if req.packaging_cost_usd is not None:
                packaging_cost_usd = float(req.packaging_cost_usd)
            elif order:
                packaging_cost_usd = float(order.total_packaging_cost or 0.0)
        elif req.inputs:
            order_inputs_by_id = {i.id: i for i in (order.inputs if order else [])}
            order_inputs_by_var = {i.component_variant_id: i for i in (order.inputs if order else [])}
            non_pkg_req_items = [
                item
                for item in req.inputs
                if (
                    (
                        item.input_role
                        or (
                            (order_inputs_by_id.get(item.input_id) or order_inputs_by_var.get(item.component_variant_id)).input_role
                            if (order_inputs_by_id.get(item.input_id) or order_inputs_by_var.get(item.component_variant_id))
                            else "PRIMARY_RAW_MATERIAL"
                        )
                    ).upper()
                    != "PACKAGING"
                )
            ]
            for item in req.inputs:
                ref_in = (
                    order_inputs_by_id.get(item.input_id)
                    if item.input_id
                    else order_inputs_by_var.get(item.component_variant_id)
                )
                role = (item.input_role or (ref_in.input_role if ref_in else "PRIMARY_RAW_MATERIAL")).upper()
                u_cost = (
                    float(item.unit_cost_override_usd)
                    if item.unit_cost_override_usd is not None and item.unit_cost_override_usd >= 0
                    else (
                        float(ref_in.unit_cost)
                        if ref_in and ref_in.unit_cost and float(ref_in.unit_cost) > 0
                        else get_variant_unit_cost_usd(
                            db,
                            db.query(ProductVariant).filter(ProductVariant.id == item.component_variant_id).first(),
                            facility_id,
                        )
                    )
                )
                q_c = max(0.0, float(item.consumed_base_qty or 0.0))
                if (
                    role != "PACKAGING"
                    and len(non_pkg_req_items) == 1
                    and req.actual_input_weight_kg is not None
                    and req.actual_input_weight_kg > 0
                    and ref_in is not None
                    and abs(q_c - float(ref_in.planned_base_qty or 0.0)) < 1e-4
                    and abs(float(req.actual_input_weight_kg) - q_c) > 1e-4
                ):
                    q_c = round(float(req.actual_input_weight_kg), 4)
                if role == "PACKAGING":
                    packaging_cost_usd += q_c * u_cost
                else:
                    direct_materials_cost_usd += q_c * u_cost
            if req.actual_input_weight_kg is None:
                # Si no se pasó actual_input_weight_kg explícito, usar la suma de insumos no-empaque
                non_pkg_qty = sum(
                    max(0.0, float(i.consumed_base_qty or 0.0))
                    for i in non_pkg_req_items
                )
                if non_pkg_qty > 0:
                    input_weight_kg = round(non_pkg_qty, 4)
        elif order and order.inputs:
            orig_input_kg = max(0.0001, float(order.actual_input_weight_kg or order.planned_base_qty or input_weight_kg))
            weight_ratio = input_weight_kg / orig_input_kg if orig_input_kg > 0 else 1.0
            for inp in order.inputs:
                role = (inp.input_role or "PRIMARY_RAW_MATERIAL").upper()
                u_cost = float(inp.unit_cost or 0.0)
                if u_cost <= 0:
                    u_cost = get_variant_unit_cost_usd(db, inp.component_variant, facility_id)
                base_q = float(
                    inp.consumed_base_qty
                    if inp.consumed_base_qty is not None
                    else (inp.planned_base_qty or 0.0)
                )
                if role == "PACKAGING":
                    packaging_cost_usd += base_q * u_cost
                else:
                    direct_materials_cost_usd += (base_q * weight_ratio) * u_cost
        elif bom and bom.inputs:
            for inp in bom.inputs:
                comp_var = inp.component_variant
                prod = comp_var.product if comp_var else None
                uom_base = resolve_mfg_uom_base(
                    prod.uom_base if prod else None,
                    inp.recipe_uom,
                    prod.name if prod else None,
                )
                scaled_q = float(inp.quantity) if inp.is_fixed_qty else float(inp.quantity) * scale_factor
                conv = resolve_recipe_conversion_factor(inp.recipe_uom, uom_base, inp.conversion_factor_to_base)
                net_q = scaled_q * conv
                scrap_pct = max(0.0, min(95.0, float(inp.scrap_tolerance_pct or 0.0)))
                gross_q = net_q / (1.0 - scrap_pct / 100.0) if scrap_pct < 95.0 else net_q
                if not is_weight_uom(uom_base):
                    gross_q = float(math.ceil(round(gross_q, 2) - 1e-6))
                u_cost = get_variant_unit_cost_usd(db, comp_var, facility_id)
                if (inp.input_role or "").upper() == "PACKAGING":
                    packaging_cost_usd += gross_q * u_cost
                else:
                    direct_materials_cost_usd += gross_q * u_cost

        if req.packaging_cost_usd is not None:
            packaging_cost_usd = float(req.packaging_cost_usd)

        direct_materials_cost_usd = round(direct_materials_cost_usd, 4)
        packaging_cost_usd = round(packaging_cost_usd, 4)

        # 2. Calcular MOD y CIF
        hourly_labor_rate = float(wc.hourly_labor_rate or 0.0) if wc else 0.0
        hourly_overhead_rate = float(wc.hourly_overhead_rate or 0.0) if wc else 0.0
        overhead_per_kg = float(wc.overhead_per_kg or 0.0) if wc else 0.0

        if req.actual_labor_hours is not None and req.actual_labor_hours >= 0:
            actual_labor_hours = float(req.actual_labor_hours)
        elif order and float(order.total_direct_labor_cost or 0) > 0 and hourly_labor_rate > 0:
            actual_labor_hours = float(order.total_direct_labor_cost) / hourly_labor_rate
        elif bom:
            actual_labor_hours = float(bom.standard_labor_hours or 2.5) * scale_factor
        else:
            actual_labor_hours = 0.5 if not wc else 2.5

        if req.direct_labor_cost_override_usd is not None:
            direct_labor_cost_usd = round(float(req.direct_labor_cost_override_usd), 4)
        else:
            direct_labor_cost_usd = round(actual_labor_hours * hourly_labor_rate, 4)

        if req.indirect_overhead_cost_override_usd is not None:
            indirect_overhead_cost_usd = round(float(req.indirect_overhead_cost_override_usd), 4)
        else:
            indirect_overhead_cost_usd = round(
                (actual_labor_hours * hourly_overhead_rate) + (input_weight_kg * overhead_per_kg),
                4,
            )

        gross_production_cost_usd = round(
            direct_materials_cost_usd
            + packaging_cost_usd
            + direct_labor_cost_usd
            + indirect_overhead_cost_usd,
            4,
        )

        # 3. Construir lista normalizada de cortes (outputs)
        order_outputs_by_id = {o.id: o for o in (order.outputs if order else [])}
        order_outputs_by_var = {o.output_variant_id: o for o in (order.outputs if order else [])}
        bom_outputs_by_var = {o.output_variant_id: o for o in (bom.outputs if bom else [])}

        raw_outputs: List[Dict[str, Any]] = []
        if req.outputs is not None and len(req.outputs) > 0:
            for item in req.outputs:
                ref_ord_out = (
                    order_outputs_by_id.get(item.output_id)
                    if item.output_id
                    else order_outputs_by_var.get(item.output_variant_id)
                )
                ref_bom_out = bom_outputs_by_var.get(item.output_variant_id)
                out_var = (
                    ref_ord_out.output_variant
                    if ref_ord_out and ref_ord_out.output_variant
                    else (
                        ref_bom_out.output_variant
                        if ref_bom_out and ref_bom_out.output_variant
                        else (
                            db.query(ProductVariant)
                            .options(selectinload(ProductVariant.product))
                            .filter(ProductVariant.id == item.output_variant_id)
                            .first()
                        )
                    )
                )
                out_type = (
                    item.output_type
                    or (ref_ord_out.output_type if ref_ord_out else None)
                    or (ref_bom_out.output_type if ref_bom_out else "CO_PRODUCT")
                ).upper()
                method = (
                    item.cost_allocation_method
                    or (ref_bom_out.cost_allocation_method if ref_bom_out else None)
                    or ("FIXED_NRV" if out_type == "BY_PRODUCT" else "MARKET_VALUE_INDEX")
                ).upper()
                exp_yield = (
                    float(item.expected_yield_pct)
                    if item.expected_yield_pct is not None
                    else (
                        float(ref_ord_out.expected_yield_pct)
                        if ref_ord_out and ref_ord_out.expected_yield_pct is not None
                        else (float(ref_bom_out.expected_yield_pct) if ref_bom_out and ref_bom_out.expected_yield_pct is not None else 0.0)
                    )
                )
                p_ref = (
                    float(item.market_reference_price)
                    if item.market_reference_price is not None and item.market_reference_price > 0
                    else (
                        float(ref_ord_out.market_reference_price)
                        if ref_ord_out and ref_ord_out.market_reference_price and float(ref_ord_out.market_reference_price) > 0
                        else (
                            float(ref_bom_out.standard_reference_price)
                            if ref_bom_out and ref_bom_out.standard_reference_price and float(ref_bom_out.standard_reference_price) > 0
                            else get_variant_sales_price_usd(db, out_var, dest_facility_id)
                        )
                    )
                )
                planned_q = (
                    float(ref_ord_out.planned_qty)
                    if ref_ord_out and ref_ord_out.planned_qty is not None
                    else round(input_weight_kg * (exp_yield / 100.0), 4)
                )
                uom_b = (
                    ref_ord_out.uom_base
                    if ref_ord_out and ref_ord_out.uom_base
                    else (
                        ref_bom_out.uom_id
                        if ref_bom_out and ref_bom_out.uom_id
                        else ((out_var.product.uom_base if out_var and out_var.product else "KG") or "KG")
                    )
                )
                raw_outputs.append({
                    "output_id": item.output_id or (ref_ord_out.id if ref_ord_out else None),
                    "output_variant_id": item.output_variant_id,
                    "out_var": out_var,
                    "output_type": out_type,
                    "cost_allocation_method": method,
                    "uom_base": uom_b,
                    "expected_yield_pct": round(exp_yield, 3),
                    "planned_qty": round(planned_q, 4),
                    "actual_good_qty": round(max(0.0, float(item.actual_good_qty or 0.0)), 4),
                    "explicit_damaged_qty": round(max(0.0, float(item.explicit_damaged_qty or 0.0)), 4),
                    "market_reference_price_usd": round(p_ref, 4),
                })
        elif order and order.outputs:
            for ord_out in order.outputs:
                ref_bom_out = bom_outputs_by_var.get(ord_out.output_variant_id)
                out_type = (ord_out.output_type or "CO_PRODUCT").upper()
                method = (
                    ref_bom_out.cost_allocation_method
                    if ref_bom_out and ref_bom_out.cost_allocation_method
                    else ("FIXED_NRV" if out_type == "BY_PRODUCT" else "MARKET_VALUE_INDEX")
                ).upper()
                p_ref = (
                    float(ord_out.market_reference_price)
                    if ord_out.market_reference_price and float(ord_out.market_reference_price) > 0
                    else get_variant_sales_price_usd(db, ord_out.output_variant, dest_facility_id)
                )
                raw_outputs.append({
                    "output_id": ord_out.id,
                    "output_variant_id": ord_out.output_variant_id,
                    "out_var": ord_out.output_variant,
                    "output_type": out_type,
                    "cost_allocation_method": method,
                    "uom_base": ord_out.uom_base or "KG",
                    "expected_yield_pct": round(float(ord_out.expected_yield_pct or 0.0), 3),
                    "planned_qty": round(float(ord_out.planned_qty or 0.0), 4),
                    "actual_good_qty": round(float(ord_out.actual_good_qty if ord_out.actual_good_qty is not None else (ord_out.planned_qty or 0.0)), 4),
                    "explicit_damaged_qty": round(float(ord_out.explicit_damaged_qty or 0.0), 4),
                    "market_reference_price_usd": round(p_ref, 4),
                })
        elif bom and bom.outputs:
            for bom_out in bom.outputs:
                out_type = (bom_out.output_type or "CO_PRODUCT").upper()
                method = (bom_out.cost_allocation_method or ("FIXED_NRV" if out_type == "BY_PRODUCT" else "MARKET_VALUE_INDEX")).upper()
                p_ref = (
                    float(bom_out.standard_reference_price)
                    if bom_out.standard_reference_price and float(bom_out.standard_reference_price) > 0
                    else get_variant_sales_price_usd(db, bom_out.output_variant, dest_facility_id)
                )
                q_exp = round(float(bom_out.expected_qty or 0.0) * scale_factor, 4)
                raw_outputs.append({
                    "output_id": None,
                    "output_variant_id": bom_out.output_variant_id,
                    "out_var": bom_out.output_variant,
                    "output_type": out_type,
                    "cost_allocation_method": method,
                    "uom_base": bom_out.uom_id or "KG",
                    "expected_yield_pct": round(float(bom_out.expected_yield_pct or 0.0), 3),
                    "planned_qty": q_exp,
                    "actual_good_qty": q_exp,
                    "explicit_damaged_qty": 0.0,
                    "market_reference_price_usd": round(p_ref, 4),
                })

        # 4. Balance de Masa al 100%
        good_cuts_weight_kg = 0.0
        byproducts_weight_kg = 0.0
        sum_line_damaged_kg = 0.0
        byproduct_credit_usd = 0.0
        total_coproducts_market_value_usd = 0.0

        for ro in raw_outputs:
            is_byp = ro["output_type"] == "BY_PRODUCT" or ro["cost_allocation_method"] == "FIXED_NRV"
            ro["is_byproduct"] = is_byp
            q_good = ro["actual_good_qty"]
            p_ref = ro["market_reference_price_usd"]
            sum_line_damaged_kg += ro["explicit_damaged_qty"]
            if is_byp:
                byproducts_weight_kg += q_good
                byproduct_credit_usd += q_good * p_ref
            else:
                good_cuts_weight_kg += q_good
                total_coproducts_market_value_usd += q_good * p_ref

        if good_cuts_weight_kg <= 0 and byproducts_weight_kg > 0:
            for ro in raw_outputs:
                if ro["actual_good_qty"] > 0:
                    q_good = ro["actual_good_qty"]
                    p_ref = ro["market_reference_price_usd"]
                    ro["is_byproduct"] = False
                    ro["output_type"] = "CO_PRODUCT"
                    ro["cost_allocation_method"] = "MARKET_VALUE_INDEX"
                    byproducts_weight_kg = max(0.0, byproducts_weight_kg - q_good)
                    byproduct_credit_usd = max(0.0, byproduct_credit_usd - (q_good * p_ref))
                    good_cuts_weight_kg += q_good
                    total_coproducts_market_value_usd += q_good * p_ref
                    break

        good_cuts_weight_kg = round(good_cuts_weight_kg, 4)
        byproducts_weight_kg = round(byproducts_weight_kg, 4)
        sum_line_damaged_kg = round(sum_line_damaged_kg, 4)
        byproduct_credit_usd = round(byproduct_credit_usd, 4)
        total_coproducts_market_value_usd = round(total_coproducts_market_value_usd, 4)

        header_explicit_waste_kg = (
            max(0.0, float(req.explicit_waste_qty))
            if req.explicit_waste_qty is not None
            else (float(order.explicit_waste_qty or 0.0) if (order and not req.outputs) else 0.0)
        )
        explicit_waste_qty = round(max(sum_line_damaged_kg, header_explicit_waste_kg), 4)

        suggested_natural_shrinkage_qty = round(
            max(0.0, input_weight_kg - good_cuts_weight_kg - byproducts_weight_kg - explicit_waste_qty),
            4,
        )
        if req.natural_shrinkage_qty is not None and req.natural_shrinkage_qty >= 0:
            natural_shrinkage_qty = round(float(req.natural_shrinkage_qty), 4)
        elif order and order.natural_shrinkage_qty is not None and not req.outputs:
            natural_shrinkage_qty = round(max(0.0, float(order.natural_shrinkage_qty)), 4)
        else:
            natural_shrinkage_qty = suggested_natural_shrinkage_qty

        accounted_weight_kg = round(
            good_cuts_weight_kg + byproducts_weight_kg + natural_shrinkage_qty + explicit_waste_qty,
            4,
        )
        unaccounted_weight_kg = round(input_weight_kg - accounted_weight_kg, 4)
        is_mass_balanced = abs(unaccounted_weight_kg) <= 0.001
        mass_balance_pct = round((accounted_weight_kg / input_weight_kg) * 100.0, 2) if input_weight_kg > 0 else 100.0

        # 5. Algoritmo NIC 2 de Costos Conjuntos y Subproductos
        joint_cost_before_waste_usd = round(max(0.0, gross_production_cost_usd - byproduct_credit_usd), 4)

        effective_coproduct_and_waste_kg = round(good_cuts_weight_kg + explicit_waste_qty, 4)
        if explicit_waste_qty > 0 and effective_coproduct_and_waste_kg > 0:
            unit_cost_after_natural_shrinkage_usd = joint_cost_before_waste_usd / effective_coproduct_and_waste_kg
            explicit_waste_cost_usd = round(explicit_waste_qty * unit_cost_after_natural_shrinkage_usd, 4)
        else:
            unit_cost_after_natural_shrinkage_usd = (
                joint_cost_before_waste_usd / good_cuts_weight_kg if good_cuts_weight_kg > 0 else 0.0
            )
            explicit_waste_cost_usd = 0.0

        net_joint_cost_to_distribute_usd = round(max(0.0, joint_cost_before_waste_usd - explicit_waste_cost_usd), 4)

        # Primera pasada de asignación proporcional a cada corte co-producto
        simulated_outputs: List[Dict[str, Any]] = []
        active_coproduct_indices: List[int] = []
        use_percentage_method = any(
            ro["cost_allocation_method"] == "PERCENTAGE" and not ro["is_byproduct"]
            for ro in raw_outputs
        )

        for idx, ro in enumerate(raw_outputs):
            q_good = ro["actual_good_qty"]
            p_ref = ro["market_reference_price_usd"]
            comm_val = round(q_good * p_ref, 4)
            actual_yield_pct = round((q_good / input_weight_kg) * 100.0, 3) if input_weight_kg > 0 else 0.0
            yield_variance_pct = round(actual_yield_pct - ro["expected_yield_pct"], 3)

            if ro["is_byproduct"]:
                alloc_pct = 0.0
                alloc_total_usd = comm_val
            else:
                if q_good > 0:
                    active_coproduct_indices.append(idx)
                    if not use_percentage_method and total_coproducts_market_value_usd > 0:
                        alpha = (q_good * p_ref) / total_coproducts_market_value_usd
                    elif good_cuts_weight_kg > 0:
                        alpha = q_good / good_cuts_weight_kg
                    else:
                        alpha = 0.0
                    alloc_pct = round(alpha * 100.0, 4)
                    alloc_total_usd = round(net_joint_cost_to_distribute_usd * alpha, 4)
                else:
                    alloc_pct = 0.0
                    alloc_total_usd = 0.0

            simulated_outputs.append({
                "output_id": ro["output_id"],
                "output_variant_id": ro["output_variant_id"],
                "out_var": ro["out_var"],
                "output_sku": ro["out_var"].sku if ro["out_var"] else f"VAR-{ro['output_variant_id']}",
                "output_name": (
                    ro["out_var"].product.name
                    if (ro["out_var"] and ro["out_var"].product)
                    else f"Corte #{ro['output_variant_id']}"
                ),
                "output_type": ro["output_type"],
                "cost_allocation_method": ro["cost_allocation_method"],
                "is_byproduct": ro["is_byproduct"],
                "uom_base": ro["uom_base"],
                "expected_yield_pct": ro["expected_yield_pct"],
                "actual_yield_pct": actual_yield_pct,
                "yield_variance_pct": yield_variance_pct,
                "planned_qty": ro["planned_qty"],
                "actual_good_qty": q_good,
                "explicit_damaged_qty": ro["explicit_damaged_qty"],
                "market_reference_price_usd": p_ref,
                "market_reference_price_ves": round(p_ref * rate, 2),
                "commercial_value_usd": comm_val,
                "commercial_value_ves": round(comm_val * rate, 2),
                "cost_allocation_pct": alloc_pct,
                "allocated_total_cost_usd": alloc_total_usd,
            })

        # Reconciliación exacta al 100% (Delta = $0.0000) sobre el corte principal de mayor absorción
        if active_coproduct_indices and net_joint_cost_to_distribute_usd > 0:
            sum_alloc_usd = round(sum(simulated_outputs[i]["allocated_total_cost_usd"] for i in active_coproduct_indices), 4)
            sum_alloc_pct = round(sum(simulated_outputs[i]["cost_allocation_pct"] for i in active_coproduct_indices), 4)
            diff_usd = round(net_joint_cost_to_distribute_usd - sum_alloc_usd, 4)
            diff_pct = round(100.0 - sum_alloc_pct, 4)
            anchor_idx = max(active_coproduct_indices, key=lambda i: simulated_outputs[i]["allocated_total_cost_usd"])
            if abs(diff_usd) > 0:
                simulated_outputs[anchor_idx]["allocated_total_cost_usd"] = round(
                    simulated_outputs[anchor_idx]["allocated_total_cost_usd"] + diff_usd,
                    4,
                )
            if abs(diff_pct) > 0:
                simulated_outputs[anchor_idx]["cost_allocation_pct"] = round(
                    simulated_outputs[anchor_idx]["cost_allocation_pct"] + diff_pct,
                    4,
                )

        # Segunda pasada: Costo Unitario Liquidado ($/Kg), Nuevo WAVG proyectado y Margen Bruto %
        final_outputs: List[Dict[str, Any]] = []
        is_order_already_completed = bool(order and order.state == "COMPLETED")
        for item in simulated_outputs:
            out_var = item.pop("out_var")
            q_good = item["actual_good_qty"]
            p_ref = item["market_reference_price_usd"]
            alloc_total_usd = item["allocated_total_cost_usd"]
            if item["is_byproduct"]:
                calc_unit_usd = round(p_ref, 4)
            else:
                calc_unit_usd = round(alloc_total_usd / q_good, 4) if q_good > 0 else 0.0

            snap = (
                db.query(InventorySnapshot)
                .filter(
                    InventorySnapshot.variant_id == item["output_variant_id"],
                    InventorySnapshot.facility_id == dest_facility_id,
                )
                .first()
            )
            curr_stock = max(0.0, float(snap.stock_qty or 0.0)) if snap else 0.0
            curr_wavg = (
                float(snap.avg_cost)
                if (snap and snap.avg_cost and float(snap.avg_cost) > 0)
                else get_variant_unit_cost_usd(db, out_var, dest_facility_id)
            )
            if is_order_already_completed:
                proj_wavg = round(curr_wavg if curr_wavg > 0 else calc_unit_usd, 4)
            elif (curr_stock + q_good) > 0 and q_good > 0 and calc_unit_usd > 0:
                proj_wavg = (
                    round(((curr_stock * curr_wavg) + (q_good * calc_unit_usd)) / (curr_stock + q_good), 4)
                    if curr_stock > 0 and curr_wavg > 0
                    else calc_unit_usd
                )
            else:
                proj_wavg = round(curr_wavg if curr_wavg > 0 else calc_unit_usd, 4)

            margin_pct = round(((p_ref - calc_unit_usd) / p_ref) * 100.0, 2) if p_ref > 0 else 0.0

            item["allocated_total_cost_ves"] = round(alloc_total_usd * rate, 2)
            item["calculated_unit_cost_usd"] = calc_unit_usd
            item["calculated_unit_cost_ves"] = round(calc_unit_usd * rate, 2)
            item["current_stock_qty"] = round(curr_stock, 4)
            item["current_wavg_cost_usd"] = round(curr_wavg, 4)
            item["current_wavg_cost_ves"] = round(curr_wavg * rate, 2)
            item["projected_wavg_cost_usd"] = proj_wavg
            item["projected_wavg_cost_ves"] = round(proj_wavg * rate, 2)
            item["gross_margin_pct"] = margin_pct
            final_outputs.append(item)

        allocated_coproducts_cost_usd = round(
            sum(o["allocated_total_cost_usd"] for o in final_outputs if not o["is_byproduct"]),
            4,
        )
        cost_allocation_delta_usd = round(net_joint_cost_to_distribute_usd - allocated_coproducts_cost_usd, 4)
        total_commercial_value_usd = round(total_coproducts_market_value_usd + byproduct_credit_usd, 4)
        total_capitalized_cost_usd = round(net_joint_cost_to_distribute_usd + byproduct_credit_usd, 4)
        global_margin_pct = (
            round(((total_commercial_value_usd - total_capitalized_cost_usd) / total_commercial_value_usd) * 100.0, 2)
            if total_commercial_value_usd > 0
            else 0.0
        )

        expected_shrink_pct = float(bom.expected_shrinkage_pct or 3.0) if bom else 3.0
        max_allowed_shrink_pct = float(bom.max_allowed_shrinkage_pct or 3.5) if bom else 3.5
        natural_shrinkage_pct = round((natural_shrinkage_qty / input_weight_kg) * 100.0, 3) if input_weight_kg > 0 else 0.0

        cost_summary = {
            "direct_materials_usd": direct_materials_cost_usd,
            "direct_materials_ves": round(direct_materials_cost_usd * rate, 2),
            "packaging_usd": packaging_cost_usd,
            "packaging_ves": round(packaging_cost_usd * rate, 2),
            "direct_labor_mod_usd": direct_labor_cost_usd,
            "direct_labor_mod_ves": round(direct_labor_cost_usd * rate, 2),
            "indirect_overhead_cif_usd": indirect_overhead_cost_usd,
            "indirect_overhead_cif_ves": round(indirect_overhead_cost_usd * rate, 2),
            "gross_production_cost_usd": gross_production_cost_usd,
            "gross_production_cost_ves": round(gross_production_cost_usd * rate, 2),
            "byproduct_credit_usd": byproduct_credit_usd,
            "byproduct_credit_ves": round(byproduct_credit_usd * rate, 2),
            "joint_cost_before_waste_usd": joint_cost_before_waste_usd,
            "joint_cost_before_waste_ves": round(joint_cost_before_waste_usd * rate, 2),
            "explicit_waste_cost_usd": explicit_waste_cost_usd,
            "explicit_waste_cost_ves": round(explicit_waste_cost_usd * rate, 2),
            "net_joint_cost_to_distribute_usd": net_joint_cost_to_distribute_usd,
            "net_joint_cost_to_distribute_ves": round(net_joint_cost_to_distribute_usd * rate, 2),
            "net_cost_pool_for_main_cuts_usd": net_joint_cost_to_distribute_usd,
            "net_production_cost_usd": net_joint_cost_to_distribute_usd,
            "net_production_cost_ves": round(net_joint_cost_to_distribute_usd * rate, 2),
            "allocated_coproducts_cost_usd": allocated_coproducts_cost_usd,
            "allocated_coproducts_cost_ves": round(allocated_coproducts_cost_usd * rate, 2),
            "total_allocated_main_cuts_usd": allocated_coproducts_cost_usd,
            "total_capitalized_inventory_cost_usd": total_capitalized_cost_usd,
            "total_capitalized_inventory_cost_ves": round(total_capitalized_cost_usd * rate, 2),
            "cost_allocation_delta_usd": cost_allocation_delta_usd,
            "reconciliation_delta_usd": cost_allocation_delta_usd,
            "total_coproducts_market_value_usd": total_coproducts_market_value_usd,
            "total_coproducts_market_value_ves": round(total_coproducts_market_value_usd * rate, 2),
            "total_commercial_value_usd": total_commercial_value_usd,
            "total_commercial_value_ves": round(total_commercial_value_usd * rate, 2),
            "projected_global_margin_pct": global_margin_pct,
        }

        return {
            "order_id": order.id if order else None,
            "order_number": order.order_number if order else None,
            "bom_id": bom.id if bom else None,
            "bom_code": bom.code if bom else "TRANSF-LIBRE",
            "bom_name": bom.name if bom else "Transformación Libre de Materiales",
            "exchange_rate": round(rate, 4),
            "actual_input_weight_kg": input_weight_kg,
            "actual_labor_hours": round(actual_labor_hours, 2),
            "mass_balance": {
                "input_weight_kg": input_weight_kg,
                "good_cuts_weight_kg": good_cuts_weight_kg,
                "main_cuts_good_weight_kg": good_cuts_weight_kg,
                "byproducts_weight_kg": byproducts_weight_kg,
                "byproduct_good_weight_kg": byproducts_weight_kg,
                "natural_shrinkage_qty": natural_shrinkage_qty,
                "natural_shrinkage_weight_kg": natural_shrinkage_qty,
                "explicit_waste_qty": explicit_waste_qty,
                "explicit_waste_weight_kg": explicit_waste_qty,
                "accounted_weight_kg": accounted_weight_kg,
                "unaccounted_weight_kg": unaccounted_weight_kg,
                "suggested_natural_shrinkage_qty": suggested_natural_shrinkage_qty,
                "is_balanced": is_mass_balanced,
                "is_mass_balanced": is_mass_balanced,
                "mass_balance_pct": mass_balance_pct,
                "accounted_pct": mass_balance_pct,
                "good_cuts_yield_pct": round((good_cuts_weight_kg / input_weight_kg) * 100.0, 3) if input_weight_kg > 0 else 0.0,
                "byproducts_yield_pct": round((byproducts_weight_kg / input_weight_kg) * 100.0, 3) if input_weight_kg > 0 else 0.0,
                "total_meat_recovery_pct": round(((good_cuts_weight_kg + byproducts_weight_kg) / input_weight_kg) * 100.0, 3) if input_weight_kg > 0 else 0.0,
                "natural_shrinkage_pct": natural_shrinkage_pct,
                "explicit_waste_pct": round((explicit_waste_qty / input_weight_kg) * 100.0, 3) if input_weight_kg > 0 else 0.0,
                "expected_shrinkage_pct": expected_shrink_pct,
                "max_allowed_shrinkage_pct": max_allowed_shrink_pct,
                "exceeds_max_shrinkage": natural_shrinkage_pct > max_allowed_shrink_pct,
            },
            "cost_summary": cost_summary,
            "cost_waterfall": cost_summary,
            "outputs": final_outputs,
        }

    @staticmethod
    def complete_order(
        db: Session,
        order_id: int,
        req: CompleteOrderRequest,
        user_id: Optional[int] = None,
        commit: bool = True,
    ) -> Dict[str, Any]:
        """
        Liquidación Atómica al Kardex bajo NIC 2 (Convergente N->1, Desposte Divergente 1->N y Transformaciones Libres Ad-Hoc):
        1. Registra StockPicking (MFG_CONSUME / MFG_OUT) y StockMoves de insumos hacia VIRT_PRODUCTION.
        2. Calcula acumuladores de costo reales (Materiales, Empaque, MOD, CIF).
        3. Descuenta el Crédito por Subproductos (BY_PRODUCT / FIXED_NRV) para obtener C_conj.
        4. Si existe Merma Explícita / Anormal (explicit_damaged_qty / explicit_waste_qty > 0), segrega su costo proporcional
           a total_explicit_waste_cost (NO infla el producto/corte bueno) y crea StockMove VIRT_PRODUCTION -> VIRT_LOSS
           con adjustment_reason_id = MERMA_PROD_ANORMAL.
        5. La Merma Natural / Técnica (natural_shrinkage_qty) es absorbida orgánicamente por las unidades/cortes buenos.
        6. En órdenes de Desposte (MEAT_DISASSEMBLY / multi-salida), prorratea C_neto por Valor Relativo de Mercado
           cuadrando el 100% del costo (Delta = $0.00), genera lote sanitario individual L-{order_number}-{sku} por cada corte,
           inserta StockMove en MFG_PRODUCE y actualiza WAVG en InventorySnapshot y ProductVariant sin duplicar stock_qty.
        """
        # Bloquear la fila de la Orden de Producción primero para evitar condiciones de carrera (doble liquidación)
        locked_order = (
            db.query(ProductionOrder)
            .filter(ProductionOrder.id == order_id)
            .with_for_update()
            .first()
        )
        if not locked_order:
            raise HTTPException(status_code=404, detail="Orden de Producción no encontrada")
        if locked_order.state == "COMPLETED":
            raise HTTPException(status_code=400, detail="La Orden de Producción ya fue liquidada anteriormente")
        if locked_order.state == "CANCELLED":
            raise HTTPException(status_code=400, detail="No se puede liquidar una Orden de Producción cancelada")

        infra = ProductionService.ensure_mfg_wms_infrastructure(db, commit=False)
        virt_prod: Location = infra["virt_production"]
        virt_loss: Location = infra["virt_loss"]
        picking_type_consume: StockPickingType = infra["picking_consume"]
        picking_type_produce: StockPickingType = infra["picking_produce"]
        abnormal_reason: AdjustmentReason = infra["abnormal_reason"]

        order = (
            db.query(ProductionOrder)
            .options(
                selectinload(ProductionOrder.bom).selectinload(BOMHeader.work_center),
                selectinload(ProductionOrder.bom).selectinload(BOMHeader.outputs),
                selectinload(ProductionOrder.work_center),
                selectinload(ProductionOrder.inputs).selectinload(ProductionOrderInput.component_variant).selectinload(ProductVariant.product),
                selectinload(ProductionOrder.outputs).selectinload(ProductionOrderOutput.output_variant).selectinload(ProductVariant.product),
            )
            .filter(ProductionOrder.id == order_id)
            .first()
        )

        now = datetime.now(timezone.utc)
        today = date.today()
        if not order.started_at:
            order.started_at = now

        src_loc = ProductionService.get_warehouse_internal_location(db, order.source_warehouse_id)
        dest_loc = ProductionService.get_warehouse_internal_location(db, order.dest_warehouse_id)
        src_wh = db.query(Warehouse).filter(Warehouse.id == order.source_warehouse_id).first()
        src_facility_id = src_wh.facility_id if (src_wh and src_wh.facility_id) else order.facility_id
        dest_wh = db.query(Warehouse).filter(Warehouse.id == order.dest_warehouse_id).first()
        dest_facility_id = dest_wh.facility_id if (dest_wh and dest_wh.facility_id) else order.facility_id

        # 1. Mapear consumos reales recibidos en req.inputs (incluyendo insumos nuevos agregados en piso de planta)
        existing_input_ids = {i.id for i in order.inputs}
        existing_input_vars = {i.component_variant_id for i in order.inputs}
        input_overrides_by_id = {}
        input_overrides_by_variant = {}
        if req.inputs:
            for item in req.inputs:
                if item.input_id and item.input_id in existing_input_ids:
                    input_overrides_by_id[item.input_id] = item
                elif item.component_variant_id and item.component_variant_id in existing_input_vars:
                    input_overrides_by_variant[item.component_variant_id] = item
                elif item.component_variant_id and float(item.consumed_base_qty or 0.0) > 0:
                    # Nuevo insumo agregado durante la ejecución de la orden
                    comp_var = (
                        db.query(ProductVariant)
                        .options(selectinload(ProductVariant.product))
                        .filter(ProductVariant.id == item.component_variant_id)
                        .first()
                    )
                    if comp_var:
                        uom_b = ((comp_var.product.uom_base if comp_var.product else "UND") or "UND").strip().upper()
                        u_cost = (
                            float(item.unit_cost_override_usd)
                            if (item.unit_cost_override_usd is not None and item.unit_cost_override_usd >= 0)
                            else get_variant_unit_cost_usd(db, comp_var, src_facility_id)
                        )
                        q_new = round(float(item.consumed_base_qty), 4)
                        std_planned_new = Decimal("0.0000") if order.bom_id is not None else Decimal(str(q_new))
                        new_inp = ProductionOrderInput(
                            production_order_id=order.id,
                            component_variant_id=comp_var.id,
                            batch_id=item.batch_id,
                            input_role=(item.input_role or "INGREDIENT").upper(),
                            planned_base_qty=std_planned_new,
                            consumed_base_qty=Decimal(str(q_new)),
                            uom_base=uom_b,
                            unit_cost=Decimal(str(round(u_cost, 4))),
                            total_cost=Decimal(str(round(q_new * u_cost, 4))),
                        )
                        new_inp.component_variant = comp_var
                        db.add(new_inp)
                        db.flush()
                        order.inputs.append(new_inp)
                        input_overrides_by_id[new_inp.id] = item
                        existing_input_ids.add(new_inp.id)
                        existing_input_vars.add(comp_var.id)

        consume_picking_name = f"MFG-OUT/{order.order_number}"
        existing_cp = db.query(StockPicking).filter(StockPicking.name == consume_picking_name).first()
        if existing_cp:
            consume_picking_name = f"MFG-OUT/{order.order_number}-{int(now.timestamp())}"

        consume_picking = StockPicking(
            picking_type_id=picking_type_consume.id,
            name=consume_picking_name,
            origin_document=order.order_number,
            facility_id=src_facility_id,
            status="DONE",
            notes=f"Descargo de insumos a piso de planta ({order.order_number})",
            scheduled_date=now,
            date_done=now,
            created_by_id=user_id,
        )
        db.add(consume_picking)
        db.flush()

        total_direct_material_cost = 0.0
        total_packaging_cost = 0.0
        actual_input_weight_kg = 0.0

        non_pkg_inputs = [i for i in order.inputs if (i.input_role or "").upper() != "PACKAGING"]

        for inp in order.inputs:
            role = (inp.input_role or "INGREDIENT").upper()
            ov = input_overrides_by_id.get(inp.id) or input_overrides_by_variant.get(inp.component_variant_id)
            if ov is not None:
                consumed_qty = max(0.0, float(ov.consumed_base_qty))
                if (
                    role != "PACKAGING"
                    and len(non_pkg_inputs) == 1
                    and req.actual_input_weight_kg is not None
                    and req.actual_input_weight_kg > 0
                    and abs(consumed_qty - float(inp.planned_base_qty or 0.0)) < 1e-4
                    and abs(float(req.actual_input_weight_kg) - consumed_qty) > 1e-4
                ):
                    consumed_qty = float(req.actual_input_weight_kg)
                if ov.batch_id is not None:
                    inp.batch_id = ov.batch_id
                if ov.unit_cost_override_usd is not None and ov.unit_cost_override_usd >= 0:
                    inp.unit_cost = Decimal(str(round(float(ov.unit_cost_override_usd), 4)))
            elif (
                req.actual_input_weight_kg is not None
                and req.actual_input_weight_kg > 0
                and role != "PACKAGING"
                and len(non_pkg_inputs) == 1
            ):
                consumed_qty = float(req.actual_input_weight_kg)
            else:
                consumed_qty = float(
                    inp.consumed_base_qty
                    if inp.consumed_base_qty is not None
                    else (inp.planned_base_qty or 0.0)
                )

            if not is_weight_uom(inp.uom_base) and consumed_qty > 0:
                consumed_qty = float(math.ceil(round(consumed_qty, 2) - 1e-6))
            else:
                consumed_qty = round(consumed_qty, 4)

            if not inp.batch_id:
                fefo_batch = (
                    db.query(Batch)
                    .filter(
                        Batch.product_variant_id == inp.component_variant_id,
                        Batch.is_quarantined == False,
                    )
                    .order_by(Batch.expiry_date.asc().nullslast(), Batch.id.asc())
                    .first()
                )
                if fefo_batch:
                    inp.batch_id = fefo_batch.id

            unit_cost_val = float(inp.unit_cost or 0.0)
            if unit_cost_val <= 0:
                unit_cost_val = get_variant_unit_cost_usd(db, inp.component_variant, src_facility_id)

            line_total_cost = round(consumed_qty * unit_cost_val, 4)
            inp.consumed_base_qty = Decimal(str(consumed_qty))
            inp.unit_cost = Decimal(str(round(unit_cost_val, 4)))
            inp.total_cost = Decimal(str(line_total_cost))

            if role == "PACKAGING":
                total_packaging_cost += line_total_cost
            else:
                total_direct_material_cost += line_total_cost
                actual_input_weight_kg += consumed_qty

            if consumed_qty > 0:
                in_snap = (
                    db.query(InventorySnapshot)
                    .filter(
                        InventorySnapshot.variant_id == inp.component_variant_id,
                        InventorySnapshot.facility_id == src_facility_id,
                    )
                    .first()
                )
                hist_avg = (
                    float(in_snap.avg_cost)
                    if (in_snap and in_snap.avg_cost and float(in_snap.avg_cost) > 0)
                    else unit_cost_val
                )
                in_move = StockMove(
                    picking_id=consume_picking.id,
                    product_id=inp.component_variant_id,
                    location_src_id=src_loc.id,
                    location_dest_id=virt_prod.id,
                    quantity_demand=inp.planned_base_qty,
                    quantity_done=Decimal(str(consumed_qty)),
                    uom_id=inp.uom_base,
                    state="DONE",
                    notes=f"Consumo OP {order.order_number} ({role})",
                    batch_id=inp.batch_id,
                    unit_cost=Decimal(str(round(unit_cost_val, 4))),
                    historic_avg_cost=Decimal(str(round(hist_avg, 4))),
                    reference=f"{order.order_number} [MFG_CONSUME]",
                    created_by_id=user_id,
                )
                db.add(in_move)
                db.flush()
                if in_snap is not None:
                    db.refresh(in_snap)
                inp.stock_move_id = in_move.id

        if req.actual_input_weight_kg is not None and req.actual_input_weight_kg > 0 and actual_input_weight_kg <= 0:
            actual_input_weight_kg = round(float(req.actual_input_weight_kg), 4)

        # 2. Calcular MOD y CIF reales
        bom = order.bom
        wc = order.work_center or (bom.work_center if bom else None)
        base_qty_bom = max(0.0001, float(bom.base_qty or 1.0)) if bom else 1.0
        scale_factor = float(order.planned_base_qty or base_qty_bom) / base_qty_bom

        hourly_labor_rate = float(wc.hourly_labor_rate or 0.0) if wc else 0.0
        hourly_overhead_rate = float(wc.hourly_overhead_rate or 0.0) if wc else 0.0
        overhead_per_kg = float(wc.overhead_per_kg or 0.0) if wc else 0.0

        if req.actual_labor_hours is not None and req.actual_labor_hours >= 0:
            actual_labor_hours = float(req.actual_labor_hours)
        elif float(order.total_direct_labor_cost or 0.0) > 0 and hourly_labor_rate > 0:
            actual_labor_hours = float(order.total_direct_labor_cost) / hourly_labor_rate
        elif bom:
            actual_labor_hours = float(bom.standard_labor_hours or 0.0) * scale_factor
        else:
            actual_labor_hours = 0.5 if wc else 0.0

        total_direct_labor_cost = round(actual_labor_hours * hourly_labor_rate, 4)
        mass_for_cif = actual_input_weight_kg if actual_input_weight_kg > 0 else float(order.planned_base_qty or 1.0)
        total_indirect_overhead_cost = round(
            (actual_labor_hours * hourly_overhead_rate) + (mass_for_cif * overhead_per_kg),
            4,
        )
        total_maquila_cost = float(order.total_maquila_service_cost or 0.0)

        gross_production_cost = round(
            total_direct_material_cost
            + total_packaging_cost
            + total_direct_labor_cost
            + total_indirect_overhead_cost
            + total_maquila_cost,
            4,
        )

        # 3. Mapear salidas reales (incluyendo cortes/salidas nuevas agregadas en piso de planta)
        existing_output_ids = {o.id for o in order.outputs}
        existing_output_vars = {o.output_variant_id for o in order.outputs}
        output_overrides_by_id = {}
        output_overrides_by_variant = {}
        if req.outputs:
            for item in req.outputs:
                if item.output_id and item.output_id in existing_output_ids:
                    output_overrides_by_id[item.output_id] = item
                elif item.output_variant_id and item.output_variant_id in existing_output_vars:
                    output_overrides_by_variant[item.output_variant_id] = item
                elif item.output_variant_id and (float(item.actual_good_qty or 0.0) > 0 or float(item.explicit_damaged_qty or 0.0) > 0):
                    # Nuevo corte/salida agregada durante la ejecución de la orden
                    out_var = (
                        db.query(ProductVariant)
                        .options(selectinload(ProductVariant.product))
                        .filter(ProductVariant.id == item.output_variant_id)
                        .first()
                    )
                    if out_var:
                        uom_b = ((out_var.product.uom_base if out_var.product else "KG") or "KG").strip().upper()
                        p_ref = (
                            float(item.market_reference_price)
                            if (item.market_reference_price is not None and item.market_reference_price > 0)
                            else get_variant_sales_price_usd(db, out_var, dest_facility_id)
                        )
                        q_good_new = round(float(item.actual_good_qty or 0.0), 4)
                        new_out = ProductionOrderOutput(
                            production_order_id=order.id,
                            output_variant_id=out_var.id,
                            output_type=(item.output_type or "CO_PRODUCT").upper(),
                            planned_qty=Decimal(str(q_good_new)),
                            actual_good_qty=Decimal(str(q_good_new)),
                            explicit_damaged_qty=Decimal(str(round(float(item.explicit_damaged_qty or 0.0), 4))),
                            uom_base=uom_b,
                            expected_yield_pct=Decimal(str(round(float(item.expected_yield_pct or 0.0), 3))),
                            actual_yield_pct=Decimal("0.000"),
                            market_reference_price=Decimal(str(round(p_ref, 4))),
                            cost_allocation_pct=Decimal("0.0000"),
                            allocated_total_cost=Decimal("0.0000"),
                            calculated_unit_cost=Decimal("0.0000"),
                        )
                        new_out.output_variant = out_var
                        db.add(new_out)
                        db.flush()
                        order.outputs.append(new_out)
                        output_overrides_by_id[new_out.id] = item
                        existing_output_ids.add(new_out.id)
                        existing_output_vars.add(out_var.id)

        bom_outputs_by_var = {o.output_variant_id: o for o in (bom.outputs if bom and bom.outputs else [])}
        effective_method_by_out_id: Dict[int, str] = {}
        total_good_qty = 0.0
        total_byproduct_qty = 0.0
        sum_line_damaged_qty = 0.0

        for idx, out_line in enumerate(order.outputs):
            ov = output_overrides_by_id.get(out_line.id) or output_overrides_by_variant.get(out_line.output_variant_id)
            if ov is not None:
                good_q = max(0.0, float(ov.actual_good_qty))
                dmg_q = max(0.0, float(ov.explicit_damaged_qty or 0.0))
                if ov.market_reference_price is not None and ov.market_reference_price > 0:
                    out_line.market_reference_price = Decimal(str(round(float(ov.market_reference_price), 4)))
                if ov.output_type:
                    out_line.output_type = ov.output_type.upper()
                if ov.expected_yield_pct is not None:
                    out_line.expected_yield_pct = Decimal(str(round(float(ov.expected_yield_pct), 3)))
            elif idx == 0 and (req.actual_good_qty is not None or req.explicit_damaged_qty is not None):
                good_q = (
                    max(0.0, float(req.actual_good_qty))
                    if req.actual_good_qty is not None
                    else float(out_line.actual_good_qty or out_line.planned_qty)
                )
                dmg_q = max(0.0, float(req.explicit_damaged_qty or 0.0))
            else:
                good_q = float(out_line.actual_good_qty if out_line.actual_good_qty is not None else out_line.planned_qty)
                dmg_q = float(out_line.explicit_damaged_qty or 0.0)

            if not is_weight_uom(out_line.uom_base):
                good_q = float(round(good_q))
                dmg_q = float(round(dmg_q))
            else:
                good_q = round(good_q, 4)
                dmg_q = round(dmg_q, 4)

            out_line.actual_good_qty = Decimal(str(good_q))
            out_line.explicit_damaged_qty = Decimal(str(dmg_q))

            ref_bom_out = bom_outputs_by_var.get(out_line.output_variant_id)
            eff_method = (
                (ov.cost_allocation_method if (ov and ov.cost_allocation_method) else None)
                or (ref_bom_out.cost_allocation_method if (ref_bom_out and ref_bom_out.cost_allocation_method) else None)
                or ("FIXED_NRV" if (out_line.output_type or "").upper() == "BY_PRODUCT" else "MARKET_VALUE_INDEX")
            ).upper()
            effective_method_by_out_id[out_line.id] = eff_method
            is_byp = (out_line.output_type or "").upper() == "BY_PRODUCT" or eff_method == "FIXED_NRV"
            if is_byp:
                total_byproduct_qty += good_q
            else:
                total_good_qty += good_q
            sum_line_damaged_qty += dmg_q

        if (total_good_qty + total_byproduct_qty) <= 0:
            db.rollback()
            raise HTTPException(
                status_code=400,
                detail="La cantidad de unidades buenas producidas (actual_good_qty) debe ser mayor a cero para liquidar la orden.",
            )

        if total_good_qty <= 0 and total_byproduct_qty > 0:
            for out_line in order.outputs:
                q_good = float(out_line.actual_good_qty or 0.0)
                if q_good > 0:
                    out_line.output_type = "CO_PRODUCT" if order.order_type == "MEAT_DISASSEMBLY" else "PRIMARY_PRODUCT"
                    effective_method_by_out_id[out_line.id] = "MARKET_VALUE_INDEX"
                    total_byproduct_qty = max(0.0, total_byproduct_qty - q_good)
                    total_good_qty += q_good
                    break

        header_explicit_waste = max(
            0.0,
            float(
                req.explicit_waste_qty
                if req.explicit_waste_qty is not None
                else (req.explicit_damaged_qty if req.explicit_damaged_qty is not None else 0.0)
            ),
        )
        total_explicit_damaged_qty = round(max(sum_line_damaged_qty, header_explicit_waste), 4)

        reference_mass = (
            actual_input_weight_kg
            if (order.order_type == "MEAT_DISASSEMBLY" and actual_input_weight_kg > 0)
            else float(order.planned_base_qty or 1.0)
        )
        if req.natural_shrinkage_qty is not None and req.natural_shrinkage_qty >= 0:
            natural_shrinkage_qty = round(float(req.natural_shrinkage_qty), 4)
        else:
            natural_shrinkage_qty = round(
                max(0.0, reference_mass - total_good_qty - total_byproduct_qty - total_explicit_damaged_qty),
                4,
            )

        if order.order_type == "MEAT_DISASSEMBLY":
            accounted_mass = round(
                total_good_qty + total_byproduct_qty + natural_shrinkage_qty + total_explicit_damaged_qty,
                4,
            )
            unaccounted_mass = round(reference_mass - accounted_mass, 4)
            if abs(unaccounted_mass) > 0.05:
                db.rollback()
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"El Balance de Masa debe cuadrar al 100% para liquidar el desposte "
                        f"(Entrada: {reference_mass} kg vs Contabilizado: {accounted_mass} kg, "
                        f"Diferencia sin asignar: {unaccounted_mass} kg)."
                    ),
                )

        # 4. Calcular Crédito por Subproductos (BY_PRODUCT / FIXED_NRV) y Valor Relativo de Mercado
        total_market_val = 0.0
        byproduct_credit = 0.0
        for out_line in order.outputs:
            q_good = float(out_line.actual_good_qty or 0.0)
            p_ref = float(out_line.market_reference_price or 0.0)
            if p_ref <= 0:
                p_ref = get_variant_sales_price_usd(db, out_line.output_variant, dest_facility_id)
                out_line.market_reference_price = Decimal(str(round(p_ref, 4)))
            eff_method = effective_method_by_out_id.get(out_line.id, "MARKET_VALUE_INDEX")
            is_byp = (out_line.output_type or "").upper() == "BY_PRODUCT" or eff_method == "FIXED_NRV"
            if is_byp:
                byproduct_credit += q_good * p_ref
            else:
                total_market_val += q_good * p_ref

        byproduct_credit = round(byproduct_credit, 4)
        total_market_val = round(total_market_val, 4)
        joint_cost_before_waste = round(max(0.0, gross_production_cost - byproduct_credit), 4)

        # 5. Segregación de Merma Explícita / Anormal bajo NIC 2 párrafo 16
        # Las unidades/cortes producidos antes de daño explícito (buenos + dañados) absorben la merma natural/térmica.
        # La fracción explícitamente dañada lleva su parte proporcional del costo a gasto (VIRT_LOSS)
        # para NO inflar el costo unitario de las unidades/cortes buenos.
        total_effective_coproduct_qty = round(total_good_qty + total_explicit_damaged_qty, 4)
        unit_cost_after_natural_shrinkage = (
            joint_cost_before_waste / total_effective_coproduct_qty
            if total_effective_coproduct_qty > 0
            else 0.0
        )

        waste_move_id = None
        if total_explicit_damaged_qty > 0:
            total_explicit_waste_cost = round(total_explicit_damaged_qty * unit_cost_after_natural_shrinkage, 4)
            # Asociar el movimiento de merma al corte dañado (o al producto primario)
            damaged_out = next(
                (o for o in order.outputs if float(o.explicit_damaged_qty or 0) > 0),
                order.outputs[0],
            )
            waste_move = StockMove(
                picking_id=consume_picking.id,
                product_id=damaged_out.output_variant_id,
                location_src_id=virt_prod.id,
                location_dest_id=virt_loss.id,
                quantity_demand=Decimal(str(total_explicit_damaged_qty)),
                quantity_done=Decimal(str(total_explicit_damaged_qty)),
                uom_id=damaged_out.uom_base,
                state="DONE",
                notes=f"Merma Explícita/Anormal OP {order.order_number} (NIC 2 p.16)",
                unit_cost=Decimal(str(round(unit_cost_after_natural_shrinkage, 4))),
                historic_avg_cost=Decimal(str(round(unit_cost_after_natural_shrinkage, 4))),
                reference=f"{order.order_number} [MERMA_PROD_ANORMAL]",
                adjustment_reason_id=abnormal_reason.id,
                created_by_id=user_id,
            )
            db.add(waste_move)
            db.flush()
            waste_move_id = waste_move.id
        else:
            total_explicit_waste_cost = 0.0

        net_joint_cost_to_allocate = round(max(0.0, joint_cost_before_waste - total_explicit_waste_cost), 4)

        # 6. Crear StockPicking de Entrada de Producción (MFG_PRODUCE / MFG_IN)
        produce_picking_name = f"MFG-IN/{order.order_number}"
        existing_pp = db.query(StockPicking).filter(StockPicking.name == produce_picking_name).first()
        if existing_pp:
            produce_picking_name = f"MFG-IN/{order.order_number}-{int(now.timestamp())}"

        produce_picking = StockPicking(
            picking_type_id=picking_type_produce.id,
            name=produce_picking_name,
            origin_document=order.order_number,
            facility_id=order.facility_id,
            dest_facility_id=dest_facility_id,
            status="DONE",
            notes=f"Ingreso de Producto Terminado / Cortes ({order.order_number})",
            scheduled_date=now,
            date_done=now,
            created_by_id=user_id,
        )
        db.add(produce_picking)
        db.flush()

        shelf_life_days = int(bom.shelf_life_days or 1) if bom else 7
        multi_outputs = len(order.outputs) > 1 or order.order_type == "MEAT_DISASSEMBLY"
        use_percentage_method = any(
            effective_method_by_out_id.get(o.id) == "PERCENTAGE"
            and (o.output_type or "").upper() != "BY_PRODUCT"
            for o in order.outputs
        )

        # Primera pasada: calcular % de absorción y costo total asignado a cada salida con cuadre al 100%
        active_coproducts: List[ProductionOrderOutput] = []
        for out_line in order.outputs:
            q_good = float(out_line.actual_good_qty or 0.0)
            p_ref = float(out_line.market_reference_price or 0.0)
            eff_method = effective_method_by_out_id.get(out_line.id, "MARKET_VALUE_INDEX")
            is_byp = (out_line.output_type or "").upper() == "BY_PRODUCT" or eff_method == "FIXED_NRV"
            actual_yield = round((q_good / reference_mass) * 100.0, 3) if reference_mass > 0 else 0.0
            out_line.actual_yield_pct = Decimal(str(actual_yield))

            if q_good <= 0:
                out_line.cost_allocation_pct = Decimal("0.0000")
                out_line.allocated_total_cost = Decimal("0.0000")
                out_line.calculated_unit_cost = Decimal("0.0000")
                continue

            if is_byp:
                out_line.cost_allocation_pct = Decimal("0.0000")
                out_line.allocated_total_cost = Decimal(str(round(q_good * p_ref, 4)))
                out_line.calculated_unit_cost = Decimal(str(round(p_ref, 4)))
            else:
                active_coproducts.append(out_line)
                if not multi_outputs:
                    alloc_pct = 100.0
                elif not use_percentage_method and total_market_val > 0:
                    alloc_pct = ((q_good * p_ref) / total_market_val) * 100.0
                else:
                    alloc_pct = (q_good / max(0.0001, total_good_qty)) * 100.0
                alloc_total = round(net_joint_cost_to_allocate * (alloc_pct / 100.0), 4)
                out_line.cost_allocation_pct = Decimal(str(round(alloc_pct, 4)))
                out_line.allocated_total_cost = Decimal(str(alloc_total))

        # Reconciliación exacta al 100% (Delta = $0.0000) sobre el corte principal de mayor costo
        if active_coproducts and net_joint_cost_to_allocate > 0:
            sum_alloc_usd = round(sum(float(o.allocated_total_cost or 0.0) for o in active_coproducts), 4)
            sum_alloc_pct = round(sum(float(o.cost_allocation_pct or 0.0) for o in active_coproducts), 4)
            diff_usd = round(net_joint_cost_to_allocate - sum_alloc_usd, 4)
            diff_pct = round(100.0 - sum_alloc_pct, 4)
            anchor_out = max(active_coproducts, key=lambda o: float(o.allocated_total_cost or 0.0))
            if abs(diff_usd) > 0:
                anchor_out.allocated_total_cost = Decimal(
                    str(round(float(anchor_out.allocated_total_cost) + diff_usd, 4))
                )
            if abs(diff_pct) > 0:
                anchor_out.cost_allocation_pct = Decimal(
                    str(round(float(anchor_out.cost_allocation_pct) + diff_pct, 4))
                )

        # Segunda pasada: generar lotes sanitarios, StockMoves MFG_PRODUCE y actualizar WAVG sin doble conteo
        for out_line in order.outputs:
            q_good = float(out_line.actual_good_qty or 0.0)
            if q_good <= 0:
                continue

            eff_method = effective_method_by_out_id.get(out_line.id, "MARKET_VALUE_INDEX")
            is_byp = (out_line.output_type or "").upper() == "BY_PRODUCT" or eff_method == "FIXED_NRV"
            alloc_total = float(out_line.allocated_total_cost or 0.0)
            calc_unit_cost = (
                round(float(out_line.market_reference_price or 0.0), 4)
                if is_byp
                else round(alloc_total / q_good, 4)
            )
            out_line.calculated_unit_cost = Decimal(str(calc_unit_cost))

            # Crear Lote Sanitario en inv.batches
            out_var = out_line.output_variant
            batch_code = (
                f"L-{order.order_number}-{out_var.sku}"
                if (multi_outputs and out_var and out_var.sku)
                else f"L-{order.order_number}"
            )
            gen_batch = (
                db.query(Batch)
                .filter(
                    Batch.product_variant_id == out_line.output_variant_id,
                    Batch.batch_number == batch_code,
                )
                .first()
            )
            if not gen_batch:
                gen_batch = Batch(
                    product_variant_id=out_line.output_variant_id,
                    batch_number=batch_code,
                    manufacturing_date=today,
                    expiry_date=today + timedelta(days=shelf_life_days),
                    is_quarantined=False,
                )
                db.add(gen_batch)
                db.flush()
            out_line.generated_batch_id = gen_batch.id

            # Leer stock_qty y avg_cost ANTES de insertar el StockMove de entrada
            # para evitar doble conteo con el trigger SQL trg_moves_update_snapshot
            snap_before = (
                db.query(InventorySnapshot)
                .filter(
                    InventorySnapshot.variant_id == out_line.output_variant_id,
                    InventorySnapshot.facility_id == dest_facility_id,
                )
                .first()
            )
            old_stock = max(0.0, float(snap_before.stock_qty or 0.0)) if snap_before else 0.0
            old_avg = (
                float(snap_before.avg_cost or snap_before.replacement_cost or 0.0)
                if snap_before
                else 0.0
            )
            if old_avg <= 0 and out_var:
                old_avg = float(
                    out_var.average_cost
                    or out_var.replacement_cost
                    or out_var.standard_cost
                    or 0.0
                )
            prev_cost_before = (
                float(snap_before.current_cost or snap_before.avg_cost or old_avg or calc_unit_cost)
                if snap_before
                else (old_avg if old_avg > 0 else calc_unit_cost)
            )

            if (old_stock + q_good) > 0 and q_good > 0 and calc_unit_cost > 0:
                if old_stock > 0 and old_avg > 0:
                    new_wavg = round(((old_stock * old_avg) + (q_good * calc_unit_cost)) / (old_stock + q_good), 4)
                else:
                    new_wavg = calc_unit_cost
            else:
                new_wavg = old_avg if old_avg > 0 else calc_unit_cost

            # Insertar StockMove (VIRT_PRODUCTION -> dest_loc) con state='DONE'
            out_move = StockMove(
                picking_id=produce_picking.id,
                product_id=out_line.output_variant_id,
                location_src_id=virt_prod.id,
                location_dest_id=dest_loc.id,
                quantity_demand=out_line.planned_qty,
                quantity_done=Decimal(str(q_good)),
                uom_id=out_line.uom_base,
                state="DONE",
                notes=f"Entrada Producción OP {order.order_number} (Lote {batch_code})",
                batch_id=gen_batch.id,
                unit_cost=Decimal(str(calc_unit_cost)),
                historic_avg_cost=Decimal(str(new_wavg)),
                reference=f"{order.order_number} [MFG_PRODUCE]",
                created_by_id=user_id,
            )
            db.add(out_move)
            # Flush dispara trg_moves_update_snapshot que suma q_good en inv.inventory_snapshots.stock_qty
            db.flush()
            out_line.stock_move_id = out_move.id

            # Refrescar snapshot tras el trigger y actualizar ÚNICAMENTE las columnas de costo
            snap_after = (
                db.query(InventorySnapshot)
                .filter(
                    InventorySnapshot.variant_id == out_line.output_variant_id,
                    InventorySnapshot.facility_id == dest_facility_id,
                )
                .first()
            )
            if snap_after:
                db.refresh(snap_after)
                snap_after.prev_cost = Decimal(str(round(prev_cost_before, 4)))
                snap_after.current_cost = Decimal(str(calc_unit_cost))
                snap_after.replacement_cost = Decimal(str(calc_unit_cost))
                snap_after.avg_cost = Decimal(str(new_wavg))
                snap_after.batch_id = gen_batch.id
                db.add(snap_after)

            if out_var:
                out_var.last_cost = Decimal(str(calc_unit_cost))
                out_var.replacement_cost = Decimal(str(calc_unit_cost))
                out_var.average_cost = Decimal(str(new_wavg))
                if not out_var.standard_cost or float(out_var.standard_cost) <= 0:
                    out_var.standard_cost = Decimal(str(calc_unit_cost))
                db.add(out_var)

        # 7. Actualizar cabecera de la Orden de Producción
        order.state = "COMPLETED"
        order.actual_input_weight_kg = Decimal(str(round(actual_input_weight_kg, 4)))
        order.actual_good_output_weight_kg = Decimal(str(round(total_good_qty, 4)))
        order.actual_byproduct_weight_kg = Decimal(str(round(total_byproduct_qty, 4)))
        order.natural_shrinkage_qty = Decimal(str(natural_shrinkage_qty))
        order.explicit_waste_qty = Decimal(str(round(total_explicit_damaged_qty, 4)))
        order.total_direct_material_cost = Decimal(str(round(total_direct_material_cost, 4)))
        order.total_packaging_cost = Decimal(str(round(total_packaging_cost, 4)))
        order.total_direct_labor_cost = Decimal(str(total_direct_labor_cost))
        order.total_indirect_overhead_cost = Decimal(str(total_indirect_overhead_cost))
        order.total_byproduct_credit = Decimal(str(round(byproduct_credit, 4)))
        order.total_explicit_waste_cost = Decimal(str(total_explicit_waste_cost))
        order.net_production_cost = Decimal(str(net_joint_cost_to_allocate))
        order.picking_consumption_id = consume_picking.id
        order.picking_output_id = produce_picking.id
        order.waste_move_id = waste_move_id
        order.completed_at = now
        order.completed_by_id = user_id
        if req.notes:
            order.notes = f"{order.notes or ''}\n[Liquidación]: {req.notes}".strip()

        db.add(order)
        if commit:
            db.commit()
        else:
            db.flush()
        return ProductionService.get_order_detail(db, order.id)

    @staticmethod
    def add_order_input(
        db: Session,
        order_id: int,
        req: AdHocOrderInputCreate,
    ) -> Dict[str, Any]:
        """
        Agrega un insumo adicional a una Orden de Producción en estado DRAFT, PLANNED o IN_PROGRESS.
        """
        order = (
            db.query(ProductionOrder)
            .options(
                selectinload(ProductionOrder.inputs),
            )
            .filter(ProductionOrder.id == order_id)
            .with_for_update()
            .first()
        )
        if not order:
            raise HTTPException(status_code=404, detail="Orden de Producción no encontrada")
        if order.state in ("COMPLETED", "CANCELLED"):
            raise HTTPException(
                status_code=400,
                detail=f"No se pueden agregar insumos a una orden en estado {order.state}",
            )

        comp_var = (
            db.query(ProductVariant)
            .options(selectinload(ProductVariant.product))
            .filter(ProductVariant.id == req.component_variant_id)
            .first()
        )
        if not comp_var:
            raise HTTPException(status_code=404, detail="Insumo no encontrado en el catálogo")

        src_wh = db.query(Warehouse).filter(Warehouse.id == order.source_warehouse_id).first()
        src_facility_id = src_wh.facility_id if (src_wh and src_wh.facility_id) else order.facility_id

        uom_base = resolve_mfg_uom_base(
            req.uom_base or (comp_var.product.uom_base if comp_var.product else None),
            None,
            comp_var.product.name if comp_var.product else None,
        )
        req_qty_val = (
            req.consumed_base_qty
            if req.consumed_base_qty is not None
            else (
                req.planned_base_qty
                if req.planned_base_qty is not None
                else (req.planned_qty if req.planned_qty is not None else (req.quantity or 0.0))
            )
        )
        qty = max(0.0001, float(req_qty_val))
        if not is_weight_uom(uom_base):
            qty = float(math.ceil(round(qty, 2) - 1e-6))
        else:
            qty = round(qty, 4)

        batch_id = req.batch_id
        if not batch_id:
            today = date.today()
            batches = (
                db.query(Batch)
                .filter(
                    Batch.product_variant_id == comp_var.id,
                    Batch.is_quarantined == False,
                )
                .order_by(Batch.expiry_date.asc().nullslast(), Batch.id.asc())
                .all()
            )
            valid_batches = [b for b in batches if not b.expiry_date or b.expiry_date >= today]
            chosen = valid_batches[0] if valid_batches else (batches[0] if batches else None)
            if chosen:
                batch_id = chosen.id

        u_cost = (
            float(req.unit_cost_override_usd)
            if (req.unit_cost_override_usd is not None and req.unit_cost_override_usd >= 0)
            else get_variant_unit_cost_usd(db, comp_var, src_facility_id)
        )
        raw_role = (req.input_role or "INGREDIENT").upper()
        role = "PRIMARY_RAW_MATERIAL" if raw_role in ("PRIMARY_MATRIX", "PRIMARY_RAW_MATERIAL") else raw_role
        line_cost = round(qty * u_cost, 4)

        existing_inp = next(
            (i for i in order.inputs if i.component_variant_id == comp_var.id),
            None,
        )
        if existing_inp is not None:
            new_cons_qty = round(float(existing_inp.consumed_base_qty or 0.0) + qty, 4)
            if not is_weight_uom(existing_inp.uom_base) and new_cons_qty > 0:
                new_cons_qty = float(math.ceil(round(new_cons_qty, 2) - 1e-6))
            existing_inp.consumed_base_qty = Decimal(str(new_cons_qty))
            if order.bom_id is None:
                existing_inp.planned_base_qty = Decimal(str(new_cons_qty))
            if req.batch_id is not None:
                existing_inp.batch_id = req.batch_id
            if req.unit_cost_override_usd is not None and req.unit_cost_override_usd >= 0:
                existing_inp.unit_cost = Decimal(str(round(u_cost, 4)))
            eff_uc = float(existing_inp.unit_cost or u_cost)
            existing_inp.total_cost = Decimal(str(round(new_cons_qty * eff_uc, 4)))
            db.add(existing_inp)
        else:
            # Si la orden proviene de una Fórmula BOM y este insumo es un ingrediente extra fuera de la receta,
            # planned_base_qty guarda 0.0000 para preservar trazabilidad Estándar vs Orden/Real.
            std_planned_qty = Decimal("0.0000") if order.bom_id is not None else Decimal(str(qty))
            new_inp = ProductionOrderInput(
                production_order_id=order.id,
                component_variant_id=comp_var.id,
                batch_id=batch_id,
                input_role=role,
                planned_base_qty=std_planned_qty,
                consumed_base_qty=Decimal(str(qty)),
                uom_base=uom_base,
                unit_cost=Decimal(str(round(u_cost, 4))),
                total_cost=Decimal(str(line_cost)),
            )
            db.add(new_inp)

        if role == "PACKAGING":
            order.total_packaging_cost = Decimal(str(round(float(order.total_packaging_cost or 0.0) + line_cost, 4)))
        else:
            order.total_direct_material_cost = Decimal(str(round(float(order.total_direct_material_cost or 0.0) + line_cost, 4)))
            order.actual_input_weight_kg = Decimal(str(round(float(order.actual_input_weight_kg or 0.0) + qty, 4)))
        order.net_production_cost = Decimal(str(round(float(order.net_production_cost or 0.0) + line_cost, 4)))
        db.add(order)
        db.commit()
        return ProductionService.get_order_detail(db, order.id)

    @staticmethod
    def update_order_inputs(
        db: Session,
        order_id: int,
        req: Union[UpdateOrderInputsRequest, List[AdHocOrderInputCreate]],
    ) -> Dict[str, Any]:
        """
        Actualiza en piso las cantidades de insumos, lotes FEFO o agrega ingredientes extra
        a una Orden de Producción en estado DRAFT, PLANNED o IN_PROGRESS sin alterar la Receta Maestra (BOM),
        manteniendo planned_base_qty con la cantidad estándar escalada y actualizando consumed_base_qty + costos.
        """
        order = (
            db.query(ProductionOrder)
            .options(
                selectinload(ProductionOrder.work_center),
                selectinload(ProductionOrder.bom).selectinload(BOMHeader.work_center),
                selectinload(ProductionOrder.inputs),
                selectinload(ProductionOrder.outputs),
            )
            .filter(ProductionOrder.id == order_id)
            .with_for_update()
            .first()
        )
        if not order:
            raise HTTPException(status_code=404, detail="Orden de Producción no encontrada")
        if order.state in ("COMPLETED", "CANCELLED"):
            raise HTTPException(
                status_code=400,
                detail=f"No se pueden modificar los insumos de una orden en estado {order.state}",
            )

        items = req if isinstance(req, list) else (req.inputs or [])
        src_wh = db.query(Warehouse).filter(Warehouse.id == order.source_warehouse_id).first()
        src_facility_id = src_wh.facility_id if (src_wh and src_wh.facility_id) else order.facility_id
        today = date.today()

        inputs_by_id = {inp.id: inp for inp in order.inputs if inp.id is not None}
        inputs_by_variant = {inp.component_variant_id: inp for inp in order.inputs}

        for item in items:
            target_inp = None
            if item.input_id is not None and item.input_id in inputs_by_id:
                target_inp = inputs_by_id[item.input_id]
            elif item.component_variant_id in inputs_by_variant:
                target_inp = inputs_by_variant[item.component_variant_id]

            raw_q = (
                item.consumed_base_qty
                if item.consumed_base_qty is not None
                else (
                    item.planned_base_qty
                    if item.planned_base_qty is not None
                    else (item.planned_qty if item.planned_qty is not None else item.quantity)
                )
            )

            if target_inp is not None:
                if raw_q is not None:
                    q_val = max(0.0, float(raw_q))
                    if not is_weight_uom(target_inp.uom_base) and q_val > 0:
                        q_val = float(math.ceil(round(q_val, 2) - 1e-6))
                    else:
                        q_val = round(q_val, 4)
                    target_inp.consumed_base_qty = Decimal(str(q_val))
                    if order.bom_id is None and item.planned_base_qty is not None and item.consumed_base_qty is None:
                        target_inp.planned_base_qty = Decimal(str(q_val))

                if item.batch_id is not None:
                    target_inp.batch_id = item.batch_id
                if item.input_role:
                    raw_role = item.input_role.upper()
                    target_inp.input_role = (
                        "PRIMARY_RAW_MATERIAL" if raw_role in ("PRIMARY_MATRIX", "PRIMARY_RAW_MATERIAL") else raw_role
                    )
                if item.unit_cost_override_usd is not None and item.unit_cost_override_usd >= 0:
                    target_inp.unit_cost = Decimal(str(round(float(item.unit_cost_override_usd), 4)))

                u_c = float(target_inp.unit_cost or 0.0)
                c_q = float(target_inp.consumed_base_qty or 0.0)
                target_inp.total_cost = Decimal(str(round(c_q * u_c, 4)))
                db.add(target_inp)
            else:
                comp_var = (
                    db.query(ProductVariant)
                    .options(selectinload(ProductVariant.product))
                    .filter(ProductVariant.id == item.component_variant_id)
                    .first()
                )
                if not comp_var:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Insumo (variant_id={item.component_variant_id}) no encontrado en el catálogo",
                    )
                uom_base = (
                    item.uom_base or (comp_var.product.uom_base if comp_var.product else "UND") or "UND"
                ).strip().upper()
                qty = max(0.0001, float(raw_q if raw_q is not None else 1.0))
                if not is_weight_uom(uom_base):
                    qty = float(math.ceil(round(qty, 2) - 1e-6))
                else:
                    qty = round(qty, 4)

                batch_id = item.batch_id
                if not batch_id:
                    batches = (
                        db.query(Batch)
                        .filter(
                            Batch.product_variant_id == comp_var.id,
                            Batch.is_quarantined == False,
                        )
                        .order_by(Batch.expiry_date.asc().nullslast(), Batch.id.asc())
                        .all()
                    )
                    valid_batches = [b for b in batches if not b.expiry_date or b.expiry_date >= today]
                    chosen = valid_batches[0] if valid_batches else (batches[0] if batches else None)
                    if chosen:
                        batch_id = chosen.id

                u_cost = (
                    float(item.unit_cost_override_usd)
                    if (item.unit_cost_override_usd is not None and item.unit_cost_override_usd >= 0)
                    else get_variant_unit_cost_usd(db, comp_var, src_facility_id)
                )
                raw_role = (item.input_role or "INGREDIENT").upper()
                role = "PRIMARY_RAW_MATERIAL" if raw_role in ("PRIMARY_MATRIX", "PRIMARY_RAW_MATERIAL") else raw_role
                line_cost = round(qty * u_cost, 4)
                std_planned = Decimal("0.0000") if order.bom_id is not None else Decimal(str(qty))

                new_inp = ProductionOrderInput(
                    production_order_id=order.id,
                    component_variant_id=comp_var.id,
                    batch_id=batch_id,
                    input_role=role,
                    planned_base_qty=std_planned,
                    consumed_base_qty=Decimal(str(qty)),
                    uom_base=uom_base,
                    unit_cost=Decimal(str(round(u_cost, 4))),
                    total_cost=Decimal(str(line_cost)),
                )
                db.add(new_inp)
                order.inputs.append(new_inp)
                inputs_by_variant[comp_var.id] = new_inp

        db.flush()

        mat_cost = sum(
            float(i.total_cost or 0.0) for i in order.inputs if (i.input_role or "").upper() != "PACKAGING"
        )
        pkg_cost = sum(
            float(i.total_cost or 0.0) for i in order.inputs if (i.input_role or "").upper() == "PACKAGING"
        )
        in_mass_kg = sum(
            float(i.consumed_base_qty or 0.0) for i in order.inputs if (i.input_role or "").upper() != "PACKAGING"
        )

        order.total_direct_material_cost = Decimal(str(round(mat_cost, 4)))
        order.total_packaging_cost = Decimal(str(round(pkg_cost, 4)))
        order.actual_input_weight_kg = Decimal(str(round(in_mass_kg, 4)))

        wc = order.work_center or (order.bom.work_center if order.bom else None)
        if not isinstance(req, list) and req.actual_labor_hours is not None and req.actual_labor_hours >= 0:
            labor_h = float(req.actual_labor_hours)
            if wc:
                order.total_direct_labor_cost = Decimal(str(round(labor_h * float(wc.hourly_labor_rate or 0.0), 4)))
                cif = (labor_h * float(wc.hourly_overhead_rate or 0.0)) + (
                    in_mass_kg * float(wc.overhead_per_kg or 0.0)
                )
                order.total_indirect_overhead_cost = Decimal(str(round(cif, 4)))
        elif wc and float(wc.overhead_per_kg or 0.0) > 0:
            hourly_lab = float(wc.hourly_labor_rate or 0.0)
            est_h = (
                float(order.total_direct_labor_cost or 0.0) / hourly_lab
                if hourly_lab > 0
                else 0.5
            )
            cif = (est_h * float(wc.hourly_overhead_rate or 0.0)) + (
                in_mass_kg * float(wc.overhead_per_kg or 0.0)
            )
            order.total_indirect_overhead_cost = Decimal(str(round(cif, 4)))

        gross_c = (
            float(order.total_direct_material_cost or 0.0)
            + float(order.total_packaging_cost or 0.0)
            + float(order.total_direct_labor_cost or 0.0)
            + float(order.total_indirect_overhead_cost or 0.0)
        )
        byp_c = float(order.total_byproduct_credit or 0.0)
        waste_c = float(order.total_explicit_waste_cost or 0.0)
        net_c = max(0.0, round(gross_c - byp_c - waste_c, 4))
        order.net_production_cost = Decimal(str(net_c))

        if len(order.outputs) == 1:
            out0 = order.outputs[0]
            out0.allocated_total_cost = Decimal(str(net_c))
            q_out = float(out0.actual_good_qty or out0.planned_qty or 1.0)
            if q_out > 0:
                out0.calculated_unit_cost = Decimal(str(round(net_c / q_out, 4)))
            db.add(out0)

        if not isinstance(req, list) and req.notes is not None:
            order.notes = req.notes

        db.add(order)
        db.commit()
        return ProductionService.get_order_detail(db, order.id)

    @staticmethod
    def add_order_output(
        db: Session,
        order_id: int,
        req: AdHocOrderOutputCreate,
    ) -> Dict[str, Any]:
        """
        Agrega un corte o producto resultante adicional a una Orden de Producción en estado DRAFT, PLANNED o IN_PROGRESS.
        """
        order = (
            db.query(ProductionOrder)
            .options(
                selectinload(ProductionOrder.outputs),
            )
            .filter(ProductionOrder.id == order_id)
            .with_for_update()
            .first()
        )
        if not order:
            raise HTTPException(status_code=404, detail="Orden de Producción no encontrada")
        if order.state in ("COMPLETED", "CANCELLED"):
            raise HTTPException(
                status_code=400,
                detail=f"No se pueden agregar productos de salida a una orden en estado {order.state}",
            )

        out_var = (
            db.query(ProductVariant)
            .options(selectinload(ProductVariant.product))
            .filter(ProductVariant.id == req.output_variant_id)
            .first()
        )
        if not out_var:
            raise HTTPException(status_code=404, detail="Producto resultante no encontrado en el catálogo")

        dest_wh = db.query(Warehouse).filter(Warehouse.id == order.dest_warehouse_id).first()
        dest_facility_id = dest_wh.facility_id if (dest_wh and dest_wh.facility_id) else order.facility_id

        uom_base = (req.uom_base or (out_var.product.uom_base if out_var.product else "KG") or "KG").strip().upper()
        qty = max(0.0001, float(req.planned_qty or 0.0))
        if not is_weight_uom(uom_base):
            qty = float(max(1, round(qty)))
        else:
            qty = round(qty, 4)

        p_ref = (
            float(req.market_reference_price)
            if (req.market_reference_price is not None and req.market_reference_price > 0)
            else get_variant_sales_price_usd(db, out_var, dest_facility_id)
        )
        raw_out_type = (req.output_type or ("CO_PRODUCT" if order.order_type == "MEAT_DISASSEMBLY" else "PRIMARY_PRODUCT")).upper()
        if raw_out_type in ("BYPRODUCT", "BY_PRODUCT"):
            out_type = "BY_PRODUCT"
        elif raw_out_type in ("MAIN_CUT", "CO_PRODUCT"):
            out_type = "CO_PRODUCT"
        else:
            out_type = raw_out_type
        ref_mass = max(0.0001, float(order.actual_input_weight_kg or order.planned_base_qty or 100.0))
        exp_yield = (
            float(req.expected_yield_pct)
            if req.expected_yield_pct is not None
            else round((qty / ref_mass) * 100.0, 3)
        )

        new_out = ProductionOrderOutput(
            production_order_id=order.id,
            output_variant_id=out_var.id,
            output_type=out_type,
            planned_qty=Decimal(str(qty)),
            actual_good_qty=Decimal(str(qty)),
            explicit_damaged_qty=Decimal("0.0000"),
            uom_base=uom_base,
            expected_yield_pct=Decimal(str(round(exp_yield, 3))),
            actual_yield_pct=Decimal(str(round(exp_yield, 3))),
            market_reference_price=Decimal(str(round(p_ref, 4))),
            cost_allocation_pct=Decimal("0.0000"),
            allocated_total_cost=Decimal("0.0000"),
            calculated_unit_cost=Decimal("0.0000"),
        )
        db.add(new_out)
        db.commit()
        return ProductionService.get_order_detail(db, order.id)

    @staticmethod
    def save_order_as_bom(
        db: Session,
        order_id: int,
        req: SaveOrderAsBOMRequest,
    ) -> Dict[str, Any]:
        """
        Convierte una Transformación Libre Ad-Hoc (o cualquier Orden de Producción)
        en una Fórmula / Receta Maestra permanente (BOMHeader) con 1 clic y la vincula a la orden.
        """
        order = (
            db.query(ProductionOrder)
            .options(
                selectinload(ProductionOrder.work_center),
                selectinload(ProductionOrder.inputs).selectinload(ProductionOrderInput.component_variant).selectinload(ProductVariant.product),
                selectinload(ProductionOrder.outputs).selectinload(ProductionOrderOutput.output_variant).selectinload(ProductVariant.product),
            )
            .filter(ProductionOrder.id == order_id)
            .first()
        )
        if not order:
            raise HTTPException(status_code=404, detail="Orden de Producción no encontrada")
        if not order.inputs or not order.outputs:
            raise HTTPException(status_code=400, detail="La orden debe tener al menos un insumo y un producto resultante para guardarse como fórmula")

        is_divergent = order.order_type == "MEAT_DISASSEMBLY" or len(order.outputs) > 1
        bom_type = "DIVERGENT_DISASSEMBLY" if is_divergent else "CONVERGENT_RECIPE"
        wc = order.work_center
        raw_sector = (
            req.sector
            or (wc.sector if wc else ("MEAT_PROCESSING" if is_divergent else "BAKERY"))
        ).upper()
        sector_map = {
            "CARNICERIA": "MEAT_PROCESSING",
            "PANADERIA": "BAKERY",
            "GASTRONOMIA": "GASTRONOMY",
        }
        sector = sector_map.get(raw_sector, raw_sector)

        if req.code and req.code.strip():
            code = req.code.strip().upper()
            existing = db.query(BOMHeader).filter(BOMHeader.code == code).first()
            if existing:
                raise HTTPException(status_code=400, detail=f"Ya existe una fórmula con el código {code}")
        else:
            prefix = "DES-ADHOC-" if is_divergent else "BOM-ADHOC-"
            seq = db.query(BOMHeader).count() + 1
            code = f"{prefix}{seq:03d}"
            while db.query(BOMHeader).filter(BOMHeader.code == code).first():
                seq += 1
                code = f"{prefix}{seq:03d}"

        primary_var = (
            order.inputs[0].component_variant
            if (is_divergent and order.inputs and order.inputs[0].component_variant)
            else order.outputs[0].output_variant
        )
        primary_var_id = (
            order.inputs[0].component_variant_id
            if is_divergent
            else order.outputs[0].output_variant_id
        )
        primary_uom = (
            order.inputs[0].uom_base
            if is_divergent
            else order.outputs[0].uom_base
        ) or "UND"

        default_name = (
            f"Plantilla {primary_var.product.name}"
            if (primary_var and primary_var.product)
            else f"Fórmula desde {order.order_number}"
        )
        name = req.name.strip() if (req.name and req.name.strip()) else default_name

        base_qty = float(
            order.actual_input_weight_kg
            if (is_divergent and float(order.actual_input_weight_kg or 0) > 0)
            else (order.planned_base_qty or 1.0)
        )
        in_mass = max(0.0001, float(order.actual_input_weight_kg or base_qty))
        nat_shrink_qty = float(order.natural_shrinkage_qty or 0.0)
        exp_shrink_pct = round(min(90.0, max(0.0, (nat_shrink_qty / in_mass) * 100.0)), 2) if in_mass > 0 else 0.0

        hourly_rate = float(wc.hourly_labor_rate or 0.0) if wc else 0.0
        std_hours = (
            round(float(order.total_direct_labor_cost or 0.0) / hourly_rate, 2)
            if hourly_rate > 0 and float(order.total_direct_labor_cost or 0.0) > 0
            else 1.0
        )

        new_bom = BOMHeader(
            code=code,
            name=name,
            bom_type=bom_type,
            sector=sector,
            work_center_id=order.work_center_id,
            primary_product_variant_id=primary_var_id,
            base_qty=Decimal(str(round(base_qty, 4))),
            uom_id=primary_uom,
            expected_shrinkage_pct=Decimal(str(exp_shrink_pct)),
            max_allowed_shrinkage_pct=Decimal(str(round(exp_shrink_pct + 2.0, 2))),
            standard_labor_hours=Decimal(str(std_hours)),
            shelf_life_days=int(req.shelf_life_days or 7),
            is_active=True,
            instructions=req.instructions or req.notes or f"Generada automáticamente desde Transformación Libre {order.order_number}",
        )
        db.add(new_bom)
        db.flush()

        saved_lines = []
        for inp in order.inputs:
            q_in = float(inp.consumed_base_qty if float(inp.consumed_base_qty or 0) > 0 else inp.planned_base_qty)
            raw_r = (inp.input_role or "INGREDIENT").upper()
            r_norm = "PRIMARY_RAW_MATERIAL" if raw_r in ("PRIMARY_MATRIX", "PRIMARY_RAW_MATERIAL") else raw_r
            bom_in = BOMInput(
                bom_id=new_bom.id,
                component_variant_id=inp.component_variant_id,
                input_role=r_norm,
                quantity=Decimal(str(round(q_in, 4))),
                recipe_uom=inp.uom_base or "UND",
                conversion_factor_to_base=Decimal("1.000000"),
                scrap_tolerance_pct=Decimal("0.00"),
                is_fixed_qty=False,
                backflush=True,
            )
            db.add(bom_in)
            saved_lines.append({
                "component_variant_id": inp.component_variant_id,
                "input_role": r_norm,
                "quantity": round(q_in, 4),
                "recipe_uom": inp.uom_base or "UND",
            })

        saved_outputs = []
        for out in order.outputs:
            q_out = float(out.actual_good_qty if float(out.actual_good_qty or 0) > 0 else out.planned_qty)
            raw_ot = (out.output_type or ("CO_PRODUCT" if is_divergent else "PRIMARY_PRODUCT")).upper()
            if raw_ot in ("BYPRODUCT", "BY_PRODUCT"):
                out_type = "BY_PRODUCT"
            elif raw_ot in ("MAIN_CUT", "CO_PRODUCT"):
                out_type = "CO_PRODUCT"
            else:
                out_type = raw_ot
            method = "FIXED_NRV" if out_type == "BY_PRODUCT" else ("MARKET_VALUE_INDEX" if is_divergent else "PERCENTAGE")
            y_pct = round((q_out / in_mass) * 100.0, 3) if in_mass > 0 else 100.0
            bom_out = BOMOutput(
                bom_id=new_bom.id,
                output_variant_id=out.output_variant_id,
                output_type=out_type,
                expected_qty=Decimal(str(round(q_out, 4))),
                uom_id=out.uom_base or "UND",
                expected_yield_pct=Decimal(str(min(100.0, max(0.001, y_pct)))),
                cost_allocation_method=method,
                standard_reference_price=out.market_reference_price,
                cost_allocation_factor=Decimal("1.0000"),
            )
            db.add(bom_out)
            saved_outputs.append({
                "output_variant_id": out.output_variant_id,
                "output_type": out_type,
                "expected_qty": round(q_out, 4),
                "uom_id": out.uom_base or "UND",
            })

        if req.link_to_order:
            order.bom_id = new_bom.id
            db.add(order)
        db.commit()

        return {
            "id": new_bom.id,
            "bom_id": new_bom.id,
            "code": new_bom.code,
            "bom_code": new_bom.code,
            "name": new_bom.name,
            "bom_name": new_bom.name,
            "lines": saved_lines,
            "outputs": saved_outputs,
            "order": ProductionService.get_order_detail(db, order.id),
        }

    @staticmethod
    def serialize_order_summary(db: Session, order: ProductionOrder, rate: float) -> Dict[str, Any]:
        bom = order.bom
        wc = order.work_center or (bom.work_center if bom else None)
        fac = order.facility
        primary_out = order.outputs[0] if order.outputs else None
        primary_in = order.inputs[0] if order.inputs else None
        primary_var = (
            bom.primary_variant
            if (order.order_type == "MEAT_DISASSEMBLY" and bom and bom.primary_variant)
            else (
                primary_in.component_variant
                if (order.order_type == "MEAT_DISASSEMBLY" and primary_in and primary_in.component_variant)
                else (
                    primary_out.output_variant
                    if (primary_out and primary_out.output_variant)
                    else (bom.primary_variant if bom else None)
                )
            )
        )

        net_cost_usd = float(order.net_production_cost or 0.0)
        byp_credit_usd = float(order.total_byproduct_credit or 0.0)
        input_kg = float(order.actual_input_weight_kg or order.planned_base_qty or 0.0)
        good_qty = float(order.actual_good_output_weight_kg or order.planned_base_qty or 1.0)
        byp_qty = float(order.actual_byproduct_weight_kg or 0.0)
        unit_cost_usd = (
            float(primary_out.calculated_unit_cost)
            if (primary_out and primary_out.calculated_unit_cost and float(primary_out.calculated_unit_cost) > 0)
            else (net_cost_usd / good_qty if good_qty > 0 else 0.0)
        )
        gen_batch = primary_out.generated_batch if primary_out else None

        total_commercial_value_usd = sum(
            float(o.actual_good_qty or 0.0) * float(o.market_reference_price or 0.0)
            for o in (order.outputs or [])
        )
        meat_yield_pct = round((good_qty / input_kg) * 100.0, 2) if input_kg > 0 else 0.0
        total_recovery_yield_pct = round(((good_qty + byp_qty) / input_kg) * 100.0, 2) if input_kg > 0 else 0.0

        sector = (
            bom.sector
            if bom
            else (wc.sector if wc else ("MEAT_PROCESSING" if order.order_type == "MEAT_DISASSEMBLY" else "BAKERY"))
        )
        uom_id = (
            bom.uom_id
            if bom
            else (
                primary_in.uom_base
                if (order.order_type == "MEAT_DISASSEMBLY" and primary_in and primary_in.uom_base)
                else (primary_out.uom_base if primary_out and primary_out.uom_base else "UND")
            )
        )

        return {
            "id": order.id,
            "order_number": order.order_number,
            "state": order.state,
            "order_type": order.order_type,
            "sector": sector,
            "facility_id": order.facility_id,
            "facility_name": fac.name if fac else "Sede Principal",
            "work_center_id": order.work_center_id,
            "work_center_name": wc.name if wc else None,
            "bom_id": order.bom_id,
            "bom_code": bom.code if bom else "TRANSF-LIBRE",
            "bom_name": bom.name if bom else "Transformación Libre de Materiales",
            "uom_id": uom_id,
            "primary_product_variant_id": primary_var.id if primary_var else None,
            "primary_product_sku": primary_var.sku if primary_var else None,
            "primary_product_name": (
                primary_var.product.name
                if (primary_var and primary_var.product)
                else (bom.name if bom else "Transformación Libre de Materiales")
            ),
            "planned_base_qty": float(order.planned_base_qty or 0.0),
            "actual_input_weight_kg": round(input_kg, 4),
            "actual_good_qty": round(good_qty, 4),
            "actual_byproduct_qty": round(byp_qty, 4),
            "natural_shrinkage_qty": float(order.natural_shrinkage_qty or 0.0),
            "explicit_waste_qty": float(order.explicit_waste_qty or 0.0),
            "meat_yield_pct": meat_yield_pct,
            "total_recovery_yield_pct": total_recovery_yield_pct,
            "outputs_count": len(order.outputs) if order.outputs else 0,
            "net_production_cost_usd": round(net_cost_usd, 4),
            "net_production_cost_ves": round(net_cost_usd * rate, 2),
            "total_byproduct_credit_usd": round(byp_credit_usd, 4),
            "total_byproduct_credit_ves": round(byp_credit_usd * rate, 2),
            "total_commercial_value_usd": round(total_commercial_value_usd, 4),
            "total_commercial_value_ves": round(total_commercial_value_usd * rate, 2),
            "calculated_unit_cost_usd": round(unit_cost_usd, 4),
            "calculated_unit_cost_ves": round(unit_cost_usd * rate, 2),
            "total_explicit_waste_cost_usd": round(float(order.total_explicit_waste_cost or 0.0), 4),
            "generated_batch_number": gen_batch.batch_number if gen_batch else None,
            "generated_batch_expiry_date": gen_batch.expiry_date.isoformat() if (gen_batch and gen_batch.expiry_date) else None,
            "picking_consumption_id": order.picking_consumption_id,
            "picking_output_id": order.picking_output_id,
            "scheduled_date": order.scheduled_date.isoformat() if order.scheduled_date else None,
            "started_at": order.started_at.isoformat() if order.started_at else None,
            "completed_at": order.completed_at.isoformat() if order.completed_at else None,
            "created_at": order.created_at.isoformat() if order.created_at else None,
        }

    @staticmethod
    def list_orders(
        db: Session,
        state: Optional[str] = None,
        sector: Optional[str] = None,
        order_type: Optional[str] = None,
        facility_id: Optional[int] = None,
        search: Optional[str] = None,
    ) -> Dict[str, Any]:
        ProductionService.ensure_initial_sample_orders(db)
        rate_info = get_active_bcv_rate(db)
        rate = rate_info["rate"]

        query = (
            db.query(ProductionOrder)
            .outerjoin(BOMHeader, ProductionOrder.bom_id == BOMHeader.id)
            .outerjoin(WorkCenter, ProductionOrder.work_center_id == WorkCenter.id)
            .options(
                selectinload(ProductionOrder.facility),
                selectinload(ProductionOrder.work_center),
                selectinload(ProductionOrder.bom).selectinload(BOMHeader.work_center),
                selectinload(ProductionOrder.bom).selectinload(BOMHeader.primary_variant).selectinload(ProductVariant.product),
                selectinload(ProductionOrder.inputs).selectinload(ProductionOrderInput.component_variant).selectinload(ProductVariant.product),
                selectinload(ProductionOrder.outputs).selectinload(ProductionOrderOutput.output_variant).selectinload(ProductVariant.product),
                selectinload(ProductionOrder.outputs).selectinload(ProductionOrderOutput.generated_batch),
            )
        )
        if state:
            query = query.filter(ProductionOrder.state == state)
        if sector:
            sector_clauses = [
                BOMHeader.sector == sector,
                WorkCenter.sector == sector,
            ]
            if sector.upper() == "MEAT_PROCESSING":
                sector_clauses.append(
                    and_(
                        ProductionOrder.bom_id.is_(None),
                        ProductionOrder.order_type == "MEAT_DISASSEMBLY",
                    )
                )
            elif sector.upper() == "BAKERY":
                sector_clauses.append(
                    and_(
                        ProductionOrder.bom_id.is_(None),
                        ProductionOrder.work_center_id.is_(None),
                        ProductionOrder.order_type != "MEAT_DISASSEMBLY",
                    )
                )
            query = query.filter(or_(*sector_clauses))
        if order_type:
            query = query.filter(ProductionOrder.order_type == order_type)
        if facility_id:
            query = query.filter(ProductionOrder.facility_id == facility_id)
        if search and search.strip():
            s_raw = search.strip()
            s = f"%{s_raw}%"
            search_clauses = [
                ProductionOrder.order_number.ilike(s),
                BOMHeader.name.ilike(s),
                BOMHeader.code.ilike(s),
                ProductionOrder.notes.ilike(s),
            ]
            if (
                s_raw.lower() in "transf-libre"
                or s_raw.lower() in "transformación libre de materiales"
                or s_raw.lower() in "transformacion libre de materiales"
            ):
                search_clauses.append(ProductionOrder.bom_id.is_(None))
            query = query.filter(or_(*search_clauses))

        orders = query.order_by(ProductionOrder.id.desc()).all()
        items = [ProductionService.serialize_order_summary(db, o, rate) for o in orders]

        all_orders_q = db.query(ProductionOrder).options(selectinload(ProductionOrder.outputs))
        if facility_id:
            all_orders_q = all_orders_q.filter(ProductionOrder.facility_id == facility_id)
        all_orders = all_orders_q.all()
        completed_val_usd = sum(float(o.net_production_cost or 0.0) for o in all_orders if o.state == "COMPLETED")

        butchery_orders = [o for o in all_orders if o.order_type == "MEAT_DISASSEMBLY"]
        completed_butchery = [o for o in butchery_orders if o.state == "COMPLETED"]
        carcass_kg_processed = sum(
            float(o.actual_input_weight_kg or o.planned_base_qty or 0.0) for o in completed_butchery
        )
        good_cuts_kg_processed = sum(float(o.actual_good_output_weight_kg or 0.0) for o in completed_butchery)
        avg_butchery_yield_pct = (
            round((good_cuts_kg_processed / carcass_kg_processed) * 100.0, 2)
            if carcass_kg_processed > 0
            else 88.0
        )
        butchery_settled_val_usd = sum(
            float(o.net_production_cost or 0.0) + float(o.total_byproduct_credit or 0.0)
            for o in completed_butchery
        )

        return {
            "exchange_rate": round(rate, 4),
            "kpis": {
                "total_orders": len(all_orders),
                "in_progress_count": sum(1 for o in all_orders if o.state in ("PLANNED", "IN_PROGRESS", "DRAFT")),
                "completed_count": sum(1 for o in all_orders if o.state == "COMPLETED"),
                "cancelled_count": sum(1 for o in all_orders if o.state == "CANCELLED"),
                "completed_value_usd": round(completed_val_usd, 2),
                "completed_value_ves": round(completed_val_usd * rate, 2),
            },
            "butchery_kpis": {
                "total_butchery_orders": len(butchery_orders),
                "in_progress_butchery_orders": sum(
                    1 for o in butchery_orders if o.state in ("PLANNED", "IN_PROGRESS", "DRAFT")
                ),
                "completed_butchery_orders": len(completed_butchery),
                "completed_carcasses_count": len(completed_butchery),
                "carcass_weight_processed_kg": round(carcass_kg_processed, 2),
                "total_carcass_weight_processed_kg": round(carcass_kg_processed, 2),
                "good_cuts_weight_produced_kg": round(good_cuts_kg_processed, 2),
                "average_meat_yield_pct": avg_butchery_yield_pct,
                "settled_cuts_value_usd": round(butchery_settled_val_usd, 2),
                "settled_cuts_value_ves": round(butchery_settled_val_usd * rate, 2),
            },
            "items": items,
        }

    @staticmethod
    def get_order_detail(db: Session, order_id: int) -> Dict[str, Any]:
        rate_info = get_active_bcv_rate(db)
        rate = rate_info["rate"]
        today = date.today()

        order = (
            db.query(ProductionOrder)
            .options(
                selectinload(ProductionOrder.facility),
                selectinload(ProductionOrder.work_center),
                selectinload(ProductionOrder.bom).selectinload(BOMHeader.work_center),
                selectinload(ProductionOrder.bom).selectinload(BOMHeader.primary_variant).selectinload(ProductVariant.product),
                selectinload(ProductionOrder.bom).selectinload(BOMHeader.outputs),
                selectinload(ProductionOrder.inputs).selectinload(ProductionOrderInput.component_variant).selectinload(ProductVariant.product),
                selectinload(ProductionOrder.inputs).selectinload(ProductionOrderInput.batch),
                selectinload(ProductionOrder.outputs).selectinload(ProductionOrderOutput.output_variant).selectinload(ProductVariant.product),
                selectinload(ProductionOrder.outputs).selectinload(ProductionOrderOutput.generated_batch),
            )
            .filter(ProductionOrder.id == order_id)
            .first()
        )
        if not order:
            raise HTTPException(status_code=404, detail="Orden de Producción no encontrada")

        bom = order.bom
        wc = order.work_center or (bom.work_center if bom else None)
        src_wh = db.query(Warehouse).filter(Warehouse.id == order.source_warehouse_id).first()
        src_facility_id = src_wh.facility_id if (src_wh and src_wh.facility_id) else order.facility_id
        dest_wh = db.query(Warehouse).filter(Warehouse.id == order.dest_warehouse_id).first()
        dest_facility_id = dest_wh.facility_id if (dest_wh and dest_wh.facility_id) else order.facility_id

        picking_consume = (
            db.query(StockPicking).filter(StockPicking.id == order.picking_consumption_id).first()
            if order.picking_consumption_id
            else None
        )
        picking_output = (
            db.query(StockPicking).filter(StockPicking.id == order.picking_output_id).first()
            if order.picking_output_id
            else None
        )
        waste_move = (
            db.query(StockMove).filter(StockMove.id == order.waste_move_id).first()
            if order.waste_move_id
            else None
        )

        bom_inputs_by_var = {bi.component_variant_id: bi for bi in (bom.inputs if bom and bom.inputs else [])}
        # Detalle de inputs con lotes disponibles FEFO y stock actual
        inputs_detail = []
        for inp in order.inputs:
            comp_var = inp.component_variant
            prod = comp_var.product if comp_var else None
            bom_inp_ref = bom_inputs_by_var.get(inp.component_variant_id)
            effective_uom_base = resolve_mfg_uom_base(
                prod.uom_base if prod else inp.uom_base,
                bom_inp_ref.recipe_uom if bom_inp_ref else None,
                prod.name if prod else None,
            )
            snap = (
                db.query(InventorySnapshot)
                .filter(
                    InventorySnapshot.variant_id == inp.component_variant_id,
                    InventorySnapshot.facility_id == src_facility_id,
                )
                .first()
            )
            avail_stock = float(snap.stock_qty or 0.0) if snap else 0.0

            batches = (
                db.query(Batch)
                .filter(
                    Batch.product_variant_id == inp.component_variant_id,
                    Batch.is_quarantined == False,
                )
                .order_by(Batch.expiry_date.asc().nullslast(), Batch.id.asc())
                .all()
            )
            unit_c = float(inp.unit_cost or 0.0)
            tot_c = float(inp.total_cost or 0.0)
            std_qty = float(inp.planned_base_qty or 0.0)
            cons_qty = float(inp.consumed_base_qty or 0.0)
            std_cost = round(std_qty * unit_c, 4)
            delta_qty = round(cons_qty - std_qty, 4)
            delta_pct = (
                round(((cons_qty - std_qty) / std_qty) * 100.0, 2)
                if std_qty > 0
                else (100.0 if (order.bom_id is not None and cons_qty > 0) else 0.0)
            )
            delta_cost = round(tot_c - std_cost, 4)

            inputs_detail.append({
                "id": inp.id,
                "component_variant_id": inp.component_variant_id,
                "component_sku": comp_var.sku if comp_var else f"VAR-{inp.component_variant_id}",
                "component_name": prod.name if prod else "Insumo",
                "input_role": inp.input_role,
                "uom_base": effective_uom_base,
                "is_discrete_uom": not is_weight_uom(effective_uom_base),
                "standard_scaled_qty_base": std_qty,
                "planned_base_qty": std_qty,
                "consumed_base_qty": cons_qty,
                "delta_qty_base": delta_qty,
                "delta_pct": delta_pct,
                "standard_cost_usd": std_cost,
                "delta_cost_usd": delta_cost,
                "delta_cost_ves": round(delta_cost * rate, 2),
                "is_extra_input": bool(order.bom_id is not None and std_qty == 0.0),
                "is_overridden": bool(abs(cons_qty - std_qty) > 1e-4),
                "available_stock_qty": round(avail_stock, 4),
                "batch_id": inp.batch_id,
                "batch_number": inp.batch.batch_number if inp.batch else None,
                "batch_expiry_date": inp.batch.expiry_date.isoformat() if (inp.batch and inp.batch.expiry_date) else None,
                "available_batches": [
                    {
                        "id": b.id,
                        "batch_number": b.batch_number,
                        "expiry_date": b.expiry_date.isoformat() if b.expiry_date else None,
                        "days_to_expiry": (b.expiry_date - today).days if b.expiry_date else None,
                    }
                    for b in batches
                ],
                "unit_cost_usd": round(unit_c, 4),
                "unit_cost_ves": round(unit_c * rate, 2),
                "total_cost_usd": round(tot_c, 4),
                "total_cost_ves": round(tot_c * rate, 2),
                "stock_move_id": inp.stock_move_id,
            })

        bom_outputs_by_var = {o.output_variant_id: o for o in (bom.outputs if bom and bom.outputs else [])}
        # Detalle de outputs con proyección / resultado WAVG y lote sanitario
        outputs_detail = []
        for out in order.outputs:
            out_var = out.output_variant
            prod = out_var.product if out_var else None
            snap = (
                db.query(InventorySnapshot)
                .filter(
                    InventorySnapshot.variant_id == out.output_variant_id,
                    InventorySnapshot.facility_id == dest_facility_id,
                )
                .first()
            )
            curr_stock = float(snap.stock_qty or 0.0) if snap else 0.0
            curr_avg = float(snap.avg_cost or 0.0) if (snap and snap.avg_cost) else get_variant_unit_cost_usd(db, out_var, dest_facility_id)
            pvp_usd = get_variant_sales_price_usd(db, out_var, dest_facility_id)
            ref_p_usd = float(out.market_reference_price) if out.market_reference_price and float(out.market_reference_price) > 0 else pvp_usd
            calc_u = float(out.calculated_unit_cost or 0.0)
            alloc_t = float(out.allocated_total_cost or 0.0)
            gb = out.generated_batch
            ref_bom_out = bom_outputs_by_var.get(out.output_variant_id)
            method = (
                ref_bom_out.cost_allocation_method
                if ref_bom_out and ref_bom_out.cost_allocation_method
                else ("FIXED_NRV" if (out.output_type or "").upper() == "BY_PRODUCT" else "MARKET_VALUE_INDEX")
            )
            q_good = float(out.actual_good_qty or 0.0)
            comm_val_usd = round(q_good * ref_p_usd, 4)
            margin_pct = round(((ref_p_usd - calc_u) / ref_p_usd) * 100.0, 2) if ref_p_usd > 0 else 0.0

            outputs_detail.append({
                "id": out.id,
                "output_variant_id": out.output_variant_id,
                "output_sku": out_var.sku if out_var else f"VAR-{out.output_variant_id}",
                "output_name": prod.name if prod else "Producto Terminado",
                "output_type": out.output_type,
                "cost_allocation_method": method,
                "uom_base": out.uom_base,
                "is_discrete_uom": not is_weight_uom(out.uom_base),
                "planned_qty": float(out.planned_qty or 0.0),
                "actual_good_qty": q_good,
                "explicit_damaged_qty": float(out.explicit_damaged_qty or 0.0),
                "expected_yield_pct": float(out.expected_yield_pct or 0.0),
                "actual_yield_pct": float(out.actual_yield_pct or 0.0),
                "yield_variance_pct": round(float(out.actual_yield_pct or 0.0) - float(out.expected_yield_pct or 0.0), 3),
                "market_reference_price_usd": round(ref_p_usd, 4),
                "market_reference_price_ves": round(ref_p_usd * rate, 2),
                "commercial_value_usd": comm_val_usd,
                "commercial_value_ves": round(comm_val_usd * rate, 2),
                "current_sales_price_usd": round(pvp_usd, 4),
                "current_sales_price_ves": round(pvp_usd * rate, 2),
                "cost_allocation_pct": float(out.cost_allocation_pct or 0.0),
                "allocated_total_cost_usd": round(alloc_t, 4),
                "allocated_total_cost_ves": round(alloc_t * rate, 2),
                "calculated_unit_cost_usd": round(calc_u, 4),
                "calculated_unit_cost_ves": round(calc_u * rate, 2),
                "gross_margin_pct": margin_pct,
                "current_inventory_stock_qty": round(curr_stock, 4),
                "current_inventory_wavg_usd": round(curr_avg, 4),
                "current_inventory_wavg_ves": round(curr_avg * rate, 2),
                "generated_batch_id": out.generated_batch_id,
                "generated_batch_number": gb.batch_number if gb else None,
                "generated_batch_manufacturing_date": gb.manufacturing_date.isoformat() if (gb and gb.manufacturing_date) else None,
                "generated_batch_expiry_date": gb.expiry_date.isoformat() if (gb and gb.expiry_date) else None,
                "stock_move_id": out.stock_move_id,
            })

        scale_factor = (
            float(order.planned_base_qty or 1.0) / float(bom.base_qty or 1.0)
            if (bom and bom.base_qty and float(bom.base_qty) > 0)
            else 1.0
        )
        hourly_labor = float(wc.hourly_labor_rate or 0.0) if wc else 0.0
        estimated_labor_hours = (
            float(order.total_direct_labor_cost or 0.0) / hourly_labor
            if hourly_labor > 0
            else (float(bom.standard_labor_hours or 0.0) * scale_factor if bom else (0.5 if wc else 0.0))
        )

        mat_usd = float(order.total_direct_material_cost or 0.0)
        pkg_usd = float(order.total_packaging_cost or 0.0)
        mod_usd = float(order.total_direct_labor_cost or 0.0)
        cif_usd = float(order.total_indirect_overhead_cost or 0.0)
        byp_usd = float(order.total_byproduct_credit or 0.0)
        waste_usd = float(order.total_explicit_waste_cost or 0.0)
        net_usd = float(order.net_production_cost or 0.0)
        gross_usd = mat_usd + pkg_usd + mod_usd + cif_usd
        joint_before_waste_usd = max(0.0, gross_usd - byp_usd)

        sector = (
            bom.sector
            if bom
            else (wc.sector if wc else ("MEAT_PROCESSING" if order.order_type == "MEAT_DISASSEMBLY" else "BAKERY"))
        )
        uom_id = (
            bom.uom_id
            if bom
            else (
                order.inputs[0].uom_base
                if (order.order_type == "MEAT_DISASSEMBLY" and order.inputs and order.inputs[0].uom_base)
                else (order.outputs[0].uom_base if order.outputs and order.outputs[0].uom_base else "UND")
            )
        )

        return {
            "id": order.id,
            "order_number": order.order_number,
            "state": order.state,
            "order_type": order.order_type,
            "sector": sector,
            "facility_id": order.facility_id,
            "facility_name": order.facility.name if order.facility else "Sede Principal",
            "source_warehouse_id": order.source_warehouse_id,
            "source_warehouse_name": src_wh.name if src_wh else f"Almacén #{order.source_warehouse_id}",
            "dest_warehouse_id": order.dest_warehouse_id,
            "dest_warehouse_name": dest_wh.name if dest_wh else f"Almacén #{order.dest_warehouse_id}",
            "work_center_id": order.work_center_id,
            "work_center_name": wc.name if wc else None,
            "work_center_capacity_per_batch": float(wc.capacity_per_batch or 0.0) if wc else 0.0,
            "work_center_capacity_uom": wc.capacity_uom if wc else None,
            "work_center_rates": {
                "hourly_labor_rate": float(wc.hourly_labor_rate or 0.0) if wc else 0.0,
                "hourly_overhead_rate": float(wc.hourly_overhead_rate or 0.0) if wc else 0.0,
                "overhead_per_kg": float(wc.overhead_per_kg or 0.0) if wc else 0.0,
            },
            "bom_id": order.bom_id,
            "bom_code": bom.code if bom else "TRANSF-LIBRE",
            "bom_name": bom.name if bom else "Transformación Libre de Materiales",
            "bom_type": bom.bom_type if bom else ("DIVERGENT_DISASSEMBLY" if order.order_type == "MEAT_DISASSEMBLY" else "CONVERGENT_RECIPE"),
            "bom_instructions": bom.instructions if bom else None,
            "instructions": bom.instructions if bom else None,
            "uom_id": uom_id,
            "expected_shrinkage_pct": float(bom.expected_shrinkage_pct or 0.0) if bom else 0.0,
            "max_allowed_shrinkage_pct": float(bom.max_allowed_shrinkage_pct or 0.0) if bom else 5.0,
            "shelf_life_days": int(bom.shelf_life_days or 1) if bom else 7,
            "exchange_rate": round(rate, 4),
            "base_qty": float(bom.base_qty or order.planned_base_qty or 1.0) if bom else float(order.planned_base_qty or 1.0),
            "scale_factor": round(scale_factor, 4),
            "planned_base_qty": float(order.planned_base_qty or 0.0),
            "actual_input_weight_kg": float(order.actual_input_weight_kg or 0.0),
            "actual_good_output_weight_kg": float(order.actual_good_output_weight_kg or 0.0),
            "actual_byproduct_weight_kg": float(order.actual_byproduct_weight_kg or 0.0),
            "natural_shrinkage_qty": float(order.natural_shrinkage_qty or 0.0),
            "explicit_waste_qty": float(order.explicit_waste_qty or 0.0),
            "actual_labor_hours": round(estimated_labor_hours, 2),
            "cost_summary": {
                "direct_materials_usd": round(mat_usd, 4),
                "direct_materials_ves": round(mat_usd * rate, 2),
                "packaging_usd": round(pkg_usd, 4),
                "packaging_ves": round(pkg_usd * rate, 2),
                "direct_labor_mod_usd": round(mod_usd, 4),
                "direct_labor_mod_ves": round(mod_usd * rate, 2),
                "indirect_overhead_cif_usd": round(cif_usd, 4),
                "indirect_overhead_cif_ves": round(cif_usd * rate, 2),
                "gross_production_cost_usd": round(gross_usd, 4),
                "gross_production_cost_ves": round(gross_usd * rate, 2),
                "byproduct_credit_usd": round(byp_usd, 4),
                "byproduct_credit_ves": round(byp_usd * rate, 2),
                "joint_cost_before_waste_usd": round(joint_before_waste_usd, 4),
                "joint_cost_before_waste_ves": round(joint_before_waste_usd * rate, 2),
                "explicit_waste_cost_usd": round(waste_usd, 4),
                "explicit_waste_cost_ves": round(waste_usd * rate, 2),
                "net_joint_cost_to_distribute_usd": round(net_usd, 4),
                "net_joint_cost_to_distribute_ves": round(net_usd * rate, 2),
                "net_production_cost_usd": round(net_usd, 4),
                "net_production_cost_ves": round(net_usd * rate, 2),
            },
            "kardex_links": {
                "picking_consumption_id": order.picking_consumption_id,
                "picking_consumption_folio": picking_consume.name if picking_consume else None,
                "picking_output_id": order.picking_output_id,
                "picking_output_folio": picking_output.name if picking_output else None,
                "waste_move_id": order.waste_move_id,
                "waste_move_reference": waste_move.reference if waste_move else None,
            },
            "scheduled_date": order.scheduled_date.isoformat() if order.scheduled_date else None,
            "started_at": order.started_at.isoformat() if order.started_at else None,
            "completed_at": order.completed_at.isoformat() if order.completed_at else None,
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "notes": order.notes,
            "inputs": inputs_detail,
            "outputs": outputs_detail,
        }

    @staticmethod
    def ensure_initial_sample_orders(db: Session) -> None:
        """
        Garantiza que exista la infraestructura WMS/Kardex de manufactura en cualquier entorno y,
        en entornos de prueba/QA (excluyendo morpheus_prod), siembra las órdenes de demostración iniciales.
        """
        ProductionService.ensure_mfg_wms_infrastructure(db, commit=True)

        if ProductionService._SAMPLE_ORDERS_SEEDED:
            return

        current_db_name = (db.execute(text("SELECT current_database()")).scalar() or "").strip()
        if current_db_name == "morpheus_prod":
            ProductionService._SAMPLE_ORDERS_SEEDED = True
            return

        default_fac = db.query(Facility).order_by(Facility.id.asc()).first()
        default_wh = db.query(Warehouse).order_by(Warehouse.id.asc()).first()
        fallback_fac_id = default_fac.id if default_fac else 1
        fallback_wh_id = default_wh.id if default_wh else 1

        try:
            existing_convergent = (
                db.query(ProductionOrder)
                .filter(ProductionOrder.order_type == "CONVERGENT_PRODUCTION")
                .order_by(ProductionOrder.id.asc())
                .all()
            )
            if len(existing_convergent) < 2:
                bom_pan = db.query(BOMHeader).filter(BOMHeader.code == "BOM-PAN-001").first()
                bom_gas = db.query(BOMHeader).filter(BOMHeader.code == "BOM-GAS-001").first()
                if not bom_pan:
                    bom_pan = db.query(BOMHeader).filter(BOMHeader.bom_type == "CONVERGENT_RECIPE").order_by(BOMHeader.id.asc()).first()
                if not bom_gas:
                    bom_gas = db.query(BOMHeader).filter(BOMHeader.bom_type == "CONVERGENT_RECIPE").order_by(BOMHeader.id.desc()).first()

                if len(existing_convergent) == 1 and existing_convergent[0].state != "COMPLETED":
                    op1_id = existing_convergent[0].id
                    ProductionService.complete_order(
                        db,
                        order_id=op1_id,
                        req=CompleteOrderRequest(
                            actual_labor_hours=float(bom_pan.standard_labor_hours or 2.5) if bom_pan else 2.5,
                            actual_good_qty=86.0,
                            explicit_damaged_qty=2.0,
                            natural_shrinkage_qty=12.0,
                            notes="Liquidación horneado matutino: 86 panes buenos, 12 eq. merma térmica de horneado y 2 unidades dañadas en desmolde.",
                        ),
                    )
                elif len(existing_convergent) == 0 and bom_pan:
                    pan_fac_id = bom_pan.work_center.facility_id if (bom_pan.work_center and bom_pan.work_center.facility_id) else fallback_fac_id
                    pan_wh_id = bom_pan.work_center.warehouse_wip_id if (bom_pan.work_center and bom_pan.work_center.warehouse_wip_id) else fallback_wh_id
                    op1 = ProductionService.create_order(
                        db,
                        ProductionOrderCreate(
                            bom_id=bom_pan.id,
                            facility_id=pan_fac_id,
                            work_center_id=bom_pan.work_center_id,
                            source_warehouse_id=pan_wh_id,
                            dest_warehouse_id=pan_wh_id,
                            planned_base_qty=float(bom_pan.base_qty or 100.0),
                            notes="Tanda matutina hornos rotativos — Pan Campesino & Artesanal.",
                            start_immediately=True,
                        ),
                    )
                    ProductionService.complete_order(
                        db,
                        order_id=op1["id"],
                        req=CompleteOrderRequest(
                            actual_labor_hours=float(bom_pan.standard_labor_hours or 2.5),
                            actual_good_qty=86.0,
                            explicit_damaged_qty=2.0,
                            natural_shrinkage_qty=12.0,
                            notes="Liquidación horneado matutino: 86 panes buenos, 12 eq. merma térmica de horneado y 2 unidades dañadas en desmolde.",
                        ),
                    )

                if (
                    db.query(ProductionOrder).filter(ProductionOrder.order_type == "CONVERGENT_PRODUCTION").count() < 2
                    and bom_gas
                ):
                    gas_fac_id = bom_gas.work_center.facility_id if (bom_gas.work_center and bom_gas.work_center.facility_id) else fallback_fac_id
                    gas_wh_id = bom_gas.work_center.warehouse_wip_id if (bom_gas.work_center and bom_gas.work_center.warehouse_wip_id) else fallback_wh_id
                    ProductionService.create_order(
                        db,
                        ProductionOrderCreate(
                            bom_id=bom_gas.id,
                            facility_id=gas_fac_id,
                            work_center_id=bom_gas.work_center_id,
                            source_warehouse_id=gas_wh_id,
                            dest_warehouse_id=gas_wh_id,
                            planned_base_qty=float(bom_gas.base_qty or 25.0),
                            notes="Tanda en proceso en Cocina Central — Lista para pesaje final y liquidación al Kardex.",
                            start_immediately=True,
                        ),
                    )

            # Semillas de Fase 3: Sala de Desposte Cárnico (DES-RES-001)
            existing_butchery = (
                db.query(ProductionOrder)
                .filter(ProductionOrder.order_type == "MEAT_DISASSEMBLY")
                .order_by(ProductionOrder.id.asc())
                .all()
            )
            if len(existing_butchery) < 2:
                bom_des = db.query(BOMHeader).filter(BOMHeader.code == "DES-RES-001").first()
                if not bom_des:
                    bom_des = (
                        db.query(BOMHeader)
                        .filter(BOMHeader.bom_type == "DIVERGENT_DISASSEMBLY")
                        .order_by(BOMHeader.id.asc())
                        .first()
                    )
                if bom_des:
                    des_fac_id = bom_des.work_center.facility_id if (bom_des.work_center and bom_des.work_center.facility_id) else fallback_fac_id
                    des_wh_id = bom_des.work_center.warehouse_wip_id if (bom_des.work_center and bom_des.work_center.warehouse_wip_id) else fallback_wh_id
                    has_completed_butchery = any(o.state == "COMPLETED" for o in existing_butchery)
                    if not has_completed_butchery:
                        op_des_completed = ProductionService.create_order(
                            db,
                            ProductionOrderCreate(
                                bom_id=bom_des.id,
                                facility_id=des_fac_id,
                                work_center_id=bom_des.work_center_id,
                                source_warehouse_id=des_wh_id,
                                dest_warehouse_id=des_wh_id,
                                planned_base_qty=100.0,
                                notes="Desposte matutino Media Canal Bovina 100 Kg — Liquidación NIC 2 por Valor Relativo de Mercado.",
                                start_immediately=True,
                            ),
                        )
                        real_weights_map = {
                            126014: (4.20, 0.0, 14.0),   # Lomito
                            122000: (27.80, 0.0, 10.0),  # Solomo
                            123630: (31.50, 0.0, 8.0),   # Pulpa
                            122003: (14.10, 0.0, 5.5),   # Costilla
                            122002: (9.90, 0.50, 5.3),   # Recorte / Molida
                            121996: (9.20, 0.0, 1.0),    # Hueso / Sebo (BY_PRODUCT)
                        }
                        positional_weights = [
                            (4.20, 0.0, 14.0),
                            (27.80, 0.0, 10.0),
                            (31.50, 0.0, 8.0),
                            (14.10, 0.0, 5.5),
                            (9.90, 0.50, 5.3),
                            (9.20, 0.0, 1.0),
                        ]
                        out_lines = []
                        for idx, out_item in enumerate(op_des_completed["outputs"]):
                            vid = out_item["output_variant_id"]
                            fallback_tuple = (
                                positional_weights[idx]
                                if idx < len(positional_weights)
                                else (out_item["planned_qty"], 0.0, out_item["market_reference_price_usd"])
                            )
                            good_w, dmg_w, ref_p = real_weights_map.get(vid, fallback_tuple)
                            out_lines.append(
                                CompleteOrderOutputLine(
                                    output_id=out_item["id"],
                                    output_variant_id=vid,
                                    actual_good_qty=good_w,
                                    explicit_damaged_qty=dmg_w,
                                    market_reference_price=ref_p,
                                )
                            )
                        sum_good_w = sum(float(l.actual_good_qty or 0.0) for l in out_lines)
                        sum_dmg_w = max(0.50, sum(float(l.explicit_damaged_qty or 0.0) for l in out_lines))
                        nat_shrink_w = round(max(0.0, 100.0 - sum_good_w - sum_dmg_w), 4)
                        ProductionService.complete_order(
                            db,
                            order_id=op_des_completed["id"],
                            req=CompleteOrderRequest(
                                actual_input_weight_kg=100.0,
                                actual_labor_hours=2.5,
                                natural_shrinkage_qty=nat_shrink_w,
                                explicit_waste_qty=sum_dmg_w,
                                outputs=out_lines,
                                notes="Liquidación Sala de Desposte: 87.50 kg cortes nobles/industriales, 9.20 kg hueso/sebo, 2.80 kg merma natural por oreo y 0.50 kg recorte descartado.",
                            ),
                        )

                    has_active_butchery = any(o.state in ("IN_PROGRESS", "PLANNED", "DRAFT") for o in existing_butchery)
                    if not has_active_butchery:
                        ProductionService.create_order(
                            db,
                            ProductionOrderCreate(
                                bom_id=bom_des.id,
                                facility_id=des_fac_id,
                                work_center_id=bom_des.work_center_id,
                                source_warehouse_id=des_wh_id,
                                dest_warehouse_id=des_wh_id,
                                planned_base_qty=120.0,
                                notes="Media Canal Bovina 120 Kg en riel de Sala de Desposte — Lista para pesaje de cortes y liquidación NIC 2 con 1 clic.",
                                start_immediately=True,
                            ),
                        )
        except Exception as exc:
            db.rollback()
            print(f"[MFG SAMPLE ORDERS WARNING] No se pudieron sembrar órdenes demo iniciales: {exc}")
        finally:
            ProductionService._SAMPLE_ORDERS_SEEDED = True

    # ==========================================================================
    # FASE 4: CORRIDA DE PRODUCCIÓN MASIVA POR LOTES (MULTI-RECETA + FEFO GLOBAL)
    # ==========================================================================
    @staticmethod
    def explode_batch_run_preview(
        db: Session,
        req: BatchRunExplodePreviewRequest,
    ) -> Dict[str, Any]:
        """
        Explosión Consolidada Multi-Receta en Vivo:
        1. Calcula la explosión individual de cada receta (BOM) en req.lines.
        2. Consolida la demanda global de cada insumo (component_variant_id) sumando a través de todas las recetas.
        3. Contrasta la demanda acumulada contra inv.inventory_snapshots de la sucursal y asigna lotes FEFO
           secuencialmente sin sobre-asignar el mismo stock dos veces.
        4. Devuelve el detalle por receta (recipe_previews / recipe_Previews), la tabla consolidada de materia prima
           (consolidated_inputs) y los totales financieros en USD y Bs.
        """
        ProductionService.ensure_mfg_wms_infrastructure(db, commit=True)

        rate_info = get_active_bcv_rate(db, req.exchange_rate_override)
        rate = rate_info["rate"]
        today = date.today()

        fac = db.query(Facility).filter(Facility.id == req.facility_id).first() if req.facility_id else None
        if not fac:
            fac = db.query(Facility).order_by(Facility.id.asc()).first()
        facility_id = fac.id if fac else 1

        src_wh = None
        if req.source_warehouse_id:
            cand_src = db.query(Warehouse).filter(Warehouse.id == req.source_warehouse_id).first()
            if cand_src and cand_src.facility_id == facility_id:
                src_wh = cand_src
        if not src_wh:
            src_wh = (
                db.query(Warehouse)
                .filter(
                    Warehouse.facility_id == facility_id,
                    Warehouse.is_scrap == False,
                    Warehouse.code != "VIRTUAL",
                )
                .order_by(Warehouse.id.asc())
                .first()
                or db.query(Warehouse).filter(Warehouse.facility_id == facility_id).order_by(Warehouse.id.asc()).first()
                or db.query(Warehouse).order_by(Warehouse.id.asc()).first()
            )
        source_warehouse_id = src_wh.id if src_wh else 1

        dest_wh = None
        if req.dest_warehouse_id:
            cand_dest = db.query(Warehouse).filter(Warehouse.id == req.dest_warehouse_id).first()
            if cand_dest and cand_dest.facility_id == facility_id:
                dest_wh = cand_dest
        if not dest_wh:
            dest_wh = src_wh
        dest_warehouse_id = dest_wh.id if dest_wh else source_warehouse_id

        src_facility_id = src_wh.facility_id if (src_wh and src_wh.facility_id) else facility_id
        dest_facility_id = dest_wh.facility_id if (dest_wh and dest_wh.facility_id) else facility_id

        if not req.lines:
            return {
                "facility_id": facility_id,
                "facility_name": fac.name if fac else f"Sucursal #{facility_id}",
                "source_warehouse_id": source_warehouse_id,
                "source_warehouse_name": src_wh.name if src_wh else f"Almacén #{source_warehouse_id}",
                "dest_warehouse_id": dest_warehouse_id,
                "dest_warehouse_name": dest_wh.name if dest_wh else f"Almacén #{dest_warehouse_id}",
                "exchange_rate": round(rate, 4),
                "overall_stock_status": "AVAILABLE",
                "total_recipes_count": 0,
                "total_consolidated_inputs_count": 0,
                "total_direct_materials_usd": 0.0,
                "total_direct_materials_ves": 0.0,
                "total_packaging_usd": 0.0,
                "total_packaging_ves": 0.0,
                "total_direct_labor_mod_usd": 0.0,
                "total_direct_labor_mod_ves": 0.0,
                "total_indirect_overhead_cif_usd": 0.0,
                "total_indirect_overhead_cif_ves": 0.0,
                "total_explicit_waste_cost_usd": 0.0,
                "total_explicit_waste_cost_ves": 0.0,
                "total_batch_cost_usd": 0.0,
                "total_batch_cost_ves": 0.0,
                "net_batch_cost_usd": 0.0,
                "net_batch_cost_ves": 0.0,
                "recipe_previews": [],
                "recipe_Previews": [],
                "consolidated_inputs": [],
            }

        recipe_previews: List[Dict[str, Any]] = []
        consolidated_map: Dict[int, Dict[str, Any]] = {}

        # Track cumulative PT stock/value in case the same recipe/product appears multiple times in the batch
        running_pt_stock_by_var: Dict[int, float] = {}
        running_pt_wavg_by_var: Dict[int, float] = {}

        total_direct_materials_usd = 0.0
        total_packaging_usd = 0.0
        total_direct_labor_mod_usd = 0.0
        total_indirect_overhead_cif_usd = 0.0
        total_explicit_waste_cost_usd = 0.0
        total_batch_cost_usd = 0.0
        net_batch_cost_usd = 0.0

        for line_idx, line in enumerate(req.lines):
            if not line.bom_id or line.bom_id <= 0:
                continue

            single_prev = ProductionService.explode_bom_preview(
                db,
                ExplodePreviewRequest(
                    bom_id=line.bom_id,
                    work_center_id=line.work_center_id,
                    scale_factor=line.scale_factor,
                    planned_base_qty=line.planned_base_qty,
                    actual_labor_hours=line.actual_labor_hours,
                    facility_id=facility_id,
                    source_warehouse_id=source_warehouse_id,
                    dest_warehouse_id=dest_warehouse_id,
                    exchange_rate_override=req.exchange_rate_override,
                ),
                commit_infra=False,
            )

            planned_qty = float(single_prev["planned_base_qty"])
            scale_factor = float(single_prev["scale_factor"])
            expected_shrink_pct = float(single_prev["expected_shrinkage_pct"])
            default_good_qty = round(max(0.0001, planned_qty * (1.0 - expected_shrink_pct / 100.0)), 4)
            is_discrete_pt = not is_weight_uom(single_prev["uom_id"])
            if is_discrete_pt:
                default_good_qty = float(max(1, round(default_good_qty)))

            explicit_damaged_qty = max(0.0, float(line.explicit_damaged_qty or 0.0))
            if is_discrete_pt and explicit_damaged_qty > 0:
                explicit_damaged_qty = float(round(explicit_damaged_qty))
            else:
                explicit_damaged_qty = round(explicit_damaged_qty, 4)

            if line.actual_good_qty is not None and float(line.actual_good_qty) > 0:
                actual_good_qty = float(line.actual_good_qty)
            else:
                actual_good_qty = max(0.0001, round(default_good_qty - explicit_damaged_qty, 4))

            if is_discrete_pt:
                actual_good_qty = float(max(1, round(actual_good_qty)))
            else:
                actual_good_qty = round(actual_good_qty, 4)

            if line.natural_shrinkage_qty is not None and float(line.natural_shrinkage_qty) >= 0:
                natural_shrinkage_qty = round(float(line.natural_shrinkage_qty), 4)
            else:
                natural_shrinkage_qty = round(
                    max(0.0, planned_qty - actual_good_qty - explicit_damaged_qty),
                    4,
                )

            cp = single_prev["cost_projection"]
            mat_usd = float(cp["direct_materials_usd"])
            pkg_usd = float(cp["packaging_usd"])
            mod_usd = float(cp["direct_labor_mod_usd"])
            cif_usd = float(cp["indirect_overhead_cif_usd"])
            gross_cost_usd = float(cp["total_batch_cost_usd"])
            byp_credit_usd = float(cp.get("byproduct_credit_usd", 0.0))
            joint_before_waste_usd = round(max(0.0, gross_cost_usd - byp_credit_usd), 4)

            effective_coprod_qty = round(actual_good_qty + explicit_damaged_qty, 4)
            unit_cost_after_natural = (
                joint_before_waste_usd / effective_coprod_qty
                if effective_coprod_qty > 0
                else 0.0
            )
            line_waste_cost_usd = (
                round(explicit_damaged_qty * unit_cost_after_natural, 4)
                if explicit_damaged_qty > 0
                else 0.0
            )
            line_net_cost_usd = round(max(0.0, joint_before_waste_usd - line_waste_cost_usd), 4)
            line_unit_cost_usd = (
                round(line_net_cost_usd / actual_good_qty, 4)
                if actual_good_qty > 0
                else float(cp["projected_unit_cost_usd"])
            )

            pt_var_id = int(single_prev["primary_product_variant_id"])
            if pt_var_id not in running_pt_stock_by_var:
                running_pt_stock_by_var[pt_var_id] = max(0.0, float(cp["current_stock_qty"]))
                running_pt_wavg_by_var[pt_var_id] = max(0.0, float(cp["current_wavg_cost_usd"]))

            prev_pt_stock = running_pt_stock_by_var[pt_var_id]
            prev_pt_wavg = running_pt_wavg_by_var[pt_var_id]
            if (prev_pt_stock + actual_good_qty) > 0 and actual_good_qty > 0 and line_unit_cost_usd > 0:
                if prev_pt_stock > 0 and prev_pt_wavg > 0:
                    proj_new_wavg_usd = round(
                        ((prev_pt_stock * prev_pt_wavg) + (actual_good_qty * line_unit_cost_usd))
                        / (prev_pt_stock + actual_good_qty),
                        4,
                    )
                else:
                    proj_new_wavg_usd = line_unit_cost_usd
            else:
                proj_new_wavg_usd = prev_pt_wavg if prev_pt_wavg > 0 else line_unit_cost_usd

            running_pt_stock_by_var[pt_var_id] = round(prev_pt_stock + actual_good_qty, 4)
            running_pt_wavg_by_var[pt_var_id] = proj_new_wavg_usd

            pvp_usd = float(cp["current_pvp_usd"])
            margin_pct = (
                round(((pvp_usd - line_unit_cost_usd) / pvp_usd) * 100.0, 2)
                if pvp_usd > 0
                else 0.0
            )

            total_direct_materials_usd += mat_usd
            total_packaging_usd += pkg_usd
            total_direct_labor_mod_usd += mod_usd
            total_indirect_overhead_cif_usd += cif_usd
            total_explicit_waste_cost_usd += line_waste_cost_usd
            total_batch_cost_usd += gross_cost_usd
            net_batch_cost_usd += line_net_cost_usd

            # Accumulate inputs for global consolidation
            for inp in single_prev["inputs"]:
                vid = int(inp["component_variant_id"])
                req_qty = float(inp["planned_base_qty"])
                if vid not in consolidated_map:
                    consolidated_map[vid] = {
                        "component_variant_id": vid,
                        "component_sku": inp["component_sku"],
                        "component_name": inp["component_name"],
                        "input_role": inp["input_role"],
                        "uom_base": inp["uom_base"],
                        "is_discrete_uom": inp["is_discrete_uom"],
                        "unit_cost_usd": float(inp["unit_cost_usd"]),
                        "unit_cost_ves": float(inp["unit_cost_ves"]),
                        "total_required_base_qty": 0.0,
                        "used_in_recipes": [],
                        "recipe_codes": [],
                    }
                entry = consolidated_map[vid]
                entry["total_required_base_qty"] = round(entry["total_required_base_qty"] + req_qty, 4)
                if single_prev["bom_code"] not in entry["recipe_codes"]:
                    entry["recipe_codes"].append(single_prev["bom_code"])
                entry["used_in_recipes"].append({
                    "line_index": line_idx,
                    "bom_id": single_prev["bom_id"],
                    "bom_code": single_prev["bom_code"],
                    "bom_name": single_prev["bom_name"],
                    "required_base_qty": round(req_qty, 4),
                    "uom_base": inp["uom_base"],
                })

            recipe_previews.append({
                "line_index": line_idx,
                "bom_id": single_prev["bom_id"],
                "bom_code": single_prev["bom_code"],
                "bom_name": single_prev["bom_name"],
                "bom_type": single_prev["bom_type"],
                "sector": single_prev["sector"],
                "work_center_id": single_prev["work_center_id"],
                "work_center_code": single_prev["work_center_code"],
                "work_center_name": single_prev["work_center_name"],
                "primary_product_variant_id": pt_var_id,
                "primary_product_sku": single_prev["primary_product_sku"],
                "primary_product_name": single_prev["primary_product_name"],
                "base_qty": single_prev["base_qty"],
                "scale_factor": round(scale_factor, 4),
                "planned_base_qty": round(planned_qty, 4),
                "uom_id": single_prev["uom_id"],
                "expected_shrinkage_pct": expected_shrink_pct,
                "actual_good_qty": actual_good_qty,
                "natural_shrinkage_qty": natural_shrinkage_qty,
                "explicit_damaged_qty": explicit_damaged_qty,
                "actual_labor_hours": round(float(single_prev["standard_labor_hours"]), 2),
                "direct_materials_usd": round(mat_usd, 4),
                "packaging_usd": round(pkg_usd, 4),
                "direct_labor_mod_usd": round(mod_usd, 4),
                "indirect_overhead_cif_usd": round(cif_usd, 4),
                "explicit_waste_cost_usd": line_waste_cost_usd,
                "estimated_batch_cost_usd": round(gross_cost_usd, 4),
                "estimated_batch_cost_ves": round(gross_cost_usd * rate, 2),
                "net_production_cost_usd": line_net_cost_usd,
                "net_production_cost_ves": round(line_net_cost_usd * rate, 2),
                "estimated_unit_cost_usd": line_unit_cost_usd,
                "estimated_unit_cost_ves": round(line_unit_cost_usd * rate, 2),
                "current_stock_qty": round(prev_pt_stock, 4),
                "current_wavg_cost_usd": round(prev_pt_wavg, 4),
                "projected_new_wavg_cost_usd": proj_new_wavg_usd,
                "projected_new_wavg_cost_ves": round(proj_new_wavg_usd * rate, 2),
                "current_pvp_usd": round(pvp_usd, 4),
                "projected_margin_pct": margin_pct,
                "stock_semaphore": single_prev["stock_semaphore"],
                "inputs": single_prev["inputs"],
            })

        # Sequential FEFO & stock allocation across consolidated inputs
        consolidated_inputs: List[Dict[str, Any]] = []
        remaining_stock_by_var: Dict[int, float] = {}
        has_global_shortage = False
        has_global_partial = False

        for vid, entry in consolidated_map.items():
            snap = (
                db.query(InventorySnapshot)
                .filter(
                    InventorySnapshot.variant_id == vid,
                    InventorySnapshot.facility_id == src_facility_id,
                )
                .first()
            )
            avail_stock = max(0.0, float(snap.stock_qty or 0.0)) if snap else 0.0
            remaining_stock_by_var[vid] = avail_stock

            tot_req = float(entry["total_required_base_qty"])
            if avail_stock >= tot_req:
                status = "AVAILABLE"
                shortage_qty = 0.0
            elif avail_stock > 0:
                status = "PARTIAL"
                shortage_qty = round(tot_req - avail_stock, 4)
                has_global_partial = True
            else:
                status = "SHORTAGE"
                shortage_qty = round(tot_req, 4)
                has_global_shortage = True

            balance_after_batch = round(avail_stock - tot_req, 4)

            batches = (
                db.query(Batch)
                .filter(
                    Batch.product_variant_id == vid,
                    Batch.is_quarantined == False,
                )
                .order_by(Batch.expiry_date.asc().nullslast(), Batch.id.asc())
                .all()
            )
            valid_batches = [b for b in batches if not b.expiry_date or b.expiry_date >= today]
            ordered_batches = valid_batches if valid_batches else batches
            primary_batch = ordered_batches[0] if ordered_batches else None
            days_to_expiry = (
                (primary_batch.expiry_date - today).days
                if (primary_batch and primary_batch.expiry_date)
                else None
            )

            fefo_batches_list = [
                {
                    "batch_id": b.id,
                    "batch_number": b.batch_number,
                    "expiry_date": b.expiry_date.isoformat() if b.expiry_date else None,
                    "days_to_expiry": (b.expiry_date - today).days if b.expiry_date else None,
                }
                for b in ordered_batches[:5]
            ]

            u_cost_usd = float(entry["unit_cost_usd"])
            tot_cost_usd = round(tot_req * u_cost_usd, 4)

            consolidated_inputs.append({
                "component_variant_id": vid,
                "component_sku": entry["component_sku"],
                "component_name": entry["component_name"],
                "input_role": entry["input_role"],
                "uom_base": entry["uom_base"],
                "is_discrete_uom": entry["is_discrete_uom"],
                "recipes_count": len(entry["used_in_recipes"]),
                "recipe_codes": entry["recipe_codes"],
                "used_in_recipes": entry["used_in_recipes"],
                "total_required_base_qty": round(tot_req, 4),
                "available_stock_qty": round(avail_stock, 4),
                "balance_after_batch_qty": balance_after_batch,
                "shortage_qty": shortage_qty,
                "availability_status": status,
                "suggested_batch_id": primary_batch.id if primary_batch else None,
                "suggested_batch_number": primary_batch.batch_number if primary_batch else None,
                "suggested_batch_expiry_date": (
                    primary_batch.expiry_date.isoformat()
                    if (primary_batch and primary_batch.expiry_date)
                    else None
                ),
                "days_to_expiry": days_to_expiry,
                "fefo_batches": fefo_batches_list,
                "unit_cost_usd": round(u_cost_usd, 4),
                "unit_cost_ves": round(u_cost_usd * rate, 2),
                "total_cost_usd": tot_cost_usd,
                "total_cost_ves": round(tot_cost_usd * rate, 2),
            })

        # Sequential allocation across recipe_previews so shared inputs don't double-count available stock
        for r_prev in recipe_previews:
            line_shortage = False
            line_partial = False
            for inp in r_prev["inputs"]:
                vid = int(inp["component_variant_id"])
                req_q = float(inp["planned_base_qty"])
                rem = remaining_stock_by_var.get(vid, 0.0)
                if rem >= req_q:
                    inp["batch_allocated_qty"] = round(req_q, 4)
                    inp["batch_shortage_qty"] = 0.0
                    inp["availability_status"] = "AVAILABLE"
                    remaining_stock_by_var[vid] = round(rem - req_q, 4)
                elif rem > 0:
                    inp["batch_allocated_qty"] = round(rem, 4)
                    inp["batch_shortage_qty"] = round(req_q - rem, 4)
                    inp["availability_status"] = "PARTIAL"
                    remaining_stock_by_var[vid] = 0.0
                    line_partial = True
                else:
                    inp["batch_allocated_qty"] = 0.0
                    inp["batch_shortage_qty"] = round(req_q, 4)
                    inp["availability_status"] = "SHORTAGE"
                    line_shortage = True

            if line_shortage:
                r_prev["stock_semaphore"] = "SHORTAGE"
                has_global_shortage = True
            elif line_partial:
                r_prev["stock_semaphore"] = "PARTIAL"
                has_global_partial = True
            else:
                r_prev["stock_semaphore"] = "AVAILABLE"

        overall_stock_status = (
            "SHORTAGE"
            if has_global_shortage
            else ("PARTIAL" if has_global_partial else "AVAILABLE")
        )

        # Sort consolidated_inputs: shared ingredients (recipes_count > 1) first, then by total_cost_usd DESC
        consolidated_inputs.sort(
            key=lambda x: (-int(x["recipes_count"]), -float(x["total_cost_usd"]))
        )

        return {
            "facility_id": facility_id,
            "facility_name": fac.name if fac else f"Sucursal #{facility_id}",
            "source_warehouse_id": source_warehouse_id,
            "source_warehouse_name": src_wh.name if src_wh else f"Almacén #{source_warehouse_id}",
            "dest_warehouse_id": dest_warehouse_id,
            "dest_warehouse_name": dest_wh.name if dest_wh else f"Almacén #{dest_warehouse_id}",
            "exchange_rate": round(rate, 4),
            "overall_stock_status": overall_stock_status,
            "total_recipes_count": len(recipe_previews),
            "total_consolidated_inputs_count": len(consolidated_inputs),
            "total_direct_materials_usd": round(total_direct_materials_usd, 4),
            "total_direct_materials_ves": round(total_direct_materials_usd * rate, 2),
            "total_packaging_usd": round(total_packaging_usd, 4),
            "total_packaging_ves": round(total_packaging_usd * rate, 2),
            "total_direct_labor_mod_usd": round(total_direct_labor_mod_usd, 4),
            "total_direct_labor_mod_ves": round(total_direct_labor_mod_usd * rate, 2),
            "total_indirect_overhead_cif_usd": round(total_indirect_overhead_cif_usd, 4),
            "total_indirect_overhead_cif_ves": round(total_indirect_overhead_cif_usd * rate, 2),
            "total_explicit_waste_cost_usd": round(total_explicit_waste_cost_usd, 4),
            "total_explicit_waste_cost_ves": round(total_explicit_waste_cost_usd * rate, 2),
            "total_batch_cost_usd": round(total_batch_cost_usd, 4),
            "total_batch_cost_ves": round(total_batch_cost_usd * rate, 2),
            "net_batch_cost_usd": round(net_batch_cost_usd, 4),
            "net_batch_cost_ves": round(net_batch_cost_usd * rate, 2),
            "recipe_previews": recipe_previews,
            "recipe_Previews": recipe_previews,
            "consolidated_inputs": consolidated_inputs,
        }

    @staticmethod
    def execute_batch_run(
        db: Session,
        req: BatchRunExecuteRequest,
        user_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Ejecución Masiva Transaccional de Corrida de Producción por Lotes:
        Soporta 2 modos de ejecución:
        1. LEAVE_IN_PROGRESS:
           Crea el ProductionPlan (state='ORDERS_GENERATED'), sus ProductionPlanLines y las N ProductionOrders
           en estado 'IN_PROGRESS' listas para ajuste/liquidación individual desde /orders.
        2. COMPLETE_AND_SETTLE:
           Crea el ProductionPlan (state='CLOSED'), sus ProductionPlanLines, las N ProductionOrders y ejecuta
           inmediatamente ProductionService.complete_order(...) para cada una dentro de la misma transacción
           atómica, generando los pickings MFG-OUT / MFG-IN, movimientos en inv.stock_moves, lotes sanitarios
           en inv.batches y actualizando inv.inventory_snapshots + inv.product_variants bajo NIC 2 sin doble conteo.
        """
        mode = (req.execution_mode or "LEAVE_IN_PROGRESS").strip().upper()
        if mode not in ("LEAVE_IN_PROGRESS", "COMPLETE_AND_SETTLE"):
            raise HTTPException(
                status_code=400,
                detail="execution_mode inválido. Use 'LEAVE_IN_PROGRESS' o 'COMPLETE_AND_SETTLE'.",
            )

        valid_lines = [l for l in req.lines if l.bom_id and l.bom_id > 0]
        if not valid_lines:
            raise HTTPException(
                status_code=400,
                detail="Debe incluir al menos una receta válida (bom_id) para ejecutar la corrida de producción masiva.",
            )

        ProductionService.ensure_mfg_wms_infrastructure(db, commit=True)

        rate_info = get_active_bcv_rate(db)
        rate = rate_info["rate"]
        today = date.today()

        fac = db.query(Facility).filter(Facility.id == req.facility_id).first() if req.facility_id else None
        if not fac:
            fac = db.query(Facility).order_by(Facility.id.asc()).first()
        facility_id = fac.id if fac else 1

        src_wh = db.query(Warehouse).filter(Warehouse.id == req.source_warehouse_id).first() if req.source_warehouse_id else None
        if not src_wh or src_wh.facility_id != facility_id:
            src_wh = (
                db.query(Warehouse)
                .filter(
                    Warehouse.facility_id == facility_id,
                    Warehouse.is_scrap == False,
                    Warehouse.code != "VIRTUAL",
                )
                .order_by(Warehouse.id.asc())
                .first()
                or db.query(Warehouse).filter(Warehouse.facility_id == facility_id).order_by(Warehouse.id.asc()).first()
                or db.query(Warehouse).order_by(Warehouse.id.asc()).first()
            )
        source_warehouse_id = src_wh.id if src_wh else 1

        dest_wh = db.query(Warehouse).filter(Warehouse.id == req.dest_warehouse_id).first() if req.dest_warehouse_id else None
        if not dest_wh or dest_wh.facility_id != facility_id:
            dest_wh = src_wh
        dest_warehouse_id = dest_wh.id if dest_wh else source_warehouse_id

        try:
            # 1. Sincronizar secuencias antes de insertar
            for seq_tbl in [
                "mfg.production_plans",
                "mfg.production_plan_lines",
                "mfg.production_orders",
                "mfg.production_order_inputs",
                "mfg.production_order_outputs",
                "inv.batches",
                "inv.stock_pickings",
                "inv.stock_moves",
            ]:
                db.execute(
                    text(
                        f"""
                        SELECT setval(
                            pg_get_serial_sequence('{seq_tbl}', 'id'),
                            COALESCE((SELECT MAX(id) FROM {seq_tbl}), 1),
                            (SELECT MAX(id) IS NOT NULL FROM {seq_tbl})
                        )
                        WHERE pg_get_serial_sequence('{seq_tbl}', 'id') IS NOT NULL
                        """
                    )
                )

            # 2. Crear ProductionPlan maestro
            plan_number = ProductionService._generate_plan_number(db)
            plan_state = "CLOSED" if mode == "COMPLETE_AND_SETTLE" else "ORDERS_GENERATED"
            shift_val = (req.shift or "MORNING").strip().upper()
            sector_val = (req.sector or "BAKERY").strip().upper()

            plan = ProductionPlan(
                plan_number=plan_number,
                facility_id=facility_id,
                plan_date=today,
                shift=shift_val,
                sector=sector_val,
                state=plan_state,
                notes=req.notes or f"Corrida de Producción Masiva ({len(valid_lines)} recetas - {mode})",
                created_by_id=user_id,
                approved_by_id=user_id,
            )
            db.add(plan)
            db.flush()

            orders_created: List[Dict[str, Any]] = []
            total_cost_usd = 0.0
            running_pt_stock_by_var: Dict[int, float] = {}
            running_pt_wavg_by_var: Dict[int, float] = {}

            # 3. Procesar cada línea del lote masivo
            for idx, line in enumerate(valid_lines):
                bom = db.query(BOMHeader).filter(BOMHeader.id == line.bom_id).first()
                if not bom:
                    raise HTTPException(
                        status_code=404,
                        detail=f"Fórmula / Receta (bom_id={line.bom_id}) no encontrada en la fila #{idx + 1}.",
                    )

                base_qty = max(0.0001, float(bom.base_qty or 1.0))
                if line.scale_factor is not None and float(line.scale_factor) > 0:
                    if line.planned_base_qty is None or (
                        abs(float(line.planned_base_qty) - base_qty) < 1e-4
                        and abs(float(line.scale_factor) - 1.0) > 1e-4
                    ):
                        scale_factor = round(float(line.scale_factor), 4)
                        planned_base_qty = round(max(0.0001, base_qty * scale_factor), 4)
                    else:
                        planned_base_qty = round(max(0.0001, float(line.planned_base_qty)), 4)
                        scale_factor = round(planned_base_qty / base_qty, 4)
                elif line.planned_base_qty is not None and float(line.planned_base_qty) > 0:
                    planned_base_qty = round(float(line.planned_base_qty), 4)
                    scale_factor = round(planned_base_qty / base_qty, 4)
                else:
                    scale_factor = 1.0
                    planned_base_qty = round(base_qty, 4)

                pt_snap = (
                    db.query(InventorySnapshot)
                    .filter(
                        InventorySnapshot.variant_id == bom.primary_product_variant_id,
                        InventorySnapshot.facility_id == facility_id,
                    )
                    .first()
                )
                curr_pt_stock = float(pt_snap.stock_qty or 0.0) if pt_snap else 0.0

                plan_line = ProductionPlanLine(
                    plan_id=plan.id,
                    bom_id=bom.id,
                    target_variant_id=bom.primary_product_variant_id,
                    demand_source="MAKE_TO_STOCK",
                    current_stock_qty=Decimal(str(round(curr_pt_stock, 4))),
                    suggested_qty=Decimal(str(planned_base_qty)),
                    planned_qty=Decimal(str(planned_base_qty)),
                    batches_count=max(1, int(math.ceil(scale_factor))),
                )
                db.add(plan_line)
                db.flush()

                line_notes = (
                    line.notes
                    or req.notes
                    or f"Corrida Masiva {plan_number} ({shift_val}) — Receta {bom.code}"
                )

                created_op = ProductionService.create_order(
                    db=db,
                    req=ProductionOrderCreate(
                        bom_id=bom.id,
                        facility_id=facility_id,
                        work_center_id=line.work_center_id or bom.work_center_id,
                        source_warehouse_id=source_warehouse_id,
                        dest_warehouse_id=dest_warehouse_id,
                        planned_base_qty=planned_base_qty,
                        scale_factor=scale_factor,
                        standard_labor_hours=line.actual_labor_hours,
                        notes=line_notes,
                        start_immediately=True,
                    ),
                    user_id=user_id,
                    plan_line_id=plan_line.id,
                    commit=False,
                )

                op_id = int(created_op["id"])
                exp_shrink_pct = float(bom.expected_shrinkage_pct or 0.0)
                default_good = round(max(0.0001, planned_base_qty * (1.0 - exp_shrink_pct / 100.0)), 4)
                is_discrete_out = not is_weight_uom(bom.uom_id or "UND")
                if is_discrete_out:
                    default_good = float(max(1, round(default_good)))

                dmg_qty = max(0.0, float(line.explicit_damaged_qty or 0.0))
                if is_discrete_out and dmg_qty > 0:
                    dmg_qty = float(round(dmg_qty))
                else:
                    dmg_qty = round(dmg_qty, 4)

                if line.actual_good_qty is not None and float(line.actual_good_qty) > 0:
                    good_qty = float(line.actual_good_qty)
                else:
                    good_qty = max(0.0001, round(default_good - dmg_qty, 4))

                if is_discrete_out:
                    good_qty = float(max(1, round(good_qty)))
                else:
                    good_qty = round(good_qty, 4)

                if line.natural_shrinkage_qty is not None and float(line.natural_shrinkage_qty) >= 0:
                    nat_shrink_qty = round(float(line.natural_shrinkage_qty), 4)
                else:
                    nat_shrink_qty = round(max(0.0, planned_base_qty - good_qty - dmg_qty), 4)

                if mode == "COMPLETE_AND_SETTLE":
                    final_op = ProductionService.complete_order(
                        db=db,
                        order_id=op_id,
                        req=CompleteOrderRequest(
                            actual_good_qty=good_qty,
                            natural_shrinkage_qty=nat_shrink_qty,
                            explicit_damaged_qty=dmg_qty,
                            explicit_waste_qty=dmg_qty,
                            actual_labor_hours=line.actual_labor_hours,
                            notes=f"Liquidación masiva {plan_number}",
                        ),
                        user_id=user_id,
                        commit=False,
                    )
                    prim_out_detail = final_op["outputs"][0] if final_op.get("outputs") else {}
                    net_cost_usd = float(final_op["cost_summary"]["net_production_cost_usd"])
                    unit_cost_usd = float(prim_out_detail.get("calculated_unit_cost_usd", 0.0))
                    new_wavg_usd = float(prim_out_detail.get("current_inventory_wavg_usd", unit_cost_usd))
                else:
                    # En modo LEAVE_IN_PROGRESS, guardar las cantidades pre-ajustadas y recalcular costos NIC 2
                    op_row = db.query(ProductionOrder).filter(ProductionOrder.id == op_id).first()
                    if op_row:
                        gross_c = (
                            float(op_row.total_direct_material_cost or 0.0)
                            + float(op_row.total_packaging_cost or 0.0)
                            + float(op_row.total_direct_labor_cost or 0.0)
                            + float(op_row.total_indirect_overhead_cost or 0.0)
                        )
                        byp_c = float(op_row.total_byproduct_credit or 0.0)
                        joint_before_waste = round(max(0.0, gross_c - byp_c), 4)
                        eff_coprod_qty = round(good_qty + dmg_qty, 4)
                        unit_after_nat = (
                            joint_before_waste / eff_coprod_qty
                            if eff_coprod_qty > 0
                            else 0.0
                        )
                        waste_cost = round(dmg_qty * unit_after_nat, 4) if dmg_qty > 0 else 0.0
                        net_c = round(max(0.0, joint_before_waste - waste_cost), 4)
                        unit_c = round(net_c / good_qty, 4) if good_qty > 0 else 0.0

                        op_row.actual_good_output_weight_kg = Decimal(str(good_qty))
                        op_row.natural_shrinkage_qty = Decimal(str(nat_shrink_qty))
                        op_row.explicit_waste_qty = Decimal(str(dmg_qty))
                        op_row.total_explicit_waste_cost = Decimal(str(waste_cost))
                        op_row.net_production_cost = Decimal(str(net_c))
                        db.add(op_row)
                        if op_row.outputs:
                            prim_out = op_row.outputs[0]
                            prim_out.actual_good_qty = Decimal(str(good_qty))
                            prim_out.explicit_damaged_qty = Decimal(str(dmg_qty))
                            prim_out.actual_yield_pct = Decimal(
                                str(round((good_qty / planned_base_qty) * 100.0, 3) if planned_base_qty > 0 else 100.0)
                            )
                            if len(op_row.outputs) == 1:
                                prim_out.allocated_total_cost = Decimal(str(net_c))
                                prim_out.calculated_unit_cost = Decimal(str(unit_c))
                            db.add(prim_out)
                        db.flush()
                    final_op = ProductionService.get_order_detail(db, op_id)
                    prim_out_detail = final_op["outputs"][0] if final_op.get("outputs") else {}
                    net_cost_usd = float(final_op["cost_summary"]["net_production_cost_usd"])
                    unit_cost_usd = float(prim_out_detail.get("calculated_unit_cost_usd", 0.0))

                    pt_var_id = int(bom.primary_product_variant_id)
                    if pt_var_id not in running_pt_stock_by_var:
                        running_pt_stock_by_var[pt_var_id] = max(
                            0.0, float(prim_out_detail.get("current_inventory_stock_qty", curr_pt_stock))
                        )
                        running_pt_wavg_by_var[pt_var_id] = max(
                            0.0, float(prim_out_detail.get("current_inventory_wavg_usd", 0.0))
                        )
                    prev_st = running_pt_stock_by_var[pt_var_id]
                    prev_wv = running_pt_wavg_by_var[pt_var_id]
                    if (prev_st + good_qty) > 0 and good_qty > 0 and unit_cost_usd > 0:
                        if prev_st > 0 and prev_wv > 0:
                            new_wavg_usd = round(
                                ((prev_st * prev_wv) + (good_qty * unit_cost_usd)) / (prev_st + good_qty),
                                4,
                            )
                        else:
                            new_wavg_usd = unit_cost_usd
                    else:
                        new_wavg_usd = prev_wv if prev_wv > 0 else unit_cost_usd
                    running_pt_stock_by_var[pt_var_id] = round(prev_st + good_qty, 4)
                    running_pt_wavg_by_var[pt_var_id] = new_wavg_usd

                gen_batch_num = prim_out_detail.get("generated_batch_number")
                k_links = final_op.get("kardex_links", {})

                total_cost_usd += net_cost_usd

                orders_created.append({
                    "id": final_op["id"],
                    "order_number": final_op["order_number"],
                    "state": final_op["state"],
                    "order_type": final_op["order_type"],
                    "sector": final_op["sector"],
                    "work_center_id": final_op["work_center_id"],
                    "work_center_name": final_op["work_center_name"],
                    "bom_id": final_op["bom_id"],
                    "bom_code": final_op["bom_code"],
                    "bom_name": final_op["bom_name"],
                    "product_sku": prim_out_detail.get("output_sku"),
                    "product_name": prim_out_detail.get("output_name") or final_op["bom_name"],
                    "uom_id": final_op["uom_id"],
                    "scale_factor": final_op["scale_factor"],
                    "planned_base_qty": final_op["planned_base_qty"],
                    "actual_good_qty": float(prim_out_detail.get("actual_good_qty", good_qty)),
                    "natural_shrinkage_qty": final_op["natural_shrinkage_qty"],
                    "explicit_damaged_qty": final_op["explicit_waste_qty"],
                    "net_production_cost_usd": round(net_cost_usd, 4),
                    "net_production_cost_ves": round(net_cost_usd * rate, 2),
                    "unit_cost_usd": round(unit_cost_usd, 4),
                    "unit_cost_ves": round(unit_cost_usd * rate, 2),
                    "new_wavg_cost_usd": round(new_wavg_usd, 4),
                    "new_wavg_cost_ves": round(new_wavg_usd * rate, 2),
                    "generated_batch_number": gen_batch_num,
                    "picking_consumption_name": k_links.get("picking_consumption_folio"),
                    "picking_output_name": k_links.get("picking_output_folio"),
                })

            db.commit()

            completed_count = sum(1 for o in orders_created if o["state"] == "COMPLETED")
            return {
                "plan_id": plan.id,
                "plan_number": plan.plan_number,
                "plan_date": plan.plan_date.isoformat(),
                "shift": plan.shift,
                "sector": plan.sector,
                "state": plan.state,
                "execution_mode": mode,
                "facility_id": facility_id,
                "facility_name": fac.name if fac else f"Sucursal #{facility_id}",
                "source_warehouse_id": source_warehouse_id,
                "source_warehouse_name": src_wh.name if src_wh else f"Almacén #{source_warehouse_id}",
                "dest_warehouse_id": dest_warehouse_id,
                "dest_warehouse_name": dest_wh.name if dest_wh else f"Almacén #{dest_warehouse_id}",
                "exchange_rate": round(rate, 4),
                "orders_count": len(orders_created),
                "completed_orders_count": completed_count,
                "total_cost_usd": round(total_cost_usd, 4),
                "total_cost_ves": round(total_cost_usd * rate, 2),
                "orders_created": orders_created,
            }
        except HTTPException:
            db.rollback()
            raise
        except Exception as exc:
            db.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Error ejecutando corrida de producción masiva: {exc}",
            )

    @staticmethod
    def _serialize_batch_run_plan(
        db: Session,
        p: ProductionPlan,
        orders_by_plan_line_id: Dict[int, List[ProductionOrder]],
        wh_map: Dict[int, str],
        picking_map: Dict[int, str],
        rate: float,
    ) -> Dict[str, Any]:
        plan_orders: List[Dict[str, Any]] = []
        total_cost_usd = 0.0
        total_mat_usd = 0.0
        total_pkg_usd = 0.0
        total_mod_usd = 0.0
        total_cif_usd = 0.0
        total_waste_usd = 0.0
        completed_count = 0
        in_progress_count = 0
        src_wh_id: Optional[int] = None
        dest_wh_id: Optional[int] = None

        cons_by_var: Dict[int, Dict[str, Any]] = {}

        for pl in (p.lines or []):
            ops = orders_by_plan_line_id.get(int(pl.id), [])
            for op in ops:
                if src_wh_id is None and op.source_warehouse_id:
                    src_wh_id = int(op.source_warehouse_id)
                if dest_wh_id is None and op.dest_warehouse_id:
                    dest_wh_id = int(op.dest_warehouse_id)

                net_c = float(op.net_production_cost or 0.0)
                total_cost_usd += net_c
                total_mat_usd += float(op.total_direct_material_cost or 0.0)
                total_pkg_usd += float(op.total_packaging_cost or 0.0)
                total_mod_usd += float(op.total_direct_labor_cost or 0.0)
                total_cif_usd += float(op.total_indirect_overhead_cost or 0.0)
                total_waste_usd += float(op.total_explicit_waste_cost or 0.0)

                if op.state == "COMPLETED":
                    completed_count += 1
                elif op.state in ("IN_PROGRESS", "PLANNED", "DRAFT"):
                    in_progress_count += 1

                prim_out = op.outputs[0] if op.outputs else None
                out_var = prim_out.output_variant if prim_out else pl.target_variant
                prod_name = (
                    out_var.product.name
                    if (out_var and out_var.product)
                    else (op.bom.name if op.bom else "Producto Terminado")
                )
                unit_c = float(prim_out.calculated_unit_cost or 0.0) if prim_out else 0.0
                gb = prim_out.generated_batch if prim_out else None
                gen_batch = gb.batch_number if gb else None
                gen_mfg_date = gb.manufacturing_date.isoformat() if (gb and gb.manufacturing_date) else None
                gen_exp_date = gb.expiry_date.isoformat() if (gb and gb.expiry_date) else None

                bom_base = float(op.bom.base_qty or 1.0) if (op.bom and op.bom.base_qty) else 1.0
                planned_q = float(op.planned_base_qty or pl.planned_qty or 0.0)
                scale_f = round(planned_q / bom_base, 4) if bom_base > 0 else 1.0
                wc_obj = op.work_center or (op.bom.work_center if op.bom else None)
                bom_code = op.bom.code if op.bom else (pl.bom.code if pl.bom else "BOM")
                bom_name = op.bom.name if op.bom else (pl.bom.name if pl.bom else prod_name)

                for inp in (op.inputs or []):
                    vid = int(inp.component_variant_id)
                    c_var = inp.component_variant
                    c_prod = c_var.product if c_var else None
                    eff_uom = resolve_mfg_uom_base(
                        c_prod.uom_base if c_prod else inp.uom_base,
                        None,
                        c_prod.name if c_prod else None,
                    )
                    req_q = float(inp.consumed_base_qty if op.state == "COMPLETED" else (inp.consumed_base_qty or inp.planned_base_qty or 0.0))
                    u_cost = float(inp.unit_cost or 0.0)
                    l_cost = float(inp.total_cost or (req_q * u_cost))
                    b_obj = inp.batch
                    entry = cons_by_var.get(vid)
                    if not entry:
                        entry = {
                            "component_variant_id": vid,
                            "component_sku": c_var.sku if c_var else f"VAR-{vid}",
                            "component_name": c_prod.name if c_prod else "Insumo",
                            "input_role": inp.input_role or "INGREDIENT",
                            "uom_base": eff_uom,
                            "is_discrete_uom": not is_weight_uom(eff_uom),
                            "recipes_count": 0,
                            "recipe_codes": [],
                            "used_in_recipes": [],
                            "total_required_base_qty": 0.0,
                            "available_stock_qty": 0.0,
                            "balance_after_batch_qty": 0.0,
                            "shortage_qty": 0.0,
                            "availability_status": "AVAILABLE",
                            "suggested_batch_id": inp.batch_id,
                            "suggested_batch_number": b_obj.batch_number if b_obj else None,
                            "suggested_batch_expiry_date": b_obj.expiry_date.isoformat() if (b_obj and b_obj.expiry_date) else None,
                            "unit_cost_usd": round(u_cost, 4),
                            "unit_cost_ves": round(u_cost * rate, 2),
                            "total_cost_usd": 0.0,
                            "total_cost_ves": 0.0,
                        }
                        cons_by_var[vid] = entry
                    entry["recipes_count"] += 1
                    if bom_code not in entry["recipe_codes"]:
                        entry["recipe_codes"].append(bom_code)
                    entry["used_in_recipes"].append({
                        "line_index": len(entry["used_in_recipes"]),
                        "bom_id": op.bom_id or 0,
                        "bom_code": bom_code,
                        "bom_name": bom_name,
                        "required_base_qty": round(req_q, 4),
                        "uom_base": eff_uom,
                    })
                    entry["total_required_base_qty"] = round(entry["total_required_base_qty"] + req_q, 4)
                    entry["total_cost_usd"] = round(entry["total_cost_usd"] + l_cost, 4)
                    entry["total_cost_ves"] = round(entry["total_cost_usd"] * rate, 2)
                    if not entry["suggested_batch_number"] and b_obj:
                        entry["suggested_batch_id"] = inp.batch_id
                        entry["suggested_batch_number"] = b_obj.batch_number
                        entry["suggested_batch_expiry_date"] = b_obj.expiry_date.isoformat() if b_obj.expiry_date else None

                plan_orders.append({
                    "id": op.id,
                    "order_number": op.order_number,
                    "state": op.state,
                    "order_type": op.order_type,
                    "sector": op.bom.sector if op.bom else p.sector,
                    "work_center_id": op.work_center_id,
                    "work_center_name": wc_obj.name if wc_obj else "Estación Planta",
                    "bom_id": op.bom_id,
                    "bom_code": bom_code,
                    "bom_name": bom_name,
                    "product_sku": out_var.sku if out_var else None,
                    "product_name": prod_name,
                    "uom_id": op.bom.uom_id if op.bom else (prim_out.uom_base if prim_out else "UND"),
                    "scale_factor": scale_f,
                    "planned_base_qty": planned_q,
                    "actual_good_qty": float(prim_out.actual_good_qty if prim_out else (op.actual_good_output_weight_kg or 0.0)),
                    "natural_shrinkage_qty": float(op.natural_shrinkage_qty or 0.0),
                    "explicit_damaged_qty": float(op.explicit_waste_qty or 0.0),
                    "net_production_cost_usd": round(net_c, 4),
                    "net_production_cost_ves": round(net_c * rate, 2),
                    "unit_cost_usd": round(unit_c, 4),
                    "unit_cost_ves": round(unit_c * rate, 2),
                    "generated_batch_number": gen_batch,
                    "generated_batch_manufacturing_date": gen_mfg_date,
                    "generated_batch_expiry_date": gen_exp_date,
                    "picking_consumption_name": picking_map.get(int(op.picking_consumption_id)) if op.picking_consumption_id else None,
                    "picking_output_name": picking_map.get(int(op.picking_output_id)) if op.picking_output_id else None,
                })

        return {
            "id": p.id,
            "plan_id": p.id,
            "plan_number": p.plan_number,
            "plan_date": p.plan_date.isoformat() if p.plan_date else None,
            "shift": p.shift,
            "sector": p.sector,
            "state": p.state,
            "facility_id": p.facility_id,
            "facility_name": p.facility.name if p.facility else f"Sucursal #{p.facility_id}",
            "source_warehouse_id": src_wh_id,
            "source_warehouse_name": wh_map.get(src_wh_id, "Almacén MP") if src_wh_id else "Almacén MP",
            "dest_warehouse_id": dest_wh_id,
            "dest_warehouse_name": wh_map.get(dest_wh_id, "Almacén PT") if dest_wh_id else "Almacén PT",
            "exchange_rate": round(rate, 4),
            "notes": p.notes,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "lines_count": len(p.lines or []),
            "orders_count": len(plan_orders),
            "completed_orders_count": completed_count,
            "in_progress_orders_count": in_progress_count,
            "total_direct_materials_usd": round(total_mat_usd, 4),
            "total_direct_materials_ves": round(total_mat_usd * rate, 2),
            "total_packaging_usd": round(total_pkg_usd, 4),
            "total_packaging_ves": round(total_pkg_usd * rate, 2),
            "total_direct_labor_mod_usd": round(total_mod_usd, 4),
            "total_direct_labor_mod_ves": round(total_mod_usd * rate, 2),
            "total_indirect_overhead_cif_usd": round(total_cif_usd, 4),
            "total_indirect_overhead_cif_ves": round(total_cif_usd * rate, 2),
            "total_explicit_waste_cost_usd": round(total_waste_usd, 4),
            "total_explicit_waste_cost_ves": round(total_waste_usd * rate, 2),
            "total_cost_usd": round(total_cost_usd, 4),
            "total_cost_ves": round(total_cost_usd * rate, 2),
            "orders": plan_orders,
            "consolidated_inputs": list(cons_by_var.values()),
        }

    @staticmethod
    def list_batch_runs(
        db: Session,
        facility_id: Optional[int] = None,
        limit: int = 30,
    ) -> Dict[str, Any]:
        """
        Lista el historial reciente de Corridas / Planes de Producción Masiva (mfg.production_plans)
        con sus órdenes de producción vinculadas e insumos consolidados.
        """
        ProductionService.ensure_mfg_wms_infrastructure(db, commit=True)

        rate_info = get_active_bcv_rate(db)
        rate = rate_info["rate"]

        query = db.query(ProductionPlan).options(
            selectinload(ProductionPlan.facility),
            selectinload(ProductionPlan.lines).selectinload(ProductionPlanLine.bom).selectinload(BOMHeader.work_center),
            selectinload(ProductionPlan.lines).selectinload(ProductionPlanLine.target_variant).selectinload(ProductVariant.product),
        )
        if facility_id:
            fac = db.query(Facility).filter(Facility.id == facility_id).first()
            if not fac:
                fac = db.query(Facility).order_by(Facility.id.asc()).first()
            if fac:
                query = query.filter(ProductionPlan.facility_id == fac.id)

        plans = query.order_by(ProductionPlan.id.desc()).limit(limit).all()
        plan_line_ids = [line.id for p in plans for line in (p.lines or [])]

        orders_by_plan_line_id: Dict[int, List[ProductionOrder]] = {}
        picking_ids: set[int] = set()
        wh_ids: set[int] = set()

        if plan_line_ids:
            linked_orders = (
                db.query(ProductionOrder)
                .options(
                    selectinload(ProductionOrder.bom).selectinload(BOMHeader.work_center),
                    selectinload(ProductionOrder.work_center),
                    selectinload(ProductionOrder.inputs).selectinload(ProductionOrderInput.component_variant).selectinload(ProductVariant.product),
                    selectinload(ProductionOrder.inputs).selectinload(ProductionOrderInput.batch),
                    selectinload(ProductionOrder.outputs).selectinload(ProductionOrderOutput.output_variant).selectinload(ProductVariant.product),
                    selectinload(ProductionOrder.outputs).selectinload(ProductionOrderOutput.generated_batch),
                )
                .filter(ProductionOrder.plan_line_id.in_(plan_line_ids))
                .order_by(ProductionOrder.id.asc())
                .all()
            )
            for op in linked_orders:
                if op.plan_line_id is not None:
                    orders_by_plan_line_id.setdefault(int(op.plan_line_id), []).append(op)
                if op.picking_consumption_id:
                    picking_ids.add(int(op.picking_consumption_id))
                if op.picking_output_id:
                    picking_ids.add(int(op.picking_output_id))
                if op.source_warehouse_id:
                    wh_ids.add(int(op.source_warehouse_id))
                if op.dest_warehouse_id:
                    wh_ids.add(int(op.dest_warehouse_id))

        wh_map = (
            {w.id: w.name for w in db.query(Warehouse).filter(Warehouse.id.in_(wh_ids)).all()}
            if wh_ids
            else {}
        )
        picking_map = (
            {pk.id: pk.name for pk in db.query(StockPicking).filter(StockPicking.id.in_(picking_ids)).all()}
            if picking_ids
            else {}
        )

        items = [
            ProductionService._serialize_batch_run_plan(
                db, p, orders_by_plan_line_id, wh_map, picking_map, rate
            )
            for p in plans
        ]

        return {
            "exchange_rate": round(rate, 4),
            "items": items,
            "total": len(items),
        }

    @staticmethod
    def get_batch_run_detail(db: Session, plan_id: int) -> Dict[str, Any]:
        ProductionService.ensure_mfg_wms_infrastructure(db, commit=True)
        rate_info = get_active_bcv_rate(db)
        rate = rate_info["rate"]

        p = (
            db.query(ProductionPlan)
            .options(
                selectinload(ProductionPlan.facility),
                selectinload(ProductionPlan.lines).selectinload(ProductionPlanLine.bom).selectinload(BOMHeader.work_center),
                selectinload(ProductionPlan.lines).selectinload(ProductionPlanLine.target_variant).selectinload(ProductVariant.product),
            )
            .filter(ProductionPlan.id == plan_id)
            .first()
        )
        if not p:
            raise HTTPException(status_code=404, detail="Plan / Corrida Masiva no encontrada")

        plan_line_ids = [line.id for line in (p.lines or [])]
        orders_by_plan_line_id: Dict[int, List[ProductionOrder]] = {}
        picking_ids: set[int] = set()
        wh_ids: set[int] = set()

        if plan_line_ids:
            linked_orders = (
                db.query(ProductionOrder)
                .options(
                    selectinload(ProductionOrder.bom).selectinload(BOMHeader.work_center),
                    selectinload(ProductionOrder.work_center),
                    selectinload(ProductionOrder.inputs).selectinload(ProductionOrderInput.component_variant).selectinload(ProductVariant.product),
                    selectinload(ProductionOrder.inputs).selectinload(ProductionOrderInput.batch),
                    selectinload(ProductionOrder.outputs).selectinload(ProductionOrderOutput.output_variant).selectinload(ProductVariant.product),
                    selectinload(ProductionOrder.outputs).selectinload(ProductionOrderOutput.generated_batch),
                )
                .filter(ProductionOrder.plan_line_id.in_(plan_line_ids))
                .order_by(ProductionOrder.id.asc())
                .all()
            )
            for op in linked_orders:
                if op.plan_line_id is not None:
                    orders_by_plan_line_id.setdefault(int(op.plan_line_id), []).append(op)
                if op.picking_consumption_id:
                    picking_ids.add(int(op.picking_consumption_id))
                if op.picking_output_id:
                    picking_ids.add(int(op.picking_output_id))
                if op.source_warehouse_id:
                    wh_ids.add(int(op.source_warehouse_id))
                if op.dest_warehouse_id:
                    wh_ids.add(int(op.dest_warehouse_id))

        wh_map = (
            {w.id: w.name for w in db.query(Warehouse).filter(Warehouse.id.in_(wh_ids)).all()}
            if wh_ids
            else {}
        )
        picking_map = (
            {pk.id: pk.name for pk in db.query(StockPicking).filter(StockPicking.id.in_(picking_ids)).all()}
            if picking_ids
            else {}
        )

        return ProductionService._serialize_batch_run_plan(
            db, p, orders_by_plan_line_id, wh_map, picking_map, rate
        )




