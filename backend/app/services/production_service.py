from datetime import datetime, date, timedelta, timezone
from decimal import Decimal
import math
from typing import Any, Dict, List, Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import and_, or_, text

from app.core.uom import is_weight_uom
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
    ProductionOrder,
    ProductionOrderInput,
    ProductionOrderOutput,
)
from app.schemas.manufacturing import (
    AdHocOrderInputCreate,
    AdHocOrderOutputCreate,
    SaveOrderAsBOMRequest,
    ExplodePreviewRequest,
    ProductionOrderCreate,
    CompleteOrderRequest,
    CompleteOrderOutputLine,
    ButcherySimulateSettlementRequest,
    ButcherySimulateOutputItem,
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
                        .filter(WorkCenter.code == st_def["code"])
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
    def explode_bom_preview(db: Session, req: ExplodePreviewRequest) -> Dict[str, Any]:
        """
        Motor de Explosión de Materiales y Sugerencia FEFO en Vivo (con o sin BOM):
        - Soporta órdenes basadas en Fórmula (req.bom_id != None) y Transformaciones Libres Ad-Hoc (req.bom_id == None)
        - Calcula requerimientos brutos en unidad base (con factor de merma de limpieza y CEIL para discretos)
        - Consulta stock en inv.inventory_snapshots por (variant_id, facility_id)
        - Sugiere lote activo bajo FEFO estricto (expiry_date ASC, is_quarantined=False)
        - Calcula semáforo de disponibilidad (AVAILABLE, PARTIAL, SHORTAGE)
        - Proyecta costos NIC 2 (Materiales, Empaque, MOD, CIF, Merma Natural y Nuevo Costo Promedio Ponderado WAVG)
        """
        ProductionService.ensure_mfg_wms_infrastructure(db, commit=True)

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
            planned_base_qty = max(0.0001, float(req.planned_base_qty or base_qty))
            scale_factor = planned_base_qty / base_qty
            bom_type = bom.bom_type
            sector = bom.sector

            for inp in bom.inputs:
                comp_var = inp.component_variant
                prod = comp_var.product if comp_var else None
                uom_base = (prod.uom_base if prod and prod.uom_base else inp.recipe_uom or "UND").strip().upper()

                scaled_recipe_qty = float(inp.quantity) if inp.is_fixed_qty else float(inp.quantity) * scale_factor
                conv = float(inp.conversion_factor_to_base or 1.0)
                net_qty_base = scaled_recipe_qty * conv

                scrap_pct = max(0.0, min(95.0, float(inp.scrap_tolerance_pct or 0.0)))
                scrap_divisor = 1.0 - (scrap_pct / 100.0)
                raw_gross_qty_base = net_qty_base / scrap_divisor if scrap_divisor > 0 else net_qty_base

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
                chosen_batch = valid_batches[0] if valid_batches else (batches[0] if batches else None)

                days_to_expiry = (
                    (chosen_batch.expiry_date - today).days
                    if (chosen_batch and chosen_batch.expiry_date)
                    else None
                )

                unit_cost_usd = get_variant_unit_cost_usd(db, comp_var, facility_id)
                line_cost_usd = gross_qty_base * unit_cost_usd
                role = (inp.input_role or "INGREDIENT").upper()
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
                    "planned_base_qty": gross_qty_base,
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
                    "planned_base_qty": gross_qty_base,
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
    def create_order(
        db: Session,
        req: ProductionOrderCreate,
        user_id: Optional[int] = None,
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
                outputs=req.outputs,
            ),
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
            facility_id=preview["facility_id"],
            work_center_id=preview["work_center_id"],
            bom_id=req.bom_id,
            order_type=order_type,
            state=initial_state,
            planned_base_qty=Decimal(str(preview["planned_base_qty"])),
            actual_input_weight_kg=Decimal(str(sum(i["planned_base_qty"] for i in preview["inputs"] if i["input_role"] != "PACKAGING"))),
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
            db.add(
                ProductionOrderInput(
                    production_order_id=order.id,
                    component_variant_id=inp["component_variant_id"],
                    batch_id=inp["suggested_batch_id"],
                    input_role=inp["input_role"],
                    planned_base_qty=Decimal(str(inp["planned_base_qty"])),
                    consumed_base_qty=Decimal(str(inp["planned_base_qty"])),
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

        db.commit()
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
                base_q = float(inp.consumed_base_qty or inp.planned_base_qty or 0.0)
                if role == "PACKAGING":
                    packaging_cost_usd += base_q * u_cost
                else:
                    direct_materials_cost_usd += (base_q * weight_ratio) * u_cost
        elif bom and bom.inputs:
            for inp in bom.inputs:
                comp_var = inp.component_variant
                prod = comp_var.product if comp_var else None
                uom_base = (prod.uom_base if prod and prod.uom_base else inp.recipe_uom or "UND").strip().upper()
                scaled_q = float(inp.quantity) if inp.is_fixed_qty else float(inp.quantity) * scale_factor
                conv = float(inp.conversion_factor_to_base or 1.0)
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
                        new_inp = ProductionOrderInput(
                            production_order_id=order.id,
                            component_variant_id=comp_var.id,
                            batch_id=item.batch_id,
                            input_role=(item.input_role or "INGREDIENT").upper(),
                            planned_base_qty=Decimal(str(q_new)),
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
                consumed_qty = float(inp.consumed_base_qty if inp.consumed_base_qty and float(inp.consumed_base_qty) > 0 else inp.planned_base_qty)

            if not is_weight_uom(inp.uom_base):
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
        elif bom:
            actual_labor_hours = float(bom.standard_labor_hours or 0.0) * scale_factor
        elif float(order.total_direct_labor_cost or 0.0) > 0 and hourly_labor_rate > 0:
            actual_labor_hours = float(order.total_direct_labor_cost) / hourly_labor_rate
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
        db.commit()
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

        uom_base = (req.uom_base or (comp_var.product.uom_base if comp_var.product else "UND") or "UND").strip().upper()
        req_qty_val = req.planned_base_qty if req.planned_base_qty is not None else (req.planned_qty or 0.0)
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

        new_inp = ProductionOrderInput(
            production_order_id=order.id,
            component_variant_id=comp_var.id,
            batch_id=batch_id,
            input_role=role,
            planned_base_qty=Decimal(str(qty)),
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

        # Detalle de inputs con lotes disponibles FEFO y stock actual
        inputs_detail = []
        for inp in order.inputs:
            comp_var = inp.component_variant
            prod = comp_var.product if comp_var else None
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

            inputs_detail.append({
                "id": inp.id,
                "component_variant_id": inp.component_variant_id,
                "component_sku": comp_var.sku if comp_var else f"VAR-{inp.component_variant_id}",
                "component_name": prod.name if prod else "Insumo",
                "input_role": inp.input_role,
                "uom_base": inp.uom_base,
                "is_discrete_uom": not is_weight_uom(inp.uom_base),
                "planned_base_qty": float(inp.planned_base_qty or 0.0),
                "consumed_base_qty": float(inp.consumed_base_qty or 0.0),
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
            "work_center_rates": {
                "hourly_labor_rate": float(wc.hourly_labor_rate or 0.0) if wc else 0.0,
                "hourly_overhead_rate": float(wc.hourly_overhead_rate or 0.0) if wc else 0.0,
                "overhead_per_kg": float(wc.overhead_per_kg or 0.0) if wc else 0.0,
            },
            "bom_id": order.bom_id,
            "bom_code": bom.code if bom else "TRANSF-LIBRE",
            "bom_name": bom.name if bom else "Transformación Libre de Materiales",
            "bom_type": bom.bom_type if bom else ("DIVERGENT_DISASSEMBLY" if order.order_type == "MEAT_DISASSEMBLY" else "CONVERGENT_RECIPE"),
            "uom_id": uom_id,
            "expected_shrinkage_pct": float(bom.expected_shrinkage_pct or 0.0) if bom else 0.0,
            "max_allowed_shrinkage_pct": float(bom.max_allowed_shrinkage_pct or 0.0) if bom else 5.0,
            "shelf_life_days": int(bom.shelf_life_days or 1) if bom else 7,
            "exchange_rate": round(rate, 4),
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

        current_db_name = (db.execute(text("SELECT current_database()")).scalar() or "").strip()
        if current_db_name == "morpheus_prod":
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



