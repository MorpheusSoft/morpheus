from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1.api import api_router
import uvicorn

from contextlib import asynccontextmanager
import asyncio

async def run_background_poller():
    from app.services.jobs_service import poll_and_execute_jobs
    while True:
        try:
            await asyncio.to_thread(poll_and_execute_jobs)
        except Exception as e:
            print(f"[CRON FATAL ERROR] {e}")
        await asyncio.sleep(60)

async def run_mrp_bot_scheduler():
    from app.services.mrp_bot_service import run_mrp_bot
    from app.api.deps import SessionLocal
    from app.models.purchasing import MRPBotLog
    import datetime
    import asyncio
    try:
        from zoneinfo import ZoneInfo
        tz = ZoneInfo("America/Caracas")
    except Exception:
        tz = datetime.timezone(datetime.timedelta(hours=-4))
    
    print("[MRP BOT SCHEDULER] Iniciando...")
    while True:
        try:
            now = datetime.datetime.now(tz)
            if now.hour == 3:
                db = SessionLocal()
                try:
                    today_start = datetime.datetime.combine(now.date(), datetime.time.min).replace(tzinfo=tz)
                    already_run = db.query(MRPBotLog).filter(
                        MRPBotLog.executed_at >= today_start
                    ).first()
                    if not already_run:
                        print(f"[MRP BOT SCHEDULER] Ejecutando diagnóstico predictivo de quiebres diario a las {now}...")
                        await run_mrp_bot(db)
                except Exception as ex:
                    print(f"[MRP BOT SCHEDULER ERROR] Fallo durante ejecución: {ex}")
                finally:
                    db.close()
        except Exception as e:
            print(f"[MRP BOT SCHEDULER ERROR] {e}")
        await asyncio.sleep(60)

