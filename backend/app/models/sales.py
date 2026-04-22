from sqlalchemy import Boolean, Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from app.db.base_class import Base

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
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # relationships can be added here if needed like orders = relationship("Order", back_populates="customer")

class Order(Base):
    __tablename__ = "orders"
    __table_args__ = {"schema": "sales"}
    
    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, index=True, nullable=False) # ForeignKey omitted for simplicity or could be added
    status = Column(String(50), default="PENDING", index=True) # PENDING, INVOICED, CANCELLED
    total_amount = Column(Integer, default=0) # e.g stored as cents or handle as Float/Numeric depending on db dialect
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
class OrderItem(Base):
    __tablename__ = "order_items"
    __table_args__ = {"schema": "sales"}
    
    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, index=True, nullable=False)
    product_id = Column(Integer, index=True, nullable=False) # Maps to ProductVariant
    quantity = Column(Integer, nullable=False, default=1)
    unit_price = Column(Integer, nullable=False, default=0)
    subtotal = Column(Integer, nullable=False, default=0)
