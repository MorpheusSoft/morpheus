from sqlalchemy import Boolean, Column, Integer, String, ForeignKey, DateTime, Text, Numeric, BigInteger, Date
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.db.base_class import Base

# =================
# PHYSICAL
# =================
class Warehouse(Base):
    __tablename__ = "warehouses"
    __table_args__ = {"schema": "inv"}
    
    id = Column(Integer, primary_key=True, index=True)
    facility_id = Column(Integer, ForeignKey("core.facilities.id"))
    name = Column(String, nullable=False)
    code = Column(String, unique=True, nullable=False)
    is_scrap = Column(Boolean, default=False)
    is_transit = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Location(Base):
    __tablename__ = "locations"
    __table_args__ = {"schema": "inv"}
    
    id = Column(Integer, primary_key=True, index=True)
    warehouse_id = Column(Integer, ForeignKey("inv.warehouses.id"))
    parent_id = Column(Integer, ForeignKey("inv.locations.id"))
    name = Column(String, nullable=False)
    code = Column(String, nullable=False)
    barcode = Column(String, unique=True)
    location_type = Column(String, default='SHELF')
    usage = Column(String, default='INTERNAL')
    is_blocked = Column(Boolean, default=False)
    capacity_volume = Column(Numeric(12, 4), default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

# =================
# MASTER DATA
# =================
class Category(Base):
    __tablename__ = "categories"
    __table_args__ = {"schema": "inv"}
    
    id = Column(Integer, primary_key=True, index=True)
    parent_id = Column(Integer, ForeignKey("inv.categories.id"))
    name = Column(String, nullable=False)
    slug = Column(String, unique=True)
    is_liquor = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    path = Column(String)

class Product(Base):
    __tablename__ = "products"
    __table_args__ = {"schema": "inv"}
    
    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("inv.categories.id"))
    currency_id = Column(Integer, ForeignKey("core.currencies.id"))
    tax_id = Column(Integer, ForeignKey("core.tributes.id"))
    name = Column(String, nullable=False)
    brand = Column(String)
    model = Column(String)
    description = Column(Text)
    
    # Multimedia / Technical
    image_main = Column(String)
    datasheet = Column(String)
    
    product_type = Column(String, default='STOCKED', nullable=False)
    uom_base = Column(String, default='PZA', nullable=False)
    shrinkage_percent = Column(Numeric(5, 2), default=0)
    is_liquor = Column(Boolean, default=False)
    has_variants = Column(Boolean, default=False)
    track_batches = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    origin = Column(String, default='NACIONAL')
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    variants = relationship("ProductVariant", back_populates="product")
    packagings = relationship("ProductPackaging", backref="product", cascade="all, delete-orphan")

class ProductVariant(Base):
    __tablename__ = "product_variants"
    __table_args__ = {"schema": "inv"}
    
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("inv.products.id"))
    sku = Column(String, unique=True, nullable=False, index=True)
    currency_id = Column(Integer, ForeignKey("core.currencies.id")) # New field
    # Technical & Commercial
    part_number = Column(String, index=True)
    barcode = Column(String)
    image = Column(String)
    attributes = Column(JSONB)
    
    # Costs
    costing_method = Column(String, default='AVERAGE')
    standard_cost = Column(Numeric(19, 4), default=0)
    average_cost = Column(Numeric(19, 4), default=0)
    last_cost = Column(Numeric(19, 4), default=0)
    replacement_cost = Column(Numeric(19, 4), default=0)
    
    # Sales
    sales_price = Column(Numeric(19, 4), default=0)
    is_published = Column(Boolean, default=False)
    
    # Audit Trace for Price Changes (Margin Protection)
    last_price_updated_by_id = Column(Integer, ForeignKey("core.users.id"))
    last_price_updated_at = Column(DateTime(timezone=True))
    
    weight = Column(Numeric(12, 4), default=0)
    is_active = Column(Boolean, default=True)
    
    product = relationship("Product", back_populates="variants")
    barcodes = relationship("ProductBarcode", backref="variant")
    facility_prices = relationship("ProductFacilityPrice", backref="variant", cascade="all, delete-orphan")

class ProductBarcode(Base):
    __tablename__ = "product_barcodes"
    __table_args__ = {"schema": "inv"}
    
    id = Column(Integer, primary_key=True, index=True)
    product_variant_id = Column(Integer, ForeignKey("inv.product_variants.id"))
    barcode = Column(String, unique=True, nullable=False)
    code_type = Column(String, default='BARCODE')
    uom = Column(String, nullable=False)
    conversion_factor = Column(Numeric(12, 4), default=1)
    weight = Column(Numeric(12, 4))
    dimensions = Column(String)

class ProductPackaging(Base):
    __tablename__ = "product_packagings"
    __table_args__ = {"schema": "inv"}
    
    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("inv.products.id"))
    name = Column(String, nullable=False)
    qty_per_unit = Column(Numeric(12, 4), nullable=False)
    weight_kg = Column(Numeric(12, 4), default=0)
    volume_m3 = Column(Numeric(12, 4), default=0)

class ProductFacilityPrice(Base):
    __tablename__ = "product_facility_prices"
    __table_args__ = {"schema": "inv"}
    
    variant_id = Column(Integer, ForeignKey("inv.product_variants.id"), primary_key=True)
    facility_id = Column(Integer, ForeignKey("core.facilities.id"), primary_key=True)
    sales_price = Column(Numeric(19, 4), default=0)
    target_utility_pct = Column(Numeric(5, 2))

