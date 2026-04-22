import psycopg2

# CREDS
HOST = "localhost"
PORT = "5433"
USER = "postgres"
PASS = "Pegaso26"
DB_NAME = "morpheus"

SQL = """
-- USERS (Authentication)
CREATE TABLE IF NOT EXISTS core.users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(100) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    is_superuser BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Insert Default Admin User (password: admin123)
-- Hash generated via bcrypt
INSERT INTO core.users (email, hashed_password, full_name, is_superuser) 
VALUES ('admin@morpheus.com', '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga311W', 'Admin User', TRUE)
ON CONFLICT (email) DO NOTHING;
"""

def update_db():
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
        
        print("Executing update...")
        cur.execute(SQL)
        print("Users table created and admin user seeded.")
        
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    update_db()
