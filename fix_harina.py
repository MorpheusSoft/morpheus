import sys
import os
import traceback
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.db.session import SessionLocal
from app.models.purchasing import SupplierProduct

db = SessionLocal()
try:
    print("Borrando el registro corrupto...")
    corrupt = db.query(SupplierProduct).filter(SupplierProduct.variant_id == 13).all()
    for c in corrupt:
        db.delete(c)
        print(f"Logrado: Borrado variant_id 13 del proveedor {c.supplier_id}")
    db.commit()
except Exception as e:
    traceback.print_exc()
    db.rollback()
