from sqlalchemy import text
from app.api.deps import SessionLocal

def run_migration():
    db = SessionLocal()
    try:
        print("Iniciando migración de columnas Fase 3 (Logística de Proveedores)...")
        
        db.execute(text("""
            ALTER TABLE core.suppliers
            ADD COLUMN IF NOT EXISTS auto_tune_logistics BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS clara_suggested_lead_time INTEGER,
            ADD COLUMN IF NOT EXISTS clara_suggested_restock_days INTEGER,
            ADD COLUMN IF NOT EXISTS clara_lead_time_deviation INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS clara_restock_deviation INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS clara_deliveries_analyzed INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS clara_logistics_score NUMERIC(5, 2) DEFAULT 100.0,
            ADD COLUMN IF NOT EXISTS clara_last_evaluated_at TIMESTAMP WITH TIME ZONE;
        """))
        print("Columnas añadidas exitosamente a core.suppliers.")

        db.commit()
        print("Migración Fase 3 completada con éxito.")
    except Exception as e:
        db.rollback()
        print("Error en migración Fase 3:", e)
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()
