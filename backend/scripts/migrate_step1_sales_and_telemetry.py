import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy import text
from app.api.deps import SessionLocal

def run_migration():
    db = SessionLocal()
    print("Iniciando migración para Paso 1 (Ventas y Telemetría)...")
    try:
        # 1. Agregar columnas a sales.documents
        print("1. Agregando columnas a sales.documents...")
        db.execute(text("""
            ALTER TABLE sales.documents 
            ADD COLUMN IF NOT EXISTS register_code VARCHAR(20) DEFAULT '01';
            
            ALTER TABLE sales.documents 
            ADD COLUMN IF NOT EXISTS is_historical BOOLEAN DEFAULT FALSE;
            
            UPDATE sales.documents SET register_code = '01' WHERE register_code IS NULL;
            UPDATE sales.documents SET is_historical = FALSE WHERE is_historical IS NULL;
        """))
        db.commit()

        # 2. Ajustar restricción de unicidad en sales.documents
        print("2. Ajustando restricciones de unicidad en sales.documents...")
        # Buscar el nombre de la restricción única existente sobre document_number si existe
        constraints = db.execute(text("""
            SELECT conname
            FROM pg_constraint con
            JOIN pg_class rel ON rel.oid = con.conrelid
            JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
            WHERE nsp.nspname = 'sales' 
              AND rel.relname = 'documents' 
              AND con.contype = 'u';
        """)).fetchall()

        for c in constraints:
            c_name = c[0]
            print(f"  - Evaluando restricción existente: {c_name}")
            if "document_number" in c_name:
                print(f"    -> Eliminando restricción global previa: {c_name}")
                db.execute(text(f'ALTER TABLE sales.documents DROP CONSTRAINT IF EXISTS "{c_name}";'))
                db.commit()

        # Crear restricción única compuesta (facility_id, register_code, document_number)
        print("  - Creando restricción única compuesta: uq_sales_documents_facility_register_doc...")
        db.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint 
                    WHERE conname = 'uq_sales_documents_facility_register_doc'
                ) THEN
                    ALTER TABLE sales.documents 
                    ADD CONSTRAINT uq_sales_documents_facility_register_doc 
                    UNIQUE (facility_id, register_code, document_number);
                END IF;
            END $$;
        """))
        db.commit()

        # 3. Crear tabla core.store_sync_telemetry
        print("3. Creando tabla core.store_sync_telemetry...")
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS core.store_sync_telemetry (
                id BIGSERIAL PRIMARY KEY,
                facility_id INTEGER NOT NULL REFERENCES core.facilities(id) ON DELETE CASCADE,
                register_code VARCHAR(50),
                agent_version VARCHAR(30) DEFAULT '1.0.0',
                machine_name VARCHAR(100),
                sql_server_status VARCHAR(30) DEFAULT 'CONNECTED',
                last_stellar_sale_time TIMESTAMPTZ,
                last_synced_sale_time TIMESTAMPTZ,
                sales_today_count INTEGER DEFAULT 0,
                sales_today_amount NUMERIC(14, 4) DEFAULT 0.0,
                pending_queue_count INTEGER DEFAULT 0,
                lag_minutes INTEGER DEFAULT 0,
                status VARCHAR(30) DEFAULT 'HEALTHY',
                error_details TEXT,
                telemetry_metadata JSONB DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_telemetry_facility_created 
            ON core.store_sync_telemetry (facility_id, created_at DESC);
        """))
        db.commit()

        # 4. Desactivar el trigger duplicado trg_sales_update_snapshot
        # Como acordamos, StockMove es el Kardex oficial de inventario
        print("4. Silenciando trigger duplicado sales.trg_sales_update_snapshot...")
        db.execute(text("""
            CREATE OR REPLACE FUNCTION inv.trigger_sales_update_snapshot()
            RETURNS TRIGGER AS $$
            BEGIN
                -- Silenciado: La deducción de inventario la realiza inv.stock_moves (Kardex oficial)
                -- Esto elimina el doble descuento en ventas.
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        """))
        db.commit()

        print("✅ Migración del Paso 1 completada exitosamente.")
    except Exception as e:
        db.rollback()
        print(f"❌ Error durante la migración: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()
