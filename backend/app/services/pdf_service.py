import io
from fpdf import FPDF
from sqlalchemy.orm import Session
from app.models.purchasing import PurchaseOrder
from app.models.core import Supplier, Facility

def calculate_discount_cascade(base_amount: float, discount_str: str) -> float:
    if not discount_str:
        return base_amount
    net = base_amount
    if discount_str:
        parts = discount_str.replace(' ', '').split('+')
        for p in parts:
            try:
                pct = float(p)
                net = net * (1 - pct / 100.0)
            except Exception:
                pass
    return net

def generate_purchase_order_pdf(order_id: int, db: Session) -> bytes:
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise ValueError("Orden no encontrada")
        
    supplier = db.query(Supplier).filter(Supplier.id == order.supplier_id).first()
    facility = db.query(Facility).filter(Facility.id == order.dest_facility_id).first()
    facility_name = facility.name if facility else "BODEGA PRINCIPAL"
    
    from app.models.core import Currency
    currency = db.query(Currency).filter(Currency.id == order.currency_id).first() if order.currency_id else None
    if not currency and supplier and supplier.currency_id:
        currency = db.query(Currency).filter(Currency.id == supplier.currency_id).first()
        
    currency_decimals = currency.decimal_places if currency else 2
    currency_symbol = currency.symbol if currency and hasattr(currency, 'symbol') and currency.symbol else "$"
    currency_code = currency.code if currency else "USD"
    
    pdf = FPDF()
    pdf.add_page()
    
    # Fuentes Standard
    pdf.set_font("Arial", size=12)
    
    # Header
    pdf.set_font("Arial", style='B', size=16)
    pdf.set_text_color(79, 70, 229) # #4f46e5
    pdf.cell(200, 10, txt="NEO ERP - ORDEN DE COMPRA", ln=True, align='C')
    pdf.set_font("Arial", style='B', size=12)
    pdf.set_text_color(71, 85, 105) # slate-600
    pdf.cell(200, 10, txt=f"Referencia Oficial: {order.reference}", ln=True, align='C')
    pdf.ln(10)
    
    # Info Boxes
    pdf.set_font("Arial", style='B', size=10)
    pdf.set_text_color(0, 0, 0)
    pdf.cell(95, 6, txt="PROVEEDOR", border=0, ln=False, align='L')
    pdf.cell(95, 6, txt="DATOS ODC", border=0, ln=True, align='L')
    
    pdf.set_font("Arial", size=9)
    pdf.cell(95, 5, txt=f"Razón Social: {supplier.name if supplier else 'N/A'}", ln=False)
    pdf.cell(95, 5, txt=f"Fecha: {order.created_at.strftime('%Y-%m-%d')}", ln=True)
    
    pdf.cell(95, 5, txt=f"Identificador: {supplier.tax_id if supplier else 'N/A'}", ln=False)
    pdf.cell(95, 5, txt=f"Destino: {facility_name}", ln=True)
    
    pdf.cell(95, 5, txt=f"Contacto: {supplier.commercial_email if supplier else 'N/A'}", ln=False)
    pdf.cell(95, 5, txt=f"Moneda Transaccional: {currency_code}", ln=True)
    
    pdf.ln(10)
    
    # Table Header
    pdf.set_fill_color(79, 70, 229)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Arial", style='B', size=9)
    pdf.cell(45, 8, "CÓDIGO INSUMO", border=1, fill=True)
    pdf.cell(45, 8, "CANTIDAD", border=1, fill=True)
    pdf.cell(50, 8, "COSTO UNITARIO", border=1, fill=True)
    pdf.cell(50, 8, f"SUBTOTAL ({currency_code})", border=1, fill=True, align='R')
    pdf.ln()
    
    # Table Lines
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Arial", size=9)
    for line in order.lines:
        qty = float(line.expected_base_qty)
        cost = float(line.unit_cost)
        gross_subtotal = qty * cost
        subtotal = calculate_discount_cascade(gross_subtotal, line.line_discount_str)
        
        # Si es regalía, indicarlo visualmente
        if cost == 0:
            cost_str = "REGALÍA (BONIF)"
            subtotal_str = f"{currency_symbol} {{:,.{currency_decimals}f}}".format(0)
        else:
            cost_str = f"{currency_symbol} {{:,.{currency_decimals}f}}".format(cost)
            subtotal_str = f"{currency_symbol} {{:,.{currency_decimals}f}}".format(subtotal)
            
        # Quantity format: if it is an integer, show 0 decimals, else 3 (simple approximation)
        cost_str = f"{{:,.{currency_decimals}f}}".format(cost)
        subtotal_str = f"{{:,.{currency_decimals}f}}".format(subtotal)
        # Quantity format: if it is an integer, show 0 decimals, else 3 (simple approximation)
        qty_str = f"{qty:.3f}".rstrip('0').rstrip('.') if qty % 1 != 0 else f"{int(qty)}"
        
        pdf.cell(45, 8, f"VR-{line.variant_id}", border=1)
        pdf.cell(45, 8, qty_str, border=1)
        
        # Indicate line discount string if any
        if line.line_discount_str:
            cost_str = f"{cost_str} (-{line.line_discount_str}%)"
            
        pdf.cell(50, 8, cost_str, border=1)
        pdf.cell(50, 8, subtotal_str, border=1, align='R')
        pdf.ln()
        
    pdf.set_font("Arial", style='B', size=10)
    
    total_gross = sum([calculate_discount_cascade(float(l.expected_base_qty) * float(l.unit_cost), l.line_discount_str) for l in order.lines])
    
    if order.invoice_discount_str or order.condition_discount_str:
        pdf.cell(140, 6, "SUBTOTAL BRUTO:", border=1, align='R')
        pdf.cell(50, 6, f"{currency_symbol} {{:,.{currency_decimals}f}}".format(total_gross), border=1, align='R')
        pdf.ln()
        
        if order.invoice_discount_str:
            pdf.cell(140, 6, f"DSCTO. FACTURA ({order.invoice_discount_str}%):", border=1, align='R')
            net_inv = calculate_discount_cascade(total_gross, order.invoice_discount_str)
            pdf.cell(50, 6, f"-{currency_symbol} {{:,.{currency_decimals}f}}".format(total_gross - net_inv), border=1, align='R')
            pdf.ln()
            total_gross = net_inv
            
        if order.condition_discount_str:
            pdf.cell(140, 6, f"PRONTO PAGO ({order.condition_discount_str}%):", border=1, align='R')
            net_cond = calculate_discount_cascade(total_gross, order.condition_discount_str)
            pdf.cell(50, 6, f"-{currency_symbol} {{:,.{currency_decimals}f}}".format(total_gross - net_cond), border=1, align='R')
            pdf.ln()
            
        pdf.cell(140, 10, f"GRAN TOTAL (NETO {currency_code}):", border=1, align='R')
    else:
        pdf.cell(140, 10, f"GRAN TOTAL ({currency_code}):", border=1, align='R')
    
    total = float(order.total_amount)
    total_str = f"{{:,.{currency_decimals}f}}".format(total)
    
    pdf.set_text_color(5, 150, 105)
    pdf.cell(50, 10, f"{currency_symbol} {total_str}", border=1, align='R')
    pdf.ln(15)
    
    # Contractual details (Phase 6.7)
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Arial", style='B', size=9)
    if order.expiration_date:
        pdf.cell(200, 6, f"VENCIMIENTO DE ORDEN: {order.expiration_date.strftime('%Y-%m-%d')}", ln=True)
    if order.allow_partial_deliveries:
        pdf.cell(200, 6, "LOGISTICA: SE ACEPTAN ENTREGAS PARCIALES (BACKORDERS)", ln=True)
    else:
        pdf.cell(200, 6, "LOGISTICA: NO SE ACEPTAN ENTREGAS PARCIALES. CIERRA AL PRIMER DESPACHO.", ln=True)
        
    if order.notes:
        pdf.ln(3)
        pdf.set_font("Arial", style='B', size=9)
        pdf.cell(200, 6, "OBSERVACIONES Y CONDICIONES:", ln=True)
        pdf.set_font("Arial", size=9)
        pdf.multi_cell(0, 5, order.notes)
    
    pdf.ln(5)
    
    if hasattr(order, 'exchange_rate') and order.exchange_rate and float(order.exchange_rate) != 1.0:
        pdf.set_text_color(180, 83, 9)
        pdf.set_font("Arial", style='B', size=8)
        pdf.cell(200, 5, f"IMPORTANTE: Valores documentados y calculados bajo Tasa de Cambio Referencial = {float(order.exchange_rate)}", ln=True, align='C')
        pdf.ln(2)
    
    pdf.set_text_color(100, 116, 139)
    pdf.set_font("Arial", style='I', size=8)
    pdf.cell(200, 5, "Documento contractual autogenerado por Neo ERP. Todos los montos son vinculantes.", ln=True, align='C')
    pdf.cell(200, 5, "El proveedor reconoce y acepta cantidades y costos al procesar este documento.", ln=True, align='C')
    
    pdf_bytes = bytes(pdf.output())
    return pdf_bytes
