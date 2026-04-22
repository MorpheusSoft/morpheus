import sys, os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.api.deps import engine
from sqlalchemy import text

try:
    with engine.connect() as conn:
        # Phase 8: Conciliation & 3-Way Match
        
        # 1. pur.purchase_orders
        conn.execute(text("ALTER TABLE pur.purchase_orders ADD COLUMN IF NOT EXISTS invoice_number VARCHAR"))
        conn.execute(text("ALTER TABLE pur.purchase_orders ADD COLUMN IF NOT EXISTS invoice_date DATE"))
        conn.execute(text("ALTER TABLE pur.purchase_orders ADD COLUMN IF NOT EXISTS conciliated_by_id INT"))
        conn.execute(text("ALTER TABLE pur.purchase_orders ADD COLUMN IF NOT EXISTS conciliated_at TIMESTAMP WITH TIME ZONE"))
        
        # Foreign key for conciliated_by_id
        conn.execute(text("ALTER TABLE pur.purchase_orders DROP CONSTRAINT IF EXISTS fk_purchase_orders_conciliated_by_id"))
        conn.execute(text("ALTER TABLE pur.purchase_orders ADD CONSTRAINT fk_purchase_orders_conciliated_by_id FOREIGN KEY (conciliated_by_id) REFERENCES core.users(id)"))
        
        # 2. pur.purchase_order_lines
        conn.execute(text("ALTER TABLE pur.purchase_order_lines ADD COLUMN IF NOT EXISTS billed_qty NUMERIC(19,4)"))
        conn.execute(text("ALTER TABLE pur.purchase_order_lines ADD COLUMN IF NOT EXISTS billed_unit_cost NUMERIC(19,4)"))
        
        # 3. inv.product_variants
        conn.execute(text("ALTER TABLE inv.product_variants ADD COLUMN IF NOT EXISTS last_price_updated_by_id INT"))
        conn.execute(text("ALTER TABLE inv.product_variants ADD COLUMN IF NOT EXISTS last_price_updated_at TIMESTAMP WITH TIME ZONE"))
        
        # Foreign key for last_price_updated_by_id
        conn.execute(text("ALTER TABLE inv.product_variants DROP CONSTRAINT IF EXISTS fk_product_variants_last_price_upd_by_id"))
        conn.execute(text("ALTER TABLE inv.product_variants ADD CONSTRAINT fk_product_variants_last_price_upd_by_id FOREIGN KEY (last_price_updated_by_id) REFERENCES core.users(id)"))

        conn.commit()
    print("SUCCESS_MIGRATION_PHASE8")
except Exception as e:
    print(f"FAILED_MIGRATION: {e}")
