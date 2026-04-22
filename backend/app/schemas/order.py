from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime

class OrderItemBase(BaseModel):
    product_id: int
    quantity: int
    unit_price: float
    subtotal: float

class OrderItemCreate(OrderItemBase):
    pass

class OrderItem(OrderItemBase):
    id: int
    order_id: int

    class Config:
        from_attributes = True

class OrderBase(BaseModel):
    customer_id: int
    status: str = "PENDING"
    total_amount: float
    notes: Optional[str] = None

class OrderCreate(OrderBase):
    items: List[OrderItemCreate]

class OrderUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None

class OrderInDBBase(OrderBase):
    id: int
    created_at: datetime
    
class Order(OrderInDBBase):
    items: List[OrderItem] = []
    
    class Config:
        from_attributes = True
