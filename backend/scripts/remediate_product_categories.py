#!/usr/bin/env python3
"""
Neo ERP - Script de Remediación y Reclasificación Jerárquica de Categorías
========================================================================
Este script corrige la errónea asignación masiva de productos a 'ACEITE VEGETAL'
y otras categorías colapsadas, reasignando cada producto a su categoría real
(Departamento -> Grupo -> Subgrupo) según el catálogo maestro de Stellar.
"""

import sys
import os
import csv
from typing import Dict, Tuple, Optional, List

# Add backend root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text
from app.api.deps import SessionLocal

def remediate_categories(dry_run: bool = False):
    print("=" * 70)
    print("  NEO ERP: REMEDIACIÓN Y RECLASIFICACIÓN JERÁRQUICA DE PRODUCTOS")
    print(f"  Modo: {'[SIMULACIÓN - DRY RUN]' if dry_run else '[EJECUCIÓN REAL EN BASE DE DATOS]'}")
    print("=" * 70)

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(os.path.dirname(base_dir), "data_import")
    
    if not os.path.exists(data_dir):
        # Fallback to local data_import if in backend
        data_dir = os.path.join(base_dir, "data_import")

    print(f"\n[1/5] Cargando archivos maestros de Stellar desde {data_dir}...")
    
    def get_val(row, *candidate_keys):
        for ck in candidate_keys:
            for k, v in row.items():
                if ck.lower() == k.strip().lower() or ck.lower() in k.strip().lower():
                    return v.strip()
        return ""

    # 1. Departamentos
    depts = {}
    dep_file = os.path.join(data_dir, "Departamentos.csv")
    if os.path.exists(dep_file):
        with open(dep_file, 'r', encoding='utf-8-sig') as f:
            for row in csv.DictReader(f):
                c = get_val(row, 'codigo', 'cod')
                name = get_val(row, 'descripcio', 'descri', 'nombre')
                if not c: continue
                depts[c] = name
                depts[c.lstrip('0') or '0'] = name

    # 2. Grupos
    grps = {}
    grp_file = os.path.join(data_dir, "grupos.csv")
    if os.path.exists(grp_file):
        with open(grp_file, 'r', encoding='utf-8-sig') as f:
            for row in csv.DictReader(f):
                c = get_val(row, 'codigo', 'cod')
                d = get_val(row, 'departamento', 'dep')
                name = get_val(row, 'descripcio', 'descri', 'nombre')
                if not c: continue
                grps[(d, c)] = name
                grps[(d.lstrip('0') or '0', c.lstrip('0') or '0')] = name
                grps[c] = (d, name)
                grps[c.lstrip('0') or '0'] = (d, name)

    # 3. Subgrupos
    subs = []
    sub_by_code = {}
    sub_file = os.path.join(data_dir, "subGrupos.csv")
    if os.path.exists(sub_file):
        with open(sub_file, 'r', encoding='utf-8-sig') as f:
            for row in csv.DictReader(f):
                c = get_val(row, 'codigo', 'cod')
                name = get_val(row, 'descripcio', 'descri', 'nombre')
                d = get_val(row, 'in_departamento', 'departamento', 'dep')
                g = get_val(row, 'in_grupo', 'grupo', 'grp')
                if not c: continue
                item = {
                    'code': c,
                    'name': name,
                    'dep': d,
                    'grp': g,
                    'clean_c': c.lstrip('0') or '0',
                    'clean_g': g.lstrip('0') or '0',
                    'clean_d': d.lstrip('0') or '0'
                }
                subs.append(item)
                clean_c = c.lstrip('0') or '0'
                if clean_c not in sub_by_code:
                    sub_by_code[clean_c] = []
                sub_by_code[clean_c].append(item)

    print(f"  ✓ Cargados {len(depts)} Departamentos, {len(grps)} Grupos y {len(subs)} Subgrupos.")

    # 4. Conectar a Base de Datos y cargar categorías de Neo ERP
    print("\n[2/5] Consultando árbol de categorías de Neo ERP (inv.categories)...")
    db = SessionLocal()
    
    categories = db.execute(text("SELECT id, name, slug, parent_id, path FROM inv.categories;")).fetchall()
    print(f"  ✓ {len(categories)} categorías encontradas en base de datos.")

    sub_cat_map = {} # (grp, sub) -> cat_id
    grp_cat_map = {} # (dep, grp) -> cat_id, y grp -> cat_id
    dep_cat_map = {} # dep -> cat_id

    for row in categories:
        cid, name, slug, pid, path = row[0], row[1], row[2], row[3], row[4]
        if not slug: continue
        parts = slug.split('-')
        if slug.startswith("sub-") and len(parts) >= 3:
            g, s = parts[1], parts[2]
            cg, cs = g.lstrip('0') or '0', s.lstrip('0') or '0'
            sub_cat_map[(g, s)] = cid
            sub_cat_map[(cg, cs)] = cid
            sub_cat_map[(g, cs)] = cid
            sub_cat_map[(cg, s)] = cid
        elif slug.startswith("grp-") and len(parts) >= 3:
            d, g = parts[1], parts[2]
            cd, cg = d.lstrip('0') or '0', g.lstrip('0') or '0'
            grp_cat_map[(d, g)] = cid
            grp_cat_map[(cd, cg)] = cid
            grp_cat_map[(d, cg)] = cid
            grp_cat_map[(cd, g)] = cid
            if cg not in grp_cat_map:
                grp_cat_map[cg] = cid
        elif slug.startswith("dep-") and len(parts) >= 2:
            d = parts[1]
            cd = d.lstrip('0') or '0'
            dep_cat_map[d] = cid
            dep_cat_map[cd] = cid
            dep_cat_map[cd.zfill(2)] = cid

    # 5. Mapear productos desde productos_base.csv
    print("\n[3/5] Procesando catálogo de productos y resolviendo jerarquías...")
    prod_file = os.path.join(data_dir, "productos_base.csv")
    if not os.path.exists(prod_file):
        raise FileNotFoundError(f"No se encontró el archivo: {prod_file}")

    stellar_code_to_cat = {}
    
    with open(prod_file, 'r', encoding='utf-8-sig') as f:
        reader = csv.reader(f, delimiter=';')
        for row in reader:
            if len(row) < 3: continue
            code = row[0].strip()
            name = row[1].strip()
            cat_code = row[2].strip()
            if not code or code.lower() in ('codigo', 'sku'): continue

            clean_code = cat_code.lstrip('0') or '0' if cat_code else ""
            target_cat_id = None
            name_upper = name.upper()

            # Reglas de desambiguación rápida para colisiones conocidas
            if clean_code == '48':
                if 'AVENA' in name_upper:
                    target_cat_id = sub_cat_map.get(('145', '48')) or 403 # AVENAS
                else:
                    target_cat_id = grp_cat_map.get(('2', '48')) or 135 # FRUTAS
            elif clean_code == '49':
                if 'GRANOLA' in name_upper:
                    target_cat_id = sub_cat_map.get(('145', '49')) or 209 # GRANOLA
                else:
                    target_cat_id = grp_cat_map.get(('2', '49')) or 50 # VEGETALES
            elif clean_code == '1':
                if any(w in name_upper for w in ('SALCHICHA', 'CHORIZO', 'VIENA')):
                    target_cat_id = sub_cat_map.get(('31', '01')) or 378 # SALCHICHAS
                elif any(w in name_upper for w in ('PANETTON', 'PAN DULCE')):
                    target_cat_id = sub_cat_map.get(('104', '1')) or 262 # PANETTONES
                elif 'ACEITE' in name_upper:
                    target_cat_id = sub_cat_map.get(('136', '1')) or 380 # ACEITE VEGETAL
            elif clean_code == '2':
                if any(w in name_upper for w in ('CHORIZO', 'CHORIZON')):
                    target_cat_id = sub_cat_map.get(('31', '02')) or 379 # CHORIZOS
                elif 'GALLETA' in name_upper:
                    target_cat_id = sub_cat_map.get(('104', '2'))
                elif 'VINAGRE' in name_upper:
                    target_cat_id = sub_cat_map.get(('136', '2')) or 381 # VINAGRES
            elif clean_code == '4':
                if any(w in name_upper for w in ('ACEITE', 'OLIVA')):
                    target_cat_id = sub_cat_map.get(('136', '4')) or 185 # ACEITE DE OLIVA

            # Caso A: El código está en subgrupos (si no fue resuelto por regla específica)
            if not target_cat_id:
                candidates = sub_by_code.get(clean_code, [])
                if len(candidates) == 1:
                    sub_info = candidates[0]
                    target_cat_id = sub_cat_map.get((sub_info['clean_g'], sub_info['clean_c'])) or sub_cat_map.get((sub_info['grp'], sub_info['code']))
                elif len(candidates) > 1:
                    # Desambiguación por coincidencia léxica entre el nombre del producto y el subgrupo/grupo
                    best_cand = None
                    best_score = -1
                    for c in candidates:
                        score = 0
                        c_name_upper = c['name'].upper()
                        # Palabras en común
                        for w in c_name_upper.split():
                            if len(w) >= 4 and w in name_upper:
                                score += 10
                        # Grupo
                        grp_name = grps.get((c['dep'], c['grp']), "")
                        if isinstance(grp_name, str):
                            for gw in grp_name.upper().split():
                                if len(gw) >= 4 and gw in name_upper:
                                    score += 5
                        if score > best_score:
                            best_score = score
                            best_cand = c
                    
                    chosen = best_cand if (best_cand and best_score > 0) else candidates[0]
                    target_cat_id = sub_cat_map.get((chosen['clean_g'], chosen['clean_c'])) or sub_cat_map.get((chosen['grp'], chosen['code']))

            # Caso B: Si no fue subgrupo, verificar si es Grupo
            if not target_cat_id and clean_code in grps:
                grp_val = grps[clean_code]
                if isinstance(grp_val, tuple):
                    dep_code, grp_name = grp_val
                    target_cat_id = grp_cat_map.get((dep_code.lstrip('0') or '0', clean_code)) or grp_cat_map.get(clean_code)

            # Caso C: Si no fue grupo, verificar si es Departamento
            if not target_cat_id and clean_code in depts:
                target_cat_id = dep_cat_map.get(clean_code) or dep_cat_map.get(clean_code.zfill(2))

            if target_cat_id:
                stellar_code_to_cat[code] = target_cat_id

    print(f"  ✓ {len(stellar_code_to_cat):,} productos clasificados con categoría objetivo.")

    # 6. Consultar productos existentes en inv.products con su código STELLAR_CODE
    print("\n[4/5] Evaluando productos en la base de datos de Neo ERP...")
    db_prods = db.execute(text("""
        SELECT p.id, p.name, p.category_id, b.barcode
        FROM inv.products p
        JOIN inv.product_variants pv ON pv.product_id = p.id
        JOIN inv.product_barcodes b ON b.product_variant_id = pv.id
        WHERE b.code_type = 'STELLAR_CODE';
    """)).fetchall()

    print(f"  ✓ {len(db_prods):,} registros de producto con código Stellar en base de datos.")

    # Conteo inicial en ACEITE VEGETAL (ID 380)
    initial_oil_count = sum(1 for p in db_prods if p[2] == 380)
    print(f"  [ALERTA INICIAL] Productos asignados actualmente a 'ACEITE VEGETAL' (ID 380): {initial_oil_count:,}")

    updates = []
    for p in db_prods:
        pid, pname, cur_cat_id, stellar_code = p[0], p[1], p[2], p[3]
        target_cat = stellar_code_to_cat.get(stellar_code)
        if not target_cat and cur_cat_id == 16:
            pname_up = (pname or "").upper()
            if "CHIMO" in pname_up:
                target_cat = sub_cat_map.get(('169', '162'))
            elif any(w in pname_up for w in ("ENCENDEDOR", "FOSFORO", "PORTA FUEGO", "SOPLETE")):
                target_cat = sub_cat_map.get(('169', '161'))
            elif "CIGARR" in pname_up:
                target_cat = sub_cat_map.get(('169', '160'))
        if target_cat and target_cat != cur_cat_id:
            updates.append((target_cat, pid))

    print(f"\n[5/5] Reclasificación requerida para {len(updates):,} productos...")

    if not dry_run and updates:
        batch_size = 2000
        total_updated = 0
        for i in range(0, len(updates), batch_size):
            batch = updates[i:i + batch_size]
            for target_cat, pid in batch:
                db.execute(
                    text("UPDATE inv.products SET category_id = :cat_id WHERE id = :pid;"),
                    {"cat_id": target_cat, "pid": pid}
                )
            db.commit()
            total_updated += len(batch)
            print(f"  -> Progreso: {total_updated:,} / {len(updates):,} productos actualizados...")

        print(f"\n  ✓ ¡{total_updated:,} productos actualizados con éxito en base de datos!")
    elif dry_run:
        print(f"  [DRY RUN] Se habrían actualizado {len(updates):,} productos.")

    # 7. Verificación final de integridad
    final_prods = db.execute(text("""
        SELECT p.id, p.name, p.category_id, c.name as category_name, b.barcode
        FROM inv.products p
        JOIN inv.product_variants pv ON pv.product_id = p.id
        JOIN inv.product_barcodes b ON b.product_variant_id = pv.id
        LEFT JOIN inv.categories c ON c.id = p.category_id
        WHERE b.code_type = 'STELLAR_CODE' AND b.barcode IN ('016481', '000266', '000102', '000103');
    """)).fetchall()

    final_oil_count = db.execute(text("SELECT COUNT(*) FROM inv.products WHERE category_id = 380;")).scalar()

    print("\n" + "=" * 70)
    print("  RESULTADOS DE LA REMEDIACIÓN")
    print("=" * 70)
    print(f"  Total productos en 'ACEITE VEGETAL' (ID 380) ANTES:   {initial_oil_count:,}")
    print(f"  Total productos en 'ACEITE VEGETAL' (ID 380) DESPUÉS: {final_oil_count:,}")
    print("\n  Comprobación de Productos Clave:")
    for fp in final_prods:
        target = stellar_code_to_cat.get(fp[4])
        target_cat_row = db.execute(text("SELECT name FROM inv.categories WHERE id = :id"), {"id": target}).first() if target else None
        target_name = target_cat_row[0] if target_cat_row else "No mapeado"
        print(f"    - [{fp[4]}] {fp[1]}:")
        print(f"        -> Categoría en DB:       {fp[3]} (ID {fp[2]})")
        print(f"        -> Categoría Destino/Fix: {target_name} (ID {target})")

    top_cats = db.execute(text("""
        SELECT c.id, c.name, count(p.id) as total
        FROM inv.categories c
        JOIN inv.products p ON p.category_id = c.id
        GROUP BY c.id, c.name
        ORDER BY total DESC
        LIMIT 10;
    """)).fetchall()

    print("\n  Top 10 Categorías con Mayor Variedad de Productos tras Reclasificación:")
    for tc in top_cats:
        print(f"    - {tc[1]} (ID {tc[0]}): {tc[2]:,} artículos")

    db.close()
    print("\n" + "=" * 70)
    print("  REMEDIACIÓN COMPLETADA EXITOSAMENTE.")
    print("=" * 70)

if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    remediate_categories(dry_run=dry)
