from typing import Optional, List
from pydantic import BaseModel
from decimal import Decimal

class MRPSimulatorLine(BaseModel):
    variant_id: int
    product_id: int
    sku: str
    product_name: str
    supplier_id: int
    supplier_name: str
    supplier_default_facility_id: Optional[int] = None
    uom_base: str = 'PZA'
    
    # MRP Core Variables
    run_rate: Decimal
    safety_stock: Decimal
    current_stock: Decimal
    lead_time: int
    
    # Financial & Logistics
    replacement_cost: Decimal
    pack_id: Optional[int] = None
    pack_name: Optional[str] = None
    qty_per_pack: Decimal = 1.0
    moq: Decimal = 1.0
    
    # Mathematical Result
    suggested_qty: Decimal
    suggested_base_qty: Decimal
    
    class Config:
        from_attributes = True

class MRPSyncValues(BaseModel):
    variant_id: int
    facility_id: int
    run_rate: Decimal
    safety_stock: Decimal

class GenerateOrdersRequest(BaseModel):
    lines: List[MRPSimulatorLine]
    facility_id: int
    buyer_id: int
