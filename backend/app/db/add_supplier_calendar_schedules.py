"""
Migración: Calendario de Compras de Proveedores por Sucursal (Clara Neo ERP)
Crea la tabla pur.supplier_facility_schedules y agrega order_day_of_week a core.suppliers.
"""

from app.api.deps import SessionLocal
from sqlalchemy import text
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def migrate_supplier_calendar_schedules():
    db = SessionLocal()
    try:
        logger.info("[MIGRATION] Creando esquema de calendario de compras...")

        # 1. Columna order_day_of_week en core.suppliers (0=Lunes, 1=Martes, ..., 6=Domingo)
        db.execute(text("""
            ALTER TABLE core.suppliers 
            ADD COLUMN IF NOT EXISTS order_day_of_week INTEGER DEFAULT NULL;
        """))

        # 2. Tabla pur.supplier_facility_schedules
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS pur.supplier_facility_schedules (
                id SERIAL PRIMARY KEY,
                supplier_id INTEGER NOT NULL REFERENCES core.suppliers(id) ON DELETE CASCADE,
                facility_id INTEGER NOT NULL REFERENCES core.facilities(id) ON DELETE CASCADE,
                order_day_of_week INTEGER NOT NULL, -- 0=Lunes, 1=Martes, 2=Miércoles, 3=Jueves, 4=Viernes, 5=Sábado, 6=Domingo
                review_cadence_days INTEGER DEFAULT 7,  -- 7 (semanal), 14/15 (quincenal), 30 (mensual)
                lead_time_days INTEGER DEFAULT 3,       -- Días de despacho específicos para esta sucursal
                restock_coverage_days INTEGER DEFAULT 7, -- Días de cobertura deseados
                replenishment_mode VARCHAR(30) DEFAULT 'STORE_DIRECT', -- 'STORE_DIRECT' o 'CONSOLIDATED_CD'
                is_active BOOLEAN DEFAULT TRUE,
                last_evaluated_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                CONSTRAINT uq_supplier_facility_day UNIQUE (supplier_id, facility_id, order_day_of_week)
            );
        """))

        # Índices de alto rendimiento
        db.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_supp_fac_sched_active_day 
            ON pur.supplier_facility_schedules (is_active, order_day_of_week);
        """))
        db.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_supp_fac_sched_supplier 
            ON pur.supplier_facility_schedules (supplier_id);
        """))
        db.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_supp_fac_sched_facility 
            ON pur.supplier_facility_schedules (facility_id);
        """))

        db.commit()
        logger.info("[MIGRATION] pur.supplier_facility_schedules y core.suppliers.order_day_of_week creados exitosamente.")

        # 3. Seed inicial opcional si existen proveedores clave (ej. Nena o Polar)
        db.execute(text("""
            DO $$
            DECLARE
                nena_id INTEGER;
                fac_record RECORD;
            BEGIN
                SELECT id INTO nena_id FROM core.suppliers WHERE name ILIKE '%nena%' LIMIT 1;
                IF nena_id IS NOT NULL THEN
                    FOR fac_record IN SELECT id FROM core.facilities WHERE is_active = TRUE LIMIT 3 LOOP
                        INSERT INTO pur.supplier_facility_schedules 
                            (supplier_id, facility_id, order_day_of_week, review_cadence_days, lead_time_days, restock_coverage_days, replenishment_mode, is_active)
                        VALUES 
                            (nena_id, fac_record.id, 2, 7, 2, 7, 'STORE_DIRECT', TRUE) -- Miércoles (2), semanal
                        ON CONFLICT (supplier_id, facility_id, order_day_of_week) DO NOTHING;
                    END LOOP;
                END IF;
            END $$;
        """))
        db.commit()
        logger.info("[MIGRATION] Seed de calendario de ejemplo verificado.")

    except Exception as e:
        db.rollback()
        logger.error(f"[MIGRATION ERROR] Error ejecutando migración: {e}", exc_info=True)
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    migrate_supplier_calendar_schedules()
