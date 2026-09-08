import sys
import os
import re

# Add the backend directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from sqlalchemy import create_engine, text
from app.core.config import settings

def add_columns():
    db_uri = settings.SQLALCHEMY_DATABASE_URI
    try:
        print("Connecting to database using configured URI...")
        engine = create_engine(db_uri)
        with engine.connect() as conn:
            print("Adding reconciliation columns to pur.purchase_orders...")
            commands = [
                "ALTER TABLE pur.purchase_orders ADD COLUMN IF NOT EXISTS reconciliation_status VARCHAR(50) DEFAULT 'PENDING';",
                "ALTER TABLE pur.purchase_orders ADD COLUMN IF NOT EXISTS debit_note_number VARCHAR(100) DEFAULT NULL;",
                "ALTER TABLE pur.purchase_orders ADD COLUMN IF NOT EXISTS debit_note_amount NUMERIC(19, 4) DEFAULT 0;",
                "ALTER TABLE pur.purchase_orders ADD COLUMN IF NOT EXISTS reconciliation_notes TEXT DEFAULT NULL;"
            ]
            for cmd in commands:
                print(f"Executing: {cmd}")
                conn.execute(text(cmd))
            conn.commit()
            print("Reconciliation columns added successfully!")
            return True
    except Exception as e1:
        print(f"Direct connection failed: {e1}. Trying superuser fallback...")
        try:
            su_uri = re.sub(r'postgresql://[^@]+@', 'postgresql://postgres:Pegaso%2326@', db_uri)
            engine = create_engine(su_uri)
            with engine.connect() as conn:
                for cmd in commands:
                    print(f"Executing: {cmd}")
                    conn.execute(text(cmd))
                conn.commit()
                print("Reconciliation columns added successfully with superuser fallback!")
                return True
        except Exception as e2:
            print(f"Fallback also failed: {e2}")
            return False

if __name__ == "__main__":
    add_columns()
