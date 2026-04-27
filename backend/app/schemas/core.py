from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

# --- COMPANY SCHEMAS ---
class CompanyBase(BaseModel):
    name: str = Field(..., description="Razón Social")
    tax_id: Optional[str] = Field(None, description="RIF o Identificador Fiscal")
    currency_code: str = Field("USD", description="Código de moneda referencial")

class CompanyCreate(CompanyBase):
    pass

class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    tax_id: Optional[str] = None
    currency_code: Optional[str] = None

class CompanyInDBBase(CompanyBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class Company(CompanyInDBBase):
    pass

# --- FACILITY SCHEMAS ---
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

# --- CURRENCY SCHEMAS ---
class CurrencyBase(BaseModel):
    name: str
    code: str
    symbol: Optional[str] = "$"
    exchange_rate: float
    decimal_places: Optional[int] = 2
    is_active: Optional[bool] = True

class CurrencyCreate(CurrencyBase):
    pass

class CurrencyUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    symbol: Optional[str] = None
    exchange_rate: Optional[float] = None
    decimal_places: Optional[int] = None
    is_active: Optional[bool] = None

class CurrencyInDBBase(CurrencyBase):
    id: int
    
    class Config:
        from_attributes = True

class Currency(CurrencyInDBBase):
    pass

# --- ROLE SCHEMAS ---
class RoleBase(BaseModel):
    name: str
    description: Optional[str] = None
    permissions: Optional[dict] = {}
    can_use_oracle: Optional[bool] = False
    is_active: Optional[bool] = True

class RoleCreate(RoleBase):
    pass

class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    can_use_oracle: Optional[bool] = None
    is_active: Optional[bool] = None

class RoleInDBBase(RoleBase):
    id: int
    
    class Config:
        from_attributes = True

class Role(RoleInDBBase):
    pass

# --- USER SCHEMAS (Basic representations for endpoints) ---
class UserBase(BaseModel):
    email: str
    full_name: Optional[str] = None
    is_active: Optional[bool] = True
    is_superuser: Optional[bool] = False

class UserCreate(UserBase):
    password: str
    role_ids: Optional[List[int]] = []
    facility_ids: Optional[List[int]] = []

class UserUpdate(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None
    role_ids: Optional[List[int]] = None
    facility_ids: Optional[List[int]] = None

class UserInDBBase(UserBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class User(UserInDBBase):
    roles: List[Role] = []
    facilities: List[Facility] = []

# --- SYSTEM JOB SCHEMAS ---
from datetime import time

class SystemJobBase(BaseModel):
    job_code: str
    name: str
    is_enabled: Optional[bool] = True
    execution_time: time

class SystemJobCreate(SystemJobBase):
    pass

class SystemJobUpdate(BaseModel):
    name: Optional[str] = None
    is_enabled: Optional[bool] = None
    execution_time: Optional[time] = None

class SystemJobInDBBase(SystemJobBase):
    id: int
    last_executed_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class SystemJob(SystemJobInDBBase):
    pass