def seed_demo_mfg_data():
    from app.api.deps import SessionLocal
    from app.models.core import Facility
    from app.models.inventory import Warehouse, Product, ProductVariant
    from app.models.manufacturing import WorkCenter, BOMHeader, BOMInput, BOMOutput
    from decimal import Decimal

    db = SessionLocal()
    try:
        fac = db.query(Facility).order_by(Facility.id.asc()).first()
        if not fac:
            return
        wh = db.query(Warehouse).filter(Warehouse.facility_id == fac.id).first()
        if not wh:
            wh = db.query(Warehouse).first()

        # 1. Seed Work Centers if empty
        if db.query(WorkCenter).count() == 0:
            wc_bakery = WorkCenter(
                facility_id=fac.id,
                warehouse_wip_id=wh.id if wh else None,
                code="PANADERIA_HORNOS",
                name="Hornos Rotativos Panadería Central",
                sector="BAKERY",
                capacity_per_batch=Decimal("80.0000"),
                capacity_uom="KG",
                hourly_labor_rate=Decimal("4.5000"),
                hourly_overhead_rate=Decimal("2.8000"),
                overhead_per_kg=Decimal("0.0400"),
                is_active=True,
            )
            wc_kitchen = WorkCenter(
                facility_id=fac.id,
                warehouse_wip_id=wh.id if wh else None,
                code="COCINA_CALIENTE",
                name="Cocina Central & Comidas Preparadas",
                sector="GASTRONOMY",
                capacity_per_batch=Decimal("50.0000"),
                capacity_uom="UND",
                hourly_labor_rate=Decimal("5.2000"),
                hourly_overhead_rate=Decimal("3.1000"),
                overhead_per_kg=Decimal("0.0500"),
                is_active=True,
            )
            wc_butchery = WorkCenter(
                facility_id=fac.id,
                warehouse_wip_id=wh.id if wh else None,
                code="SALA_DESPOSTE",
                name="Sala de Desposte & Corte Cárnico",
                sector="MEAT_PROCESSING",
                capacity_per_batch=Decimal("250.0000"),
                capacity_uom="KG",
                hourly_labor_rate=Decimal("6.0000"),
                hourly_overhead_rate=Decimal("3.5000"),
                overhead_per_kg=Decimal("0.0300"),
                is_active=True,
            )
            db.add_all([wc_bakery, wc_kitchen, wc_butchery])
            db.commit()
            print("[MFG SEED] Centros de trabajo iniciales sembrados exitosamente.")

        # 2. Seed Initial BOMs if empty
        if db.query(BOMHeader).count() == 0:
            wc_bakery = db.query(WorkCenter).filter(WorkCenter.code == "PANADERIA_HORNOS").first()
            wc_kitchen = db.query(WorkCenter).filter(WorkCenter.code == "COCINA_CALIENTE").first()
            wc_butchery = db.query(WorkCenter).filter(WorkCenter.code == "SALA_DESPOSTE").first()

            def find_var(keyword: str, fallback_offset: int = 0):
                v = (
                    db.query(ProductVariant)
                    .join(Product, ProductVariant.product_id == Product.id)
                    .filter(Product.name.ilike(f"%{keyword}%"))
                    .first()
                )
                if v:
                    return v
                return db.query(ProductVariant).offset(fallback_offset).first()

            # Receta 1: Panadería Convergente (Porcentaje Panadero)
            v_pan = find_var("PAN PERRO CALIENTE", 0)
            v_harina = find_var("HARINA DE SEMOLA", 1)
            v_levadura = find_var("LEVADURA INSTANTANEA", 2)
            v_mantequilla = find_var("MANTEQUILLA CON SAL", 3)
            v_sal = find_var("SAL CON AJO", 4)
            v_bandeja = find_var("BANDEJA BLANCA", 5)

            if v_pan and v_harina:
                bom_pan = BOMHeader(
                    code="BOM-PAN-001",
                    name="Pan Campesino & Artesanal (Lote Estándar 100 UND)",
                    bom_type="CONVERGENT_RECIPE",
                    sector="BAKERY",
                    work_center_id=wc_bakery.id if wc_bakery else None,
                    primary_product_variant_id=v_pan.id,
                    base_qty=Decimal("100.0000"),
                    uom_id="UND",
                    expected_shrinkage_pct=Decimal("12.00"),
                    max_allowed_shrinkage_pct=Decimal("15.00"),
                    standard_labor_hours=Decimal("1.5000"),
                    shelf_life_days=3,
                    instructions="1. Amasar harina y agua por 12 min en primera velocidad.\n2. Incorporar levadura y sal.\n3. Fermentar en cámara 60 min y hornear a 210°C con vapor.",
                    is_active=True,
                )
                db.add(bom_pan)
                db.flush()

                db.add_all([
                    BOMInput(
                        bom_id=bom_pan.id,
                        component_variant_id=v_harina.id,
                        input_role="PRIMARY_RAW_MATERIAL",
                        quantity=Decimal("35.0000"),
                        recipe_uom="KG",
                        conversion_factor_to_base=Decimal("1.000000"),
                        bakers_percentage=Decimal("100.00"),
                        scrap_tolerance_pct=Decimal("2.00"),
                    ),
                    BOMInput(
                        bom_id=bom_pan.id,
                        component_variant_id=v_levadura.id if v_levadura else v_harina.id,
                        input_role="INGREDIENT",
                        quantity=Decimal("850.0000"),
                        recipe_uom="G",
                        conversion_factor_to_base=Decimal("0.002000"),
                        bakers_percentage=Decimal("2.43"),
                        scrap_tolerance_pct=Decimal("0.00"),
                    ),
                    BOMInput(
                        bom_id=bom_pan.id,
                        component_variant_id=v_mantequilla.id if v_mantequilla else v_harina.id,
                        input_role="INGREDIENT",
                        quantity=Decimal("1400.0000"),
                        recipe_uom="G",
                        conversion_factor_to_base=Decimal("0.004000"),
                        bakers_percentage=Decimal("4.00"),
                        scrap_tolerance_pct=Decimal("1.00"),
                    ),
                    BOMInput(
                        bom_id=bom_pan.id,
                        component_variant_id=v_sal.id if v_sal else v_harina.id,
                        input_role="INGREDIENT",
                        quantity=Decimal("700.0000"),
                        recipe_uom="G",
                        conversion_factor_to_base=Decimal("0.007143"),
                        bakers_percentage=Decimal("2.00"),
                        scrap_tolerance_pct=Decimal("0.00"),
                    ),
                ])
                db.add(
                    BOMOutput(
                        bom_id=bom_pan.id,
                        output_variant_id=v_pan.id,
                        output_type="PRIMARY_PRODUCT",
                        expected_qty=Decimal("100.0000"),
                        uom_id="UND",
                        expected_yield_pct=Decimal("88.000"),
                        cost_allocation_method="PERCENTAGE",
                        cost_allocation_factor=Decimal("1.0000"),
                    )
                )

            # Plantilla 2: Sala de Desposte Cárnico Divergente (1 Canal -> N Cortes bajo NIC 2)
            v_canal = find_var("CARNE CANAL", 6)
            if v_canal and float(v_canal.average_cost or 0) > 10:
                v_canal.average_cost = Decimal("4.5000")
                v_canal.standard_cost = Decimal("4.5000")
                v_canal.replacement_cost = Decimal("4.5000")
                db.add(v_canal)
                db.flush()
            v_lomito = find_var("LOMITO BOS TAURUS", 7)
            v_solomo = find_var("SOLOMO EN BISTECK", 8)
            v_pulpa = find_var("PULPA DE PERNIL", 9)
            v_molida = find_var("CARNE MOLIDA", 10)
            v_costilla = find_var("COSTILLA DE RES", 11)
            v_hueso = find_var("HUESITO AHUMADO", 12)

            if v_canal and v_solomo:
                bom_desposte = BOMHeader(
                    code="DES-RES-001",
                    name="Plantilla Estándar Desposte Media Res Bovina (100 KG)",
                    bom_type="DIVERGENT_DISASSEMBLY",
                    sector="MEAT_PROCESSING",
                    work_center_id=wc_butchery.id if wc_butchery else None,
                    primary_product_variant_id=v_canal.id,
                    base_qty=Decimal("100.0000"),
                    uom_id="KG",
                    expected_shrinkage_pct=Decimal("3.00"),
                    max_allowed_shrinkage_pct=Decimal("3.50"),
                    standard_labor_hours=Decimal("2.5000"),
                    shelf_life_days=7,
                    instructions="1. Pesar media canal en riel de entrada.\n2. Separar cuarto delantero y cuarto trasero.\n3. Extraer cortes nobles de 1ra, 2da, 3ra, recorte 80/20 y hueso blanco.\n4. Empacar al vacío y etiquetar con peso variable.",
                    is_active=True,
                )
                db.add(bom_desposte)
                db.flush()

                db.add_all([
                    BOMInput(
                        bom_id=bom_desposte.id,
                        component_variant_id=v_canal.id,
                        input_role="PRIMARY_RAW_MATERIAL",
                        quantity=Decimal("100.0000"),
                        recipe_uom="KG",
                        conversion_factor_to_base=Decimal("1.000000"),
                        scrap_tolerance_pct=Decimal("0.00"),
                    ),
                    BOMInput(
                        bom_id=bom_desposte.id,
                        component_variant_id=v_bandeja.id if v_bandeja else v_canal.id,
                        input_role="PACKAGING",
                        quantity=Decimal("25.0000"),
                        recipe_uom="UND",
                        conversion_factor_to_base=Decimal("0.050000"),
                        scrap_tolerance_pct=Decimal("0.00"),
                    ),
                ])

                db.add_all([
                    BOMOutput(
                        bom_id=bom_desposte.id,
                        output_variant_id=v_lomito.id if v_lomito else v_solomo.id,
                        output_type="PRIMARY_PRODUCT",
                        expected_qty=Decimal("4.0000"),
                        uom_id="KG",
                        expected_yield_pct=Decimal("4.000"),
                        cost_allocation_method="MARKET_VALUE_INDEX",
                        standard_reference_price=Decimal("14.0000"),
                    ),
                    BOMOutput(
                        bom_id=bom_desposte.id,
                        output_variant_id=v_solomo.id,
                        output_type="CO_PRODUCT",
                        expected_qty=Decimal("28.0000"),
                        uom_id="KG",
                        expected_yield_pct=Decimal("28.000"),
                        cost_allocation_method="MARKET_VALUE_INDEX",
                        standard_reference_price=Decimal("10.0000"),
                    ),
                    BOMOutput(
                        bom_id=bom_desposte.id,
                        output_variant_id=v_pulpa.id if v_pulpa else v_solomo.id,
                        output_type="CO_PRODUCT",
                        expected_qty=Decimal("32.0000"),
                        uom_id="KG",
                        expected_yield_pct=Decimal("32.000"),
                        cost_allocation_method="MARKET_VALUE_INDEX",
                        standard_reference_price=Decimal("8.0000"),
                    ),
                    BOMOutput(
                        bom_id=bom_desposte.id,
                        output_variant_id=v_costilla.id if v_costilla else v_solomo.id,
                        output_type="CO_PRODUCT",
                        expected_qty=Decimal("14.0000"),
                        uom_id="KG",
                        expected_yield_pct=Decimal("14.000"),
                        cost_allocation_method="MARKET_VALUE_INDEX",
                        standard_reference_price=Decimal("5.5000"),
                    ),
                    BOMOutput(
                        bom_id=bom_desposte.id,
                        output_variant_id=v_molida.id if v_molida else v_solomo.id,
                        output_type="CO_PRODUCT",
                        expected_qty=Decimal("10.0000"),
                        uom_id="KG",
                        expected_yield_pct=Decimal("10.000"),
                        cost_allocation_method="MARKET_VALUE_INDEX",
                        standard_reference_price=Decimal("5.3000"),
                    ),
                    BOMOutput(
                        bom_id=bom_desposte.id,
                        output_variant_id=v_hueso.id if v_hueso else v_solomo.id,
                        output_type="BY_PRODUCT",
                        expected_qty=Decimal("9.0000"),
                        uom_id="KG",
                        expected_yield_pct=Decimal("9.000"),
                        cost_allocation_method="FIXED_NRV",
                        standard_reference_price=Decimal("1.0000"),
                    ),
                ])

            # Receta 3: Gastronomía Convergente (Con Sub-receta y Merma de Pelado)
            v_chorizo = find_var("CHORIZO CON AJO", 13)
            v_aderezo = find_var("ADEREZO DE AJO", 14)
            if v_chorizo and v_aderezo:
                bom_gastro = BOMHeader(
                    code="BOM-GAS-001",
                    name="Bandeja Gastronómica Chorizo Artesanal al Ajo (25 KG)",
                    bom_type="CONVERGENT_RECIPE",
                    sector="GASTRONOMY",
                    work_center_id=wc_kitchen.id if wc_kitchen else None,
                    primary_product_variant_id=v_chorizo.id,
                    base_qty=Decimal("25.0000"),
                    uom_id="KG",
                    expected_shrinkage_pct=Decimal("8.00"),
                    max_allowed_shrinkage_pct=Decimal("10.00"),
                    standard_labor_hours=Decimal("1.2000"),
                    shelf_life_days=5,
                    instructions="1. Limpiar y trocear carne de cerdo y tocino (merma limpieza 8%).\n2. Incorporar base culinaria de aderezo de ajo.\n3. Embutir y reposar en cava.",
                    is_active=True,
                )
                db.add(bom_gastro)
                db.flush()

                v_chuleta = find_var("CHULETA DE CERDO", 15)
                db.add_all([
                    BOMInput(
                        bom_id=bom_gastro.id,
                        component_variant_id=v_chuleta.id if v_chuleta else v_chorizo.id,
                        input_role="PRIMARY_RAW_MATERIAL",
                        quantity=Decimal("18.5000"),
                        recipe_uom="KG",
                        conversion_factor_to_base=Decimal("1.000000"),
                        scrap_tolerance_pct=Decimal("8.00"),
                    ),
                    BOMInput(
                        bom_id=bom_gastro.id,
                        component_variant_id=v_aderezo.id,
                        input_role="SEMI_FINISHED",
                        quantity=Decimal("6.0000"),
                        recipe_uom="UND",
                        conversion_factor_to_base=Decimal("1.000000"),
                        scrap_tolerance_pct=Decimal("0.00"),
                    ),
                ])
                db.add(
                    BOMOutput(
                        bom_id=bom_gastro.id,
                        output_variant_id=v_chorizo.id,
                        output_type="PRIMARY_PRODUCT",
                        expected_qty=Decimal("25.0000"),
                        uom_id="KG",
                        expected_yield_pct=Decimal("92.000"),
                        cost_allocation_method="PERCENTAGE",
                        cost_allocation_factor=Decimal("1.0000"),
                    )
                )

            db.commit()
            print("[MFG SEED] Fórmulas de demostración (Panadería, Desposte Cárnico y Gastronomía) sembradas exitosamente.")
    except Exception as ex:
        db.rollback()
        print(f"[MFG SEED WARNING] Error sembrando datos demo de producción: {ex}")
    finally:
        db.close()


