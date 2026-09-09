from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Text, BigInteger
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base_class import Base

class DigitalWorker(Base):
    __tablename__ = "digital_workers"
    __table_args__ = {"schema": "core"}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("core.users.id", ondelete="CASCADE"), unique=True, nullable=False)
    agent_code = Column(String(50), unique=True, nullable=False, index=True)
    display_title = Column(String(100), nullable=False)
    operational_module = Column(String(50), nullable=False)
    system_prompt = Column(Text, nullable=False)
    model_name = Column(String(50), default="gemini-2.5-flash")
    is_autonomous_active = Column(Boolean, default=True)
    scan_interval_minutes = Column(Integer, default=60)
    channel_config = Column(JSONB, default=dict)
    guardrails_config = Column(JSONB, default=dict)
    last_scan_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", backref="digital_worker_profile")
    worker_skills = relationship("DigitalWorkerSkill", back_populates="worker", cascade="all, delete-orphan")
    actions = relationship("DigitalWorkerActionLog", back_populates="worker", cascade="all, delete-orphan")
    conversations = relationship("DigitalWorkerConversation", back_populates="worker", cascade="all, delete-orphan")

class DigitalSkill(Base):
    __tablename__ = "digital_skills"
    __table_args__ = {"schema": "core"}

    id = Column(Integer, primary_key=True, index=True)
    skill_code = Column(String(60), unique=True, nullable=False, index=True)
    operational_module = Column(String(50), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=False)
    execution_type = Column(String(20), default="NATIVE_CODE")
    handler_function = Column(String(100))
    declarative_prompt = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    worker_assignments = relationship("DigitalWorkerSkill", back_populates="skill", cascade="all, delete-orphan")

class DigitalWorkerSkill(Base):
    __tablename__ = "digital_worker_skills"
    __table_args__ = {"schema": "core"}

    id = Column(Integer, primary_key=True, index=True)
    worker_id = Column(Integer, ForeignKey("core.digital_workers.id", ondelete="CASCADE"), nullable=False)
    skill_id = Column(Integer, ForeignKey("core.digital_skills.id", ondelete="CASCADE"), nullable=False)
    is_enabled = Column(Boolean, default=True)
    parameters = Column(JSONB, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    worker = relationship("DigitalWorker", back_populates="worker_skills")
    skill = relationship("DigitalSkill", back_populates="worker_assignments")

class DigitalWorkerActionLog(Base):
    __tablename__ = "digital_worker_actions_log"
    __table_args__ = {"schema": "core"}

    id = Column(BigInteger, primary_key=True, index=True)
    worker_id = Column(Integer, ForeignKey("core.digital_workers.id", ondelete="CASCADE"), nullable=False)
    facility_id = Column(Integer, ForeignKey("core.facilities.id"), nullable=True)
    action_type = Column(String(60), nullable=False, index=True)
    target_entity_type = Column(String(50))
    target_entity_id = Column(String(50))
    severity = Column(String(20), default="INFO")
    summary = Column(Text, nullable=False)
    details = Column(JSONB)
    recipient_target = Column(String(100))
    status = Column(String(30), default="COMPLETED")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    worker = relationship("DigitalWorker", back_populates="actions")

class DigitalWorkerConversation(Base):
    __tablename__ = "digital_worker_conversations"
    __table_args__ = {"schema": "core"}

    id = Column(BigInteger, primary_key=True, index=True)
    worker_id = Column(Integer, ForeignKey("core.digital_workers.id", ondelete="CASCADE"), nullable=False)
    channel = Column(String(30), default="WHATSAPP")
    external_sender_id = Column(String(50), nullable=False, index=True)
    sender_user_id = Column(Integer, ForeignKey("core.users.id"), nullable=True)
    sender_supplier_id = Column(Integer, ForeignKey("core.suppliers.id"), nullable=True)
    is_authenticated = Column(Boolean, default=False)
    context_data = Column(JSONB, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    worker = relationship("DigitalWorker", back_populates="conversations")
    messages = relationship("DigitalWorkerMessage", back_populates="conversation", cascade="all, delete-orphan")

class DigitalWorkerMessage(Base):
    __tablename__ = "digital_worker_messages"
    __table_args__ = {"schema": "core"}

    id = Column(BigInteger, primary_key=True, index=True)
    conversation_id = Column(BigInteger, ForeignKey("core.digital_worker_conversations.id", ondelete="CASCADE"), nullable=False)
    sender_type = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    tool_calls = Column(JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    conversation = relationship("DigitalWorkerConversation", back_populates="messages")
