import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__)))

from app.api.deps import engine
from sqlalchemy import text

def truncate_operational_data():
    print(">> Iniciando Truncado de Datos Operativos (Mantenimiento de QA)...")
    tables_to_truncate = [
        "inv.products",
        "pur.purchase_orders",
        "pur.supplier_products",
        "sal.documents",
        "inv.inventory_sessions",
        "inv.pricing_sessions",
        "inv.inventory_snapshots",
        "inv.stock_pickings",
        "inv.stock_moves",
        "inv.batches"
    ]
    
    with engine.connect() as conn:
        for table in tables_to_truncate:
            try:
                # CASCADE ensures all child tables (like order_lines, product_variants) are also truncated
                conn.execute(text(f"TRUNCATE TABLE {table} CASCADE;"))
                conn.commit()
                print(f"  [OK] Truncada tabla {table} y sus dependencias.")
            except Exception as e:
                conn.rollback()
                # Si la tabla no existe o ya está vacía de una forma rara
                print(f"  [WARN] No se pudo truncar {table}: {e}")
                
        print(">> ¡Limpieza completada! Proveedores, Categorías y Configuraciones se mantienen intactos.")

if __name__ == "__main__":
    truncate_operational_data()
