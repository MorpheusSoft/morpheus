import io
from fpdf import FPDF
from sqlalchemy.orm import Session
from decimal import Decimal
from app.models.purchasing import PurchaseOrder, PurchaseOrderLine
from app.models.core import Supplier, Facility, Company, User, Buyer, Tribute
from typing import Optional
from app.models.inventory import ProductVariant, Product, ProductPackaging, ProductBarcode

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

def sanitize_pdf_text(text: Optional[str]) -> str:
    if not text:
        return ""
    # Map common non-latin-1 typographic unicode characters to ASCII/latin-1 equivalents
    replacements = {
        '\u2018': "'",
        '\u2019': "'",
        '\u201c': '"',
        '\u201d': '"',
        '\u2013': '-',
        '\u2014': '-',
        '\u2026': '...',
        '\u2022': '*',
        '\u00a0': ' ',
        '\u200b': '',
        '\u20ac': 'EUR',
        '–': '-',
        '—': '-',
        '“': '"',
        '”': '"',
        '’': "'",
        '‘': "'",
        '…': '...',
    }
    for orig, rep in replacements.items():
        text = text.replace(orig, rep)
    return text.encode('latin-1', 'replace').decode('latin-1')

def get_multicell_height(pdf: FPDF, w: float, line_height: float, text: str) -> float:
    lines = 0
    # Available text width accounts for FPDF's cell margins (1mm each side = 2mm)
    max_txt_w = max(1.0, w - 2.0)
    for paragraph in text.split('\n'):
        words = paragraph.split(' ')
        cur_w = 0.0
        p_lines = 1
        for word in words:
            word_w = pdf.get_string_width(word + ' ')
            if cur_w + word_w > max_txt_w:
                p_lines += 1
                cur_w = word_w
            else:
                cur_w += word_w
        lines += p_lines
    return lines * line_height

def resolve_line_code(
    db: Optional[Session],
    variant: Optional[ProductVariant],
    pack: Optional[ProductPackaging],
    line_variant_id: int,
    code_type: str = "barcode"
) -> str:
    sku_fallback = variant.sku if (variant and variant.sku) else f"VR-{line_variant_id}"
    
    # If not in barcode mode or no variant exists, return the SKU
    if (code_type or "barcode").strip().lower() != "barcode" or not variant:
        return sku_fallback
        
    if db:
        barcodes = (
            db.query(ProductBarcode)
            .filter(ProductBarcode.product_variant_id == variant.id)
            .order_by(ProductBarcode.id.asc())
            .all()
        )
    elif hasattr(variant, 'barcodes') and variant.barcodes:
        barcodes = list(variant.barcodes)
    else:
        barcodes = []
    
    standard_bcs = [
        b for b in barcodes
        if (b.code_type or "").strip().upper() != "STELLAR_CODE" and b.barcode and b.barcode.strip()
    ]
    stellar_bcs = [
        b for b in barcodes
        if (b.code_type or "").strip().upper() == "STELLAR_CODE" and b.barcode and b.barcode.strip()
    ]
    
    # 1. Pack barcode if the line is ordered by packaging (conversion_factor == pack.qty_per_unit)
    if pack and pack.qty_per_unit is not None:
        try:
            target_pack_factor = float(pack.qty_per_unit)
            for b in standard_bcs:
                if b.conversion_factor is not None and abs(float(b.conversion_factor) - target_pack_factor) < 1e-4:
                    return b.barcode.strip()
        except (ValueError, TypeError):
            pass

    # 2. Base unit barcode (conversion_factor == 1)
    for b in standard_bcs:
        if b.conversion_factor is not None:
            try:
                if abs(float(b.conversion_factor) - 1.0) < 1e-4:
                    return b.barcode.strip()
            except (ValueError, TypeError):
                pass
                
    # 3. Any barcode (standard barcode, or variant.barcode)
    if standard_bcs:
        return standard_bcs[0].barcode.strip()
    if variant.barcode and variant.barcode.strip():
        return variant.barcode.strip()
        
    # 4. Stellar code fallback (prioritize pack factor or base unit if multiple)
    if stellar_bcs:
        if pack and pack.qty_per_unit is not None:
            try:
                target_pack_factor = float(pack.qty_per_unit)
                for b in stellar_bcs:
                    if b.conversion_factor is not None and abs(float(b.conversion_factor) - target_pack_factor) < 1e-4:
                        return b.barcode.strip()
            except (ValueError, TypeError):
                pass
        for b in stellar_bcs:
            if b.conversion_factor is not None:
                try:
                    if abs(float(b.conversion_factor) - 1.0) < 1e-4:
                        return b.barcode.strip()
                except (ValueError, TypeError):
                    pass
        return stellar_bcs[0].barcode.strip()
        
    # 5. SKU fallback
    return sku_fallback

