import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.api.deps import SessionLocal
from app.api.v1.endpoints.reports import get_advanced_kardex, KardexFilter
from datetime import datetime

db = SessionLocal()
filters = KardexFilter(
    product_ids=[115730], # Harina Pan
    facility_ids=[1], # Patio Trigal
    date_from=datetime(2026, 6, 1),
    date_to=datetime(2026, 6, 30)
)
res = get_advanced_kardex(filters, db)
print(type(res))
import json
try:
    print(res.dict())
except:
    print(res)
