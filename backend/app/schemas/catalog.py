from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime
from decimal import Decimal

# =================
# CATEGORIES
# =================
class CategoryBase(BaseModel):
    name: str
    slug: Optional[str] = None
    parent_id: Optional[int] = None
    is_active: bool = True
    is_liquor: bool = False

class CategoryCreate(CategoryBase):
    pass

class Category(CategoryBase):
    id: int
    path: Optional[str] = None
    
    class Config:
        from_attributes = True

# Tree Response (For recursive frontend display)
class CategoryTree(Category):
    children: List['CategoryTree'] = []

# =================
# CORE: Currencies, Companies & Facilities
# =================
class CurrencyBase(BaseModel):
    name: str
    code: str
    symbol: Optional[str] = None
    exchange_rate: Optional[Decimal] = 1.0
    is_active: Optional[bool] = True

class CurrencyCreate(CurrencyBase):
    pass

class Currency(CurrencyBase):
    id: int

    class Config:
        from_attributes = True

class CompanyBase(BaseModel):
    name: str
    tax_id: Optional[str] = None
    currency_code: str = "USD"

class CompanyCreate(CompanyBase):
    pass

class Company(CompanyBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class FacilityBase(BaseModel):
    company_id: int
    name: str
    code: str
    address: str
    is_active: Optional[bool] = True

class FacilityCreate(FacilityBase):
    pass

class Facility(FacilityBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

# =================
# LOCATIONS & WAREHOUSES
# =================
class WarehouseBase(BaseModel):
    name: str
    code: str
    facility_id: int
    is_scrap: bool = False
    is_transit: bool = False

class Warehouse(WarehouseBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class LocationBase(BaseModel):
    name: str
    code: str
    warehouse_id: Optional[int] = None
    parent_id: Optional[int] = None
    location_type: str = "SHELF"
    usage: str = "INTERNAL"
    
class LocationCreate(LocationBase):
    pass

class Location(LocationBase):
    id: int
    barcode: Optional[str] = None
    is_blocked: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

# =================
# TRIBUTES (TAXES)
# =================
from decimal import Decimal

class TributeBase(BaseModel):
    name: str
    rate: Decimal
    is_active: bool = True

class TributeCreate(TributeBase):
    pass

class Tribute(TributeBase):
    id: int
    
    class Config:
        from_attributes = True
