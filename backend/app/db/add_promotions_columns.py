import psycopg2

HOST = "localhost"
PORT = "5432"
USER = "postgres"
PASS = "Pegaso#26"
DB_NAME = "morpheus"

def add_columns():
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

        print("Adding promotions columns to inv.product_facility_prices...")
        commands = [
            "ALTER TABLE inv.product_facility_prices ADD COLUMN IF NOT EXISTS promo_price NUMERIC(19, 4) DEFAULT NULL;",
            "ALTER TABLE inv.product_facility_prices ADD COLUMN IF NOT EXISTS promo_target_utility_pct NUMERIC(5, 2) DEFAULT NULL;",
            "ALTER TABLE inv.product_facility_prices ADD COLUMN IF NOT EXISTS promo_start_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;",
            "ALTER TABLE inv.product_facility_prices ADD COLUMN IF NOT EXISTS promo_end_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;"
        ]
        
        for cmd in commands:
            print(f"Executing: {cmd}")
            cur.execute(cmd)
            
        print("Promotions columns added successfully!")
        cur.close()
        conn.close()
        return True
    except Exception as e:
        print(f"Error adding columns: {e}")
        return False

if __name__ == "__main__":
    add_columns()
