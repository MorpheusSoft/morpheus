import os
import sys

# Ensure backend root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.api.deps import engine

def consolidate_and_clean_categories():
    print("=" * 60)
    print("MIGRACIÓN: CONSOLIDACIÓN Y LIMPIEZA DE CATEGORÍAS DUPLICADAS")
    print("=" * 60)
    
    with engine.connect() as conn:
        trans = conn.begin()
        try:
            # 1. Actualizar referencias en inv.inventory_sessions
            print("\n[1/5] Actualizando filtros de sesiones de inventario...")
            conn.execute(text("""
                UPDATE inv.inventory_sessions SET scope_value = '394' WHERE scope_type IN ('CATEGORY', 'CYCLIC') AND scope_value = '1';
                UPDATE inv.inventory_sessions SET scope_value = '401' WHERE scope_type IN ('CATEGORY', 'CYCLIC') AND scope_value = '8';
                UPDATE inv.inventory_sessions SET scope_value = '395' WHERE scope_type IN ('CATEGORY', 'CYCLIC') AND scope_value = '2';
            """))
            print("  ✓ Sesiones de inventario actualizadas a las categorías activas (394, 401, 395).")

            # 2. Identificar categorías del árbol obsoleto 1..9
            print("\n[2/5] Identificando categorías vacías del árbol legacy (1..9)...")
            tree_query = text("""
                WITH RECURSIVE cat_tree AS (
                    SELECT id, name, slug, parent_id, 1 as level FROM inv.categories WHERE id BETWEEN 1 AND 9
                    UNION ALL
                    SELECT c.id, c.name, c.slug, c.parent_id, ct.level + 1
                    FROM inv.categories c
                    JOIN cat_tree ct ON c.parent_id = ct.id
                )
                SELECT id, name, slug, level FROM cat_tree ORDER BY level DESC, id;
            """)
            stale_cats = conn.execute(tree_query).fetchall()
            stale_ids = [r[0] for r in stale_cats]
            print(f"  Total de categorías a eliminar: {len(stale_ids)}")

            # 3. Verificación de seguridad estricta: Cero productos asociados
            print("\n[3/5] Verificando seguridad de eliminación (0 productos)...")
            prod_count = conn.execute(
                text("SELECT COUNT(*) FROM inv.products WHERE category_id = ANY(:ids)"),
                {"ids": stale_ids}
            ).scalar()
            if prod_count > 0:
                raise RuntimeError(f"ABORTADO: Se encontraron {prod_count} productos asociados a estas categorías.")
            print("  ✓ Verificación exitosa: 0 productos asociados a las categorías a depurar.")

            # Eliminar en orden descendente (hojas primero, luego ramas, luego raíces 1..9)
            del_result = conn.execute(
                text("DELETE FROM inv.categories WHERE id = ANY(:ids)"),
                {"ids": stale_ids}
            )
            print(f"  ✓ Eliminadas {del_result.rowcount} categorías obsoletas.")

            # 4. Recalcular paths jerárquicos de todas las categorías restantes
            print("\n[4/5] Recalculando campo 'path' de todas las categorías restantes...")
            cats = conn.execute(text("SELECT id, name, slug, parent_id, path FROM inv.categories")).fetchall()
            cat_map = {c[0]: {'name': c[1], 'slug': c[2], 'parent_id': c[3], 'path': c[4]} for c in cats}

            def get_full_path(cid):
                c = cat_map[cid]
                if not c['parent_id'] or c['parent_id'] not in cat_map:
                    return c['slug']
                return get_full_path(c['parent_id']) + '/' + str(c['slug'])

            updated_paths_count = 0
            for cid, c in cat_map.items():
                correct_path = get_full_path(cid)
                if c['path'] != correct_path:
                    conn.execute(
                        text("UPDATE inv.categories SET path = :path WHERE id = :id"),
                        {"id": cid, "path": correct_path}
                    )
                    updated_paths_count += 1
            print(f"  ✓ Actualizados {updated_paths_count} paths jerárquicos.")

            # 5. Verificaciones finales de integridad
            print("\n[5/5] Realizando verificaciones finales de integridad...")
            total_cats = conn.execute(text("SELECT COUNT(*) FROM inv.categories")).scalar()
            total_prods = conn.execute(text("SELECT COUNT(*) FROM inv.products")).scalar()
            
            orphans = conn.execute(text("""
                SELECT c.id, c.name, c.parent_id
                FROM inv.categories c
                LEFT JOIN inv.categories p ON c.parent_id = p.id
                WHERE c.parent_id IS NOT NULL AND p.id IS NULL;
            """)).fetchall()
            if orphans:
                raise RuntimeError(f"ABORTADO: Se encontraron categorías huérfanas: {orphans}")

            viveres_roots = conn.execute(text("""
                SELECT id, name, slug FROM inv.categories WHERE parent_id IS NULL AND name ILIKE '%VIVERES%';
            """)).fetchall()
            print(f"  Raíces de 'VIVERES': {[r[1] + ' (ID ' + str(r[0]) + ', slug ' + r[2] + ')' for r in viveres_roots]}")
            if len(viveres_roots) != 1:
                raise RuntimeError(f"ABORTADO: Se esperaba exactamente 1 raíz de VIVERES, pero hay {len(viveres_roots)}")

            # Comprobar que no queden paths residuales de dep-1 a dep-9
            for i in range(1, 10):
                stale_path_count = conn.execute(
                    text(f"SELECT COUNT(*) FROM inv.categories WHERE path LIKE 'dep-{i}/%'")
                ).scalar()
                if stale_path_count > 0:
                    raise RuntimeError(f"ABORTADO: Quedan paths residuales con 'dep-{i}/%'")

            trans.commit()
            print("\n" + "=" * 60)
            print("✅ MIGRACIÓN COMPLETADA CON ÉXITO")
            print(f"  - Total categorías activas: {total_cats}")
            print(f"  - Total productos preservados: {total_prods}")
            print("=" * 60)

        except Exception as ex:
            trans.rollback()
            print(f"\n❌ ERROR EN LA MIGRACIÓN: {ex}")
            raise

if __name__ == "__main__":
    consolidate_and_clean_categories()
