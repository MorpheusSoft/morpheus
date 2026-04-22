from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Numeric, BigInteger, Boolean, Date, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
from sqlalchemy.sql import func
from app.db.base_class import Base

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
    
    supplier = relationship("Supplier")
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
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
