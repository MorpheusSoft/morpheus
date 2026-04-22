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
                
                slug = f"dep-{codigo}"
                cat = session.query(Category).filter_by(slug=slug).first()
                if not cat:
                    cat = Category(name=nombre, slug=slug, parent_id=None, path=slug)
                    session.add(cat)
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
                
                # Como descubrí que hay códigos duplicados entre deptos, armamos un slug compuesto
                slug = f"grp-{depto}-{codigo}"
                parent_slug = f"dep-{depto}"
                
                parent = session.query(Category).filter_by(slug=parent_slug).first()
                if not parent:
                    print(f"  [!] Alerta: Padre no encontrado para el grupo {nombre} (Se buscó: {parent_slug})")
                    continue
                
                cat = session.query(Category).filter_by(slug=slug).first()
                if not cat:
                    cat = Category(name=nombre, slug=slug, parent_id=parent.id, path=f"{parent.path}/{slug}")
                    session.add(cat)
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
                
                slug = f"sub-{grupo}-{codigo}"
                parent_slug = f"grp-{depto}-{grupo}"
                
                parent = session.query(Category).filter_by(slug=parent_slug).first()
                if not parent:
                    print(f"  [!] Alerta: Padre no encontrado para el subgrupo {nombre} (Se buscó: {parent_slug})")
                    continue
                    
                cat = session.query(Category).filter_by(slug=slug).first()
                if not cat:
                    cat = Category(name=nombre, slug=slug, parent_id=parent.id, path=f"{parent.path}/{slug}")
                    session.add(cat)
        session.commit()
        print("✓ Subgrupos cargados.")
        print("✅ ¡Árbol de categorías migrado con éxito!")

if __name__ == "__main__":
    import_categories()
