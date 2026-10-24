from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, date


class WorkCenterBase(BaseModel):
    facility_id: int
    warehouse_wip_id: Optional[int] = None
    code: str
    name: str
    sector: str  # 'BAKERY', 'GASTRONOMY', 'MEAT_PROCESSING'
    capacity_per_batch: float = 0.0
    capacity_uom: str = "KG"
    hourly_labor_rate: float = 0.0
    hourly_overhead_rate: float = 0.0
    overhead_per_kg: float = 0.0
    is_active: bool = True


class WorkCenterCreate(WorkCenterBase):
    pass


class WorkCenterUpdate(BaseModel):
    facility_id: Optional[int] = None
    warehouse_wip_id: Optional[int] = None
    code: Optional[str] = None
    name: Optional[str] = None
    sector: Optional[str] = None
    capacity_per_batch: Optional[float] = None
    capacity_uom: Optional[str] = None
    hourly_labor_rate: Optional[float] = None
    hourly_overhead_rate: Optional[float] = None
    overhead_per_kg: Optional[float] = None
    is_active: Optional[bool] = None


class WorkCenterResponse(WorkCenterBase):
    id: int
    facility_name: Optional[str] = None
    warehouse_wip_name: Optional[str] = None
    boms_count: int = 0
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BOMInputCreate(BaseModel):
    component_variant_id: int
    input_role: str = "INGREDIENT"  # 'PRIMARY_RAW_MATERIAL', 'INGREDIENT', 'SEMI_FINISHED', 'PACKAGING'
    quantity: float
    recipe_uom: str = "KG"
    conversion_factor_to_base: float = 1.0
    bakers_percentage: Optional[float] = None
    scrap_tolerance_pct: float = 0.0
    is_fixed_qty: bool = False
    backflush: bool = True


class BOMInputResponse(BOMInputCreate):
    id: int
    bom_id: int
    component_sku: Optional[str] = None
    component_name: Optional[str] = None
    component_uom_base: Optional[str] = None
    unit_cost_usd: float = 0.0
    unit_cost_ves: float = 0.0
    gross_qty_base: float = 0.0
    line_cost_usd: float = 0.0
    line_cost_ves: float = 0.0

    class Config:
        from_attributes = True


class BOMOutputCreate(BaseModel):
    output_variant_id: int
    output_type: str = "PRIMARY_PRODUCT"  # 'PRIMARY_PRODUCT', 'CO_PRODUCT', 'BY_PRODUCT'
    expected_qty: float
    uom_id: str = "KG"
    expected_yield_pct: float = 100.0
    cost_allocation_method: str = "MARKET_VALUE_INDEX"  # 'MARKET_VALUE_INDEX', 'PERCENTAGE', 'FIXED_NRV'
    standard_reference_price: Optional[float] = None
    cost_allocation_factor: float = 1.0


class BOMOutputResponse(BOMOutputCreate):
    id: int
    bom_id: int
    output_sku: Optional[str] = None
    output_name: Optional[str] = None
    current_sales_price_usd: float = 0.0

    class Config:
        from_attributes = True


class BOMHeaderBase(BaseModel):
    code: str
    name: str
    bom_type: str = "CONVERGENT_RECIPE"  # 'CONVERGENT_RECIPE', 'DIVERGENT_DISASSEMBLY'
    sector: str = "BAKERY"  # 'BAKERY', 'GASTRONOMY', 'MEAT_PROCESSING'
    work_center_id: Optional[int] = None
    primary_product_variant_id: int
    base_qty: float = 1.0
    uom_id: str = "KG"
    expected_shrinkage_pct: float = 0.0
    max_allowed_shrinkage_pct: float = 0.0
    standard_labor_hours: float = 0.0
    shelf_life_days: int = 1
    instructions: Optional[str] = None
    is_active: bool = True


class BOMHeaderCreate(BOMHeaderBase):
    inputs: List[BOMInputCreate] = Field(default_factory=list)
    outputs: List[BOMOutputCreate] = Field(default_factory=list)


class BOMHeaderUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    bom_type: Optional[str] = None
    sector: Optional[str] = None
    work_center_id: Optional[int] = None
    primary_product_variant_id: Optional[int] = None
    base_qty: Optional[float] = None
    uom_id: Optional[str] = None
    expected_shrinkage_pct: Optional[float] = None
    max_allowed_shrinkage_pct: Optional[float] = None
    standard_labor_hours: Optional[float] = None
    shelf_life_days: Optional[int] = None
    instructions: Optional[str] = None
    is_active: Optional[bool] = None
    inputs: Optional[List[BOMInputCreate]] = None
    outputs: Optional[List[BOMOutputCreate]] = None


class BOMHeaderResponse(BOMHeaderBase):
    id: int
    work_center_name: Optional[str] = None
    primary_product_sku: Optional[str] = None
    primary_product_name: Optional[str] = None
    primary_product_price_usd: float = 0.0
    total_commercial_value_usd: float = 0.0
    effective_good_qty: float = 0.0
    estimated_batch_cost_usd: float = 0.0
    estimated_batch_cost_ves: float = 0.0
    estimated_unit_cost_usd: float = 0.0
    estimated_unit_cost_ves: float = 0.0
    estimated_margin_pct: float = 0.0
    created_at: Optional[datetime] = None
    inputs: List[BOMInputResponse] = Field(default_factory=list)
    outputs: List[BOMOutputResponse] = Field(default_factory=list)

    class Config:
        from_attributes = True


class SimulateCostInputItem(BaseModel):
    component_variant_id: int
    input_role: str = "INGREDIENT"
    quantity: float
    recipe_uom: str = "KG"
    conversion_factor_to_base: float = 1.0
    bakers_percentage: Optional[float] = None
    scrap_tolerance_pct: float = 0.0
    unit_cost_override_usd: Optional[float] = None


class SimulateCostOutputItem(BaseModel):
    output_variant_id: int
    output_type: str = "PRIMARY_PRODUCT"
    expected_qty: float
    uom_id: str = "KG"
    expected_yield_pct: float = 100.0
    cost_allocation_method: str = "MARKET_VALUE_INDEX"
    standard_reference_price: Optional[float] = None
    cost_allocation_factor: float = 1.0


class SimulateCostRequest(BaseModel):
    bom_type: str = "CONVERGENT_RECIPE"
    work_center_id: Optional[int] = None
    primary_product_variant_id: Optional[int] = None
    facility_id: Optional[int] = None
    base_qty: float = 1.0
    uom_id: str = "KG"
    expected_shrinkage_pct: float = 0.0
    standard_labor_hours: float = 0.0
    exchange_rate_override: Optional[float] = None
    inputs: List[SimulateCostInputItem] = Field(default_factory=list)
    outputs: List[SimulateCostOutputItem] = Field(default_factory=list)


# ==============================================================================
# FASE 2: EXPLOSIÓN DE MATERIALES FEFO & ÓRDENES DE PRODUCCIÓN CONVERGENTES / LIBRES
# ==============================================================================
class AdHocOrderInputCreate(BaseModel):
    component_variant_id: int
    planned_base_qty: Optional[float] = None
    planned_qty: Optional[float] = None
    uom_base: Optional[str] = None
    scrap_factor_pct: Optional[float] = 0.0
    input_role: str = "PRIMARY_RAW_MATERIAL"  # 'PRIMARY_RAW_MATERIAL', 'INGREDIENT', 'PACKAGING', 'SEMI_FINISHED'
    batch_id: Optional[int] = None
    unit_cost_override_usd: Optional[float] = None


class AdHocOrderOutputCreate(BaseModel):
    output_variant_id: int
    planned_qty: float
    uom_base: Optional[str] = None
    output_type: str = "PRIMARY_PRODUCT"  # 'PRIMARY_PRODUCT', 'CO_PRODUCT', 'BY_PRODUCT'
    cost_allocation_method: str = "MARKET_VALUE_INDEX"  # 'MARKET_VALUE_INDEX', 'PERCENTAGE', 'FIXED_NRV'
    market_reference_price: Optional[float] = None
    expected_yield_pct: Optional[float] = None


