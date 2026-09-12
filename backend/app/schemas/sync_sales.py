from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
from datetime import datetime
from decimal import Decimal

class SalesBatchLineIn(BaseModel):
    sku_code: str
    quantity: float
    unit_price: float
    subtotal: float = 0.0
    tax_amount: float = 0.0
    total: float
    deposit_code: str = "01"
    description: Optional[str] = None

class SalesBatchDocumentIn(BaseModel):
    facility_id: Optional[int] = 1
    facility_code: Optional[str] = None
    register_code: str = "01"
    document_number: str
    doc_type: str = "FAC" # FAC, TCK, DEV, NC
    doc_date: str # ISO or 'YYYY-MM-DD HH:MM:SS'
    customer_tax_id: Optional[str] = "J-000000000"
    customer_name: Optional[str] = "Cliente Contado"
    subtotal: float
    tax_amount: float
    total_amount: float
    fiscal_number: Optional[str] = None
    fiscal_serial: Optional[str] = None
    lines: List[SalesBatchLineIn] = Field(default_factory=list)

class SalesBatchPayloadIn(BaseModel):
    is_historical: bool = False
    documents: List[SalesBatchDocumentIn]

class StoreSyncTelemetryIn(BaseModel):
    facility_id: int
    register_code: Optional[str] = "01"
    agent_version: Optional[str] = "1.0.0"
    machine_name: Optional[str] = None
    sql_server_status: Optional[str] = "CONNECTED"
    last_stellar_sale_time: Optional[datetime] = None
    last_synced_sale_time: Optional[datetime] = None
    sales_today_count: Optional[int] = 0
    sales_today_amount: Optional[float] = 0.0
    pending_queue_count: Optional[int] = 0
    lag_minutes: Optional[int] = 0
    status: Optional[str] = "HEALTHY"
    error_details: Optional[str] = None
    telemetry_metadata: Optional[Dict[str, Any]] = None

class StoreSyncTelemetryOut(BaseModel):
    id: int
    facility_id: int
    register_code: Optional[str]
    status: str
    lag_minutes: int
    sales_today_count: int
    sales_today_amount: float
    last_stellar_sale_time: Optional[datetime]
    last_synced_sale_time: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True
