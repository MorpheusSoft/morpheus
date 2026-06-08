import psycopg2

HOST = "localhost"
PORT = "5432"
USER = "postgres"
PASS = "Pegaso#26"
DB_NAME = "morpheus"

try:
    conn = psycopg2.connect(
        host=HOST,
        port=PORT,
        user=USER,
        password=PASS,
        database=DB_NAME
    )
    cur = conn.cursor()
    cur.execute("""
        SELECT table_schema, table_name 
        FROM information_schema.tables 
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY table_schema, table_name;
    """)
    rows = cur.fetchall()
    print("Tables in database:")
    for row in rows:
        print(f" - {row[0]}.{row[1]}")
    
    cur.close()
    conn.close()
except Exception as e:
    print(f"Error: {e}")