class PurchaseOrderPDF(FPDF):
    def __init__(self, reference, currency_code, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.reference = sanitize_pdf_text(reference)
        self.currency_code = sanitize_pdf_text(currency_code)
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
    facility = db.query(Facility).filter(Facility.id == order.dest_facility_id).first() if order.dest_facility_id else None
    
    # Query issuer Details (Company)
    company = None
    if facility and facility.company_id:
        company = db.query(Company).filter(Company.id == facility.company_id).first()
    if not company:
        company = db.query(Company).first()
        
    issuer_name = sanitize_pdf_text(company.name if company else "NEO SOLUTIONS C.A.")
    issuer_tax_id = sanitize_pdf_text(company.tax_id if company else "J-31415926-9")
    issuer_address = sanitize_pdf_text(facility.address if facility else "Calle La Planta, Edif. Neo ERP, Caracas, Venezuela")
    issuer_email = "compras@neosolutions.com"
    
    supplier_name = sanitize_pdf_text(supplier.name if supplier else "N/A")
    supplier_tax_id = sanitize_pdf_text(supplier.tax_id if supplier else "N/A")
    supplier_address = sanitize_pdf_text(supplier.fiscal_address if supplier and supplier.fiscal_address else "N/A")
    supplier_email = sanitize_pdf_text(supplier.commercial_email if supplier and supplier.commercial_email else "N/A")
    
    from app.models.core import Currency
    currency = db.query(Currency).filter(Currency.id == order.currency_id).first() if order.currency_id else None
    if not currency and supplier and supplier.currency_id:
        currency = db.query(Currency).filter(Currency.id == supplier.currency_id).first()
        
    currency_decimals = currency.decimal_places if currency else 2
    currency_symbol = sanitize_pdf_text(currency.symbol if currency and hasattr(currency, 'symbol') and currency.symbol else "$")
    currency_code = sanitize_pdf_text(currency.code if currency else "USD")
    
    emission_date = order.created_at.strftime('%Y-%m-%d') if order.created_at else "N/A"
    expiration_date = order.expiration_date.strftime('%Y-%m-%d') if order.expiration_date else "N/A"
    
    buyer_name = "N/A"
    if order.buyer_id:
        buyer = db.query(Buyer).filter(Buyer.id == order.buyer_id).first()
        if buyer:
            buyer_user = db.query(User).filter(User.id == buyer.user_id).first()
            if buyer_user:
                buyer_name = sanitize_pdf_text(buyer_user.full_name)
                
    pdf = PurchaseOrderPDF(reference=order.reference, currency_code=currency_code)
    pdf.set_margins(15, 15, 15)
    pdf.add_page()
    
    y_start = pdf.get_y()
    
    box_w = 88
    inner_w = 82
    
    # Sanitize and guard text lengths to fit comfortably within the boxes
    issuer_name_disp = issuer_name[:70] + "..." if len(issuer_name) > 70 else issuer_name
    issuer_addr_disp = issuer_address[:100] + "..." if len(issuer_address) > 100 else issuer_address
    issuer_email_disp = issuer_email[:40] + "..." if len(issuer_email) > 40 else issuer_email
    
    supplier_name_disp = supplier_name[:70] + "..." if len(supplier_name) > 70 else supplier_name
    supplier_addr_disp = supplier_address[:100] + "..." if len(supplier_address) > 100 else supplier_address
    supplier_email_disp = supplier_email[:40] + "..." if len(supplier_email) > 40 else supplier_email

    emisor_txt = f"Nombre: {issuer_name_disp}\nRIF: {issuer_tax_id}\nDirección: {issuer_addr_disp}\nEmail: {issuer_email_disp}"
    proveedor_txt = f"Razón Social: {supplier_name_disp}\nRIF: {supplier_tax_id}\nDirección: {supplier_addr_disp}\nEmail: {supplier_email_disp}"

    # Calculate required box height dynamically so content never overflows
    pdf.set_font("Helvetica", "", 8)
    h_emisor = get_multicell_height(pdf, inner_w, 4.2, emisor_txt)
    h_proveedor = get_multicell_height(pdf, inner_w, 4.2, proveedor_txt)
    box_h = max(38.0, max(h_emisor, h_proveedor) + 11.0)

    # 1. Structured boxes for Issuer and Supplier
    pdf.set_draw_color(226, 232, 240)
    pdf.set_fill_color(248, 250, 252)
    
    # --- Box 1: EMISOR (Left: 15 to 103) ---
    pdf.rect(15, y_start, box_w, box_h, 'DF')
    pdf.set_xy(18, y_start + 2.5)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(51, 65, 85)
    pdf.cell(inner_w, 4, "EMISOR / FACTURAR A:")
    pdf.set_xy(18, y_start + 7.5)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(71, 85, 105)
    pdf.multi_cell(inner_w, 4.2, emisor_txt)
    
    # --- Box 2: PROVEEDOR (Right: 107 to 195) ---
    pdf.rect(107, y_start, box_w, box_h, 'DF')
    pdf.set_xy(110, y_start + 2.5)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(51, 65, 85)
    pdf.cell(inner_w, 4, "PROVEEDOR:")
    pdf.set_xy(110, y_start + 7.5)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(71, 85, 105)
    pdf.multi_cell(inner_w, 4.2, proveedor_txt)
    
    # Build Destination / Dispatch Location string safely
    def _safe_field(obj, attr):
        if not obj:
            return None
        val = getattr(obj, attr, None)
        if val is None or hasattr(val, '_mock_return_value'):
            return None
        s = str(val).strip()
        return s if s else None

    fac_name = _safe_field(facility, 'name')
    fac_code = _safe_field(facility, 'code')
    fac_address = _safe_field(facility, 'address')

    if facility and (fac_name or fac_code or fac_address):
        parts = []
        if fac_name:
            parts.append(fac_name)
        if fac_code:
            parts.append(f"({fac_code})")
        fac_head = " ".join(parts) if parts else ""

        if fac_head and fac_address:
            dest_location = f"{fac_head} - {fac_address}"
        elif fac_head:
            dest_location = fac_head
        else:
            dest_location = fac_address
    else:
        dest_location = "General (Libre)"

    if len(dest_location) > 180:
        dest_location = dest_location[:177] + "..."
    dest_str = sanitize_pdf_text(f"DESPACHAR A / DESTINO: {dest_location}")

    # Metadata bar positioned cleanly below both boxes with dynamic height
    bar_y = y_start + box_h + 3
    pdf.set_font("Helvetica", "B", 8)
    h_dest = get_multicell_height(pdf, 176, 4.0, dest_str)
    h_dest = max(4.0, h_dest)
    bar_h = 8.0 + h_dest + 2.0

    pdf.set_fill_color(241, 245, 249)
    pdf.rect(15, bar_y, 180, bar_h, 'F')

    # Row 1: Dates, Currency, Buyer
    pdf.set_xy(17, bar_y + 2)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(71, 85, 105)
    pdf.cell(44, 5, f"F. Emisión: {emission_date}")
    pdf.cell(44, 5, f"F. Vencimiento: {expiration_date}")
    pdf.cell(44, 5, f"Moneda: {currency_code} ({currency_symbol})")
    buyer_disp = buyer_name[:20] + "..." if len(buyer_name) > 20 else buyer_name
    pdf.cell(44, 5, f"Comprador: {buyer_disp}")

    # Row 2: Dispatch / Destination Location
    pdf.set_xy(17, bar_y + 7.5)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(71, 85, 105)
    pdf.multi_cell(176, 4.0, dest_str)
    
    pdf.set_y(bar_y + bar_h + 3)
    
    # 2. Items Table
    def render_table_header():
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

    render_table_header()
    
    pdf.set_text_color(51, 65, 85)
    pdf.set_draw_color(226, 232, 240)
    
    total_lines_net = 0.0
    line_details = []
    
    for line in order.lines:
        variant = db.query(ProductVariant).filter(ProductVariant.id == line.variant_id).first()
        prod = db.query(Product).filter(Product.id == variant.product_id).first() if variant else None
        pack = db.query(ProductPackaging).filter(ProductPackaging.id == line.pack_id).first() if line.pack_id else None
        
        # Code selection
        code_str = resolve_line_code(db, variant, pack, line.variant_id, code_type=code_type)
            
        prod_name = sanitize_pdf_text(prod.name if prod else "N/A")
        pack_name = sanitize_pdf_text(pack.name if pack else "Und. Base")
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
            "code_str": sanitize_pdf_text(code_str),
            "prod_name": prod_name,
            "pack_str": pack_str,
            "qty_str": qty_str,
            "unit_cost_val": unit_cost_val,
            "subtotal_net": subtotal_net,
            "tax_rate": tax_rate
        })
        
    for item in line_details:
        if pdf.get_y() > 260:
            pdf.add_page()
            render_table_header()

        pdf.set_font("Helvetica", "", 8)
        
        desc_truncated = item["prod_name"]
        if len(desc_truncated) > 26:
            desc_truncated = desc_truncated[:23] + "..."
            
        code_str = str(item["code_str"])
        code_font_size = 8.0
        pdf.set_font("Helvetica", "", code_font_size)
        while code_font_size > 5.5 and pdf.get_string_width(code_str) > 23.0:
            code_font_size -= 0.5
            pdf.set_font("Helvetica", "", code_font_size)
        if pdf.get_string_width(code_str) > 23.0:
            while len(code_str) > 3 and pdf.get_string_width(code_str + "...") > 23.0:
                code_str = code_str[:-1]
            code_str += "..."
            
        pdf.cell(25, 7, code_str, border=1)
        pdf.set_font("Helvetica", "", 8)
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
    notes_str = sanitize_pdf_text(order.notes) if order.notes else "Entrega sujeta a los términos generales de compra de Neo ERP."
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
        pdf_bytes = pdf_bytes.encode('latin-1', 'replace')
    return pdf_bytes
