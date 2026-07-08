import sys
import os
# Add the backend directory to the path so we can import app modules
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from sqlalchemy import create_engine, text
from app.core.config import settings

def add_columns():
    try:
        engine = create_engine(settings.SQLALCHEMY_DATABASE_URI)
        with engine.connect() as conn:
            print("Adding promotions columns to inv.product_facility_prices...")
            commands = [
                "ALTER TABLE inv.product_facility_prices ADD COLUMN IF NOT EXISTS promo_price NUMERIC(19, 4) DEFAULT NULL;",
                "ALTER TABLE inv.product_facility_prices ADD COLUMN IF NOT EXISTS promo_target_utility_pct NUMERIC(5, 2) DEFAULT NULL;",
                "ALTER TABLE inv.product_facility_prices ADD COLUMN IF NOT EXISTS promo_start_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;",
                "ALTER TABLE inv.product_facility_prices ADD COLUMN IF NOT EXISTS promo_end_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;"
            ]
            
            for cmd in commands:
                print(f"Executing: {cmd}")
                conn.execute(text(cmd))
            
            conn.commit()
            print("Promotions columns added successfully!")
            return True
    except Exception as e:
        print(f"Error adding columns: {e}")
        return False

if __name__ == "__main__":
    add_columns()
