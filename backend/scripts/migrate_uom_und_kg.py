import sys
import os

# Add backend root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.api.deps import SessionLocal
from sqlalchemy import text

def run_migration():
    db = SessionLocal()
    try:
        print("--- INICIANDO MIGRACIÓN DE UNIDADES DE MEDIDA (PZA -> UND / KG) ---")

        # 1. Identificar productos pesados por movimientos fraccionados
        fractional_prods = db.execute(text("""
            SELECT DISTINCT p.id, p.name, v.sku
            FROM inv.stock_moves m
            JOIN inv.product_variants v ON v.id = m.product_id
            JOIN inv.products p ON p.id = v.product_id
            WHERE m.quantity_done % 1 != 0
        """)).fetchall()

        print(f"Productos identificados con movimientos fraccionados: {len(fractional_prods)}")

        # 2. Asignar KG a productos con movimientos fraccionados o explícitos (ej. PRD-3555)
        res_kg_frac = db.execute(text("""
            UPDATE inv.products p
            SET uom_base = 'KG'
            FROM inv.product_variants v, inv.stock_moves m
            WHERE v.product_id = p.id
              AND m.product_id = v.id
              AND m.quantity_done % 1 != 0
              AND p.uom_base != 'KG';
        """))
        print(f"Productos actualizados a KG por movimientos fraccionados: {res_kg_frac.rowcount}")

        # Asegurar PRD-3555 específicamente a KG
        res_3555 = db.execute(text("""
            UPDATE inv.products p
            SET uom_base = 'KG'
            FROM inv.product_variants v
            WHERE v.product_id = p.id
              AND (v.sku = 'PRD-3555' OR p.id = 3555)
              AND p.uom_base != 'KG';
        """))
        print(f"Producto PRD-3555 actualizado a KG: {res_3555.rowcount}")

        # 3. Actualizar todos los productos restantes con PZA a UND
        res_prods_und = db.execute(text("""
            UPDATE inv.products
            SET uom_base = 'UND'
            WHERE uom_base = 'PZA' OR uom_base IS NULL;
        """))
        print(f"Productos actualizados de PZA a UND: {res_prods_und.rowcount}")

        # 4. Actualizar códigos de barra
        # Para productos KG: sincronizar códigos base / stellar a KG
        res_bc_kg = db.execute(text("""
            UPDATE inv.product_barcodes b
            SET uom = 'KG'
            FROM inv.product_variants v
            JOIN inv.products p ON p.id = v.product_id
            WHERE b.product_variant_id = v.id
              AND p.uom_base = 'KG'
              AND (b.conversion_factor = 1.0 OR b.conversion_factor IS NULL OR b.code_type = 'STELLAR_CODE')
              AND b.uom != 'KG';
        """))
        print(f"Códigos de barra actualizados a KG: {res_bc_kg.rowcount}")

        # Actualizar cualquier código de barra con PZA a UND
        res_bc_und = db.execute(text("""
            UPDATE inv.product_barcodes
            SET uom = 'UND'
            WHERE uom = 'PZA' OR uom IS NULL;
        """))
        print(f"Códigos de barra actualizados de PZA a UND: {res_bc_und.rowcount}")

        # 5. Actualizar movimientos de inventario (Stock Moves)
        # Asignar KG a los movimientos de productos con uom_base = 'KG'
        res_moves_kg = db.execute(text("""
            UPDATE inv.stock_moves m
            SET uom_id = 'KG'
            FROM inv.product_variants v
            JOIN inv.products p ON p.id = v.product_id
            WHERE m.product_id = v.id
              AND p.uom_base = 'KG'
              AND m.uom_id != 'KG';
        """))
        print(f"Movimientos de stock actualizados a KG: {res_moves_kg.rowcount}")

        # Actualizar cualquier movimiento con PZA a UND
        res_moves_und = db.execute(text("""
            UPDATE inv.stock_moves
            SET uom_id = 'UND'
            WHERE uom_id = 'PZA' OR uom_id IS NULL;
        """))
        print(f"Movimientos de stock actualizados de PZA a UND: {res_moves_und.rowcount}")

        db.commit()
        print("✅ MIGRACIÓN COMPLETADA EXITOSAMENTE.")

    except Exception as e:
        db.rollback()
        print(f"❌ Error durante la migración: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()
