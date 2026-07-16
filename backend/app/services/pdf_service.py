import io
from fpdf import FPDF
from sqlalchemy.orm import Session
from decimal import Decimal
from app.models.purchasing import PurchaseOrder, PurchaseOrderLine
from app.models.core import Supplier, Facility, Company, User, Buyer, Tribute
from app.models.inventory import ProductVariant, Product, ProductPackaging

def calculate_discount_cascade(base_amount: float, discount_str: str) -> float:
    if not discount_str:
        return base_amount
    net = base_amount
    parts = discount_str.replace(' ', '').split('+')
    for p in parts:
        try:
            pct = float(p)
            net = net * (1 - pct / 100.0)
        except Exception:
            pass
    return net

class PurchaseOrderPDF(FPDF):
    def __init__(self, reference, currency_code, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.reference = reference
        self.currency_code = currency_code
        self.alias_nb_pages()

    def header(self):
        # Top banner decoration
        self.set_fill_color(79, 70, 229)  # Indigo
        self.rect(0, 0, 210, 8, 'F')
        
        self.set_y(12)
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(79, 70, 229)
        self.cell(90, 8, "NEO ERP", ln=False, align="L")
        
        self.set_font("Helvetica", "B", 12)
        self.set_text_color(71, 85, 105)
        self.cell(90, 8, "ORDEN DE COMPRA", ln=True, align="R")
        
        self.set_font("Helvetica", "", 8)
        self.set_text_color(148, 163, 184)
        self.cell(180, 4, f"Referencia: {self.reference}", ln=True, align="R")
        self.ln(3)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(148, 163, 184)
        self.cell(0, 10, f"Página {self.page_no()} de {{nb}}", border=0, align="C")

def generate_purchase_order_pdf(order_id: int, db: Session, code_type: str = "barcode") -> bytes:
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise ValueError("Orden no encontrada")
        
    supplier = db.query(Supplier).filter(Supplier.id == order.supplier_id).first()
    facility = db.query(Facility).filter(Facility.id == order.dest_facility_id).first()
    
    # Query issuer Details (Company)
    company = None
    if facility and facility.company_id:
        company = db.query(Company).filter(Company.id == facility.company_id).first()
        
    issuer_name = company.name if company else "NEO SOLUTIONS C.A."
    issuer_tax_id = company.tax_id if company else "J-31415926-9"
    issuer_address = facility.address if facility else "Calle La Planta, Edif. Neo ERP, Caracas, Venezuela"
    issuer_email = "compras@neosolutions.com"
    
    supplier_name = supplier.name if supplier else "N/A"
    supplier_tax_id = supplier.tax_id if supplier else "N/A"
    supplier_address = supplier.fiscal_address if supplier and supplier.fiscal_address else "N/A"
    supplier_email = supplier.commercial_email if supplier and supplier.commercial_email else "N/A"
    
    from app.models.core import Currency
    currency = db.query(Currency).filter(Currency.id == order.currency_id).first() if order.currency_id else None
    if not currency and supplier and supplier.currency_id:
        currency = db.query(Currency).filter(Currency.id == supplier.currency_id).first()
        
    currency_decimals = currency.decimal_places if currency else 2
    currency_symbol = currency.symbol if currency and hasattr(currency, 'symbol') and currency.symbol else "$"
    currency_code = currency.code if currency else "USD"
    
    emission_date = order.created_at.strftime('%Y-%m-%d') if order.created_at else "N/A"
    expiration_date = order.expiration_date.strftime('%Y-%m-%d') if order.expiration_date else "N/A"
    
    buyer_name = "N/A"
    if order.buyer_id:
        buyer = db.query(Buyer).filter(Buyer.id == order.buyer_id).first()
        if buyer:
            buyer_user = db.query(User).filter(User.id == buyer.user_id).first()
            if buyer_user:
                buyer_name = buyer_user.full_name
                
    pdf = PurchaseOrderPDF(reference=order.reference, currency_code=currency_code)
    pdf.set_margins(15, 15, 15)
    pdf.add_page()
    
    y_start = pdf.get_y()
    
    # 1. Structured boxes for Issuer and Supplier
    pdf.set_draw_color(226, 232, 240)
    pdf.set_fill_color(248, 250, 252)
    pdf.rect(15, y_start, 88, 38, 'DF')
    pdf.set_xy(17, y_start + 2)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(51, 65, 85)
    pdf.cell(84, 4, "EMISOR / FACTURAR A:", ln=True)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(71, 85, 105)
    pdf.multi_cell(84, 4.5, f"Nombre: {issuer_name}\nRIF: {issuer_tax_id}\nDirección: {issuer_address}\nEmail: {issuer_email}")
    
    pdf.rect(107, y_start, 88, 38, 'DF')
    pdf.set_xy(109, y_start + 2)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(51, 65, 85)
    pdf.cell(84, 4, "PROVEEDOR:", ln=True)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(71, 85, 105)
    pdf.multi_cell(84, 4.5, f"Razón Social: {supplier_name}\nRIF: {supplier_tax_id}\nDirección: {supplier_address}\nEmail: {supplier_email}")
    
    pdf.set_y(y_start + 40)
    
    # Metadata bar
    pdf.set_fill_color(241, 245, 249)
    pdf.rect(15, pdf.get_y(), 180, 10, 'F')
    pdf.set_xy(17, pdf.get_y() + 2)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(71, 85, 105)
    pdf.cell(45, 6, f"F. Emisión: {emission_date}")
    pdf.cell(45, 6, f"F. Vencimiento: {expiration_date}")
    pdf.cell(45, 6, f"Moneda: {currency_code} ({currency_symbol})")
    pdf.cell(45, 6, f"Comprador: {buyer_name}")
    
    pdf.ln(12)
    
    # 2. Items Table
    pdf.set_fill_color(79, 70, 229)
    pdf.set_text_color(255, 255, 255)
    pdf.set_draw_color(79, 70, 229)
    pdf.set_font("Helvetica", "B", 8)
    
    pdf.cell(25, 8, "CÓDIGO", border=1, fill=True, align="L")
    pdf.cell(45, 8, "DESCRIPCIÓN", border=1, fill=True, align="L")
    pdf.cell(25, 8, "EMPAQUE", border=1, fill=True, align="L")
    pdf.cell(30, 8, "CANTIDAD", border=1, fill=True, align="C")
    pdf.cell(20, 8, "COSTO UNIT.", border=1, fill=True, align="R")
    pdf.cell(15, 8, "DSCTO.", border=1, fill=True, align="C")
    pdf.cell(20, 8, "SUBTOTAL", border=1, fill=True, align="R")
    pdf.ln()
    
    pdf.set_text_color(51, 65, 85)
    pdf.set_draw_color(226, 232, 240)
    
    total_lines_net = 0.0
    line_details = []
    
    for line in order.lines:
        variant = db.query(ProductVariant).filter(ProductVariant.id == line.variant_id).first()
        prod = db.query(Product).filter(Product.id == variant.product_id).first() if variant else None
        pack = db.query(ProductPackaging).filter(ProductPackaging.id == line.pack_id).first() if line.pack_id else None
        
        # Code selection
        if code_type == "barcode" and variant and variant.barcode:
            code_str = variant.barcode
        else:
            code_str = variant.sku if variant else f"VR-{line.variant_id}"
            
        prod_name = prod.name if prod else "N/A"
        pack_name = pack.name if pack else "Und. Base"
        qty_per_pack = float(pack.qty_per_unit) if pack else 1.0
        
        pack_str = f"{pack_name} (x{int(qty_per_pack) if qty_per_pack % 1 == 0 else qty_per_pack})"
        
        qty_ordered_val = float(line.qty_ordered)
        expected_base_qty_val = float(line.expected_base_qty)
        
        qty_ordered_str = f"{qty_ordered_val:.3f}".rstrip('0').rstrip('.') if qty_ordered_val % 1 != 0 else f"{int(qty_ordered_val)}"
        expected_base_str = f"{expected_base_qty_val:.3f}".rstrip('0').rstrip('.') if expected_base_qty_val % 1 != 0 else f"{int(expected_base_qty_val)}"
        
        if line.pack_id:
            qty_str = f"{qty_ordered_str} Pac. ({expected_base_str} Und.)"
        else:
            qty_str = f"{expected_base_str} Und."
            
        unit_cost_val = float(line.unit_cost)
        
        gross_subtotal = expected_base_qty_val * unit_cost_val
        subtotal_net = calculate_discount_cascade(gross_subtotal, line.line_discount_str)
        total_lines_net += subtotal_net
        
        tax_rate = float(prod.tribute.rate) if prod and prod.tribute else 0.0
        
        line_details.append({
            "line": line,
            "code_str": code_str,
            "prod_name": prod_name,
            "pack_str": pack_str,
            "qty_str": qty_str,
            "unit_cost_val": unit_cost_val,
            "subtotal_net": subtotal_net,
            "tax_rate": tax_rate
        })
        
    for item in line_details:
        pdf.set_font("Helvetica", "", 8)
        
        desc_truncated = item["prod_name"]
        if len(desc_truncated) > 26:
            desc_truncated = desc_truncated[:23] + "..."
            
        code_truncated = item["code_str"]
        if len(code_truncated) > 14:
            code_truncated = code_truncated[:12] + "..."
            
        pdf.cell(25, 7, code_truncated, border=1)
        pdf.cell(45, 7, desc_truncated, border=1)
        pdf.cell(25, 7, item["pack_str"], border=1)
        pdf.cell(30, 7, item["qty_str"], border=1, align="C")
        pdf.cell(20, 7, f"{currency_symbol}{item['unit_cost_val']:,.2f}", border=1, align="R")
        pdf.cell(15, 7, f"{item['line'].line_discount_str or '0'}%", border=1, align="C")
        pdf.cell(20, 7, f"{currency_symbol}{item['subtotal_net']:,.2f}", border=1, align="R")
        pdf.ln()
        
    # Global discount calculations
    net_after_invoice = calculate_discount_cascade(total_lines_net, order.invoice_discount_str)
    net_final = calculate_discount_cascade(net_after_invoice, order.condition_discount_str)
    
    global_ratio = net_final / total_lines_net if total_lines_net > 0 else 1.0
    total_vat = 0.0
    for item in line_details:
        item_net_final = item["subtotal_net"] * global_ratio
        item_vat = item_net_final * (item["tax_rate"] / 100.0)
        total_vat += item_vat
        
    grand_total = net_final + total_vat
    
    # 3. Footer totals block
    if pdf.get_y() > 175:
        pdf.add_page()
        
    pdf.ln(5)
    
    y_totals = pdf.get_y()
    
    # Notes box
    pdf.set_xy(15, y_totals)
    pdf.set_draw_color(226, 232, 240)
    pdf.set_fill_color(250, 250, 250)
    pdf.rect(15, y_totals, 110, 20, 'DF')
    pdf.set_xy(17, y_totals + 1)
    pdf.set_font("Helvetica", "B", 7)
    pdf.set_text_color(100, 116, 139)
    pdf.cell(106, 4, "NOTAS Y CONDICIONES:", ln=True)
    pdf.set_font("Helvetica", "", 7)
    notes_str = order.notes if order.notes else "Entrega sujeta a los términos generales de compra de Neo ERP."
    if len(notes_str) > 180:
        notes_str = notes_str[:177] + "..."
    pdf.multi_cell(106, 3.5, notes_str)
    
    # Signature line
    pdf.set_xy(15, y_totals + 23)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(71, 85, 105)
    pdf.cell(110, 6, "Firma Recepción: _______________________   Fecha: ____/____/________", ln=True)
    
    # Totals (Right Column)
    pdf.set_xy(130, y_totals)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(100, 116, 139)
    
    pdf.cell(35, 5, "Subtotal Líneas:", border="B")
    pdf.cell(30, 5, f"{currency_symbol}{total_lines_net:,.2f}", border="B", align="R", ln=True)
    
    if order.invoice_discount_str:
        pdf.set_xy(130, pdf.get_y())
        inv_disc_amount = total_lines_net - net_after_invoice
        pdf.cell(35, 5, f"Dscto. Invoice ({order.invoice_discount_str}%):", border="B")
        pdf.cell(30, 5, f"-{currency_symbol}{inv_disc_amount:,.2f}", border="B", align="R", ln=True)
        
    if order.condition_discount_str:
        pdf.set_xy(130, pdf.get_y())
        cond_disc_amount = net_after_invoice - net_final
        pdf.cell(35, 5, f"Dscto. Condición ({order.condition_discount_str}%):", border="B")
        pdf.cell(30, 5, f"-{currency_symbol}{cond_disc_amount:,.2f}", border="B", align="R", ln=True)
        
    pdf.set_xy(130, pdf.get_y())
    pdf.cell(35, 5, "Base Imponible (Neto):", border="B")
    pdf.cell(30, 5, f"{currency_symbol}{net_final:,.2f}", border="B", align="R", ln=True)
    
    pdf.set_xy(130, pdf.get_y())
    pdf.cell(35, 5, "IVA / Impuestos:", border="B")
    pdf.cell(30, 5, f"{currency_symbol}{total_vat:,.2f}", border="B", align="R", ln=True)
    
    pdf.set_xy(130, pdf.get_y() + 1)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(79, 70, 229)
    pdf.cell(35, 7, "TOTAL GENERAL:", border=1)
    pdf.cell(30, 7, f"{currency_symbol}{grand_total:,.2f}", border=1, align="R", ln=True)
    
    # 4. Under-notes
    pdf.set_y(y_totals + 30)
    
    if hasattr(order, 'exchange_rate') and order.exchange_rate and float(order.exchange_rate) != 1.0:
        pdf.set_text_color(180, 83, 9)
        pdf.set_font("Helvetica", "B", 7)
        pdf.cell(0, 4, f"IMPORTANTE: Valores documentados y calculados bajo Tasa de Cambio Referencial = {float(order.exchange_rate)}", ln=True, align='C')
        pdf.ln(2)
        
    pdf.set_text_color(148, 163, 184)
    pdf.set_font("Helvetica", "I", 7)
    pdf.cell(0, 4, "Documento contractual autogenerado por Neo ERP. Todos los montos son vinculantes.", ln=True, align='C')
    pdf.cell(0, 4, "El proveedor reconoce y acepta cantidades y costos al procesar este documento.", ln=True, align='C')
    
    pdf_bytes = pdf.output(dest='S')
    if isinstance(pdf_bytes, str):
        pdf_bytes = pdf_bytes.encode('latin-1')
    return pdf_bytes
