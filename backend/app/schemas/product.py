from typing import Optional, List, Dict, Any
from pydantic import BaseModel, HttpUrl
from datetime import datetime
from decimal import Decimal

# =================
# BARCODE SCHEMAS
# =================
class ProductBarcodeBase(BaseModel):
    barcode: str
    code_type: str = "BARCODE"
    uom: str
    conversion_factor: Decimal = 1
    weight: Optional[Decimal] = 0
    dimensions: Optional[str] = None

class ProductBarcodeCreate(ProductBarcodeBase):
    id: Optional[int] = None

class ProductBarcode(ProductBarcodeBase):
    id: int
    product_variant_id: int
    
    class Config:
        from_attributes = True

# =================
# PACKAGING SCHEMAS
# =================
class ProductPackagingBase(BaseModel):
    name: str
    qty_per_unit: Decimal
    weight_kg: Optional[Decimal] = 0
    volume_m3: Optional[Decimal] = 0

class ProductPackagingCreate(ProductPackagingBase):
    id: Optional[int] = None

class ProductPackaging(ProductPackagingBase):
    id: int
    product_id: int
    class Config:
        from_attributes = True

# =================
# FACILITY PRICE SCHEMAS
# =================
class ProductFacilityPriceBase(BaseModel):
    facility_id: int
    sales_price: Decimal = 0
    target_utility_pct: Optional[Decimal] = None

class ProductFacilityPriceCreate(ProductFacilityPriceBase):
    id: Optional[int] = None

class ProductFacilityPrice(ProductFacilityPriceBase):
    variant_id: int
    class Config:
        from_attributes = True

# =================
# VARIANT SCHEMAS
# =================
class ProductVariantBase(BaseModel):
    sku: str
    part_number: Optional[str] = None
    barcode: Optional[str] = None
    image: Optional[str] = None # URL
    
    # Financials
    costing_method: str = "AVERAGE"
    standard_cost: Decimal = 0
    replacement_cost: Decimal = 0
    sales_price: Decimal = 0
    is_published: bool = False
    
    weight: Optional[Decimal] = None
    currency_id: Optional[int] = None
    attributes: Optional[Dict[str, Any]] = None # JSON {"size": "M", "color": "Red"}

class ProductVariantCreate(ProductVariantBase):
    pass

class ProductVariantUpdate(BaseModel):
    sku: Optional[str] = None
    part_number: Optional[str] = None
    barcode: Optional[str] = None
    image: Optional[str] = None
    costing_method: Optional[str] = None
    standard_cost: Optional[Decimal] = None
    replacement_cost: Optional[Decimal] = None
    sales_price: Optional[Decimal] = None
    is_published: Optional[bool] = None
    weight: Optional[Decimal] = None
    currency_id: Optional[int] = None
    attributes: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None

class ProductVariant(ProductVariantBase):
    id: int
    product_id: int
    average_cost: Decimal = 0
    last_cost: Decimal = 0
    is_active: bool

    barcodes: List[ProductBarcode] = []
    facility_prices: List[ProductFacilityPrice] = []

    class Config:
        from_attributes = True

# =================
# PRODUCT SCHEMAS
# =================
class ProductBase(BaseModel):
    name: str
    description: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    product_type: str = "STOCKED"
    uom_base: str = "PZA"
    is_liquor: Optional[bool] = False
    track_batches: Optional[bool] = False
    tax_id: Optional[int] = None
    
    # Multimedia
    image_main: Optional[str] = None
    datasheet: Optional[str] = None
    origin: Optional[str] = "NACIONAL"

class ProductCreate(ProductBase):
    category_id: int
    currency_id: int # Obligatorio para cálculo de utilidades blindado
    shrinkage_percent: Optional[Decimal] = 0
    
    # Optional: Helper to create the first default variant immediately
    sku: Optional[str] = None 
    standard_cost: Optional[Decimal] = 0
    price: Optional[Decimal] = 0 # Helper for sales_price
    replacement_cost: Optional[Decimal] = 0
    has_variants: Optional[bool] = False
    is_active: Optional[bool] = True
    
    # Anidando la metadata multidimensional prometida
    packagings: Optional[List[ProductPackagingCreate]] = []
    facility_prices: Optional[List[ProductFacilityPriceCreate]] = []
    barcodes: Optional[List[ProductBarcodeCreate]] = []

class ProductUpdate(ProductBase):
    name: Optional[str] = None
    category_id: Optional[int] = None
    is_active: Optional[bool] = None
    currency_id: Optional[int] = None
    shrinkage_percent: Optional[Decimal] = None
    has_variants: Optional[bool] = None
    
    # Variant Helpers para Simple Products
    standard_cost: Optional[Decimal] = None
    price: Optional[Decimal] = None
    replacement_cost: Optional[Decimal] = None
    
    # Arreglos relacionales
    packagings: Optional[List[ProductPackagingCreate]] = None
    facility_prices: Optional[List[ProductFacilityPriceCreate]] = None
    barcodes: Optional[List[ProductBarcodeCreate]] = None

class Product(ProductBase):
    id: int
    category_id: int
    has_variants: bool
    is_active: bool
    created_at: datetime
    
    variants: List[ProductVariant] = []
    packagings: List[ProductPackaging] = []

    class Config:
        from_attributes = True
