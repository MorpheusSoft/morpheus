from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Numeric, BigInteger, Boolean, Date, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from sqlalchemy.sql import func
from app.db.base_class import Base

from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB

class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"
    __table_args__ = {"schema": "pur"}
    
    id = Column(Integer, primary_key=True, index=True)
    reference = Column(String, unique=True)
    supplier_id = Column(Integer, ForeignKey("core.suppliers.id"))
    buyer_id = Column(Integer, ForeignKey("core.buyers.id"))
    dest_facility_id = Column(Integer, ForeignKey("core.facilities.id"))
    status = Column(String, default='draft') # draft, approved, sent, viewed, confirmed, received
    total_amount = Column(Numeric(19, 4), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    secure_token = Column(String, unique=True, index=True, default=lambda: str(uuid.uuid4()))
    supplier_viewed_at = Column(DateTime(timezone=True), nullable=True)
    
    public_token = Column(PG_UUID(as_uuid=True), unique=True, default=uuid.uuid4)
    seen_by_supplier_at = Column(DateTime(timezone=True), nullable=True)
    accepted_by_supplier_at = Column(DateTime(timezone=True), nullable=True)
    supplier_ip_accepted = Column(String(45), nullable=True)
    
    # Financial Negotiations & Legal Rules (Phase 6.7)
    invoice_discount_str = Column(String) # Ej: "10+5"
    condition_discount_str = Column(String) # Ej: "2"
    notes = Column(Text)
    expiration_date = Column(Date, nullable=True)
    allow_partial_deliveries = Column(Boolean, default=False)
    currency_id = Column(Integer, ForeignKey("core.currencies.id"), nullable=True)
    exchange_rate = Column(Numeric(18, 6), default=1.0)
    
    # Phase 8: Conciliation & 3-Way Match
    invoice_number = Column(String)
    invoice_date = Column(Date)
    conciliated_by_id = Column(Integer, ForeignKey("core.users.id"))
    conciliated_at = Column(DateTime(timezone=True))
    reconciliation_status = Column(String, default="PENDING")  # PENDING, MATCH_EXACT, MATCH_WITH_DEBIT_NOTE, REJECTED
    debit_note_number = Column(String, nullable=True)
    debit_note_amount = Column(Numeric(19, 4), default=0)
    reconciliation_notes = Column(Text, nullable=True)
    
    # Phase 1 Digital Worker Extension
    invoice_documents = Column(JSONB, default=list)
    ocr_extracted_payload = Column(JSONB, default=dict)
    reconciliation_mode = Column(String(30), default='AUTO')
    reconciled_by_worker_id = Column(Integer, ForeignKey("core.digital_workers.id"), nullable=True)

    # Phase 2 Digital Worker Extension: CENDI & Multi-Store Consolidation
    consolidation_mode = Column(String(30), default='DIRECT_STORE')  # DIRECT_STORE, CONSOLIDATED_CD
    target_cd_facility_id = Column(Integer, ForeignKey("core.facilities.id"), nullable=True)
    distribution_breakdown = Column(JSONB, default=list)
    
    supplier = relationship("Supplier")
    dest_facility = relationship("Facility", foreign_keys=[dest_facility_id])
    target_cd_facility = relationship("Facility", foreign_keys=[target_cd_facility_id])
    lines = relationship("PurchaseOrderLine", back_populates="order")

class PurchaseOrderLine(Base):
    __tablename__ = "purchase_order_lines"
    __table_args__ = {"schema": "pur"}
    
    id = Column(BigInteger, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("pur.purchase_orders.id"))
    variant_id = Column(Integer, ForeignKey("inv.product_variants.id"))
    pack_id = Column(Integer, ForeignKey("inv.product_packagings.id"))
    qty_ordered = Column(Numeric(19, 4), nullable=False)
    expected_base_qty = Column(Numeric(19, 4), nullable=False)
    unit_cost = Column(Numeric(19, 4), nullable=False)
    
    # Negotiation and Backorders (Phase 6.7)
    line_discount_str = Column(String) # Ej: "15"
    received_base_qty = Column(Numeric(19, 4), default=0) # Trazabilidad Logística de Almacén
    
    # Phase 8: Conciliation
    billed_qty = Column(Numeric(19, 4))
    billed_unit_cost = Column(Numeric(19, 4))
    
    order = relationship("PurchaseOrder", back_populates="lines")


class SupplierProduct(Base):
    __tablename__ = "supplier_products"
    __table_args__ = {"schema": "pur"}
    
    id = Column(Integer, primary_key=True, index=True)
    supplier_id = Column(Integer, ForeignKey("core.suppliers.id"))
    variant_id = Column(Integer, ForeignKey("inv.product_variants.id"))
    supplier_sku = Column(String)
    
    # Equivalencia de Embalaje Logístico
    pack_id = Column(Integer, ForeignKey("inv.product_packagings.id"), nullable=True) 
    
    # Precios y Moneda
    currency_id = Column(Integer, ForeignKey("core.currencies.id"))
    replacement_cost = Column(Numeric(19, 4), default=0)
    min_order_qty = Column(Numeric(19, 4), default=1)
    is_active = Column(Boolean, default=True)
    is_primary = Column(Boolean, default=False)
    
    # Phase 1: Reorder Blocking for Dead Stock / Negative Margin
    is_reorder_blocked = Column(Boolean, default=False)
    block_reason = Column(String(255), nullable=True)
    blocked_at = Column(DateTime(timezone=True), nullable=True)
    blocked_by_worker_id = Column(Integer, ForeignKey("core.digital_workers.id"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class MRPBotLog(Base):
    __tablename__ = "mrp_bot_logs"
    __table_args__ = {"schema": "pur"}
    
    id = Column(Integer, primary_key=True, index=True)
    executed_at = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String(50)) # 'success', 'failed'
    orders_generated = Column(Integer, default=0)
    items_evaluated = Column(Integer, default=0)
    details = Column(Text) # JSON string containing details of what was bought and omitted

class SellOutAgreement(Base):
    __tablename__ = "sell_out_agreements"
    __table_args__ = {"schema": "pur"}

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    title = Column(String(200), nullable=False)
    supplier_id = Column(Integer, ForeignKey("core.suppliers.id"), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    status = Column(String(30), default="DRAFT", index=True) # DRAFT, ACTIVE, SETTLED, CONCILIATED, CANCELLED
    total_claim_amount = Column(Numeric(19, 4), default=0.0)
    settled_at = Column(DateTime(timezone=True), nullable=True)
    settled_by_worker_id = Column(Integer, ForeignKey("core.digital_workers.id"), nullable=True)
    credit_note_number = Column(String(80), nullable=True)
    credit_note_date = Column(Date, nullable=True)
    credit_note_amount = Column(Numeric(19, 4), default=0.0)
    conciliation_status = Column(String(30), default="PENDING") # PENDING, MATCH_EXACT, DISCREPANCY, REJECTED
    conciliation_notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    supplier = relationship("Supplier")
    lines = relationship("SellOutAgreementLine", back_populates="agreement", cascade="all, delete-orphan")

class SellOutAgreementLine(Base):
    __tablename__ = "sell_out_agreement_lines"
    __table_args__ = {"schema": "pur"}

    id = Column(BigInteger, primary_key=True, index=True)
    agreement_id = Column(Integer, ForeignKey("pur.sell_out_agreements.id", ondelete="CASCADE"), nullable=False)
    variant_id = Column(Integer, ForeignKey("inv.product_variants.id"), nullable=False)
    regular_price = Column(Numeric(19, 4), nullable=False, default=0.0)
    promo_price = Column(Numeric(19, 4), nullable=False, default=0.0)
    discount_per_unit = Column(Numeric(19, 4), nullable=False, default=0.0)
    provider_share_pct = Column(Numeric(5, 2), default=100.0)
    provider_share_fixed = Column(Numeric(19, 4), default=0.0)
    units_sold_qty = Column(Numeric(19, 4), default=0.0)
    claim_amount = Column(Numeric(19, 4), default=0.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    agreement = relationship("SellOutAgreement", back_populates="lines")
    variant = relationship("ProductVariant")

# Ensure cross-schema relations resolve properly
from app.models import inventory  # noqa: F401


