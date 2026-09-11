import sys
import os
import csv

sys.path.append(os.path.join(os.path.dirname(__file__)))

from sqlalchemy.orm import Session
from app.api.deps import engine
from app.models.inventory import Category

def import_categories():
    with Session(engine) as session:
        print("Iniciando carga de Categorías...")
        
        # 1. Departamentos (Abuelos)
        dep_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data_import', 'Departamentos.csv')
        with open(dep_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            # Normalizamos llaves para evitar problemas con espacios blancos en el CSV
            keys = reader.fieldnames
            c_cod = next(k for k in keys if "CODIGO" in k.upper())
            c_desc = next(k for k in keys if "DESCRIPCIO" in k.upper())
            
            for row in reader:
                codigo = row[c_cod].strip()
                nombre = row[c_desc].strip()
                if not codigo: continue
                
                clean_code = codigo.lstrip('0') or '0'
                padded_code = clean_code.zfill(2) if clean_code.isdigit() else clean_code
                candidate_slugs = list(dict.fromkeys([f"dep-{codigo}", f"dep-{clean_code}", f"dep-{padded_code}"]))
                
                cat = session.query(Category).filter(Category.slug.in_(candidate_slugs)).first()
                target_slug = f"dep-{padded_code}"
                if not cat:
                    cat = Category(name=nombre, slug=target_slug, parent_id=None, path=target_slug)
                    session.add(cat)
                else:
                    cat.name = nombre
                    if not cat.path:
                        cat.path = cat.slug
        session.commit()
        print("✓ Departamentos cargados.")
        
        # 2. Grupos (Padres)
        grp_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data_import', 'grupos.csv')
        with open(grp_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            keys = reader.fieldnames
            c_cod = next(k for k in keys if "CODIGO" in k.upper())
            c_desc = next(k for k in keys if "DESCRIPCIO" in k.upper())
            c_dep = next(k for k in keys if "DEPARTAMENTO" in k.upper())
            
            for row in reader:
                codigo = row[c_cod].strip()
                nombre = row[c_desc].strip()
                depto = row[c_dep].strip()
                if not codigo: continue
                
                clean_dep = depto.lstrip('0') or '0'
                padded_dep = clean_dep.zfill(2) if clean_dep.isdigit() else clean_dep
                
                slug = f"grp-{padded_dep}-{codigo}"
                candidate_parent_slugs = [f"dep-{padded_dep}", f"dep-{clean_dep}", f"dep-{depto}"]
                
                parent = session.query(Category).filter(Category.slug.in_(candidate_parent_slugs)).first()
                if not parent:
                    print(f"  [!] Alerta: Padre no encontrado para el grupo {nombre} (Se buscó: {candidate_parent_slugs})")
                    continue
                
                cat = session.query(Category).filter_by(slug=slug).first()
                if not cat:
                    cat = Category(name=nombre, slug=slug, parent_id=parent.id, path=f"{parent.path}/{slug}")
                    session.add(cat)
                else:
                    cat.name = nombre
                    cat.parent_id = parent.id
                    cat.path = f"{parent.path}/{cat.slug}"
        session.commit()
        print("✓ Grupos cargados.")

        # 3. SubGrupos (Hijos)
        sub_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data_import', 'subGrupos.csv')
        with open(sub_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            keys = reader.fieldnames
            c_cod = next(k for k in keys if "CODIGO" in k.upper())
            c_desc = next(k for k in keys if "DESCRIPCIO" in k.upper())
            c_dep = next(k for k in keys if "IN_DEPARTAMENTO" in k.upper())
            c_grp = next(k for k in keys if "IN_GRUPO" in k.upper())
            
            for row in reader:
                codigo = row[c_cod].strip()
                nombre = row[c_desc].strip()
                depto = row[c_dep].strip()
                grupo = row[c_grp].strip()
                if not codigo: continue
                
                clean_dep = depto.lstrip('0') or '0'
                padded_dep = clean_dep.zfill(2) if clean_dep.isdigit() else clean_dep
                
                slug = f"sub-{grupo}-{codigo}"
                candidate_parent_slugs = [f"grp-{padded_dep}-{grupo}", f"grp-{clean_dep}-{grupo}", f"grp-{depto}-{grupo}"]
                
                parent = session.query(Category).filter(Category.slug.in_(candidate_parent_slugs)).first()
                if not parent:
                    print(f"  [!] Alerta: Padre no encontrado para el subgrupo {nombre} (Se buscó: {candidate_parent_slugs})")
                    continue
                    
                cat = session.query(Category).filter_by(slug=slug).first()
                if not cat:
                    cat = Category(name=nombre, slug=slug, parent_id=parent.id, path=f"{parent.path}/{slug}")
                    session.add(cat)
                else:
                    cat.name = nombre
                    cat.parent_id = parent.id
                    cat.path = f"{parent.path}/{cat.slug}"
        session.commit()
        print("✓ Subgrupos cargados.")
        print("✅ ¡Árbol de categorías migrado con éxito!")

if __name__ == "__main__":
    import_categories()
