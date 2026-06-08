import sys
sys.path.insert(0, '/home/lzambrano/Desarrollo/Morpheus/backend')

from app.api.deps import SessionLocal
from app.models.core import Supplier

db = SessionLocal()
try:
    count = db.query(Supplier).count()
    print(f"Total Suppliers: {count}")
    
    # Let's fetch one supplier
    if count > 0:
        first = db.query(Supplier).first()
        print(f"First supplier: ID={first.id}, Name={first.name}, Tax ID={first.tax_id}")
finally:
    db.close()
