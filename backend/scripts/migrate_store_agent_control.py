import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy import text
from app.api.deps import SessionLocal

def run_migration():
    print("==================================================================")
    print("  MIGRACION: TABLAS DE MANDO Y CONTROL REMOTO DE TIENDAS")
    print("==================================================================")
    db = SessionLocal()
    try:
        # 1. Tabla core.store_agent_configs
        print("1. Creando/verificando core.store_agent_configs...")
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS core.store_agent_configs (
                facility_id INTEGER PRIMARY KEY REFERENCES core.facilities(id) ON DELETE CASCADE,
                config_version INTEGER NOT NULL DEFAULT 1,
                sales_interval_minutes INTEGER NOT NULL DEFAULT 5,
                sales_batch_size INTEGER NOT NULL DEFAULT 500,
                heartbeat_interval_seconds INTEGER NOT NULL DEFAULT 60,
                sales_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                products_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                barcodes_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                categories_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                suppliers_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                supplier_products_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                movements_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        """))
        print("   ✓ Tabla core.store_agent_configs lista.")

        # Sembrar configuración inicial para sedes activas existentes
        db.execute(text("""
            INSERT INTO core.store_agent_configs (facility_id, config_version, sales_interval_minutes, sales_batch_size)
            SELECT id, 1, 5, 500 FROM core.facilities
            ON CONFLICT (facility_id) DO NOTHING;
        """))
        db.commit()
        print("   ✓ Semilla de configuración por defecto aplicada a sedes.")

        # 2. Tabla core.store_agent_commands
        print("2. Creando/verificando core.store_agent_commands...")
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS core.store_agent_commands (
                id BIGSERIAL PRIMARY KEY,
                facility_id INTEGER NOT NULL REFERENCES core.facilities(id) ON DELETE CASCADE,
                command_type VARCHAR(50) NOT NULL,
                parameters JSONB DEFAULT '{}'::jsonb,
                status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
                result_details JSONB,
                error_message TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                sent_at TIMESTAMP WITH TIME ZONE,
                completed_at TIMESTAMP WITH TIME ZONE
            );

            CREATE INDEX IF NOT EXISTS idx_store_agent_commands_fac_status 
            ON core.store_agent_commands(facility_id, status);

            CREATE INDEX IF NOT EXISTS idx_store_agent_commands_created 
            ON core.store_agent_commands(created_at DESC);
        """))
        db.commit()
        print("   ✓ Tabla core.store_agent_commands lista con índices.")

        print("==================================================================")
        print("  MIGRACION COMPLETADA EXITOSAMENTE")
        print("==================================================================")
        return True
    except Exception as e:
        db.rollback()
        print(f"❌ Error en migración: {e}")
        return False
    finally:
        db.close()

if __name__ == '__main__':
    if not run_migration():
        sys.exit(1)
