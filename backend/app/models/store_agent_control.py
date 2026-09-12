from sqlalchemy import Column, Integer, BigInteger, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db.base_class import Base

class StoreAgentConfig(Base):
    __tablename__ = "store_agent_configs"
    __table_args__ = {"schema": "core"}

    facility_id = Column(Integer, ForeignKey("core.facilities.id"), primary_key=True)
    config_version = Column(Integer, nullable=False, default=1)
    sales_interval_minutes = Column(Integer, nullable=False, default=5)
    sales_batch_size = Column(Integer, nullable=False, default=500)
    heartbeat_interval_seconds = Column(Integer, nullable=False, default=60)
    sales_enabled = Column(Boolean, nullable=False, default=True)
    products_enabled = Column(Boolean, nullable=False, default=True)
    barcodes_enabled = Column(Boolean, nullable=False, default=True)
    categories_enabled = Column(Boolean, nullable=False, default=True)
    suppliers_enabled = Column(Boolean, nullable=False, default=True)
    supplier_products_enabled = Column(Boolean, nullable=False, default=True)
    movements_enabled = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    facility = relationship("Facility")

class StoreAgentCommand(Base):
    __tablename__ = "store_agent_commands"
    __table_args__ = {"schema": "core"}

    id = Column(BigInteger, primary_key=True, index=True)
    facility_id = Column(Integer, ForeignKey("core.facilities.id"), nullable=False, index=True)
    command_type = Column(String(50), nullable=False)
    parameters = Column(JSONB, default=dict)
    status = Column(String(30), nullable=False, default='PENDING', index=True) # PENDING, SENT, RUNNING, COMPLETED, FAILED
    result_details = Column(JSONB, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    facility = relationship("Facility")
