from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func
from app.api.deps import get_db
from app.models.purchasing import PurchaseOrder, PurchaseOrderLine

router = APIRouter()

@router.get("/ceo-inbox")
def get_ceo_metrics(db: Session = Depends(get_db)):
    # Calculate Float and Pending Approval amounts with eager loading
    orders = db.query(PurchaseOrder).options(selectinload(PurchaseOrder.lines)).all()
    
    pending_approval_usd = 0.0
    pending_float_usd = 0.0
    counts = {
        "pending_approval": 0,
        "pending_send": 0,
        "pending_read": 0,
        "pending_receipt": 0,
    }
    
    for o in orders:
        order_total = sum((float(l.expected_base_qty) * float(l.unit_cost)) for l in o.lines)
        
        if o.status in ['draft', 'pending_approval']:
            pending_approval_usd += order_total
            counts["pending_approval"] += 1
        elif o.status == 'approved':
            pending_float_usd += order_total
            counts["pending_send"] += 1
        elif o.status == 'sent':
            pending_float_usd += order_total
            counts["pending_read"] += 1
        elif o.status == 'viewed':
            counts["pending_receipt"] += 1

    return {
        "pending_approval_usd": pending_approval_usd,
        "pending_float_usd": pending_float_usd,
        "total_active_orders": len(orders),
        "counts": counts
    }
