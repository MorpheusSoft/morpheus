import sys
sys.path.append('/home/lzambrano/Desarrollo/Morpheus/backend')
from app.db.session import SessionLocal
from app.models.purchasing import PurchaseOrder
from app.schemas.purchase_order import PurchaseOrderResponse
from pydantic import ValidationError

db = SessionLocal()
orders = db.query(PurchaseOrder).all()
for p in orders:
    try:
        PurchaseOrderResponse.model_validate(p)
    except ValidationError as e:
        print(f"Error en PO {p.id}: {e}")
