import sys
sys.path.insert(0, '/home/lzambrano/Desarrollo/Morpheus/backend')

from app.api.deps import SessionLocal
from app.models.core import Facility

db = SessionLocal()
try:
    facilities = db.query(Facility).all()
    print(f"Total Facilities in DB: {len(facilities)}")
    for f in facilities:
        print(f"ID: {f.id} | Name: {f.name} | Code: {f.code} | Active: {f.is_active} | Company ID: {f.company_id}")
finally:
    db.close()
