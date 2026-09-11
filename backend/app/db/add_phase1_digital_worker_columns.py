from sqlalchemy import text
from app.api.deps import SessionLocal

def run_migration():
    db = SessionLocal()
    try:
        print("Iniciando migración de columnas Fase 1...")
        
        # 1. pur.purchase_orders
        db.execute(text("""
            ALTER TABLE pur.purchase_orders
            ADD COLUMN IF NOT EXISTS invoice_documents JSONB DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS ocr_extracted_payload JSONB DEFAULT '{}'::jsonb,
            ADD COLUMN IF NOT EXISTS reconciliation_mode VARCHAR(30) DEFAULT 'AUTO',
            ADD COLUMN IF NOT EXISTS reconciled_by_worker_id INTEGER REFERENCES core.digital_workers(id) ON DELETE SET NULL;
        """))
        print("Columnas añadidas a pur.purchase_orders")

        # 2. pur.supplier_products
        db.execute(text("""
            ALTER TABLE pur.supplier_products
            ADD COLUMN IF NOT EXISTS is_reorder_blocked BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS block_reason VARCHAR(255),
            ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS blocked_by_worker_id INTEGER REFERENCES core.digital_workers(id) ON DELETE SET NULL;
        """))
        print("Columnas añadidas a pur.supplier_products")

        db.commit()
        print("Migración Fase 1 completada con éxito.")
    except Exception as e:
        db.rollback()
        print("Error en migración:", e)
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()
