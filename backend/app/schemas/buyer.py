from pydantic import BaseModel, ConfigDict
from typing import Optional, Any

class BuyerBase(BaseModel):
    user_id: int
    assigned_categories: Optional[Any] = None
    assigned_facilities: Optional[Any] = None
    assigned_suppliers: Optional[Any] = None
    is_active: Optional[bool] = True

class BuyerCreate(BuyerBase):
    pass

class BuyerUpdate(BaseModel):
    assigned_categories: Optional[Any] = None
    assigned_facilities: Optional[Any] = None
    assigned_suppliers: Optional[Any] = None
    is_active: Optional[bool] = None

class BuyerResponse(BuyerBase):
    id: int
    model_config = ConfigDict(from_attributes=True)
