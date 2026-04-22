from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime
from enum import Enum

class PickingStatus(str, Enum):
    DRAFT = "DRAFT"
    CONFIRMED = "CONFIRMED"
    DONE = "DONE"
    CANCELLED = "CANCELLED"

# =================
# MOVES
# =================
class StockMoveBase(BaseModel):
    product_id: int
    quantity_demand: float
    location_src_id: int
    location_dest_id: int
    uom_id: str = "PZA"

class StockMoveCreate(StockMoveBase):
    pass

class StockMove(StockMoveBase):
    id: int
    picking_id: int
    quantity_done: float
    state: str
    date: datetime
    
    class Config:
        from_attributes = True

# =================
# PICKINGS
# =================
class StockPickingBase(BaseModel):
    picking_type_id: int
    origin_document: Optional[str] = None
    facility_id: Optional[int] = None # Optional in schema, but usually required logic

class StockPickingCreate(StockPickingBase):
    pass

class StockPicking(StockPickingBase):
    id: int
    name: str # The sequence number generated
    status: PickingStatus
    moves: List[StockMove] = []
    created_at: datetime
    date_done: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class StockPickingType(BaseModel):
    id: int
    name: str
    code: str
    default_location_src_id: Optional[int]
    default_location_dest_id: Optional[int]

    class Config:
        from_attributes = True
