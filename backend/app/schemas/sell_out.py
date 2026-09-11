from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List, Dict, Any
from decimal import Decimal
from datetime import date, datetime

class SellOutAgreementLineBase(BaseModel):
    variant_id: int
    regular_price: Decimal = Field(default=Decimal('0.0'), max_digits=19, decimal_places=4)
    promo_price: Decimal = Field(default=Decimal('0.0'), max_digits=19, decimal_places=4)
    discount_per_unit: Decimal = Field(default=Decimal('0.0'), max_digits=19, decimal_places=4)
    provider_share_pct: Decimal = Field(default=Decimal('100.0'), max_digits=5, decimal_places=2)
    provider_share_fixed: Decimal = Field(default=Decimal('0.0'), max_digits=19, decimal_places=4)

class SellOutAgreementLineCreate(SellOutAgreementLineBase):
    pass

class SellOutAgreementLineResponse(SellOutAgreementLineBase):
    id: int
    agreement_id: int
    units_sold_qty: Decimal = Decimal('0.0')
    claim_amount: Decimal = Decimal('0.0')
    created_at: Optional[datetime] = None
    
    # Enriched fields
    sku: Optional[str] = None
    product_name: Optional[str] = None
    barcode: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class SellOutAgreementBase(BaseModel):
    title: str
    supplier_id: int
    start_date: date
    end_date: date

class SellOutAgreementCreate(SellOutAgreementBase):
    code: Optional[str] = None
    lines: List[SellOutAgreementLineCreate] = []

class SellOutAgreementUpdate(BaseModel):
    title: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[str] = None

class SellOutAgreementResponse(SellOutAgreementBase):
    id: int
    code: str
    status: str
    total_claim_amount: Decimal = Decimal('0.0')
    settled_at: Optional[datetime] = None
    settled_by_worker_id: Optional[int] = None
    credit_note_number: Optional[str] = None
    credit_note_date: Optional[date] = None
    credit_note_amount: Decimal = Decimal('0.0')
    conciliation_status: str = "PENDING"
    conciliation_notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    supplier_name: Optional[str] = None
    lines: List[SellOutAgreementLineResponse] = []

    model_config = ConfigDict(from_attributes=True)

class SellOutAgreementPaginated(BaseModel):
    data: List[SellOutAgreementResponse]
    total: int

class SettleSellOutResponse(BaseModel):
    ok: bool
    agreement_id: int
    agreement_code: str
    total_units_sold: Decimal
    total_claim_amount: Decimal
    lines_settled: int
    settled_at: datetime
    message: str

class ConciliateCreditNoteRequest(BaseModel):
    credit_note_number: str
    credit_note_amount: Decimal
    credit_note_date: date
    notes: Optional[str] = None

class ConciliateCreditNoteResponse(BaseModel):
    ok: bool
    agreement_id: int
    conciliation_status: str # MATCH_EXACT, DISCREPANCY, REJECTED
    discrepancy_amount: Decimal = Decimal('0.0')
    message: str
