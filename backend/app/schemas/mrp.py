from typing import Optional, List
from datetime import datetime
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
    uom_base: str = 'UND'
    
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

class MRPBotLogResponse(BaseModel):
    id: int
    executed_at: datetime
    status: str
    orders_generated: int
    items_evaluated: int
    details: Optional[str] = None

    class Config:
        from_attributes = True

class MRPSupplierDiagnosisItem(BaseModel):
    variant_id: int
    sku: str
    product_name: str
    facility_id: int
    facility_name: str
    stock_qty: float
    transit_qty: float
    available_qty: float
    run_rate: float
    days_of_stock: float
    critical_threshold: float
    urgency: str  # 'CRITICAL', 'WARNING', 'HEALTHY'
    boxes_needed: int
    suggested_base_qty: float
    pack_name: Optional[str] = None
    qty_per_pack: float = 1.0
    moq: float = 1.0
    unit_cost: float
    estimated_subtotal: float

class MRPSupplierDiagnosis(BaseModel):
    supplier_id: int
    supplier_name: str
    lead_time_days: int
    urgency: str  # 'CRITICAL', 'WARNING', 'HEALTHY'
    total_skus: int
    skus_in_breach: int
    critical_skus_count: int
    warning_skus_count: int
    estimated_total_cost: float
    existing_draft_po_id: Optional[int] = None
    existing_draft_po_reference: Optional[str] = None
    items: List[MRPSupplierDiagnosisItem] = []

class MRPDiagnosisSummary(BaseModel):
    evaluated_at: datetime
    total_suppliers_evaluated: int
    critical_suppliers_count: int
    warning_suppliers_count: int
    healthy_suppliers_count: int
    total_capital_required: float
    suppliers: List[MRPSupplierDiagnosis] = []

class GenerateSupplierOrderRequest(BaseModel):
    supplier_id: int
    facility_id: int
    buyer_id: Optional[int] = None
    notes: Optional[str] = None

class GenerateSupplierOrderResponse(BaseModel):
    success: bool
    message: str
    order_id: int
    order_reference: str
    supplier_name: str
    facility_name: str
    total_amount: float
    lines_count: int

class StoreBreakdownItem(BaseModel):
    facility_id: int
    facility_name: str
    facility_code: str
    qty_needed: float
    boxes_needed: int
    subtotal: float
    urgency: Optional[str] = None

class VariantDistributionBreakdown(BaseModel):
    variant_id: int
    sku: str
    product_name: str
    total_qty: float
    unit_cost: float
    total_subtotal: float
    stores: List[StoreBreakdownItem] = []

class SupplierStrategyResponse(BaseModel):
    supplier_id: int
    supplier_name: str
    total_orders_analyzed: int
    cendi_orders_count: int
    store_orders_count: int
    cendi_percentage: float
    store_percentage: float
    pattern: str  # 'PREDOMINANT_CENDI' | 'PREDOMINANT_STORES' | 'DISPARITY_DETECTED'
    recommendation: str
    requires_human_decision: bool
    suggested_cendi_id: Optional[int] = None
    suggested_cendi_name: Optional[str] = None

class GenerateCendiOrderRequest(BaseModel):
    supplier_id: int
    cendi_facility_id: Optional[int] = None
    buyer_id: Optional[int] = None
    notes: Optional[str] = None

class GenerateCendiOrderResponse(BaseModel):
    success: bool
    message: str
    order_id: int
    order_reference: str
    supplier_name: str
    cendi_facility_name: str
    total_amount: float
    lines_count: int
    stores_count: int
    distribution_breakdown: List[dict] = []



