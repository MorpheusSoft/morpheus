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
    old_replacement_cost: Decimal = Decimal('0.0')
    proposed_replacement_cost: Decimal = Decimal('0.0')
    old_price: Decimal = Decimal('0.0')
    proposed_price: Decimal = Decimal('0.0')
    action: str = 'IGNORE'
    clear_facility_prices: bool = False

class PricingSessionLineCreate(PricingSessionLineBase):
    pass

class PricingSessionLineUpdate(BaseModel):
    action: Optional[str] = None
    proposed_cost: Optional[Decimal] = None
    proposed_replacement_cost: Optional[Decimal] = None
    proposed_price: Optional[Decimal] = None
    clear_facility_prices: Optional[bool] = None

class BarcodeOut(BaseModel):
    barcode: str
    code_type: str
    model_config = ConfigDict(from_attributes=True)

class VariantBarcodesOut(BaseModel):
    id: int
    sku: str
    barcodes: List[BarcodeOut] = []
    model_config = ConfigDict(from_attributes=True)

class PricingSessionLineOut(PricingSessionLineBase):
    id: int
    session_id: int
    suggested_price: Optional[Decimal] = None
    suggested_margin: Optional[Decimal] = None
    current_margin: Optional[Decimal] = None
    variant: Optional[VariantBarcodesOut] = None
    
    model_config = ConfigDict(from_attributes=True)

# =======================
# PRICING SESSION
# =======================
class PricingSessionBase(BaseModel):
    name: str
    source_type: str = 'CSV_UPLOAD'
    target_cost_type: str = 'REPLACEMENT'
    status: str = 'DRAFT'
    update_type: str = 'BOTH'
    supplier_id: Optional[int] = None

class PricingSessionCreate(BaseModel):
    name: str
    source_type: str = 'CSV_UPLOAD'
    target_cost_type: str = 'REPLACEMENT'
    update_type: str = 'BOTH'
    supplier_id: Optional[int] = None
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

class MathRule(BaseModel):
    action: str = 'KEEP'  # KEEP, SET_FIXED, ADD_FIXED, ADD_PERCENTAGE
    base_target: str = 'CURRENT_VALUE' # CURRENT_VALUE, NEW_COST
    value: float = 0.0
    include_tax: bool = False

class BulkFilters(BaseModel):
    supplier_ids: Optional[List[int]] = []
    category_ids: Optional[List[int]] = []
    search_term: Optional[str] = None
    brands: Optional[List[str]] = []
    models: Optional[List[str]] = []
    attribute_key: Optional[str] = None
    attribute_value: Optional[str] = None

class PricingSessionBulkFilterRequest(BaseModel):
    filters: BulkFilters
    cost_rule: MathRule
    price_rule: MathRule
    clear_facility_prices: bool = False
