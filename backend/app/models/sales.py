from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Numeric, Enum as SQLEnum, BigInteger, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base_class import Base
import enum

class DocumentType(str, enum.Enum):
    BUDGET = "BUDGET"
    ORDER = "ORDER"
    DELIVERY_NOTE = "DELIVERY_NOTE"
    INVOICE = "INVOICE"
    CREDIT_NOTE = "CREDIT_NOTE"
    DEBIT_NOTE = "DEBIT_NOTE"

class DocumentState(str, enum.Enum):
    DRAFT = "DRAFT"
    CONFIRMED = "CONFIRMED"
    PAID = "PAID"
    CANCELLED = "CANCELLED"

class Customer(Base):
    __tablename__ = "customers"
    __table_args__ = {"schema": "sales"}
    
    id = Column(Integer, primary_key=True, index=True)
    rif = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, index=True, nullable=False)
    address = Column(Text)
    shipping_address = Column(Text)
    phone = Column(String)
    email = Column(String, index=True)
    is_active = Column(Boolean, default=True)
    approval_status = Column(String, default='PENDING_APPROVAL') # PENDING_APPROVAL, APPROVED, REJECTED
    wholesaler_tier_id = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relaciones
    documents = relationship("Document", back_populates="customer")

class Document(Base):
    __tablename__ = "documents"
    __table_args__ = {"schema": "sales"}
    
    id = Column(BigInteger, primary_key=True, index=True)
    document_number = Column(String, unique=True, index=True, nullable=False) # Ej: FAC-001
    
    # Metadatos Fiscales
    fiscal_number = Column(String, index=True, nullable=True)
    fiscal_serial = Column(String, nullable=True)
    fiscal_serie = Column(String, nullable=True)
    
    # Comportamiento
    type = Column(SQLEnum(DocumentType), nullable=False, index=True)
    state = Column(SQLEnum(DocumentState), default=DocumentState.DRAFT, index=True)
    
    # Trazabilidad
    parent_id = Column(BigInteger, ForeignKey("sales.documents.id"), nullable=True)
    
    # Relaciones base
    customer_id = Column(Integer, ForeignKey("sales.customers.id"), nullable=False)
    facility_id = Column(Integer, ForeignKey("core.facilities.id"), nullable=False)
    currency_id = Column(Integer, ForeignKey("core.currencies.id"), nullable=False)
    
    # Snapshots (Para soportar clientes de contado del POS sin ensuciar la BD)
    customer_name_snap = Column(String, nullable=True)
    customer_tax_snap = Column(String, nullable=True)
    customer_addr_snap = Column(Text, nullable=True)
    
    # Financiero
    exchange_rate = Column(Numeric(14, 4), nullable=False, default=1.0)
    subtotal = Column(Numeric(14, 4), nullable=False, default=0.0)
    tax_amount = Column(Numeric(14, 4), nullable=False, default=0.0)
    total_amount = Column(Numeric(14, 4), nullable=False, default=0.0)
    is_web_order = Column(Boolean, default=False)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relaciones
    customer = relationship("Customer", back_populates="documents")
    lines = relationship("DocumentLine", back_populates="document", cascade="all, delete-orphan")
    parent = relationship("Document", remote_side=[id])

class DocumentLine(Base):
    __tablename__ = "document_lines"
    __table_args__ = {"schema": "sales"}
    
    id = Column(BigInteger, primary_key=True, index=True)
    document_id = Column(BigInteger, ForeignKey("sales.documents.id"), nullable=False, index=True)
    origin_line_id = Column(BigInteger, ForeignKey("sales.document_lines.id"), nullable=True)
    
    # Relación con el SKU
    variant_id = Column(Integer, ForeignKey("inv.product_variants.id"), nullable=False)
    
    # Cantidades y montos
    quantity = Column(Numeric(14, 4), nullable=False, default=1.0)
    unit_price = Column(Numeric(14, 4), nullable=False, default=0.0)
    tax_pct = Column(Numeric(5, 2), nullable=False, default=0.0)
    line_total = Column(Numeric(14, 4), nullable=False, default=0.0)
    
    # Relaciones
    document = relationship("Document", back_populates="lines")
    origin_line = relationship("DocumentLine", remote_side=[id])
