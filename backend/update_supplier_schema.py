import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__)))

from app.api.deps import engine
from sqlalchemy import text

def update_schema():
    with engine.begin() as conn:
        print("Migrin Suppliers schema in Morpheus DB...")
        queries = [
            "ALTER TABLE core.suppliers ADD COLUMN IF NOT EXISTS minimum_order_qty NUMERIC(19, 4) DEFAULT 0;",
            "ALTER TABLE core.suppliers ADD COLUMN IF NOT EXISTS lead_time_days INTEGER DEFAULT 0;",
            "ALTER TABLE core.suppliers ADD COLUMN IF NOT EXISTS commercial_email VARCHAR;",
            "ALTER TABLE core.suppliers ADD COLUMN IF NOT EXISTS financial_email VARCHAR;",
            "ALTER TABLE core.suppliers ADD COLUMN IF NOT EXISTS international_tax_id VARCHAR;",
            "ALTER TABLE core.suppliers ADD COLUMN IF NOT EXISTS commercial_name VARCHAR;",
            "ALTER TABLE core.suppliers ADD COLUMN IF NOT EXISTS fiscal_address TEXT;",
            "ALTER TABLE core.suppliers ADD COLUMN IF NOT EXISTS currency_id INTEGER REFERENCES core.currencies(id);",
            "ALTER TABLE core.suppliers ADD COLUMN IF NOT EXISTS credit_days INTEGER DEFAULT 0;",
            "ALTER TABLE core.suppliers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(19, 4) DEFAULT 0;",
            "ALTER TABLE core.suppliers ADD COLUMN IF NOT EXISTS early_payment_days INTEGER DEFAULT 0;",
            "ALTER TABLE core.suppliers ADD COLUMN IF NOT EXISTS early_payment_discount_pct NUMERIC(5, 2) DEFAULT 0;",
            "ALTER TABLE core.suppliers ADD COLUMN IF NOT EXISTS restock_coverage_days INTEGER DEFAULT 0;",
            "ALTER TABLE core.suppliers ADD COLUMN IF NOT EXISTS sales_analysis_days INTEGER DEFAULT 0;",
            "ALTER TABLE core.suppliers ADD COLUMN IF NOT EXISTS commercial_contact_name VARCHAR;",
            "ALTER TABLE core.suppliers ADD COLUMN IF NOT EXISTS commercial_contact_phone VARCHAR;",
            "ALTER TABLE core.suppliers ADD COLUMN IF NOT EXISTS financial_contact_name VARCHAR;",
            "ALTER TABLE core.suppliers ADD COLUMN IF NOT EXISTS financial_contact_phone VARCHAR;",
            "ALTER TABLE core.supplier_banks ADD COLUMN IF NOT EXISTS swift_code VARCHAR;",
            "ALTER TABLE core.supplier_banks ADD COLUMN IF NOT EXISTS aba_code VARCHAR;"
        ]
        
        for q in queries:
            try:
                conn.execute(text(q))
                print(f"Success: {q}")
            except Exception as e:
                print(f"Failed: {q} - {e}")
                
if __name__ == '__main__':
    update_schema()
