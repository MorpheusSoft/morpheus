from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel

class LocationOptionSchema(BaseModel):
    id: int
    name: str
    code: str
    usage: Optional[str] = None

    class Config:
        from_attributes = True

class WarehouseOptionSchema(BaseModel):
    id: int
    name: str
    code: str
    locations: List[LocationOptionSchema] = []

    class Config:
        from_attributes = True

class StoreDepositMappingSchema(BaseModel):
    id: int
    facility_id: int
    external_deposit_code: str
    external_deposit_name: Optional[str] = None
    warehouse_id: int
    warehouse_name: Optional[str] = None
    warehouse_code: Optional[str] = None
    location_id: int
    location_name: Optional[str] = None
    location_code: Optional[str] = None
    affects_inventory: bool = True
    is_active: bool = True
    auto_discovered: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class StoreDepositMappingCreate(BaseModel):
    external_deposit_code: str
    external_deposit_name: Optional[str] = None
    warehouse_id: int
    location_id: int
    affects_inventory: bool = True

class StoreDepositMappingUpdate(BaseModel):
    external_deposit_name: Optional[str] = None
    warehouse_id: Optional[int] = None
    location_id: Optional[int] = None
    affects_inventory: Optional[bool] = None
    is_active: Optional[bool] = None

class FacilityDepositMappingResponse(BaseModel):
    facility_id: int
    facility_name: str
    mappings: List[StoreDepositMappingSchema]
    available_warehouses: List[WarehouseOptionSchema]
