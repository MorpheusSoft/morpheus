from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from decimal import Decimal

# =======================
# PRICING SESSION LINE
# =======================
class PricingSessionLineBase(BaseModel):
    variant_id: Optional[int] = None
    external_reference_name: Optional[str] = None
    old_cost: Decimal = Decimal('0.0')
    proposed_cost: Decimal = Decimal('0.0')
    old_price: Decimal = Decimal('0.0')
    proposed_price: Decimal = Decimal('0.0')
    action: str = 'IGNORE'

class PricingSessionLineCreate(PricingSessionLineBase):
    pass

class PricingSessionLineUpdate(BaseModel):
    action: Optional[str] = None
    proposed_cost: Optional[Decimal] = None
    proposed_price: Optional[Decimal] = None

class PricingSessionLineOut(PricingSessionLineBase):
    id: int
    session_id: int
    
    model_config = ConfigDict(from_attributes=True)

# =======================
# PRICING SESSION
# =======================
class PricingSessionBase(BaseModel):
    name: str
    source_type: str = 'CSV_UPLOAD'
    status: str = 'DRAFT'

class PricingSessionCreate(BaseModel):
    name: str
    source_type: str = 'CSV_UPLOAD'
    lines: Optional[List[PricingSessionLineCreate]] = []

class PricingSessionUploadData(BaseModel):
    """
    Simulates sending an array of objects straight from the AI/PDF or CSV.
    """
    lines: List[PricingSessionLineCreate]

class PricingSessionOut(PricingSessionBase):
    id: int
    created_by: Optional[int] = None
    created_at: datetime
    applied_at: Optional[datetime] = None
    
    # Expose the lines relation
    lines: List[PricingSessionLineOut] = []

    model_config = ConfigDict(from_attributes=True)
