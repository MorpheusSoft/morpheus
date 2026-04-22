from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date
from decimal import Decimal
from typing import Any

class PurchaseOrderLineBase(BaseModel):
    variant_id: int
    pack_id: Optional[int] = None
    qty_ordered: Decimal
    expected_base_qty: Decimal
    unit_cost: Decimal

class PurchaseOrderLineCreate(PurchaseOrderLineBase):
    pass

class PurchaseOrderLineResponse(PurchaseOrderLineBase):
    id: int
    order_id: int
    line_discount_str: Optional[str] = None
    received_base_qty: Decimal = Decimal(0)
    
    class Config:
        from_attributes = True

class SupplierBasic(BaseModel):
    id: int
    name: str
    tax_id: Optional[str] = None
    currency_id: Optional[int] = None
    
    class Config:
        from_attributes = True

class PurchaseOrderBase(BaseModel):
    supplier_id: int
    buyer_id: Optional[int] = None
    dest_facility_id: Optional[int] = None
    status: str = 'draft'
    total_amount: Decimal
    
    invoice_discount_str: Optional[str] = None
    condition_discount_str: Optional[str] = None
    notes: Optional[str] = None
    expiration_date: Optional[date] = None
    allow_partial_deliveries: Optional[bool] = False
    currency_id: Optional[int] = None
    exchange_rate: Optional[Decimal] = None

class PurchaseOrderCreate(BaseModel):
    supplier_id: int
    dest_facility_id: Optional[int] = None
    lines: List[PurchaseOrderLineCreate]

class PurchaseOrderUpdateStatus(BaseModel):
    status: str

class PurchaseOrderLineUpdate(BaseModel):
    id: Optional[int] = None # Para nuevos renglones (regalías)
    variant_id: Optional[int] = None
    pack_id: Optional[int] = None
    qty_ordered: Decimal
    expected_base_qty: Decimal
    unit_cost: Decimal
    line_discount_str: Optional[str] = None
    currency_id: Optional[int] = None
    exchange_rate: Decimal = 1.0

class PurchaseOrderUpdate(BaseModel):
    invoice_discount_str: Optional[str] = None
    condition_discount_str: Optional[str] = None
    notes: Optional[str] = None
    expiration_date: Optional[date] = None
    allow_partial_deliveries: bool = False
    currency_id: Optional[int] = None
    exchange_rate: Decimal = 1.0
    
    lines: List[PurchaseOrderLineUpdate]

class PurchaseOrderResponse(PurchaseOrderBase):
    id: int
    reference: str
    created_at: datetime
    lines: List[PurchaseOrderLineResponse] = []
    supplier: Optional[SupplierBasic] = None
    
    class Config:
        from_attributes = True

class PurchaseOrderConciliationLine(BaseModel):
    id: int
    billed_qty: Decimal
    billed_unit_cost: Decimal
    new_sales_price: Optional[Decimal] = None # Protección de Margen
    
class PurchaseOrderConciliation(BaseModel):
    invoice_number: str
    invoice_date: date
    lines: List[PurchaseOrderConciliationLine]
