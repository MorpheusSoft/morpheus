import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

HOST = "localhost"
PORT = "5432"
USER = "postgres"
PASS = "Pegaso#26"
DB_NAME = "morpheus"

def update_schema():
    try:
        conn = psycopg2.connect(
            host=HOST,
            port=PORT,
            user=USER,
            password=PASS,
            database=DB_NAME
        )
        conn.autocommit = True
        cur = conn.cursor()

        print("Updating schema...")
        commands = [
            "ALTER TABLE inv.products ADD COLUMN IF NOT EXISTS image_main VARCHAR(255);",
            "ALTER TABLE inv.products ADD COLUMN IF NOT EXISTS datasheet VARCHAR(255);",
            "ALTER TABLE inv.products ADD COLUMN IF NOT EXISTS currency_id INTEGER;",
            "ALTER TABLE inv.products ADD COLUMN IF NOT EXISTS shrinkage_percent DECIMAL(5,2) DEFAULT 0;",
            "ALTER TABLE inv.products ADD COLUMN IF NOT EXISTS is_liquor BOOLEAN DEFAULT FALSE;",
            "ALTER TABLE inv.categories ADD COLUMN IF NOT EXISTS is_liquor BOOLEAN DEFAULT FALSE;",
            "ALTER TABLE inv.product_variants ADD COLUMN IF NOT EXISTS part_number VARCHAR(100);",
            "ALTER TABLE inv.product_variants ADD COLUMN IF NOT EXISTS image VARCHAR(255);",
            "ALTER TABLE inv.product_variants ADD COLUMN IF NOT EXISTS sales_price DECIMAL(19,4) DEFAULT 0;",
            "ALTER TABLE inv.product_variants ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT FALSE;",
            "ALTER TABLE inv.product_variants ADD COLUMN IF NOT EXISTS currency_id INTEGER;",
            "ALTER TABLE inv.stock_moves ADD COLUMN IF NOT EXISTS supplier_id INTEGER;",
            "ALTER TABLE inv.stock_moves ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(19,4) DEFAULT 0;",
            "ALTER TABLE inv.stock_moves ADD COLUMN IF NOT EXISTS historic_avg_cost DECIMAL(19,4) DEFAULT 0;",
            "CREATE TABLE IF NOT EXISTS core.tributes (id SERIAL PRIMARY KEY, name VARCHAR(50) NOT NULL, rate NUMERIC(5,2) NOT NULL, is_active BOOLEAN DEFAULT TRUE);",
            "INSERT INTO core.tributes (name, rate) SELECT 'Exento (0%)', 0.00 WHERE NOT EXISTS (SELECT 1 FROM core.tributes WHERE rate=0.00);",
            "INSERT INTO core.tributes (name, rate) SELECT 'Reducido (8%)', 8.00 WHERE NOT EXISTS (SELECT 1 FROM core.tributes WHERE rate=8.00);",
            "INSERT INTO core.tributes (name, rate) SELECT 'General (16%)', 16.00 WHERE NOT EXISTS (SELECT 1 FROM core.tributes WHERE rate=16.00);",
            "INSERT INTO core.tributes (name, rate) SELECT 'Adicional (31%)', 31.00 WHERE NOT EXISTS (SELECT 1 FROM core.tributes WHERE rate=31.00);",
            "ALTER TABLE inv.products ADD COLUMN IF NOT EXISTS tax_id INTEGER REFERENCES core.tributes(id);"
        ]
        
        for cmd in commands:
            print(f"Executing: {cmd}")
            cur.execute(cmd)
            
        print("Schema updated successfully!")
        cur.close()
        conn.close()
        return True
    except Exception as e:
        print(f"Error updating schema: {e}")
        return False

if __name__ == "__main__":
    update_schema()
