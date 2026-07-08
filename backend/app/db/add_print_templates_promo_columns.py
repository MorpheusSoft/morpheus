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
            print("Adding promotions columns to inv.print_templates...")
            commands = [
                "ALTER TABLE inv.print_templates ADD COLUMN IF NOT EXISTS show_promo_price_usd BOOLEAN DEFAULT TRUE;",
                "ALTER TABLE inv.print_templates ADD COLUMN IF NOT EXISTS show_promo_price_ves BOOLEAN DEFAULT TRUE;",
                "ALTER TABLE inv.print_templates ADD COLUMN IF NOT EXISTS show_promo_price_usd_iva BOOLEAN DEFAULT TRUE;",
                "ALTER TABLE inv.print_templates ADD COLUMN IF NOT EXISTS show_promo_price_ves_iva BOOLEAN DEFAULT TRUE;",
                "ALTER TABLE inv.print_templates ADD COLUMN IF NOT EXISTS show_promo_end_date BOOLEAN DEFAULT TRUE;"
            ]
            
            for cmd in commands:
                print(f"Executing: {cmd}")
                conn.execute(text(cmd))
            
            conn.commit()
            print("Promotions columns added to inv.print_templates successfully!")
            return True
    except Exception as e:
        print(f"Error adding columns: {e}")
        return False

if __name__ == "__main__":
    add_columns()
