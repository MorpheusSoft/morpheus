import psycopg2

HOST = "localhost"
PORT = "5433"
USER = "postgres"
PASS = "Pegaso#26"
DB_NAME = "morpheus_db"

def run_migrations():
    print(f"[*] Conectando a la base de datos de QA en {HOST}:{PORT}/{DB_NAME} para aplicar migraciones...")
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
        
        commands = [
            # 1. core.system_settings
            "ALTER TABLE core.system_settings ADD COLUMN IF NOT EXISTS b2b_web_stock_percent DECIMAL(5,2) DEFAULT 30.0;",
            "ALTER TABLE core.system_settings ADD COLUMN IF NOT EXISTS b2b_safety_stock DECIMAL(19,4) DEFAULT 0.0;",
            
            # 2. core.exchange_rate_audit_logs
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
            
            # 3. sales.customers
            "ALTER TABLE sales.customers ADD COLUMN IF NOT EXISTS approval_status VARCHAR(50) DEFAULT 'PENDING_APPROVAL';",
            "ALTER TABLE sales.customers ADD COLUMN IF NOT EXISTS wholesaler_tier_id INTEGER;",
            
            # 4. sales.documents
            "ALTER TABLE sales.documents ADD COLUMN IF NOT EXISTS is_web_order BOOLEAN DEFAULT FALSE;",
            
            # 5. inv.products
            "ALTER TABLE inv.products ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;",
            "ALTER TABLE inv.products ADD COLUMN IF NOT EXISTS sell_on_web BOOLEAN DEFAULT FALSE;",
            
            # 6. inv.inventory_sessions
            "ALTER TABLE inv.inventory_sessions ADD COLUMN IF NOT EXISTS scope_type VARCHAR(50) DEFAULT 'GENERAL';",
            "ALTER TABLE inv.inventory_sessions ADD COLUMN IF NOT EXISTS scope_value VARCHAR(255);",
            
            # 7. inv.pricing_sessions
            "ALTER TABLE inv.pricing_sessions ADD COLUMN IF NOT EXISTS update_type VARCHAR(50) DEFAULT 'BOTH';",
            "ALTER TABLE inv.pricing_sessions ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES core.suppliers(id) ON DELETE SET NULL;",
            
            # 8. inv.pricing_session_lines
            "ALTER TABLE inv.pricing_session_lines ADD COLUMN IF NOT EXISTS old_replacement_cost NUMERIC(19, 4) DEFAULT 0;",
            "ALTER TABLE inv.pricing_session_lines ADD COLUMN IF NOT EXISTS proposed_replacement_cost NUMERIC(19, 4) DEFAULT 0;",
            
            # 9. inv.product_variants
            "ALTER TABLE inv.product_variants ADD COLUMN IF NOT EXISTS price_base_cost VARCHAR(50) DEFAULT 'STANDARD';"
        ]
        
        for cmd in commands:
            trimmed = cmd.strip().split('\n')[0]
            print(f"[*] Ejecutando: {trimmed}...")
            cur.execute(cmd)
            
        print("[+] Migraciones aplicadas con éxito en la base de datos de QA.")
        cur.close()
        conn.close()
    except Exception as e:
        print(f"[!] Error al aplicar migraciones: {e}")

if __name__ == "__main__":
    run_migrations()
