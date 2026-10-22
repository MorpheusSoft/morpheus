#!/usr/bin/env python3
"""
Neo ERP - Reclasificación Jerárquica de Productos a Subgrupos y Grupos
=====================================================================
Reasigna cada producto de inv.products a su Subgrupo o Grupo correspondiente
utilizando el mapeo de sub_codigo de productos_base.csv y los slugs jerárquicos de inv.categories.
"""

import os
import sys
import csv

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text
from app.api.deps import engine

def main():
    print("=" * 70)
    print("  NEO ERP: RECLASIFICACIÓN JERÁRQUICA A SUBGRUPOS (WMS & COMPRAS)")
    print("=" * 70)

    csv_path = None
    candidates = [
        "/home/lzambrano/Morpheus/data_import/productos_base.csv",
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data_import", "productos_base.csv"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data_import", "productos_base.csv"),
    ]
    for c in candidates:
        if os.path.exists(c):
            csv_path = c
            break

    if not csv_path:
        print(f"Error: no se encontró productos_base.csv en ninguna de las rutas: {candidates}")
        sys.exit(1)

    print(f"[1/4] Leyendo categorías y construyendo índices jerárquicos...")
    with engine.connect() as conn:
        cats = conn.execute(text("SELECT id, name, slug, parent_id FROM inv.categories;")).fetchall()
        sub_map = {}
        grp_map = {}
        for c in cats:
            if not c[2]:
                continue
            parts = c[2].split('-')
            if c[2].startswith('sub-') and len(parts) >= 3:
                s_code = parts[2].lstrip('0') or '0'
                sub_map[s_code] = c[0]
                sub_map[parts[2]] = c[0]
            elif c[2].startswith('grp-') and len(parts) >= 3:
                g_code = parts[2].lstrip('0') or '0'
                grp_map[g_code] = c[0]
                grp_map[parts[2]] = c[0]

        print(f"  ✓ {len(sub_map)} referencias de subgrupos mapeadas.")

        print(f"\n[2/4] Procesando archivo {csv_path}...")
        stellar_to_cat = {}
        with open(csv_path, 'r', encoding='utf-8-sig', errors='ignore') as f:
            for line in f:
                parts = line.strip().split(';')
                if len(parts) >= 3:
                    code, name, s_code = parts[0].strip(), parts[1].strip(), parts[2].strip()
                    target_cat = sub_map.get(s_code) or sub_map.get(s_code.lstrip('0') or '0') or grp_map.get(s_code)
                    if target_cat:
                        clean_code = code.lstrip('0') or '0'
                        stellar_to_cat[code] = target_cat
                        stellar_to_cat[clean_code] = target_cat

        print(f"  ✓ {len(stellar_to_cat)} códigos asignados con subgrupo objetivo.")

        print("\n[3/4] Creando tabla temporal en base de datos para actualización masiva...")
        conn.execute(text("CREATE TEMP TABLE tmp_reclass (stellar_code VARCHAR(50), target_cat_id INTEGER);"))
        conn.execute(text("CREATE INDEX idx_tmp_reclass ON tmp_reclass(stellar_code);"))

        batch = []
        batch_size = 5000
        for code, cat_id in stellar_to_cat.items():
            batch.append({"c": code, "t": cat_id})
            if len(batch) >= batch_size:
                conn.execute(text("INSERT INTO tmp_reclass (stellar_code, target_cat_id) VALUES (:c, :t);"), batch)
                batch = []
        if batch:
            conn.execute(text("INSERT INTO tmp_reclass (stellar_code, target_cat_id) VALUES (:c, :t);"), batch)

        print("\n[4/4] Ejecutando UPDATE jerárquico masivo...")
        update_sql = text("""
            UPDATE inv.products p
            SET category_id = t.target_cat_id
            FROM inv.product_variants pv
            JOIN inv.product_barcodes b ON b.product_variant_id = pv.id
            JOIN tmp_reclass t ON t.stellar_code = b.barcode
            WHERE pv.product_id = p.id
              AND b.code_type = 'STELLAR_CODE'
              AND p.category_id != t.target_cat_id;
        """)
        res = conn.execute(update_sql)
        conn.commit()
        print(f"  ✓ {res.rowcount:,} productos reclasificados exitosamente a sus subgrupos/grupos reales.")

        # Resumen de verificación
        miel_cnt = conn.execute(text("SELECT count(*) FROM inv.products WHERE category_id = 199;")).scalar()
        cigar_cnt = conn.execute(text("SELECT count(*) FROM inv.products WHERE category_id = 344;")).scalar()
        amb_cnt = conn.execute(text("SELECT count(*) FROM inv.products WHERE category_id = 253;")).scalar()
        print("\n" + "=" * 70)
        print("  VERIFICACIÓN DE SUBGRUPOS ESPECÍFICOS:")
        print(f"  - MIEL (ID 199):          {miel_cnt} productos")
        print(f"  - CIGARROS (ID 344):      {cigar_cnt} productos")
        print(f"  - AMBIENTADORES (ID 253): {amb_cnt} productos")
        print("=" * 70)

if __name__ == "__main__":
    main()
