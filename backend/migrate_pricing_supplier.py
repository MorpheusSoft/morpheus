import sys
sys.path.append("/home/lzambrano/Desarrollo/Morpheus/backend")

from app.api.deps import engine
from sqlalchemy import text

def run_migration():
    with engine.connect() as conn:
        with conn.begin():
            # Add supplier_id to pricing_sessions table
            conn.execute(text("""
                ALTER TABLE inv.pricing_sessions 
                ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES core.suppliers(id) ON DELETE SET NULL;
            """))
            print("Column supplier_id added to inv.pricing_sessions successfully.")

if __name__ == "__main__":
    run_migration()
    print("Database migration completed successfully.")
