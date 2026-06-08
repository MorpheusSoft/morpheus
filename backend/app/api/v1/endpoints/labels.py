from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from typing import Optional
from decimal import Decimal
from fpdf import FPDF
import io

from app.api.deps import get_db
from app.models.inventory import Location, ProductVariant, Warehouse, Product
from app.models.core import Facility, Currency

router = APIRouter()

# Code 39 Binary Patterns (1 = narrow bar, 11 = wide bar, 0 = narrow space, 00 = wide space)
CODE39_MAP = {
    '0': '101001101101', '1': '110100101011', '2': '101100101011', '3': '110110010101',
    '4': '101001101011', '5': '110100110101', '6': '101100110101', '7': '101001011011',
    '8': '110100101101', '9': '101100101101', 'A': '110101001011', 'B': '101101001011',
    'C': '110110100101', 'D': '101011001011', 'E': '110101100101', 'F': '101101100101',
    'G': '101010011011', 'H': '110101001101', 'I': '101101001101', 'J': '101011001101',
    'K': '110101010011', 'L': '101101010011', 'M': '110110101001', 'N': '101011010011',
    'O': '110101101001', 'P': '101101101001', 'Q': '101010110011', 'R': '110101011001',
    'S': '101101011001', 'T': '101011011001', 'U': '110010101011', 'V': '100110101011',
    'W': '110011010101', 'X': '100101101011', 'Y': '110010110101', 'Z': '100110110101',
    '-': '100101011011', '.': '110010101101', ' ': '100110101101', '*': '100101101101',
    '$': '100100100101', '/': '100100101001', '+': '100101001001', '%': '101001001001',
}

def sanitize_code39(text: str) -> str:
    allowed = set(CODE39_MAP.keys())
    return "".join(c for c in text.upper() if c in allowed)

def draw_code39(pdf: FPDF, x: float, y: float, code: str, height: float = 15.0, bar_width: float = 0.4):
    code = str(code).upper()
    if not code.startswith('*'):
        code = '*' + code
    if not code.endswith('*'):
        code = code + '*'
        
    current_x = x
    pdf.set_fill_color(0, 0, 0)
    
    for char in code:
        if char not in CODE39_MAP:
            continue
        pattern = CODE39_MAP[char]
        for val in pattern:
            if val == '1':
                pdf.rect(current_x, y, bar_width, height, 'F')
            current_x += bar_width
        # Inter-character gap: 1 narrow space width
        current_x += bar_width

def safe_str(text: str) -> str:
    if not text:
        return ""
    # Ensure characters are safe for FPDF standard Arial
    return text.encode('latin-1', 'replace').decode('latin-1')

@router.get("/location/{location_id}")
def generate_location_label(
    location_id: int,
    width: float = Query(100.0, description="Ancho de etiqueta en mm"),
    height: float = Query(50.0, description="Alto de etiqueta en mm"),
    db: Session = Depends(get_db)
):
    """
    Genera una etiqueta autoadhesiva PDF para una ubicación física.
    Incluye el código legible, el almacén, la sucursal y un código de barras Code 39.
    """
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location:
        raise HTTPException(status_code=404, detail="Ubicación no encontrada")
        
    warehouse = db.query(Warehouse).filter(Warehouse.id == location.warehouse_id).first()
    facility = db.query(Facility).filter(Facility.id == warehouse.facility_id).first() if warehouse else None
    
    facility_name = facility.name if facility else "NEO ERP"
    warehouse_name = warehouse.name if warehouse else "ALMACÉN"
    
    pdf = FPDF(orientation='L', unit='mm', format=(width, height))
    pdf.add_page()
    
    margin = 5.0
    
    # Borde de diseño premium (Indigo)
    pdf.set_line_width(0.5)
    pdf.set_draw_color(79, 70, 229)
    pdf.rect(2, 2, width - 4, height - 4)
    
    # Sucursal y Almacén
    pdf.set_font("Arial", style='B', size=8)
    pdf.set_text_color(100, 116, 139) # slate-500
    top_text = f"{facility_name} - {warehouse_name}"
    pdf.cell(0, 5, safe_str(top_text.upper()), ln=True, align='C')
    
    # Código legible grande
    pdf.ln(2)
    pdf.set_font("Arial", style='B', size=24)
    pdf.set_text_color(0, 0, 0)
    pdf.cell(0, 10, safe_str(location.code), ln=True, align='C')
    
    # Código de barras Code 39
    barcode_val = location.barcode or location.code
    sanitized_val = sanitize_code39(barcode_val)
    
    total_chars = len(sanitized_val) + 2
    total_bits = total_chars * 13
    available_width = width - (2 * margin) - 10
    bar_width = min(0.4, available_width / total_bits)
    barcode_width = total_bits * bar_width
    
    barcode_x = (width - barcode_width) / 2
    barcode_y = height - 20
    barcode_height = 10.0
    
    draw_code39(pdf, barcode_x, barcode_y, sanitized_val, height=barcode_height, bar_width=bar_width)
    
    # Texto del código de barras
    pdf.set_y(barcode_y + barcode_height + 1)
    pdf.set_font("Arial", size=8)
    pdf.set_text_color(51, 65, 85) # slate-700
    pdf.cell(0, 4, safe_str(barcode_val), ln=True, align='C')
    
    # Pie de etiqueta
    pdf.set_font("Arial", style='I', size=6)
    pdf.set_text_color(148, 163, 184) # slate-400
    pdf.cell(0, 3, safe_str("SISTEMA NEO WMS - CONTROL DE UBICACIÓN"), ln=True, align='C')
    
    pdf_bytes = pdf.output(dest='S').encode('latin-1')
    return Response(content=pdf_bytes, media_type="application/pdf")

