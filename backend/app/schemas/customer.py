from typing import Optional
from pydantic import BaseModel, EmailStr
from datetime import datetime

class CustomerBase(BaseModel):
    rif: str
    name: str
    address: Optional[str] = None
    shipping_address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    is_active: bool = True

class CustomerCreate(CustomerBase):
    pass

class CustomerUpdate(BaseModel):
    rif: Optional[str] = None
    name: Optional[str] = None
    address: Optional[str] = None
    shipping_address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = None

class CustomerInDBBase(CustomerBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class Customer(CustomerInDBBase):
    pass
