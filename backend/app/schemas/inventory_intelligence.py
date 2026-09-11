from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List, Dict, Any
from decimal import Decimal
from datetime import datetime, date

class DeadStockItem(BaseModel):
    variant_id: int
    product_id: int
    sku: str
    product_name: str
    barcode: Optional[str] = None
    category_name: Optional[str] = None
    brand: Optional[str] = None
    qty_on_hand: Decimal
    stock_valuation_usd: Decimal
    days_without_sales: int
    last_sale_date: Optional[date] = None
    dead_stock_status: str # HEALTHY, SLOW_MOVING, DEAD_STOCK
    is_blocked_for_purchasing: bool
    purchasing_blocked_reason: Optional[str] = None
    clara_recommended_action: str

class DeadStockSummary(BaseModel):
    total_dead_stock_items: int
    total_slow_moving_items: int
    total_capital_immobilized_usd: Decimal
    items_blocked_for_reorder: int
    items: List[DeadStockItem]

class ShrinkageItem(BaseModel):
    variant_id: int
    sku: str
    product_name: str
    sales_price: Decimal
    replacement_cost: Decimal
    gross_margin_pct: Decimal
    units_sold: Decimal
    units_shrinkage: Decimal
    shrinkage_cost_usd: Decimal
    shrinkage_pct: Decimal
    net_real_margin_pct: Decimal
    profitability_status: str # HEALTHY, AT_RISK, NEGATIVE_MARGIN
    is_blocked_for_purchasing: bool
    clara_verdict: str

class ShrinkageSummary(BaseModel):
    total_skus_evaluated: int
    skus_at_risk: int
    total_shrinkage_loss_usd: Decimal
    average_shrinkage_pct: Decimal
    items: List[ShrinkageItem]

class TogglePurchasingBlockRequest(BaseModel):
    is_blocked: bool
    reason: Optional[str] = None

class ScheduledReportCreate(BaseModel):
    report_type: str
    name: str
    frequency: str = "MONTHLY"
    format: str = "XLSX"
    recipient_emails: List[str] = []
    filters: Dict[str, Any] = {}

class ScheduledReportResponse(BaseModel):
    id: int
    report_type: str
    name: str
    frequency: str
    format: str
    recipient_emails: List[str] = []
    filters: Dict[str, Any] = {}
    last_generated_at: Optional[datetime] = None
    last_file_path: Optional[str] = None
    is_active: bool
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