class InventorySnapshot(Base):
    __tablename__ = "inventory_snapshots"
    __table_args__ = {"schema": "inv"}
    
    variant_id = Column(Integer, ForeignKey("inv.product_variants.id"), primary_key=True)
    facility_id = Column(Integer, ForeignKey("core.facilities.id"), primary_key=True)
    # Puede ser nulo si no aplican lotes 
    batch_id = Column(Integer, ForeignKey("inv.batches.id"), primary_key=False, nullable=True) 
    
    stock_qty = Column(Numeric(19, 4), default=0)
    avg_cost = Column(Numeric(19, 4), default=0)
    current_cost = Column(Numeric(19, 4), default=0)
    prev_cost = Column(Numeric(19, 4), default=0)
    replacement_cost = Column(Numeric(19, 4), default=0)
    
    # MRP Math Fields
    safety_stock = Column(Numeric(19, 4), default=0)
    run_rate = Column(Numeric(19, 4), default=0)

# =================
# MOVEMENTS
# =================
class StockPickingType(Base):
    __tablename__ = "stock_picking_types"
    __table_args__ = {"schema": "inv"}
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    code = Column(String, unique=True, nullable=False)
    sequence_prefix = Column(String, nullable=False)
    default_location_src_id = Column(Integer, ForeignKey("inv.locations.id"))
    default_location_dest_id = Column(Integer, ForeignKey("inv.locations.id"))

class StockPicking(Base):
    __tablename__ = "stock_pickings"
    __table_args__ = {"schema": "inv"}
    
    id = Column(BigInteger, primary_key=True, index=True)
    picking_type_id = Column(Integer, ForeignKey("inv.stock_picking_types.id"))
    name = Column(String, unique=True, nullable=False)
    origin_document = Column(String)
    facility_id = Column(Integer, ForeignKey("core.facilities.id"))
    status = Column(String, default='DRAFT')
    scheduled_date = Column(DateTime)
    date_done = Column(DateTime)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    moves = relationship("StockMove", back_populates="picking")

class StockMove(Base):
    __tablename__ = "stock_moves"
    __table_args__ = {"schema": "inv"}
    
    id = Column(BigInteger, primary_key=True, index=True)
    picking_id = Column(BigInteger, ForeignKey("inv.stock_pickings.id"))
    product_id = Column(Integer, ForeignKey("inv.product_variants.id"))
    
    location_src_id = Column(Integer, ForeignKey("inv.locations.id"), nullable=False)
    location_dest_id = Column(Integer, ForeignKey("inv.locations.id"), nullable=False)
    
    quantity_demand = Column(Numeric(19, 4), default=0)
    quantity_done = Column(Numeric(19, 4), default=0)
    uom_id = Column(String, default='PZA')
    state = Column(String, default='DRAFT')
    batch_id = Column(Integer, ForeignKey("inv.batches.id"))
    supplier_id = Column(Integer, ForeignKey("core.suppliers.id"))
    unit_cost = Column(Numeric(19, 4), default=0)
    historic_avg_cost = Column(Numeric(19, 4), default=0)
    reference = Column(String)
    date = Column(DateTime(timezone=True), server_default=func.now())
    
    picking = relationship("StockPicking", back_populates="moves")

class Batch(Base):
    __tablename__ = "batches"
    __table_args__ = {"schema": "inv"}
    
    id = Column(Integer, primary_key=True, index=True)
    product_variant_id = Column(Integer, ForeignKey("inv.product_variants.id"))
    batch_number = Column(String, nullable=False)
    expiry_date = Column(Date)
    manufacturing_date = Column(Date)
    is_quarantined = Column(Boolean, default=False)

# =================
# PHYSICAL INVENTORY
# =================
class InventorySession(Base):
    __tablename__ = "inventory_sessions"
    __table_args__ = {"schema": "inv"}
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    facility_id = Column(Integer, ForeignKey("core.facilities.id"))
    warehouse_id = Column(Integer, ForeignKey("inv.warehouses.id"))
    
    state = Column(String, default='DRAFT')
    date_start = Column(DateTime(timezone=True), server_default=func.now())
    date_end = Column(DateTime)
    
    created_by = Column(Integer, ForeignKey("core.users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    lines = relationship("InventoryLine", back_populates="session")

class InventoryLine(Base):
    __tablename__ = "inventory_lines"
    __table_args__ = {"schema": "inv"}
    
    id = Column(BigInteger, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("inv.inventory_sessions.id"))
    product_variant_id = Column(Integer, ForeignKey("inv.product_variants.id"))
    location_id = Column(Integer, ForeignKey("inv.locations.id"))
    
    theoretical_qty = Column(Numeric(19, 4), default=0)
    counted_qty = Column(Numeric(19, 4), default=0)
    from sqlalchemy import Computed
    # difference_qty is generated in DB
    difference_qty = Column(Numeric(19, 4), Computed('counted_qty - theoretical_qty')) 
    
    notes = Column(Text)
    counted_by = Column(Integer, ForeignKey("core.users.id"))
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
    
    session = relationship("InventorySession", back_populates="lines")
