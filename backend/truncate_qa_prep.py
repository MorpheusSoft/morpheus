import sys
import os
import argparse

sys.path.append(os.path.join(os.path.dirname(__file__)))

from app.api.deps import engine
from sqlalchemy import text

def clean_database(include_suppliers: bool = True, include_categories: bool = False):
    print("=================================================================")
    print("🧹 INICIANDO LIMPIEZA DE BASE DE DATOS & RESETEO DE CORRELATIVOS")
    print("=================================================================")

    tables_to_truncate = [
        # Operaciones y Transacciones
        "sal.documents",
        "sal.document_lines",
        "sal.document_payments",
        "pur.purchase_orders",
        "pur.purchase_order_lines",
        "inv.inventory_sessions",
        "inv.inventory_session_lines",
        "inv.pricing_sessions",
        "inv.pricing_session_items",
        "inv.stock_pickings",
        "inv.stock_picking_lines",
        "inv.stock_moves",
        "inv.inventory_snapshots",
        "inv.batches",
        
        # Catálogo y Artículos
        "pur.supplier_products",
        "inv.product_barcodes",
        "inv.product_packagings",
        "inv.product_facility_prices",
        "inv.product_variants",
        "inv.products",
    ]

    if include_suppliers:
        tables_to_truncate.append("core.suppliers")

    if include_categories:
        tables_to_truncate.append("core.categories")

    with engine.connect() as conn:
        print("\n[1/3] Truncando tablas operativas y maestros...")
        for table in tables_to_truncate:
            try:
                conn.execute(text(f"TRUNCATE TABLE {table} RESTART IDENTITY CASCADE;"))
                conn.commit()
                print(f"  ✅ [OK] Truncada tabla: {table} (Identidad reiniciada a 1)")
            except Exception as e:
                conn.rollback()
                print(f"  ⚠️ [WARN] Error en {table}: {e}")

        print("\n[2/3] Reiniciando todas las secuencias (Correlativos auto-incrementales)...")
        try:
            # Buscar y reiniciar todas las secuencias en los esquemas inv, pur, sal, core
            seq_query = text("""
                SELECT sequence_schema, sequence_name 
                FROM information_schema.sequences 
                WHERE sequence_schema IN ('inv', 'pur', 'sal', 'core')
                AND sequence_name NOT IN ('users_id_seq', 'roles_id_seq', 'companies_id_seq', 'facilities_id_seq', 'currencies_id_seq');
            """)
            sequences = conn.execute(seq_query).fetchall()
            
            for schema, seq in sequences:
                try:
                    conn.execute(text(f"ALTER SEQUENCE {schema}.{seq} RESTART WITH 1;"))
                    conn.commit()
                    print(f"  🔢 [RESTART] Secuencia {schema}.{seq} -> 1")
                except Exception as seq_err:
                    conn.rollback()
                    print(f"  ⚠️ Error reiniciando secuencia {schema}.{seq}: {seq_err}")
        except Exception as e:
            print(f"  ⚠️ Error al listar secuencias: {e}")

        print("\n[3/3] Verificando tablas de seguridad y base...")
        try:
            users_count = conn.execute(text("SELECT count(*) FROM core.users;")).scalar()
            facilities_count = conn.execute(text("SELECT count(*) FROM core.facilities;")).scalar()
            currencies_count = conn.execute(text("SELECT count(*) FROM core.currencies;")).scalar()
            print(f"  🔒 Usuarios conservados: {users_count}")
            print(f"  🏢 Sucursales conservadas: {facilities_count}")
            print(f"  💵 Monedas conservadas: {currencies_count}")
        except Exception as e:
            print(f"  ⚠️ Error al verificar datos base: {e}")

    print("\n=================================================================")
    print("✨ ¡BASE DE DATOS LIMPIA Y LISTA PARA CARGA INICIAL DESDE CERO!")
    print("=================================================================\n")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Limpiar base de datos de QA y reiniciar correlativos.")
    parser.add_argument("--keep-suppliers", action="store_true", help="Conservar la tabla de proveedores existente")
    parser.add_argument("--include-categories", action="store_true", help="También limpiar y recargar categorías")
    args = parser.parse_args()

    clean_database(
        include_suppliers=not args.keep_suppliers,
        include_categories=args.include_categories
    )
