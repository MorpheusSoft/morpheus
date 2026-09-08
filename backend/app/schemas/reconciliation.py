from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date
from decimal import Decimal

class ReconciliationLineIn(BaseModel):
    id: int
    billed_qty: Decimal
    billed_unit_cost: Decimal
    new_sales_price: Optional[Decimal] = None

class ReconciliationLineOut(BaseModel):
    id: int
    variant_id: int
    sku: str
    product_name: str
    uom_base: str
    pack_name: Optional[str] = "Und. Base"
    qty_per_pack: Decimal = Decimal(1)
    qty_ordered: Decimal
    expected_base_qty: Decimal
    unit_cost: Decimal
    line_ordered_subtotal: Decimal
    received_base_qty: Decimal
    line_received_subtotal: Decimal
    billed_qty: Optional[Decimal] = None
    billed_unit_cost: Optional[Decimal] = None
    line_billed_subtotal: Optional[Decimal] = None
    qty_variance: Decimal = Decimal(0)
    cost_variance: Decimal = Decimal(0)
    line_discrepancy_amount: Decimal = Decimal(0)
    line_status: str = "EXACT_MATCH"  # EXACT_MATCH, QTY_DISCREPANCY, PRICE_DISCREPANCY, DOUBLE_DISCREPANCY
    current_sales_price: Decimal = Decimal(0)
    current_margin_pct: Decimal = Decimal(0)
    new_margin_pct: Decimal = Decimal(0)

class ReconciliationOrderDetail(BaseModel):
    id: int
    reference: str
    status: str
    reconciliation_status: str
    created_at: datetime
    dest_facility_id: Optional[int] = None
    dest_facility_name: Optional[str] = "N/A"
    supplier_id: int
    supplier_name: str
    supplier_tax_id: Optional[str] = "N/A"
    supplier_phone: Optional[str] = "N/A"
    supplier_email: Optional[str] = "N/A"
    currency_id: Optional[int] = None
    currency_code: str = "USD"
    currency_symbol: str = "$"
    exchange_rate: Decimal = Decimal(1)
    invoice_number: Optional[str] = None
    invoice_date: Optional[date] = None
    conciliated_at: Optional[datetime] = None
    conciliated_by_name: Optional[str] = None
    debit_note_number: Optional[str] = None
    debit_note_amount: Decimal = Decimal(0)
    reconciliation_notes: Optional[str] = None
    total_ordered_amount: Decimal
    total_received_amount: Decimal
    total_billed_amount: Optional[Decimal] = None
    total_debit_note_suggested: Decimal = Decimal(0)
    net_payable_suggested: Decimal = Decimal(0)
    lines: List[ReconciliationLineOut]

class ReconciliationOrderListItem(BaseModel):
    id: int
    reference: str
    created_at: datetime
    supplier_id: int
    supplier_name: str
    supplier_tax_id: Optional[str] = None
    dest_facility_name: Optional[str] = None
    currency_code: str = "USD"
    currency_symbol: str = "$"
    exchange_rate: Decimal = Decimal(1)
    status: str
    reconciliation_status: str
    total_ordered: Decimal
    total_received: Decimal
    items_count: int
    invoice_number: Optional[str] = None
    invoice_date: Optional[date] = None
    debit_note_number: Optional[str] = None
    debit_note_amount: Decimal = Decimal(0)
    conciliated_at: Optional[datetime] = None

class ReconciliationProcessPayload(BaseModel):
    invoice_number: str
    invoice_date: date
    action: str = "EXACT_MATCH"  # EXACT_MATCH, APPROVE_WITH_DEBIT_NOTE, REJECT
    debit_note_reason: Optional[str] = None
    lines: List[ReconciliationLineIn]

class ReconciliationProcessResponse(BaseModel):
    status: str
    order_id: int
    order_reference: str
    invoice_number: str
    reconciliation_status: str
    debit_note_number: Optional[str] = None
    debit_note_amount: Decimal = Decimal(0)
    total_invoiced: Decimal = Decimal(0)
    total_net_payable: Decimal = Decimal(0)
    message: str

class ReconciliationKPIs(BaseModel):
    pending_count: int
    pending_amount_usd: Decimal
    pending_amount_ves: Decimal
    conciliated_count: int
    conciliated_amount_usd: Decimal
    debit_notes_count: int
    debit_notes_amount_usd: Decimal
    debit_notes_amount_ves: Decimal
