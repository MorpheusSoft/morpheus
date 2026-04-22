from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime
from enum import Enum

class SessionState(str, Enum):
    DRAFT = "DRAFT"
    IN_PROGRESS = "IN_PROGRESS"
    CONFIRMING = "CONFIRMING"
    DONE = "DONE"
    CANCELLED = "CANCELLED"

# LINES
class InventoryLineBase(BaseModel):
    product_variant_id: int
    location_id: int
    counted_qty: float
    notes: Optional[str] = None

class InventoryLineCreate(InventoryLineBase):
    pass

class InventoryLine(InventoryLineBase):
    id: int
    session_id: int
    theoretical_qty: float
    difference_qty: Optional[float]
    updated_at: datetime
    
    class Config:
        from_attributes = True

# SESSIONS
class InventorySessionBase(BaseModel):
    name: str # e.g. "Annual Count 2026"
    facility_id: Optional[int] = None
    warehouse_id: Optional[int] = None

class InventorySessionCreate(InventorySessionBase):
    pass

class InventorySession(InventorySessionBase):
    id: int
    state: SessionState
    date_start: datetime
    date_end: Optional[datetime]
    lines: List[InventoryLine] = []
    
    class Config:
        from_attributes = True
