from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.api.deps import get_db
from app.models.purchasing import PurchaseOrder, PurchaseOrderLine

router = APIRouter()

@router.get("/ceo-inbox")
def get_ceo_metrics(db: Session = Depends(get_db)):
    # Calculate Float and Pending Approval amounts
    orders = db.query(PurchaseOrder).all()
    
    pending_approval_usd = 0.0
    pending_float_usd = 0.0
    
    for o in orders:
        order_total = sum((float(l.expected_base_qty) * float(l.unit_cost)) for l in o.lines)
        
        # We apply the simplest sum for MVP (ignoring cascade discounts for macro metrics)
        if o.status in ['draft', 'pending_approval']:
            pending_approval_usd += order_total
        elif o.status in ['approved', 'sent']:
            pending_float_usd += order_total

    return {
        "pending_approval_usd": pending_approval_usd,
        "pending_float_usd": pending_float_usd,
        "total_active_orders": len(orders)
    }
