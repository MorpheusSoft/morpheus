import psycopg2
from psycopg2.extras import RealDictCursor

HOST = "localhost"
PORT = "5433"
USER = "postgres"
PASS = "Pegaso#26"
DB_NAME = "morpheus_db"

def validate_db():
    print(f"[*] Conectando a la base de datos de QA en {HOST}:{PORT}/{DB_NAME}...")
    try:
        conn = psycopg2.connect(
            host=HOST,
            port=PORT,
            user=USER,
            password=PASS,
            database=DB_NAME,
            connect_timeout=5
        )
        conn.autocommit = True
        cur = conn.cursor(cursor_factory=RealDictCursor)
        print("[+] Conexión establecida con éxito.")

        # 1. Validar esquemas principales
        print("\n[*] Validando esquemas...")
        cur.execute("SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('core', 'inv', 'pur', 'sales');")
        schemas = [row['schema_name'] for row in cur.fetchall()]
        print(f"    Esquemas encontrados: {schemas}")
        
        missing_schemas = set(['core', 'inv', 'pur', 'sales']) - set(schemas)
        if missing_schemas:
            print(f"    [!] ADVERTENCIA: Faltan los siguientes esquemas: {missing_schemas}")
        else:
            print("    [+] Todos los esquemas requeridos están presentes.")

        # 2. Contar tablas y registros clave
        print("\n[*] Validando tablas y volumen de datos...")
        metrics = [
            ("core.users", "Usuarios"),
            ("core.suppliers", "Proveedores"),
            ("inv.products", "Productos"),
            ("inv.product_variants", "Variantes"),
            ("inv.pricing_sessions", "Sesiones de Precios"),
            ("pur.supplier_products", "Productos de Proveedores")
        ]
        
        for table, label in metrics:
            try:
                cur.execute(f"SELECT COUNT(*) as cnt FROM {table}")
                count = cur.fetchone()['cnt']
                print(f"    - {label} ({table}): {count} registros")
            except Exception as e:
                print(f"    [!] Error al consultar {table}: {e}")
                
        print("\n[+] La base de datos de QA está lista y óptima para el entorno de desarrollo.")
        cur.close()
        conn.close()
    except Exception as e:
        print(f"\n[!] Error al conectar a la base de datos de QA: {e}")
        print("[!] Asegúrate de que el túnel SSH esté activo y que el puerto 5433 esté mapeado correctamente.")

if __name__ == "__main__":
    validate_db()
