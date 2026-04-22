from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from enum import Enum

class InventorySessionStatus(str, Enum):
    DRAFT = "DRAFT"
    IN_PROGRESS = "IN_PROGRESS"
    DONE = "DONE"
    CANCELLED = "CANCELLED"

# LINES
class InventoryLineBase(BaseModel):
    product_variant_id: int
    location_id: int
    counted_qty: float = 0
    notes: Optional[str] = None

class InventoryLineCreate(InventoryLineBase):
    pass

class InventoryLineUpdate(BaseModel):
    counted_qty: float
    notes: Optional[str] = None

class InventoryLine(InventoryLineBase):
    id: int
    session_id: int
    theoretical_qty: float
    difference_qty: Optional[float] = None
    updated_at: datetime
    
    class Config:
        from_attributes = True

# SESSIONS
class InventorySessionBase(BaseModel):
    name: str
    warehouse_id: int
    facility_id: int

class InventorySessionCreate(InventorySessionBase):
    pass

class InventorySession(InventorySessionBase):
    id: int
    state: InventorySessionStatus
    date_start: datetime
    date_end: Optional[datetime] = None
    created_by: Optional[int] = None
    lines: List[InventoryLine] = []

    class Config:
        from_attributes = True