class ExplodePreviewRequest(BaseModel):
    bom_id: Optional[int] = None
    planned_base_qty: Optional[float] = None
    facility_id: Optional[int] = None
    work_center_id: Optional[int] = None
    source_warehouse_id: Optional[int] = None
    dest_warehouse_id: Optional[int] = None
    actual_labor_hours: Optional[float] = None
    standard_labor_hours: Optional[float] = 0.5
    shelf_life_days: Optional[int] = 7
    expected_shrinkage_pct: Optional[float] = 0.0
    sector: Optional[str] = "GASTRONOMY"
    order_type: Optional[str] = None
    exchange_rate_override: Optional[float] = None
    inputs: Optional[List[AdHocOrderInputCreate]] = None
    outputs: Optional[List[AdHocOrderOutputCreate]] = None


class ProductionOrderCreate(BaseModel):
    bom_id: Optional[int] = None
    facility_id: Optional[int] = None
    work_center_id: Optional[int] = None
    source_warehouse_id: Optional[int] = None
    dest_warehouse_id: Optional[int] = None
    planned_base_qty: Optional[float] = None
    inputs: Optional[List[AdHocOrderInputCreate]] = None
    outputs: Optional[List[AdHocOrderOutputCreate]] = None
    sector: Optional[str] = "GASTRONOMY"
    order_type: Optional[str] = None
    shelf_life_days: Optional[int] = 7
    standard_labor_hours: Optional[float] = 0.5
    expected_shrinkage_pct: Optional[float] = 0.0
    scheduled_date: Optional[datetime] = None
    notes: Optional[str] = None
    start_immediately: bool = False


class SaveOrderAsBOMRequest(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    sector: Optional[str] = None
    shelf_life_days: Optional[int] = 7
    instructions: Optional[str] = None
    notes: Optional[str] = None
    link_to_order: bool = True


class CompleteOrderInputLine(BaseModel):
    input_id: Optional[int] = None
    component_variant_id: Optional[int] = None
    batch_id: Optional[int] = None
    input_role: Optional[str] = None
    consumed_base_qty: float
    unit_cost_override_usd: Optional[float] = None


class CompleteOrderOutputLine(BaseModel):
    output_id: Optional[int] = None
    output_variant_id: Optional[int] = None
    output_type: Optional[str] = None
    expected_yield_pct: Optional[float] = None
    actual_good_qty: float
    explicit_damaged_qty: float = 0.0
    market_reference_price: Optional[float] = None
    cost_allocation_method: Optional[str] = None


class CompleteOrderRequest(BaseModel):
    actual_input_weight_kg: Optional[float] = None
    actual_labor_hours: Optional[float] = None
    natural_shrinkage_qty: Optional[float] = None
    explicit_damaged_qty: Optional[float] = None
    explicit_waste_qty: Optional[float] = None
    actual_good_qty: Optional[float] = None
    inputs: Optional[List[CompleteOrderInputLine]] = None
    outputs: Optional[List[CompleteOrderOutputLine]] = None
    notes: Optional[str] = None


# ==============================================================================
# FASE 3: SALA DE DESPOSTE CÁRNICO (1 CANAL -> N CORTES) & COSTEO CONJUNTO NIC 2
# ==============================================================================
class ButcherySimulateOutputItem(BaseModel):
    output_id: Optional[int] = None
    output_variant_id: int
    output_type: Optional[str] = None  # 'PRIMARY_PRODUCT', 'CO_PRODUCT', 'BY_PRODUCT'
    expected_yield_pct: Optional[float] = None
    actual_good_qty: float
    explicit_damaged_qty: float = 0.0
    market_reference_price: Optional[float] = None
    cost_allocation_method: Optional[str] = None  # 'MARKET_VALUE_INDEX', 'PERCENTAGE', 'FIXED_NRV'


class ButcherySimulateSettlementRequest(BaseModel):
    order_id: Optional[int] = None
    bom_id: Optional[int] = None
    facility_id: int = 1
    dest_warehouse_id: Optional[int] = None
    actual_input_weight_kg: Optional[float] = None
    actual_labor_hours: Optional[float] = None
    natural_shrinkage_qty: Optional[float] = None
    explicit_waste_qty: Optional[float] = None
    raw_material_cost_usd: Optional[float] = None
    packaging_cost_usd: Optional[float] = None
    direct_labor_cost_override_usd: Optional[float] = None
    indirect_overhead_cost_override_usd: Optional[float] = None
    exchange_rate_override: Optional[float] = None
    inputs: Optional[List[CompleteOrderInputLine]] = None
    outputs: Optional[List[ButcherySimulateOutputItem]] = None


