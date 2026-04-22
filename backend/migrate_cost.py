import sys, os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.db.session import SessionLocal
from sqlalchemy import text

db = SessionLocal()
try:
    db.execute(text("SET statement_timeout = '5s'"))
    
    db.execute(text("ALTER TABLE pur.supplier_products ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT FALSE"))
    
    db.execute(text("""
    CREATE OR REPLACE FUNCTION pur.sync_replacement_cost()
    RETURNS TRIGGER AS $$
    BEGIN
        IF pg_trigger_depth() > 1 THEN
            RETURN NEW;
        END IF;
        IF NEW.is_primary = TRUE THEN
            UPDATE pur.supplier_products SET is_primary = FALSE WHERE variant_id = NEW.variant_id AND id != NEW.id AND is_primary = TRUE;
            UPDATE inv.product_variants SET replacement_cost = NEW.replacement_cost WHERE id = NEW.variant_id;
            UPDATE inv.products SET replacement_cost = NEW.replacement_cost WHERE id = (SELECT product_id FROM inv.product_variants WHERE id = NEW.variant_id);
        END IF;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    """))
    
    db.execute(text("DROP TRIGGER IF EXISTS trg_sync_replacement_cost ON pur.supplier_products"))
    db.execute(text("CREATE TRIGGER trg_sync_replacement_cost AFTER INSERT OR UPDATE ON pur.supplier_products FOR EACH ROW WHEN (NEW.is_primary = TRUE) EXECUTE FUNCTION pur.sync_replacement_cost()"))
    
    db.commit()
    print("SUCCESS_MIGRATION")
except Exception as e:
    print(f"FAILED_MIGRATION: {e}")
    db.rollback()
finally:
    db.close()
