import sys
sys.path.insert(0, '/home/lzambrano/Desarrollo/Morpheus/backend')

from app.api.deps import SessionLocal
from app.api.v1.endpoints.catalog import read_facilities as read_catalog_facilities
from app.api.v1.endpoints.facilities import read_facilities as read_facilities_endpoint

db = SessionLocal()
try:
    print("Calling catalog read_facilities:")
    res_catalog = read_catalog_facilities(db=db)
    print("Catalog response:", res_catalog)
    for r in res_catalog:
        print(f"  id: {r.id}, name: {r.name}, code: {r.code}, active: {r.is_active}, company_id: {r.company_id}, created_at: {r.created_at}")

    print("\nCalling facilities endpoint read_facilities:")
    res_fac = read_facilities_endpoint(db=db)
    print("Facilities endpoint response:", res_fac)
    for r in res_fac:
        print(f"  id: {r.id}, name: {r.name}, code: {r.code}, active: {r.is_active}, company_id: {r.company_id}")
finally:
    db.close()
