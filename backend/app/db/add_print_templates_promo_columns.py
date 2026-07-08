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
            cur.execute(cmd)
            
        print("Promotions columns added to inv.print_templates successfully!")
        cur.close()
        conn.close()
        return True
    except Exception as e:
        print(f"Error adding columns: {e}")
        return False

if __name__ == "__main__":
    add_columns()
