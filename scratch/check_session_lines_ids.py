import sys
sys.path.insert(0, '/home/lzambrano/Desarrollo/Morpheus/backend')

from app.api.deps import SessionLocal
from app.models.inventory import PricingSessionLine

db = SessionLocal()
try:
    lines = db.query(PricingSessionLine).limit(10).all()
    print(f"Total lines sampled: {len(lines)}")
    for l in lines:
        print(f"Line ID: {l.id} (type: {type(l.id)}) | Session ID: {l.session_id} | Variant ID: {l.variant_id}")
finally:
    db.close()
