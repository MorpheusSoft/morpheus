import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
import os

# CREDS
HOST = "localhost"
PORT = "5432"
USER = "postgres"
PASS = "Pegaso#26"
DB_NAME = "morpheus"
SCHEMA_FILE = "/media/lzambrano/DEVELOPER/inventory/inventory_schema.sql"

def create_database():
    try:
        # Connect to default 'postgres' db
        conn = psycopg2.connect(
            host=HOST,
            port=PORT,
            user=USER,
            password=PASS,
            database="postgres"
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()

        # Check if exists
        cur.execute(f"SELECT 1 FROM pg_catalog.pg_database WHERE datname = '{DB_NAME}'")
        exists = cur.fetchone()

        if exists:
            print(f"Dropping database {DB_NAME}...")
            cur.execute(f"DROP DATABASE {DB_NAME}")
            
        print(f"Creating database {DB_NAME}...")
        cur.execute(f"CREATE DATABASE {DB_NAME}")
        
        cur.close()
        conn.close()
        return True
    except Exception as e:
        print(f"Error creating DB: {e}")
        return False

def run_schema():
    try:
        print(f"Connecting to {DB_NAME}...")
        conn = psycopg2.connect(
            host=HOST,
            port=PORT,
            user=USER,
            password=PASS,
            database=DB_NAME
        )
        conn.autocommit = True
        cur = conn.cursor()

        print(f"Reading schema from {SCHEMA_FILE}...")
        with open(SCHEMA_FILE, 'r', encoding='utf-8') as f:
            sql_script = f.read()
        
        print("Executing schema...")
        cur.execute(sql_script)
        
        print("Schema executed successfully!")
        
        # Verify
        cur.execute("SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('inv', 'core')")
        schemas = cur.fetchall()
        print(f"Verified Schemas: {schemas}")

        cur.close()
        conn.close()
        return True
    except Exception as e:
        print(f"Error executing schema: {e}")
        return False

if __name__ == "__main__":
    if create_database():
        run_schema()
