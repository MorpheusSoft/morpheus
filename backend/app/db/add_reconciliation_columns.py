import sys
import os
import re

# Add the backend directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from sqlalchemy import create_engine, text
from app.core.config import settings

def add_columns():
    try:
        db_uri = settings.SQLALCHEMY_DATABASE_URI
        su_uri = re.sub(r'postgresql://[^@]+@', 'postgresql://postgres:Pegaso%2326@', db_uri)
        
        print("Connecting to database...")
        engine = create_engine(su_uri)
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
    except Exception as e:
        print(f"Error adding columns: {e}")
        return False

if __name__ == "__main__":
    add_columns()
