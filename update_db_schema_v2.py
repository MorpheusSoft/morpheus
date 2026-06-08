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

        print("Updating schema to version 2...")
        commands = [
            # 1. System Settings extensions
            "ALTER TABLE core.system_settings ADD COLUMN IF NOT EXISTS b2b_web_stock_percent DECIMAL(5,2) DEFAULT 30.0;",
            "ALTER TABLE core.system_settings ADD COLUMN IF NOT EXISTS b2b_safety_stock DECIMAL(19,4) DEFAULT 0.0;",
            
            # 2. Exchange Rate Audit Log Table
            """
            CREATE TABLE IF NOT EXISTS core.exchange_rate_audit_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES core.users(id),
                old_rate DECIMAL(18, 6),
                new_rate DECIMAL(18, 6),
                reason TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            """,
            
            # 3. Customer extensions
            "ALTER TABLE sales.customers ADD COLUMN IF NOT EXISTS approval_status VARCHAR(50) DEFAULT 'PENDING_APPROVAL';",
            "ALTER TABLE sales.customers ADD COLUMN IF NOT EXISTS wholesaler_tier_id INTEGER;",
            
            # 4. Document extensions
            "ALTER TABLE sales.documents ADD COLUMN IF NOT EXISTS is_web_order BOOLEAN DEFAULT FALSE;",
            
            # 5. Product extensions
            "ALTER TABLE inv.products ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;",
            "ALTER TABLE inv.products ADD COLUMN IF NOT EXISTS sell_on_web BOOLEAN DEFAULT FALSE;",
            
            # 6. Inventory Session extensions
            "ALTER TABLE inv.inventory_sessions ADD COLUMN IF NOT EXISTS scope_type VARCHAR(50) DEFAULT 'GENERAL';",
            "ALTER TABLE inv.inventory_sessions ADD COLUMN IF NOT EXISTS scope_value VARCHAR(255);"
        ]
        
        for cmd in commands:
            print(f"Executing: {cmd.strip()}")
            cur.execute(cmd)
            
        print("Schema version 2 updated successfully!")
        cur.close()
        conn.close()
        return True
    except Exception as e:
        print(f"Error updating schema: {e}")
        return False

if __name__ == "__main__":
    update_schema()
