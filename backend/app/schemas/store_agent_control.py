from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime

class StoreAgentConfigSchema(BaseModel):
    facility_id: int
    config_version: int
    sales_interval_minutes: int
    sales_batch_size: int
    heartbeat_interval_seconds: int
    sales_enabled: bool
    products_enabled: bool
    barcodes_enabled: bool
    categories_enabled: bool
    suppliers_enabled: bool
    supplier_products_enabled: bool
    movements_enabled: bool
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class StoreAgentConfigUpdateSchema(BaseModel):
    sales_interval_minutes: Optional[int] = None
    sales_batch_size: Optional[int] = None
    heartbeat_interval_seconds: Optional[int] = None
    sales_enabled: Optional[bool] = None
    products_enabled: Optional[bool] = None
    barcodes_enabled: Optional[bool] = None
    categories_enabled: Optional[bool] = None
    suppliers_enabled: Optional[bool] = None
    supplier_products_enabled: Optional[bool] = None
    movements_enabled: Optional[bool] = None

class StoreAgentCommandCreateSchema(BaseModel):
    command_type: str # FORCE_SYNC_SALES, FORCE_SYNC_MASTERS, SYNC_HISTORICAL, RESTART_SERVICE
    parameters: Optional[Dict[str, Any]] = None

class StoreAgentCommandSchema(BaseModel):
    id: int
    facility_id: int
    command_type: str
    parameters: Optional[Dict[str, Any]] = None
    status: str
    result_details: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    created_at: datetime
    sent_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class CommandAckSchema(BaseModel):
    status: str # RUNNING, COMPLETED, FAILED
    result_details: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None

class FacilityAgentStatusSchema(BaseModel):
    facility_id: int
    facility_name: str
    facility_code: str
    is_online: bool
    last_heartbeat: Optional[datetime] = None
    agent_version: Optional[str] = None
    sql_server_status: Optional[str] = None
    sales_today_count: Optional[int] = 0
    sales_today_amount: Optional[float] = 0.0
    lag_minutes: Optional[int] = 0
    config: Optional[StoreAgentConfigSchema] = None
    pending_commands_count: int = 0