def init_bot_log_db():
    from app.api.deps import engine
    from app.db.base_class import Base
    from app.models.purchasing import MRPBotLog
    from app.models.inventory import AdjustmentReason, InventoryAdjustment, InventoryAdjustmentLine
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
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            conn.execute(text("CREATE SCHEMA IF NOT EXISTS pur;"))
            conn.execute(text("CREATE SCHEMA IF NOT EXISTS inv;"))
            conn.execute(text("CREATE SCHEMA IF NOT EXISTS mfg;"))
            conn.execute(text("""
                DO $$
                BEGIN
                    ALTER TABLE inv.locations DROP CONSTRAINT IF EXISTS locations_location_type_check;
                    ALTER TABLE inv.locations ADD CONSTRAINT locations_location_type_check 
                        CHECK (location_type IN ('SHELF', 'DOCK', 'PICKING', 'TRANSIT', 'SUPPLIER', 'CUSTOMER', 'LOSS', 'PRODUCTION', 'INTERNAL', 'ROW', 'BIN', 'TABLE', 'ZONE'));
                    
                    ALTER TABLE inv.locations DROP CONSTRAINT IF EXISTS locations_usage_check;
                    ALTER TABLE inv.locations ADD CONSTRAINT locations_usage_check 
                        CHECK (usage IN ('INTERNAL', 'EXTERNAL', 'TRANSIT', 'SCRAP'));
                EXCEPTION WHEN OTHERS THEN
                    NULL;
                END $$;
            """))
            conn.commit()
        Base.metadata.create_all(bind=engine, tables=[
            MRPBotLog.__table__,
            AdjustmentReason.__table__,
            InventoryAdjustment.__table__,
            InventoryAdjustmentLine.__table__,
            WorkCenter.__table__,
            BOMHeader.__table__,
            BOMInput.__table__,
            BOMOutput.__table__,
            ProductionPlan.__table__,
            ProductionPlanLine.__table__,
            ProductionOrder.__table__,
            ProductionOrderInput.__table__,
            ProductionOrderOutput.__table__,
        ])
        with engine.connect() as conn:
            conn.execute(text("""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'mfg'
                          AND table_name = 'production_orders'
                          AND column_name = 'bom_id'
                          AND is_nullable = 'NO'
                    ) THEN
                        ALTER TABLE mfg.production_orders ALTER COLUMN bom_id DROP NOT NULL;
                    END IF;
                END $$;
            """))
            conn.execute(text("""
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
            """))
            conn.execute(text("""
                ALTER TABLE inv.inventory_sessions ADD COLUMN IF NOT EXISTS is_blind_count BOOLEAN DEFAULT TRUE;
                CREATE TABLE IF NOT EXISTS core.audit_logs (
                    id BIGSERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES core.users(id) ON DELETE SET NULL,
                    user_name VARCHAR(150),
                    user_email VARCHAR(150),
                    action VARCHAR(50) NOT NULL,
                    module VARCHAR(50) NOT NULL,
                    entity_name VARCHAR(50) NOT NULL,
                    entity_id VARCHAR(100),
                    facility_id INTEGER REFERENCES core.facilities(id) ON DELETE SET NULL,
                    details JSONB DEFAULT '{}'::jsonb,
                    ip_address VARCHAR(45),
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
            """))
            conn.commit()
        seed_demo_mfg_data()
        print("[DATABASE] Tables for MRP bot logs, Direct Adjustments, and Neo Producción (mfg) verified/created successfully.")
    except Exception as e:
        print(f"[DATABASE ERROR] Failed to initialize tables: {e}")

