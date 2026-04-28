from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from decimal import Decimal
from datetime import datetime

class SupplierBankBase(BaseModel):
    bank_name: str
    account_number: str
    currency_id: int
    swift_code: Optional[str] = None
    aba_code: Optional[str] = None

class SupplierBankCreate(SupplierBankBase):
    pass

class SupplierBankUpdate(BaseModel):
    id: Optional[int] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    currency_id: Optional[int] = None
    swift_code: Optional[str] = None
    aba_code: Optional[str] = None

class SupplierBankResponse(SupplierBankBase):
    id: int
    supplier_id: int
    model_config = ConfigDict(from_attributes=True)

class SupplierBase(BaseModel):
    name: str # Razón Social
    tax_id: str # RIF
    company_id: Optional[int] = None
    international_tax_id: Optional[str] = None # RUC / NIT
    commercial_name: Optional[str] = None
    fiscal_address: Optional[str] = None
    is_active: Optional[bool] = True

    currency_id: Optional[int] = None
    default_facility_id: Optional[int] = None
    credit_days: Optional[int] = 0
    credit_limit: Optional[Decimal] = Field(default=Decimal('0.0'), max_digits=19, decimal_places=4)
    early_payment_days: Optional[int] = 0
    early_payment_discount_pct: Optional[Decimal] = Field(default=Decimal('0.0'), max_digits=5, decimal_places=2)
    lead_time_days: Optional[int] = 0
    restock_coverage_days: Optional[int] = 0
    sales_analysis_days: Optional[int] = 0
    minimum_order_qty: Optional[Decimal] = Field(default=Decimal('0.0'), max_digits=19, decimal_places=4)

    commercial_contact_name: Optional[str] = None
    commercial_contact_phone: Optional[str] = None
    commercial_email: Optional[str] = None
    financial_contact_name: Optional[str] = None
    financial_contact_phone: Optional[str] = None
    financial_email: Optional[str] = None

class SupplierCreate(SupplierBase):
    banks: Optional[List[SupplierBankCreate]] = []

class SupplierUpdate(SupplierBase):
    name: Optional[str] = None
    tax_id: Optional[str] = None
    banks: Optional[List[SupplierBankUpdate]] = []

class SupplierResponse(SupplierBase):
    id: int
    banks: Optional[List[SupplierBankResponse]] = []
    model_config = ConfigDict(from_attributes=True)

class SupplierProductBase(BaseModel):
    supplier_id: int
    variant_id: int
    supplier_sku: Optional[str] = None
    pack_id: Optional[int] = None
    pack_name: Optional[str] = None
    currency_id: Optional[int] = None
    replacement_cost: Optional[Decimal] = Field(default=Decimal('0.0'), max_digits=19, decimal_places=4)
    min_order_qty: Optional[Decimal] = Field(default=Decimal('1.0'), max_digits=19, decimal_places=4)
    is_active: Optional[bool] = True
    is_primary: Optional[bool] = False

class SupplierProductCreate(SupplierProductBase):
    pass

class SupplierProductUpdate(BaseModel):
    supplier_sku: Optional[str] = None
    pack_id: Optional[int] = None
    currency_id: Optional[int] = None
    replacement_cost: Optional[Decimal] = None
    min_order_qty: Optional[Decimal] = None
    is_active: Optional[bool] = None
    is_primary: Optional[bool] = None

class SupplierProductResponse(SupplierProductBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

class SupplierPaginated(BaseModel):
    data: List[SupplierResponse]
    total: int
