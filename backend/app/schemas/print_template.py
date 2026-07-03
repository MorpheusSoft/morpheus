from typing import Optional, Any, Dict
from pydantic import BaseModel

class PrintTemplateBase(BaseModel):
    name: str
    paper_type: str  # 'GRID', 'CONTINUOUS', 'INDIVIDUAL'
    width_mm: float
    height_mm: float
    margin_top_mm: float = 0.0
    margin_bottom_mm: float = 0.0
    margin_left_mm: float = 0.0
    margin_right_mm: float = 0.0
    rows: int = 1
    cols: int = 1
    show_sku: bool = True
    show_barcode: bool = True
    show_price_usd: bool = True
    show_price_ves: bool = True
    show_price_iva: bool = True
    show_uom: bool = True
    show_brand: bool = True
    promo_text: Optional[str] = None
    font_size_pt: int = 10
    layout_config: Optional[Dict[str, Any]] = None

class PrintTemplateCreate(PrintTemplateBase):
    pass

class PrintTemplateUpdate(BaseModel):
    name: Optional[str] = None
    paper_type: Optional[str] = None
    width_mm: Optional[float] = None
    height_mm: Optional[float] = None
    margin_top_mm: Optional[float] = None
    margin_bottom_mm: Optional[float] = None
    margin_left_mm: Optional[float] = None
    margin_right_mm: Optional[float] = None
    rows: Optional[int] = None
    cols: Optional[int] = None
    show_sku: Optional[bool] = None
    show_barcode: Optional[bool] = None
    show_price_usd: Optional[bool] = None
    show_price_ves: Optional[bool] = None
    show_price_iva: Optional[bool] = None
    show_uom: Optional[bool] = None
    show_brand: Optional[bool] = None
    promo_text: Optional[str] = None
    font_size_pt: Optional[int] = None
    layout_config: Optional[Dict[str, Any]] = None

class PrintTemplate(PrintTemplateBase):
    id: int

    class Config:
        from_attributes = True
