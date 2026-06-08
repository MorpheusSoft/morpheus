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

class InventoryLineBulkItem(BaseModel):
    sku: str
    location_code: str
    counted_qty: float
    notes: Optional[str] = None
    cost: Optional[float] = None # Para carga inicial

class InventoryLineBulkUpload(BaseModel):
    lines: List[InventoryLineBulkItem]

class InventoryLine(InventoryLineBase):
    id: int
    session_id: int
    theoretical_qty: Optional[float] = None
    difference_qty: Optional[float] = None
    is_anomaly: Optional[bool] = False
    anomaly_reason: Optional[str] = None
    updated_at: datetime
    
    class Config:
        from_attributes = True

# SESSIONS
class InventorySessionBase(BaseModel):
    name: str # e.g. "Annual Count 2026"
    facility_id: Optional[int] = None
    warehouse_id: Optional[int] = None
    scope_type: Optional[str] = "GENERAL"
    scope_value: Optional[str] = None

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
