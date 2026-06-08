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

        print("Updating schema to version 3...")
        commands = [
            # Add price_base_cost to inv.product_variants
            "ALTER TABLE inv.product_variants ADD COLUMN IF NOT EXISTS price_base_cost VARCHAR(50) DEFAULT 'STANDARD';"
        ]
        
        for cmd in commands:
            print(f"Executing: {cmd.strip()}")
            cur.execute(cmd)
            
        print("Schema version 3 updated successfully!")
        cur.close()
        conn.close()
        return True
    except Exception as e:
        print(f"Error updating schema: {e}")
        return False

if __name__ == "__main__":
    update_schema()
