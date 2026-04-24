from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class FacilityBase(BaseModel):
    name: str
    code: str
    address: str
    is_active: Optional[bool] = True
    company_id: Optional[int] = None

class FacilityCreate(FacilityBase):
    pass

class FacilityUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None
    company_id: Optional[int] = None

class FacilityInDBBase(FacilityBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class Facility(FacilityInDBBase):
    pass
