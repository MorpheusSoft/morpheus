import sys
sys.path.insert(0, '/home/lzambrano/Desarrollo/Morpheus/backend')

import time
from app.api.deps import SessionLocal
from app.models.core import Supplier
from app.schemas.supplier import SupplierResponse
from sqlalchemy.orm import joinedload

db = SessionLocal()
try:
    start_time = time.time()
    # Fetch 1000 suppliers with eager loading
    suppliers = db.query(Supplier).options(joinedload(Supplier.banks)).limit(1000).all()
    query_time = time.time() - start_time
    print(f"Time to fetch 1000 suppliers from DB (Eager Loading): {query_time:.4f} seconds")
    
    # Serialize to Pydantic
    start_time = time.time()
    serialized = [SupplierResponse.model_validate(s).model_dump() for s in suppliers]
    serialization_time = time.time() - start_time
    print(f"Time to serialize 1000 suppliers using Pydantic: {serialization_time:.4f} seconds")
    print(f"Total time: {query_time + serialization_time:.4f} seconds")
finally:
    db.close()
