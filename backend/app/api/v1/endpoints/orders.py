from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.models.sales import Order, OrderItem, Customer
from app.schemas.order import Order as OrderSchema, OrderCreate, OrderUpdate

router = APIRouter()

@router.get("/", response_model=List[OrderSchema])
def read_orders(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    # A complete query would include the items via eager loading options, 
    # but for simplicity we rely on lazy loading or simple fetch here
    orders = db.query(Order).offset(skip).limit(limit).all()
    
    # We load items manually since no formal relationship mapping was used in models yet
    # to keep schema isolation. Let's do a simple mapping.
    result = []
    for order in orders:
        items = db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
        order_dict = {
            "id": order.id,
            "customer_id": order.customer_id,
            "status": order.status,
            "total_amount": order.total_amount,
            "notes": order.notes,
            "created_at": order.created_at,
            "items": items
        }
        result.append(order_dict)
        
    return result

@router.post("/", response_model=OrderSchema)
def create_order(
    *,
    db: Session = Depends(deps.get_db),
    order_in: OrderCreate,
) -> Any:
    customer = db.query(Customer).filter(Customer.id == order_in.customer_id).first()
    if not customer:
        raise HTTPException(status_code=400, detail="Customer not found.")
        
    db_order = Order(
        customer_id=order_in.customer_id,
        status=order_in.status,
        total_amount=order_in.total_amount,
        notes=order_in.notes
    )
    db.add(db_order)
    db.flush()
    
    db_items = []
    for item in order_in.items:
        db_item = OrderItem(
            order_id=db_order.id,
            product_id=item.product_id,
            quantity=item.quantity,
            unit_price=item.unit_price,
            subtotal=item.subtotal
        )
        db.add(db_item)
        db_items.append(db_item)
        
    db.commit()
    db.refresh(db_order)
    
    return {
        "id": db_order.id,
        "customer_id": db_order.customer_id,
        "status": db_order.status,
        "total_amount": db_order.total_amount,
        "notes": db_order.notes,
        "created_at": db_order.created_at,
        "items": db_items
    }

@router.get("/{id}", response_model=OrderSchema)
def read_order(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
) -> Any:
    order = db.query(Order).filter(Order.id == id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    items = db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
    return {
        "id": order.id,
        "customer_id": order.customer_id,
        "status": order.status,
        "total_amount": order.total_amount,
        "notes": order.notes,
        "created_at": order.created_at,
        "items": items
    }

@router.put("/{id}/status", response_model=OrderSchema)
def update_order_status(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    order_in: OrderUpdate,
) -> Any:
    order = db.query(Order).filter(Order.id == id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    if order_in.status:
        order.status = order_in.status
        
    if order_in.notes is not None:
        order.notes = order_in.notes
        
    db.commit()
    db.refresh(order)
    
    items = db.query(OrderItem).filter(OrderItem.order_id == order.id).all()
    return {
        "id": order.id,
        "customer_id": order.customer_id,
        "status": order.status,
        "total_amount": order.total_amount,
        "notes": order.notes,
        "created_at": order.created_at,
        "items": items
    }
