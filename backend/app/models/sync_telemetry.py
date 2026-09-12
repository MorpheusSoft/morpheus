from sqlalchemy import Column, Integer, BigInteger, String, Text, DateTime, ForeignKey, Numeric
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base_class import Base

class StoreSyncTelemetry(Base):
    __tablename__ = "store_sync_telemetry"
    __table_args__ = {"schema": "core"}

    id = Column(BigInteger, primary_key=True, index=True)
    facility_id = Column(Integer, ForeignKey("core.facilities.id"), nullable=False, index=True)
    register_code = Column(String(50), nullable=True, index=True)
    agent_version = Column(String(30), default="1.0.0")
    machine_name = Column(String(100), nullable=True)
    sql_server_status = Column(String(30), default="CONNECTED")
    last_stellar_sale_time = Column(DateTime(timezone=True), nullable=True)
    last_synced_sale_time = Column(DateTime(timezone=True), nullable=True)
    sales_today_count = Column(Integer, default=0)
    sales_today_amount = Column(Numeric(14, 4), default=0.0)
    pending_queue_count = Column(Integer, default=0)
    lag_minutes = Column(Integer, default=0)
    status = Column(String(30), default="HEALTHY", index=True) # HEALTHY, WARNING, CRITICAL, OFFLINE
    error_details = Column(Text, nullable=True)
    telemetry_metadata = Column(JSONB, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    facility = relationship("Facility", backref="sync_telemetries")
