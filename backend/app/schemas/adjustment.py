from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

# ADJUSTMENT REASONS
class AdjustmentReasonBase(BaseModel):
    code: str
    name: str
    default_type: Optional[str] = 'OUT' # 'IN', 'OUT', 'BOTH'
    account_code: Optional[str] = None
    is_active: Optional[bool] = True

class AdjustmentReasonCreate(AdjustmentReasonBase):
    pass

class AdjustmentReasonResponse(AdjustmentReasonBase):
    id: int

    class Config:
        from_attributes = True

# LINES
class InventoryAdjustmentLineBase(BaseModel):
    product_variant_id: int
    batch_id: Optional[int] = None
    quantity: float
    unit_cost: Optional[float] = 0.0

class InventoryAdjustmentLineCreate(InventoryAdjustmentLineBase):
    pass

class InventoryAdjustmentLineResponse(InventoryAdjustmentLineBase):
    id: int
    total_value: float
    sku: Optional[str] = None
    product_name: Optional[str] = None
    batch_number: Optional[str] = None

    class Config:
        from_attributes = True

# DIRECT ADJUSTMENTS
class InventoryAdjustmentBase(BaseModel):
    facility_id: int
    warehouse_id: int
    location_id: Optional[int] = None
    reason_id: int
    movement_type: Optional[str] = 'OUT' # 'IN' (Cargo +), 'OUT' (Descargo -)
    notes: Optional[str] = None

class InventoryAdjustmentCreate(InventoryAdjustmentBase):
    lines: List[InventoryAdjustmentLineCreate]

class InventoryAdjustmentResponse(InventoryAdjustmentBase):
    id: int
    number: str
    total_amount: float
    state: str # 'DRAFT', 'PENDING', 'APPROVED', 'REJECTED'
    created_by_id: int
    created_by_name: Optional[str] = None
    approved_by_id: Optional[int] = None
    approved_by_name: Optional[str] = None
    created_at: datetime
    approved_at: Optional[datetime] = None
    reason_name: Optional[str] = None
    facility_name: Optional[str] = None
    warehouse_name: Optional[str] = None
    location_name: Optional[str] = None
    lines: List[InventoryAdjustmentLineResponse] = []

    class Config:
        from_attributes = True
