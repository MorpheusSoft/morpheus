import sys
import os
sys.path.insert(0, '/home/lzambrano/Desarrollo/Morpheus/backend')

from app.api.deps import SessionLocal
from app.models.inventory import PrintTemplate

db = SessionLocal()
try:
    print("[*] Consultando plantillas locales...")
    templates = db.query(PrintTemplate).all()
    print(f"[+] Se encontraron {len(templates)} plantillas locales.")
    for t in templates:
        print(f"  - ID: {t.id} | Nombre: {t.name} | Tipo Papel: {t.paper_type} | Ancho: {t.width_mm}mm | Alto: {t.height_mm}mm | Filas: {t.rows} | Cols: {t.cols}")
        print(f"    Layout Config keys: {list(t.layout_config.keys()) if t.layout_config else 'None'}")
except Exception as e:
    print(f"[!] Error: {e}")
finally:
    db.close()
