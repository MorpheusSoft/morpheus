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
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'inv' AND table_name = 'product_variants';
    """)
    rows = cur.fetchall()
    print("Columns in inv.product_variants:")
    for row in rows:
        print(f" - {row[0]} ({row[1]})")
    
    cur.close()
    conn.close()
except Exception as e:
    print(f"Error: {e}")
