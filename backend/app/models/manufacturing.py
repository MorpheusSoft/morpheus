from sqlalchemy import Boolean, Column, Integer, String, ForeignKey, DateTime, Text, Numeric, BigInteger, Date
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base_class import Base
import app.models.core  # noqa: F401
import app.models.inventory  # noqa: F401
import app.models.purchasing  # noqa: F401


class WorkCenter(Base):
    __tablename__ = "work_centers"
    __table_args__ = {"schema": "mfg"}

    id = Column(Integer, primary_key=True, index=True)
    facility_id = Column(Integer, ForeignKey("core.facilities.id"), nullable=False)
    warehouse_wip_id = Column(Integer, ForeignKey("inv.warehouses.id"), nullable=True)
    code = Column(String(30), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    sector = Column(String(30), nullable=False)  # 'BAKERY', 'GASTRONOMY', 'MEAT_PROCESSING'
    capacity_per_batch = Column(Numeric(19, 4), default=0)
    capacity_uom = Column(String(10), default="KG")
    hourly_labor_rate = Column(Numeric(19, 4), default=0)
    hourly_overhead_rate = Column(Numeric(19, 4), default=0)
    overhead_per_kg = Column(Numeric(19, 4), default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    facility = relationship("Facility")
    warehouse_wip = relationship("Warehouse")
    boms = relationship("BOMHeader", back_populates="work_center")


class BOMHeader(Base):
    __tablename__ = "bom_headers"
    __table_args__ = {"schema": "mfg"}

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(150), nullable=False)
    bom_type = Column(String(30), nullable=False)  # 'CONVERGENT_RECIPE', 'DIVERGENT_DISASSEMBLY'
    sector = Column(String(30), nullable=False)  # 'BAKERY', 'GASTRONOMY', 'MEAT_PROCESSING'
    work_center_id = Column(Integer, ForeignKey("mfg.work_centers.id"), nullable=True)
    primary_product_variant_id = Column(Integer, ForeignKey("inv.product_variants.id"), nullable=False)
    base_qty = Column(Numeric(19, 4), nullable=False, default=1)
    uom_id = Column(String(10), nullable=False, default="KG")
    expected_shrinkage_pct = Column(Numeric(5, 2), default=0.00)
    max_allowed_shrinkage_pct = Column(Numeric(5, 2), default=0.00)
    standard_labor_hours = Column(Numeric(10, 4), default=0)
    shelf_life_days = Column(Integer, default=1)
    instructions = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    work_center = relationship("WorkCenter", back_populates="boms")
    primary_variant = relationship("ProductVariant", foreign_keys=[primary_product_variant_id])
    inputs = relationship("BOMInput", back_populates="bom", cascade="all, delete-orphan")
    outputs = relationship("BOMOutput", back_populates="bom", cascade="all, delete-orphan")


class BOMInput(Base):
    __tablename__ = "bom_inputs"
    __table_args__ = {"schema": "mfg"}

    id = Column(Integer, primary_key=True, index=True)
    bom_id = Column(Integer, ForeignKey("mfg.bom_headers.id", ondelete="CASCADE"), nullable=False)
    component_variant_id = Column(Integer, ForeignKey("inv.product_variants.id"), nullable=False)
    input_role = Column(String(30), nullable=False, default="INGREDIENT")  # 'PRIMARY_RAW_MATERIAL', 'INGREDIENT', 'SEMI_FINISHED', 'PACKAGING'
    quantity = Column(Numeric(19, 4), nullable=False)
    recipe_uom = Column(String(10), nullable=False, default="KG")
    conversion_factor_to_base = Column(Numeric(19, 6), nullable=False, default=1.000000)
    bakers_percentage = Column(Numeric(6, 2), nullable=True)
    scrap_tolerance_pct = Column(Numeric(5, 2), default=0.00)
    is_fixed_qty = Column(Boolean, default=False)
    backflush = Column(Boolean, default=True)

    bom = relationship("BOMHeader", back_populates="inputs")
    component_variant = relationship("ProductVariant", foreign_keys=[component_variant_id])


class BOMOutput(Base):
    __tablename__ = "bom_outputs"
    __table_args__ = {"schema": "mfg"}

    id = Column(Integer, primary_key=True, index=True)
    bom_id = Column(Integer, ForeignKey("mfg.bom_headers.id", ondelete="CASCADE"), nullable=False)
    output_variant_id = Column(Integer, ForeignKey("inv.product_variants.id"), nullable=False)
    output_type = Column(String(30), nullable=False, default="PRIMARY_PRODUCT")  # 'PRIMARY_PRODUCT', 'CO_PRODUCT', 'BY_PRODUCT'
    expected_qty = Column(Numeric(19, 4), nullable=False)
    uom_id = Column(String(10), nullable=False, default="KG")
    expected_yield_pct = Column(Numeric(6, 3), nullable=False, default=100.000)
    cost_allocation_method = Column(String(30), nullable=False, default="MARKET_VALUE_INDEX")  # 'MARKET_VALUE_INDEX', 'PERCENTAGE', 'FIXED_NRV'
    standard_reference_price = Column(Numeric(19, 4), nullable=True)
    cost_allocation_factor = Column(Numeric(19, 4), default=1.0000)

    bom = relationship("BOMHeader", back_populates="outputs")
    output_variant = relationship("ProductVariant", foreign_keys=[output_variant_id])


class ProductionPlan(Base):
    __tablename__ = "production_plans"
    __table_args__ = {"schema": "mfg"}

    id = Column(Integer, primary_key=True, index=True)
    plan_number = Column(String(50), unique=True, nullable=False, index=True)
    facility_id = Column(Integer, ForeignKey("core.facilities.id"), nullable=False)
    plan_date = Column(Date, nullable=False)
    shift = Column(String(30), default="FULL_DAY")  # 'MORNING', 'AFTERNOON', 'NIGHT', 'FULL_DAY'
    sector = Column(String(30), nullable=False)
    state = Column(String(30), nullable=False, default="DRAFT")  # 'DRAFT', 'APPROVED', 'ORDERS_GENERATED', 'CLOSED'
    notes = Column(Text, nullable=True)
    created_by_id = Column(Integer, ForeignKey("core.users.id"), nullable=True)
    approved_by_id = Column(Integer, ForeignKey("core.users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    facility = relationship("Facility")
    lines = relationship("ProductionPlanLine", back_populates="plan", cascade="all, delete-orphan")


class ProductionPlanLine(Base):
    __tablename__ = "production_plan_lines"
    __table_args__ = {"schema": "mfg"}

    id = Column(BigInteger, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("mfg.production_plans.id", ondelete="CASCADE"), nullable=False)
    bom_id = Column(Integer, ForeignKey("mfg.bom_headers.id"), nullable=False)
    target_variant_id = Column(Integer, ForeignKey("inv.product_variants.id"), nullable=False)
    demand_source = Column(String(30), default="MAKE_TO_STOCK")  # 'MAKE_TO_STOCK', 'MAKE_TO_ORDER', 'FEFO_RESCUE'
    current_stock_qty = Column(Numeric(19, 4), default=0)
    suggested_qty = Column(Numeric(19, 4), nullable=False, default=0)
    planned_qty = Column(Numeric(19, 4), nullable=False)
    batches_count = Column(Integer, default=1)

    plan = relationship("ProductionPlan", back_populates="lines")
    bom = relationship("BOMHeader")
    target_variant = relationship("ProductVariant")


class ProductionOrder(Base):
    __tablename__ = "production_orders"
    __table_args__ = {"schema": "mfg"}

    id = Column(BigInteger, primary_key=True, index=True)
    order_number = Column(String(50), unique=True, nullable=False, index=True)
    plan_line_id = Column(BigInteger, ForeignKey("mfg.production_plan_lines.id"), nullable=True)
    facility_id = Column(Integer, ForeignKey("core.facilities.id"), nullable=False)
    work_center_id = Column(Integer, ForeignKey("mfg.work_centers.id"), nullable=True)
    bom_id = Column(Integer, ForeignKey("mfg.bom_headers.id"), nullable=True)
    order_type = Column(String(30), nullable=False)  # 'CONVERGENT_PRODUCTION', 'MEAT_DISASSEMBLY', 'AD_HOC_TRANSFORMATION', 'EXTERNAL_MAQUILA'
    state = Column(String(30), nullable=False, default="DRAFT")  # 'DRAFT', 'PLANNED', 'IN_PROGRESS', 'IN_EXTERNAL_MAQUILA', 'COMPLETED', 'CANCELLED'

    # Balance de Masa (Kg / Unidades)
    planned_base_qty = Column(Numeric(19, 4), nullable=False)
    actual_input_weight_kg = Column(Numeric(19, 4), default=0)
    actual_good_output_weight_kg = Column(Numeric(19, 4), default=0)
    actual_byproduct_weight_kg = Column(Numeric(19, 4), default=0)
    natural_shrinkage_qty = Column(Numeric(19, 4), default=0)
    explicit_waste_qty = Column(Numeric(19, 4), default=0)

    # Acumuladores de Costo (Cost Buckets)
    total_direct_material_cost = Column(Numeric(19, 4), default=0)
    total_packaging_cost = Column(Numeric(19, 4), default=0)
    total_direct_labor_cost = Column(Numeric(19, 4), default=0)
    total_indirect_overhead_cost = Column(Numeric(19, 4), default=0)
    total_maquila_service_cost = Column(Numeric(19, 4), default=0)
    total_byproduct_credit = Column(Numeric(19, 4), default=0)
    total_explicit_waste_cost = Column(Numeric(19, 4), default=0)
    net_production_cost = Column(Numeric(19, 4), default=0)

    # Vínculos con Neo Compras y Neo WMS
    supplier_maquila_id = Column(Integer, ForeignKey("core.suppliers.id"), nullable=True)
    maquila_po_id = Column(Integer, ForeignKey("pur.purchase_orders.id"), nullable=True)
    source_warehouse_id = Column(Integer, ForeignKey("inv.warehouses.id"), nullable=False)
    dest_warehouse_id = Column(Integer, ForeignKey("inv.warehouses.id"), nullable=False)
    picking_consumption_id = Column(BigInteger, ForeignKey("inv.stock_pickings.id"), nullable=True)
    picking_output_id = Column(BigInteger, ForeignKey("inv.stock_pickings.id"), nullable=True)
    waste_move_id = Column(BigInteger, ForeignKey("inv.stock_moves.id"), nullable=True)

    scheduled_date = Column(DateTime(timezone=True), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_by_id = Column(Integer, ForeignKey("core.users.id"), nullable=True)
    completed_by_id = Column(Integer, ForeignKey("core.users.id"), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    facility = relationship("Facility")
    work_center = relationship("WorkCenter")
    bom = relationship("BOMHeader")
    inputs = relationship("ProductionOrderInput", back_populates="production_order", cascade="all, delete-orphan")
    outputs = relationship("ProductionOrderOutput", back_populates="production_order", cascade="all, delete-orphan")


class ProductionOrderInput(Base):
    __tablename__ = "production_order_inputs"
    __table_args__ = {"schema": "mfg"}

    id = Column(BigInteger, primary_key=True, index=True)
    production_order_id = Column(BigInteger, ForeignKey("mfg.production_orders.id", ondelete="CASCADE"), nullable=False)
    component_variant_id = Column(Integer, ForeignKey("inv.product_variants.id"), nullable=False)
    batch_id = Column(Integer, ForeignKey("inv.batches.id"), nullable=True)
    input_role = Column(String(30), default="INGREDIENT")
    planned_base_qty = Column(Numeric(19, 4), nullable=False)
    consumed_base_qty = Column(Numeric(19, 4), default=0)
    uom_base = Column(String(10), nullable=False)
    unit_cost = Column(Numeric(19, 4), default=0)
    total_cost = Column(Numeric(19, 4), default=0)
    stock_move_id = Column(BigInteger, ForeignKey("inv.stock_moves.id"), nullable=True)

    production_order = relationship("ProductionOrder", back_populates="inputs")
    component_variant = relationship("ProductVariant")
    batch = relationship("Batch")


class ProductionOrderOutput(Base):
    __tablename__ = "production_order_outputs"
    __table_args__ = {"schema": "mfg"}

    id = Column(BigInteger, primary_key=True, index=True)
    production_order_id = Column(BigInteger, ForeignKey("mfg.production_orders.id", ondelete="CASCADE"), nullable=False)
    output_variant_id = Column(Integer, ForeignKey("inv.product_variants.id"), nullable=False)
    output_type = Column(String(30), nullable=False)  # 'PRIMARY_PRODUCT', 'CO_PRODUCT', 'BY_PRODUCT'
    generated_batch_id = Column(Integer, ForeignKey("inv.batches.id"), nullable=True)
    planned_qty = Column(Numeric(19, 4), nullable=False)
    actual_good_qty = Column(Numeric(19, 4), default=0)
    explicit_damaged_qty = Column(Numeric(19, 4), default=0)
    uom_base = Column(String(10), nullable=False)
    expected_yield_pct = Column(Numeric(6, 3), nullable=True)
    actual_yield_pct = Column(Numeric(6, 3), nullable=True)
    market_reference_price = Column(Numeric(19, 4), default=0)
    cost_allocation_pct = Column(Numeric(8, 4), default=0)
    allocated_total_cost = Column(Numeric(19, 4), default=0)
    calculated_unit_cost = Column(Numeric(19, 4), default=0)
    stock_move_id = Column(BigInteger, ForeignKey("inv.stock_moves.id"), nullable=True)

    production_order = relationship("ProductionOrder", back_populates="outputs")
    output_variant = relationship("ProductVariant")
    generated_batch = relationship("Batch")
