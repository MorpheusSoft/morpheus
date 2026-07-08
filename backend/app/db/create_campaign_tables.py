import sys
import os
# Add the backend directory to the path so we can import app modules
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from sqlalchemy import create_engine, text
from app.core.config import settings

def main():
    engine = create_engine(settings.SQLALCHEMY_DATABASE_URI)
    with engine.connect() as conn:
        print("Creating promotion campaign tables if they do not exist...")
        
        # Campaigns table
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS inv.promotion_campaigns (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            discount_pct NUMERIC(5, 2),
            fixed_price NUMERIC(19, 4),
            start_at TIMESTAMP WITH TIME ZONE NOT NULL,
            end_at TIMESTAMP WITH TIME ZONE NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            scope JSONB
        );
        """))
        
        # Campaign lines table
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS inv.promotion_campaign_lines (
            id SERIAL PRIMARY KEY,
            campaign_id INTEGER NOT NULL REFERENCES inv.promotion_campaigns(id) ON DELETE CASCADE,
            variant_id INTEGER NOT NULL REFERENCES inv.product_variants(id),
            facility_id INTEGER NOT NULL REFERENCES core.facilities(id),
            applied_promo_price NUMERIC(19, 4) NOT NULL
        );
        """))
        conn.commit()
        print("Tables created successfully.")

if __name__ == "__main__":
    main()
