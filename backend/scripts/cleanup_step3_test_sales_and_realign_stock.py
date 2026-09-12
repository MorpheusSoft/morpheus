import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy import text
from app.api.deps import SessionLocal

def run_step3_cleanup():
    db = SessionLocal()
    print("==================================================================")
    print("  EJECUTANDO PASO 3: SANEAMIENTO Y LIMPIEZA CONTROLADA DE VENTAS")
    print("==================================================================")

    try:
        # 1. Contar registros a purgar antes de iniciar
        print("\n--- 1. Auditando registros previos en Sede 1 ---")
        doc_count = db.execute(text("SELECT COUNT(*) FROM sales.documents WHERE facility_id = 1")).scalar()
        lines_count = db.execute(text("""
            SELECT COUNT(*) 
            FROM sales.document_lines l 
            JOIN sales.documents d ON l.document_id = d.id 
            WHERE d.facility_id = 1
        """)).scalar()
        
        pickings_count = db.execute(text("""
            SELECT COUNT(*) 
            FROM inv.stock_pickings 
            WHERE facility_id = 1 AND (name LIKE 'SALE-%' OR name LIKE 'POS-%')
        """)).scalar()

        moves_count = db.execute(text("""
            SELECT COUNT(*) 
            FROM inv.stock_moves m
            JOIN inv.stock_pickings p ON m.picking_id = p.id
            WHERE p.facility_id = 1 AND (p.name LIKE 'SALE-%' OR p.name LIKE 'POS-%')
        """)).scalar()

        print(f"  - Facturas a eliminar:       {doc_count:,}")
        print(f"  - Renglones de venta:        {lines_count:,}")
        print(f"  - Pickings de salida:        {pickings_count:,}")
        print(f"  - Movimientos de Kardex:     {moves_count:,}")

        # 2. Borrado de ventas de prueba en Sede 1
        print("\n--- 2. Purgando facturas y movimientos de prueba ---")
        
        # Eliminar líneas de venta
        db.execute(text("""
            DELETE FROM sales.document_lines 
            WHERE document_id IN (
                SELECT id FROM sales.documents WHERE facility_id = 1
            );
        """))
        print("  ✓ Renglones de venta eliminados.")

        # Eliminar cabeceras de venta
        db.execute(text("DELETE FROM sales.documents WHERE facility_id = 1;"))
        print("  ✓ Cabeceras de facturas eliminadas.")

        # Eliminar movimientos de stock asociados
        db.execute(text("""
            DELETE FROM inv.stock_moves 
            WHERE picking_id IN (
                SELECT id FROM inv.stock_pickings 
                WHERE facility_id = 1 AND (name LIKE 'SALE-%' OR name LIKE 'POS-%')
            );
        """))
        print("  ✓ Movimientos de Kardex de venta eliminados.")

        # Eliminar pickings de venta
        db.execute(text("""
            DELETE FROM inv.stock_pickings 
            WHERE facility_id = 1 AND (name LIKE 'SALE-%' OR name LIKE 'POS-%');
        """))
        print("  ✓ Pickings de salida eliminados.")

        # Limpiar telemetría de prueba anterior
        db.execute(text("DELETE FROM core.store_sync_telemetry WHERE facility_id = 1;"))
        print("  ✓ Telemetría previa de prueba reseteada.")

        # 3. Re-alinear existencias de Sede 1 al Inventario Baseline (Sesión 25)
        print("\n--- 3. Re-alineando existencias de Sede 1 al Baseline Oficial (Sesión 25) ---")
        
        # Primero restablecemos los conteos físicos de la Sesión 25 agrupados por variante
        db.execute(text("""
            INSERT INTO inv.inventory_snapshots (variant_id, facility_id, stock_qty)
            SELECT product_variant_id, 1, SUM(counted_qty)
            FROM inv.inventory_lines
            WHERE session_id = 25
            GROUP BY product_variant_id
            ON CONFLICT (variant_id, facility_id) DO UPDATE
            SET stock_qty = EXCLUDED.stock_qty;
        """))

        # Para cualquier variante en sede 1 que no estuvo en la sesión 25 (ej. creadas en pruebas), poner en 0
        db.execute(text("""
            UPDATE inv.inventory_snapshots
            SET stock_qty = 0.0
            WHERE facility_id = 1 
              AND variant_id NOT IN (
                  SELECT product_variant_id FROM inv.inventory_lines WHERE session_id = 25
              );
        """))
        print("  ✓ Inventario de Sede 1 restaurado fielmente al conteo físico oficial.")

        db.commit()

        # 4. Verificación post-limpieza
        print("\n--- 4. Verificación de Estado Final ---")
        final_docs = db.execute(text("SELECT COUNT(*) FROM sales.documents WHERE facility_id = 1")).scalar()
        final_pickings = db.execute(text("SELECT COUNT(*) FROM inv.stock_pickings WHERE facility_id = 1 AND (name LIKE 'SALE-%' OR name LIKE 'POS-%')")).scalar()
        final_stock = db.execute(text("SELECT COUNT(*), SUM(stock_qty) FROM inv.inventory_snapshots WHERE facility_id = 1")).fetchone()
        baseline_expected = db.execute(text("SELECT COUNT(DISTINCT product_variant_id), SUM(counted_qty) FROM inv.inventory_lines WHERE session_id = 25")).fetchone()

        print(f"  - Facturas restantes en Sede 1:       {final_docs} (Esperado: 0)")
        print(f"  - Pickings de venta restantes:        {final_pickings} (Esperado: 0)")
        print(f"  - Variantes con stock en snapshots:   {final_stock[0]} (Esperado Baseline: {baseline_expected[0]})")
        print(f"  - Stock total en snapshots:           {final_stock[1]} (Esperado Baseline: {baseline_expected[1]})")

        assert final_docs == 0, "Error: Quedaron facturas sin borrar"
        assert final_pickings == 0, "Error: Quedaron pickings sin borrar"
        assert round(float(final_stock[1]), 2) == round(float(baseline_expected[1]), 2), "Error: El inventario no coincide exactamente con el Baseline"

        print("\n==================================================================")
        print("  ✅ SANEAMIENTO COMPLETADO CON ÉXITO: BASE DE DATOS LISTA (100%)")
        print("==================================================================")

    except Exception as e:
        db.rollback()
        print(f"\n❌ Error durante el saneamiento: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    run_step3_cleanup()
