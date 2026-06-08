import sys
sys.path.append("/home/lzambrano/Desarrollo/Morpheus/backend")

from app.api.deps import engine
from sqlalchemy import text

def run_migration():
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(text("""
                ALTER TABLE inv.pricing_session_lines 
                ADD COLUMN IF NOT EXISTS old_replacement_cost NUMERIC(19, 4) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS proposed_replacement_cost NUMERIC(19, 4) DEFAULT 0;
            """))
            print("Columns old_replacement_cost and proposed_replacement_cost added to inv.pricing_session_lines successfully.")

if __name__ == "__main__":
    run_migration()
    print("Database migration completed successfully.")
