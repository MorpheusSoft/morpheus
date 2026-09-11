from sqlalchemy import text
from app.api.deps import SessionLocal

def run_migration():
    db = SessionLocal()
    try:
        print("Iniciando migración de columnas Fase 2...")
        
        # 1. core.facilities
        db.execute(text("""
            ALTER TABLE core.facilities
            ADD COLUMN IF NOT EXISTS is_distribution_center BOOLEAN DEFAULT FALSE;
        """))
        print("Columna is_distribution_center añadida a core.facilities")

        # 2. pur.purchase_orders
        db.execute(text("""
            ALTER TABLE pur.purchase_orders
            ADD COLUMN IF NOT EXISTS consolidation_mode VARCHAR(30) DEFAULT 'DIRECT_STORE',
            ADD COLUMN IF NOT EXISTS target_cd_facility_id INTEGER REFERENCES core.facilities(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS distribution_breakdown JSONB DEFAULT '[]'::jsonb;
        """))
        print("Columnas de consolidación y desglose añadidas a pur.purchase_orders")

        # Marcar por defecto al menos un CENDI si existe CAT-11 o el primero
        db.execute(text("""
            UPDATE core.facilities
            SET is_distribution_center = TRUE
            WHERE code = 'CAT-11' AND NOT EXISTS (
                SELECT 1 FROM core.facilities WHERE is_distribution_center = TRUE
            );
        """))

        db.commit()
        print("Migración Fase 2 completada con éxito.")
    except Exception as e:
        db.rollback()
        print("Error en migración Fase 2:", e)
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()
