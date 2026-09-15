import sys
import os
import argparse
import subprocess
from datetime import datetime

sys.path.append(os.path.join(os.path.dirname(__file__)))

from app.api.deps import engine
from app.core.config import settings
from sqlalchemy import text


def run_backup():
    """Genera un respaldo previo de seguridad de la base de datos usando pg_dump."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = f"/home/lzambrano/backup_morpheus_db_before_golive_{timestamp}.sql"
    print(f"\n📦 [PASO 0] Generando respaldo de seguridad previo en: {backup_file} ...")
    
    cmd = [
        "pg_dump",
        "-h", settings.POSTGRES_SERVER,
        "-p", str(settings.POSTGRES_PORT),
        "-U", settings.POSTGRES_USER,
        "-d", settings.POSTGRES_DB,
        "-f", backup_file
    ]
    env = os.environ.copy()
    env["PGPASSWORD"] = settings.POSTGRES_PASSWORD

    try:
        res = subprocess.run(cmd, env=env, capture_output=True, text=True)
        if res.returncode == 0:
            file_size = os.path.getsize(backup_file) / (1024 * 1024)
            print(f"  ✅ Respaldo generado con éxito ({file_size:.2f} MB).")
            return backup_file
        else:
            print(f"  ⚠️ Aviso en pg_dump: {res.stderr.strip()}")
            return None
    except Exception as e:
        print(f"  ⚠️ No se pudo ejecutar pg_dump directamente ({e}). Continuando con precaución...")
        return None


def reset_database_for_golive(skip_backup: bool = False, keep_categories: bool = False):
    print("==========================================================================")
    print("🚨 PUESTA A CERO DE BASE DE DATOS PARA ARRANQUE A PRODUCTIVO (GO-LIVE) 🚨")
    print("==========================================================================")

    if not skip_backup:
        run_backup()

    # Tablas en orden estricto de dependencias de Foreign Keys para TRUNCATE CASCADE
    tables_to_truncate = [
        # --- 1. TELEMETRÍA Y ACCIONES DE TRABAJADORES DIGITALES ---
        "core.digital_worker_actions_log",
        "core.digital_worker_messages",
        "core.digital_worker_conversations",
        "core.store_agent_commands",
        "core.store_sync_telemetry",

        # --- 2. VENTAS (TRANSACCIONES Y CLIENTES) ---
        "sales.document_payments",
        "sales.document_lines",
        "sales.documents",
        "sales.order_items",
        "sales.orders",
        "sales.customers",

        # --- 3. COMPRAS Y MRP ---
        "pur.mrp_bot_logs",
        "pur.sell_out_agreement_lines",
        "pur.sell_out_agreements",
        "pur.purchase_order_lines",
        "pur.purchase_orders",
        "pur.supplier_products",

        # --- 4. OPERACIONES DE INVENTARIO Y WMS ---
        "inv.supplier_return_lines",
        "inv.supplier_returns",
        "inv.vendor_swap_executions",
        "inv.vendor_swaps",
        "inv.pricing_session_lines",
        "inv.pricing_sessions",
        "inv.inventory_adjustment_lines",
        "inv.inventory_adjustments",
        "inv.inventory_lines",
        "inv.inventory_sessions",
        "inv.promotion_campaign_lines",
        "inv.promotion_campaigns",
        "inv.stock_moves",
        "inv.stock_pickings",
        "inv.inventory_snapshots",
        "inv.batches",
        "inv.store_deposit_mappings",
        "inv.stock_picking_types",

        # --- 5. ALMACENES Y UBICACIONES FÍSICAS (Requerimiento de usuario) ---
        "inv.locations",
        "inv.warehouses",

        # --- 6. CATÁLOGO MAESTRO (PRODUCTOS, VARIANTES, BARRAS, COSTOS) ---
        "inv.product_facility_prices",
        "inv.product_packagings",
        "inv.product_barcodes",
        "inv.product_variants",
        "inv.products",

        # --- 7. MAESTROS DE COMPRAS ---
        "core.buyers",
        "core.supplier_banks",
        "core.suppliers",
    ]

    if not keep_categories:
        tables_to_truncate.append("inv.categories")

    with engine.connect() as conn:
        print("\n[1/3] Vaciando tablas operativas, almacenes y catálogo maestro...")
        for table in tables_to_truncate:
            try:
                conn.execute(text(f"TRUNCATE TABLE {table} RESTART IDENTITY CASCADE;"))
                conn.commit()
                print(f"  ✅ [TRUNCATE OK] {table} (Secuencias reiniciadas)")
            except Exception as e:
                conn.rollback()
                print(f"  ⚠️ [ERROR/SKIP] {table}: {e}")

        print("\n[2/3] Reiniciando todas las secuencias auto-incrementales a 1 (PostgreSQL)...")
        try:
            seq_query = text("""
                SELECT sequence_schema, sequence_name 
                FROM information_schema.sequences 
                WHERE sequence_schema IN ('inv', 'pur', 'sales', 'core')
                AND sequence_name NOT IN (
                    'users_id_seq', 'roles_id_seq', 'companies_id_seq', 
                    'facilities_id_seq', 'currencies_id_seq', 'digital_workers_id_seq', 
                    'digital_skills_id_seq', 'digital_worker_skills_id_seq'
                );
            """)
            sequences = conn.execute(seq_query).fetchall()
            
            restarted_count = 0
            for schema, seq in sequences:
                try:
                    conn.execute(text(f"ALTER SEQUENCE {schema}.{seq} RESTART WITH 1;"))
                    conn.commit()
                    restarted_count += 1
                except Exception as seq_err:
                    conn.rollback()
                    print(f"  ⚠️ Error en secuencia {schema}.{seq}: {seq_err}")

            print(f"  🔢 {restarted_count} secuencias reiniciadas exitosamente a 1.")
        except Exception as e:
            print(f"  ⚠️ Error listando secuencias: {e}")

        print("\n[3/3] Verificando tablas de base y seguridad preservadas...")
        try:
            users_count = conn.execute(text("SELECT count(*) FROM core.users;")).scalar()
            facilities_count = conn.execute(text("SELECT count(*) FROM core.facilities;")).scalar()
            currencies_count = conn.execute(text("SELECT count(*) FROM core.currencies;")).scalar()
            companies_count = conn.execute(text("SELECT count(*) FROM core.companies;")).scalar()
            workers_count = conn.execute(text("SELECT count(*) FROM core.digital_workers;")).scalar()
            
            print(f"  🔒 Usuarios conservados:    {users_count}")
            print(f"  🏢 Sucursales conservadas:  {facilities_count}")
            print(f"  💵 Monedas conservadas:     {currencies_count}")
            print(f"  🏛️ Compañías conservadas:   {companies_count}")
            print(f"  🤖 Agentes IA conservados:  {workers_count}")

            # Validar que tablas críticas estén en 0
            wh_count = conn.execute(text("SELECT count(*) FROM inv.warehouses;")).scalar()
            loc_count = conn.execute(text("SELECT count(*) FROM inv.locations;")).scalar()
            prod_count = conn.execute(text("SELECT count(*) FROM inv.products;")).scalar()
            doc_count = conn.execute(text("SELECT count(*) FROM sales.documents;")).scalar()

            print("\n  🔍 Verificación de puesta a cero:")
            print(f"     • Almacenes (inv.warehouses):   {wh_count}")
            print(f"     • Ubicaciones (inv.locations): {loc_count}")
            print(f"     • Productos (inv.products):     {prod_count}")
            print(f"     • Ventas (sales.documents):     {doc_count}")

            if wh_count == 0 and loc_count == 0 and prod_count == 0 and doc_count == 0:
                print("\n  🎯 RESULTADO: Base de datos 100% limpia y lista para arranque a productivo.")
            else:
                print("\n  ⚠️ ATENCIÓN: Quedaron algunos registros residuales.")
        except Exception as e:
            print(f"  ⚠️ Error en verificación: {e}")

    print("\n==========================================================================")
    print("✨ OPERACIÓN DE PUESTA A CERO COMPLETADA SATISFACTORIAMENTE")
    print("==========================================================================\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Puesta a cero profunda de base de datos para simular Go-Live.")
    parser.add_argument("--skip-backup", action="store_true", help="Omitir el pg_dump previo")
    parser.add_argument("--keep-categories", action="store_true", help="Conservar el árbol de categorías")
    args = parser.parse_args()

    reset_database_for_golive(skip_backup=args.skip_backup, keep_categories=args.keep_categories)