@router.get("/product/{variant_id}")
def generate_product_label(
    variant_id: int,
    width: float = Query(100.0, description="Ancho de etiqueta en mm"),
    height: float = Query(50.0, description="Alto de etiqueta en mm"),
    show_price: bool = Query(True, description="Mostrar PVP en la etiqueta"),
    batch_code: Optional[str] = Query(None, description="Código de lote (opcional)"),
    expiration_date: Optional[str] = Query(None, description="Fecha de vencimiento (opcional, YYYY-MM-DD)"),
    db: Session = Depends(get_db)
):
    """
    Genera una etiqueta autoadhesiva PDF para un producto variante.
    Incluye descripción, SKU, marca, precio bimonetario (USD/VES) y lote/vencimiento si se especifica.
    """
    variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
    if not variant:
        raise HTTPException(status_code=404, detail="Variante de producto no encontrada")
        
    product = db.query(Product).filter(Product.id == variant.product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto maestro no encontrado")
        
    # Obtener la tasa de cambio de VES para representación bimonetaria
    ves_currency = db.query(Currency).filter(Currency.code == "VES").first()
    rate = ves_currency.exchange_rate if ves_currency else Decimal("40.0")
    
    price_usd = float(variant.sales_price or 0.0)
    price_ves = price_usd * float(rate)
    
    pdf = FPDF(orientation='L', unit='mm', format=(width, height))
    pdf.add_page()
    
    margin = 5.0
    
    # Borde de diseño premium (Indigo)
    pdf.set_line_width(0.5)
    pdf.set_draw_color(79, 70, 229)
    pdf.rect(2, 2, width - 4, height - 4)
    
    # Título: Nombre del producto
    pdf.set_y(4)
    pdf.set_font("Arial", style='B', size=9)
    pdf.set_text_color(0, 0, 0)
    name_str = f"{product.name} {variant.part_number or ''}".strip()
    pdf.multi_cell(width - 10, 4.5, safe_str(name_str), align='C')
    
    # SKU e Información de Marca
    pdf.ln(1)
    pdf.set_font("Arial", size=8)
    pdf.set_text_color(71, 85, 105) # slate-600
    brand_text = f"Marca: {product.brand}" if product.brand else ""
    sku_text = f"SKU: {variant.sku}"
    info_line = f"{sku_text}   {brand_text}".strip()
    pdf.cell(0, 4, safe_str(info_line), ln=True, align='C')
    
    # Precio bimonetario
    if show_price:
        pdf.ln(1)
        pdf.set_font("Arial", style='B', size=10)
        pdf.set_text_color(5, 150, 105) # green-600
        price_text = f"PVP: ${price_usd:,.2f} USD / Bs. {price_ves:,.2f} VES"
        pdf.cell(0, 5, safe_str(price_text), ln=True, align='C')
        
    # Información de Lote y Vencimiento
    if batch_code or expiration_date:
        pdf.ln(1)
        pdf.set_font("Arial", style='B', size=7.5)
        pdf.set_text_color(180, 83, 9) # amber-700
        batch_text_parts = []
        if batch_code:
            batch_text_parts.append(f"LOTE: {batch_code}")
        if expiration_date:
            batch_text_parts.append(f"VENCE: {expiration_date}")
        batch_line = "   |   ".join(batch_text_parts)
        pdf.cell(0, 4, safe_str(batch_line), ln=True, align='C')
        
    # Código de barras
    barcode_val = variant.barcode or variant.sku
    sanitized_val = sanitize_code39(barcode_val)
    
    total_chars = len(sanitized_val) + 2
    total_bits = total_chars * 13
    available_width = width - (2 * margin) - 10
    bar_width = min(0.4, available_width / total_bits)
    barcode_width = total_bits * bar_width
    
    barcode_x = (width - barcode_width) / 2
    barcode_y = height - 16
    barcode_height = 8.0
    
    draw_code39(pdf, barcode_x, barcode_y, sanitized_val, height=barcode_height, bar_width=bar_width)
    
    # Texto del código de barras
    pdf.set_y(barcode_y + barcode_height + 0.5)
    pdf.set_font("Arial", size=7)
    pdf.set_text_color(51, 65, 85)
    pdf.cell(0, 3, safe_str(barcode_val), ln=True, align='C')
    
    # Pie
    pdf.set_font("Arial", style='I', size=5.5)
    pdf.set_text_color(148, 163, 184)
    pdf.cell(0, 2.5, safe_str("SISTEMA NEO ERP - ETIQUETA DE PRODUCTO"), ln=True, align='C')
    
    pdf_bytes = pdf.output(dest='S').encode('latin-1')
    return Response(content=pdf_bytes, media_type="application/pdf")
