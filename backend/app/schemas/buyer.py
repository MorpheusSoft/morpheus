from pydantic import BaseModel, ConfigDict
from typing import Optional, Any

class BuyerBase(BaseModel):
    user_id: int
    assigned_categories: Optional[Any] = None
    assigned_facilities: Optional[Any] = None
    assigned_suppliers: Optional[Any] = None
    is_active: Optional[bool] = True
    approval_limit: Optional[float] = 0.0

class BuyerCreate(BuyerBase):
    pass

class BuyerUpdate(BaseModel):
    assigned_categories: Optional[Any] = None
    assigned_facilities: Optional[Any] = None
    assigned_suppliers: Optional[Any] = None
    is_active: Optional[bool] = None
    approval_limit: Optional[float] = None

class BuyerResponse(BuyerBase):
    id: int
    model_config = ConfigDict(from_attributes=True)