async def run_digital_workers_scheduler():
    from app.services.digital_worker_service import poll_and_run_due_workers
    import asyncio
    # Esperar a que FastAPI termine de iniciar y levantar sockets
    await asyncio.sleep(5)
    print("[DIGITAL WORKERS SCHEDULER] Iniciando daemon de usuarios digitales...")
    while True:
        try:
            await asyncio.to_thread(poll_and_run_due_workers)
        except Exception as e:
            print(f"[DIGITAL WORKERS SCHEDULER ERROR] {e}")
        await asyncio.sleep(60)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-initialize database tables for bot log and direct adjustments
    init_bot_log_db()
    # Initiate the polling daemon and bot scheduler
    daemon_task = asyncio.create_task(run_background_poller())
    bot_scheduler_task = asyncio.create_task(run_mrp_bot_scheduler())
    digital_workers_task = asyncio.create_task(run_digital_workers_scheduler())
    yield
    daemon_task.cancel()
    bot_scheduler_task.cancel()
    digital_workers_task.cancel()


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3005",
        "http://localhost:4000",
        "http://localhost:4001",
        "http://localhost:4002",
        "http://localhost:4003",
        "http://localhost:4004",
        "http://localhost:4005",
        "http://localhost:4006",
        "http://localhost:4007",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        "http://127.0.0.1:3005",
        "http://127.0.0.1:4000",
        "http://127.0.0.1:4001",
        "http://127.0.0.1:4002",
        "http://127.0.0.1:4003",
        "http://127.0.0.1:4004",
        "http://127.0.0.1:4005",
        "http://127.0.0.1:4006",
        "http://127.0.0.1:4007",
        "https://hub.qa.morpheussoft.net",
        "https://compras.qa.morpheussoft.net",
        "http://costos.qa.morpheussoft.net",
        "https://costos.qa.morpheussoft.net",
        "https://inventario.qa.morpheussoft.net",
        "https://logistica.qa.morpheussoft.net",
        "https://produccion.qa.morpheussoft.net",
        "http://produccion.qa.morpheussoft.net",
        "https://b2b.qa.morpheussoft.net",
        # Catania Production
        "https://grupocatania.com",
        "https://hub.grupocatania.com",
        "https://compras.grupocatania.com",
        "https://inventario.grupocatania.com",
        "https://logistica.grupocatania.com",
        "https://costos.grupocatania.com",
        "https://produccion.grupocatania.com",
        "https://b2b.grupocatania.com",
        # Morpheus Production
        "https://morpheussoft.net",
        "https://hub.morpheussoft.net",
        "https://compras.morpheussoft.net",
        "https://inventario.morpheussoft.net",
        "https://logistica.morpheussoft.net",
        "https://costos.morpheussoft.net",
        "https://produccion.morpheussoft.net",
        "https://b2b.morpheussoft.net",
        "http://hub.morpheussoft.net",
        "http://compras.morpheussoft.net",
        "http://inventario.morpheussoft.net",
        "http://logistica.morpheussoft.net",
        "http://costos.morpheussoft.net",
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|([a-zA-Z0-9-]+\.)*grupocatania\.com|([a-zA-Z0-9-]+\.)*morpheussoft\.net)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)

from fastapi.staticfiles import StaticFiles
import os

# Create static dir if not exists
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def root():
    return {"message": "Welcome to Inventory ERP API", "docs": "/docs"}

from fastapi.exceptions import RequestValidationError
from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    safe_errors = []
    for error in errors:
        error_copy = dict(error)
        error_copy.pop('input', None)
        safe_errors.append(error_copy)
    print(f"OMFG 422 ERROR! Body: {exc.body}")
    print(f"Details: {safe_errors}")
    body_str = str(exc.body) if exc.body else None
    return JSONResponse(status_code=422, content={"detail": safe_errors, "body": body_str})

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
