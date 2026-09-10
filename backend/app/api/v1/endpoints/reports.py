from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, case, text, or_
from datetime import datetime, timedelta
import os
import urllib.request
import json
import io
from fpdf import FPDF
from pydantic import BaseModel

from app.api import deps
from app.models.inventory import StockMove, Product, ProductVariant, Warehouse, Location, Category, ProductFacilityPrice, ProductBarcode
from app.models.core import User, Tribute, Supplier, Facility
from app.models.purchasing import SupplierProduct, PurchaseOrder, PurchaseOrderLine
from app.models.sales import Document, DocumentLine

router = APIRouter()

class AIChatRequest(BaseModel):
    message: str
    history: Optional[List[dict]] = []

@router.get("/stock")
def get_stock_level(
    db: Session = Depends(deps.get_db),
    warehouse_id: Optional[int] = None,
    location_id: Optional[int] = None,
    product_id: Optional[int] = None,
):
    """
    Get current stock levels (Grouped by Product and Location).
    Logic: Sum(Incoming) - Sum(Outgoing).
    """
    sql = text("""
    WITH move_lines AS (
        SELECT 
            product_id, 
            location_dest_id AS location_id, 
            quantity_done AS qty 
        FROM inv.stock_moves 
        WHERE state = 'DONE'
        
        UNION ALL
        
        SELECT 
            product_id, 
            location_src_id AS location_id, 
            -quantity_done AS qty 
        FROM inv.stock_moves 
        WHERE state = 'DONE'
    )
    SELECT 
        m.product_id,
        p.name as product_name,
        v.sku,
        m.location_id,
        l.name as location_name,
        SUM(m.qty) as stock_qty,
        v.average_cost,
        v.replacement_cost,
        (SUM(m.qty) * v.average_cost) as value_avg,
        (SUM(m.qty) * v.replacement_cost) as value_replacement
    FROM move_lines m
    JOIN inv.product_variants v ON v.id = m.product_id
    JOIN inv.products p ON p.id = v.product_id
    JOIN inv.locations l ON l.id = m.location_id
    WHERE l.usage = 'INTERNAL' -- Only show my stock
    GROUP BY m.product_id, p.name, v.sku, m.location_id, l.name, v.average_cost, v.replacement_cost
    HAVING SUM(m.qty) != 0
    ORDER BY p.name
    """)
    
    result = db.execute(sql).fetchall()
    
    data = []
    for row in result:
        data.append({
            "product_id": row.product_id,
            "product": row.product_name,
            "sku": row.sku,
            "location": row.location_name,
            "quantity": float(row.stock_qty),
            "cost_avg": float(row.average_cost or 0),
            "value_avg": float(row.value_avg or 0),
            "cost_replacement": float(row.replacement_cost or 0),
            "value_replacement": float(row.value_replacement or 0)
        })
        
    return data

class KardexFilter(BaseModel):
    product_ids: List[int]
    facility_ids: Optional[List[int]] = []
    warehouse_ids: Optional[List[int]] = []
    location_ids: Optional[List[int]] = []
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None

@router.post("/kardex")
def get_advanced_kardex(
    filters: KardexFilter,
    db: Session = Depends(deps.get_db),
):
    """
    Get detailed history of movements (Kardex) for up to 10 products.
    Includes filtering by facilities, warehouses, locations, and dates.
    Calculates running balance (saldo).
    Unifies StockMoves, Inventory Adjustments, and Sales.
    """
    if not filters.product_ids or len(filters.product_ids) > 10:
        raise HTTPException(status_code=400, detail="Debe seleccionar entre 1 y 10 productos para el Kardex.")

    target_facility_ids = set(filters.facility_ids or [])
    target_warehouse_ids = set(filters.warehouse_ids or [])

    if target_warehouse_ids:
        wh_facs = db.query(Warehouse.facility_id).filter(Warehouse.id.in_(target_warehouse_ids)).all()
        for f in wh_facs:
            if f[0] is not None:
                target_facility_ids.add(f[0])

    if filters.location_ids:
        loc_facs = db.query(Warehouse.facility_id).join(Location).filter(Location.id.in_(filters.location_ids)).all()
        target_facility_ids.update([f[0] for f in loc_facs if f[0] is not None])

    if not target_facility_ids:
        all_facs = db.query(Facility.id).all()
        target_facility_ids.update([f[0] for f in all_facs if f[0] is not None])

    if not target_facility_ids:
        return []

    tf_ids_str = ",".join(map(str, target_facility_ids))
    p_ids_str = ",".join(map(str, filters.product_ids))

    base_cte = f"""
        WITH combined_moves AS (
            SELECT 
                sm.product_id,
                sm.date::timestamptz as date,
                COALESCE(sm.reference, 'MOVE-' || sm.id) as reference,
                CASE 
                    WHEN pt.name IS NOT NULL THEN UPPER(pt.name)
                    WHEN l_src.usage = 'SUPPLIER' AND l_dest.usage = 'INTERNAL' THEN 'RECEPCIÓN'
                    ELSE 'TRANSFERENCIA'
                END as source_type,
                sm.quantity_done as qty_done,
                sm.unit_cost as unit_cost,
                w_src.facility_id as src_facility_id,
                w_dest.facility_id as dest_facility_id,
                f_src.name as src_facility_name,
                f_dest.name as dest_facility_name,
                w_src.id as src_warehouse_id,
                w_dest.id as dest_warehouse_id,
                w_src.name as src_warehouse_name,
                w_dest.name as dest_warehouse_name,
                l_src.name as src_location_name,
                l_dest.name as dest_location_name,
                COALESCE(w_src.name, 'N/A') || ' - ' || COALESCE(l_src.name, 'N/A') as src_name,
                COALESCE(w_dest.name, 'N/A') || ' - ' || COALESCE(l_dest.name, 'N/A') as dest_name
            FROM inv.stock_moves sm
            LEFT JOIN inv.stock_pickings p ON p.id = sm.picking_id
            LEFT JOIN inv.stock_picking_types pt ON pt.id = p.picking_type_id
            LEFT JOIN inv.locations l_src ON l_src.id = sm.location_src_id
            LEFT JOIN inv.warehouses w_src ON w_src.id = l_src.warehouse_id
            LEFT JOIN core.facilities f_src ON f_src.id = w_src.facility_id
            LEFT JOIN inv.locations l_dest ON l_dest.id = sm.location_dest_id
            LEFT JOIN inv.warehouses w_dest ON w_dest.id = l_dest.warehouse_id
            LEFT JOIN core.facilities f_dest ON f_dest.id = w_dest.facility_id
            WHERE sm.state = 'DONE'
            
            UNION ALL
            
            SELECT
                il.product_variant_id as product_id,
                COALESCE(iss.date_end, iss.date_start)::timestamptz as date,
                iss.name as reference,
                'AJUSTE' as source_type,
                ABS(il.difference_qty) as qty_done,
                0 as unit_cost, 
                CASE WHEN il.difference_qty < 0 THEN iss.facility_id ELSE NULL END as src_facility_id,
                CASE WHEN il.difference_qty > 0 THEN iss.facility_id ELSE NULL END as dest_facility_id,
                CASE WHEN il.difference_qty < 0 THEN f.name ELSE NULL END as src_facility_name,
                CASE WHEN il.difference_qty > 0 THEN f.name ELSE NULL END as dest_facility_name,
                CASE WHEN il.difference_qty < 0 THEN w.id ELSE NULL END as src_warehouse_id,
                CASE WHEN il.difference_qty > 0 THEN w.id ELSE NULL END as dest_warehouse_id,
                CASE WHEN il.difference_qty < 0 THEN w.name ELSE NULL END as src_warehouse_name,
                CASE WHEN il.difference_qty > 0 THEN w.name ELSE NULL END as dest_warehouse_name,
                CASE WHEN il.difference_qty < 0 THEN l.name ELSE NULL END as src_location_name,
                CASE WHEN il.difference_qty > 0 THEN l.name ELSE NULL END as dest_location_name,
                CASE WHEN il.difference_qty < 0 THEN COALESCE(w.name || ' - ' || l.name, f.name || ' - AJUSTE') ELSE 'N/A' END as src_name,
                CASE WHEN il.difference_qty > 0 THEN COALESCE(w.name || ' - ' || l.name, f.name || ' - AJUSTE') ELSE 'N/A' END as dest_name
            FROM inv.inventory_lines il
            JOIN inv.inventory_sessions iss ON iss.id = il.session_id
            JOIN core.facilities f ON f.id = iss.facility_id
            LEFT JOIN inv.locations l ON l.id = il.location_id
            LEFT JOIN inv.warehouses w ON w.id = l.warehouse_id
            WHERE iss.state IN ('APPLIED', 'DONE') AND il.difference_qty != 0
            
            UNION ALL
            
            SELECT
                dl.variant_id as product_id,
                d.created_at::timestamptz as date,
                d.document_number as reference,
                'VENTA' as source_type,
                dl.quantity as qty_done,
                dl.unit_price as unit_cost,
                d.facility_id as src_facility_id,
                NULL as dest_facility_id,
                f.name as src_facility_name,
                'CLIENTE' as dest_facility_name,
                w_def.id as src_warehouse_id,
                NULL as dest_warehouse_id,
                COALESCE(w_def.name, f.name || ' - VENTAS') as src_warehouse_name,
                'CLIENTE FINAL' as dest_warehouse_name,
                'MOSTRADOR' as src_location_name,
                'CLIENTE' as dest_location_name,
                f.name || ' - VENTAS' as src_name,
                'CLIENTE - DESTINO' as dest_name
            FROM sales.document_lines dl
            JOIN sales.documents d ON d.id = dl.document_id
            JOIN core.facilities f ON f.id = d.facility_id
            LEFT JOIN LATERAL (
                SELECT id, name FROM inv.warehouses WHERE facility_id = d.facility_id ORDER BY id ASC LIMIT 1
            ) w_def ON true
            WHERE d.type = 'INVOICE' AND d.state = 'CONFIRMED'
        )
    """

    if target_warehouse_ids:
        t_wh_ids_str = ",".join(map(str, target_warehouse_ids))
        scope_condition = f"(src_warehouse_id IN ({t_wh_ids_str}) OR dest_warehouse_id IN ({t_wh_ids_str}))"
        initial_in_cond = f"dest_warehouse_id IN ({t_wh_ids_str}) AND (src_warehouse_id IS NULL OR src_warehouse_id NOT IN ({t_wh_ids_str}))"
        initial_out_cond = f"src_warehouse_id IN ({t_wh_ids_str}) AND (dest_warehouse_id IS NULL OR dest_warehouse_id NOT IN ({t_wh_ids_str}))"
    else:
        scope_condition = f"(src_facility_id IN ({tf_ids_str}) OR dest_facility_id IN ({tf_ids_str}))"
        initial_in_cond = f"dest_facility_id IN ({tf_ids_str}) AND (src_facility_id IS NULL OR src_facility_id NOT IN ({tf_ids_str}))"
        initial_out_cond = f"src_facility_id IN ({tf_ids_str}) AND (dest_facility_id IS NULL OR dest_facility_id NOT IN ({tf_ids_str}))"

    initial_balances = {p_id: 0.0 for p_id in filters.product_ids}

    if filters.date_from:
        sql_initial = text(base_cte + f"""
            SELECT 
                product_id,
                SUM(CASE WHEN {initial_in_cond} THEN qty_done ELSE 0 END) as qty_in,
                SUM(CASE WHEN {initial_out_cond} THEN qty_done ELSE 0 END) as qty_out
            FROM combined_moves
            WHERE product_id IN ({p_ids_str})
              AND date < :date_from
            GROUP BY product_id
        """)
        init_res = db.execute(sql_initial, {"date_from": filters.date_from}).fetchall()
        for row in init_res:
            qty_in = float(row.qty_in or 0)
            qty_out = float(row.qty_out or 0)
            initial_balances[row.product_id] = qty_in - qty_out

    date_filters = ""
    params = {}
    if filters.date_from:
        date_filters += " AND date >= :date_from"
        params["date_from"] = filters.date_from
    if filters.date_to:
        date_filters += " AND date <= :date_to"
        params["date_to"] = filters.date_to

    sql_moves = text(base_cte + f"""
        SELECT *
        FROM combined_moves
        WHERE product_id IN ({p_ids_str})
          AND {scope_condition}
          {date_filters}
        ORDER BY date ASC
    """)
    
    moves_res = db.execute(sql_moves, params).fetchall()

    moves_by_product = {p_id: [] for p_id in filters.product_ids}
    for m in moves_res:
        moves_by_product[m.product_id].append(m)

    results = []

    for product_id in filters.product_ids:
        product_info = db.query(ProductVariant, Product).join(Product).filter(ProductVariant.id == product_id).first()
        if not product_info:
            continue
            
        variant, product = product_info
        
        current_balance = initial_balances[product_id]
        product_history = []

        if filters.date_from:
            product_history.append({
                "date": filters.date_from,
                "reference": "SALDO INICIAL",
                "type": "INITIAL",
                "source_type": "INITIAL",
                "flow_type": "INITIAL",
                "flow_display": "Saldo Inicial Consolidado",
                "facility_name": "Todas",
                "src_warehouse": None,
                "dest_warehouse": None,
                "location_name": "Saldo Inicial Consolidado",
                "qty_in": 0.0,
                "qty_out": 0.0,
                "balance": current_balance,
                "cost": 0.0
            })

        for m in moves_by_product[product_id]:
            if target_warehouse_ids:
                is_in = m.dest_warehouse_id in target_warehouse_ids
                is_out = m.src_warehouse_id in target_warehouse_ids
            else:
                is_in = m.dest_facility_id in target_facility_ids
                is_out = m.src_facility_id in target_facility_ids

            qty = float(m.qty_done or 0)
            cost = float(m.unit_cost or 0)

            src_wh = m.src_warehouse_name
            dest_wh = m.dest_warehouse_name
            fac_name = m.dest_facility_name or m.src_facility_name or "General"

            if is_in and is_out:
                flow_type = "TRANSFER"
                flow_display = f"Transferencia: {src_wh or 'Origen'} ➔ {dest_wh or 'Destino'}"
                location_name = f"{src_wh or 'Origen'} ➔ {dest_wh or 'Destino'}"
                type_str = m.source_type
                qty_in = 0.0
                qty_out = 0.0
            elif is_in:
                flow_type = "IN"
                flow_display = f"Entrada a: {dest_wh or 'Almacén'}"
                location_name = m.dest_name or dest_wh or 'N/A'
                type_str = m.source_type
                current_balance += qty
                qty_in = qty
                qty_out = 0.0
            elif is_out:
                flow_type = "OUT"
                flow_display = f"Salida de: {src_wh or 'Almacén'}"
                location_name = m.src_name or src_wh or 'N/A'
                type_str = m.source_type
                current_balance -= qty
                qty_in = 0.0
                qty_out = qty
            else:
                continue
                
            product_history.append({
                "date": m.date,
                "reference": m.reference,
                "type": type_str,
                "source_type": m.source_type,
                "flow_type": flow_type,
                "flow_display": flow_display,
                "facility_name": fac_name,
                "src_warehouse": src_wh,
                "dest_warehouse": dest_wh,
                "src_location": m.src_location_name,
                "dest_location": m.dest_location_name,
                "location_name": location_name,
                "qty_in": qty_in,
                "qty_out": qty_out,
                "balance": current_balance,
                "cost": cost
            })

        results.append({
            "product_id": product_id,
            "product_name": product.name,
            "sku": variant.sku,
            "initial_balance": initial_balances[product_id],
            "final_balance": current_balance,
            "history": product_history
        })

    return results

def _build_pricing_margin_query(
    db: Session,
    supplier_ids: Optional[List[int]] = None,
    category_ids: Optional[List[int]] = None,
    brands: Optional[List[str]] = None,
    models: Optional[List[str]] = None,
    attribute_key: Optional[str] = None,
    attribute_value: Optional[str] = None,
    search_term: Optional[str] = None,
):
    if hasattr(supplier_ids, 'default'):
        supplier_ids = None
    if hasattr(category_ids, 'default'):
        category_ids = None
    if hasattr(brands, 'default'):
        brands = None
    if hasattr(models, 'default'):
        models = None
    if hasattr(attribute_key, 'default'):
        attribute_key = None
    if hasattr(attribute_value, 'default'):
        attribute_value = None
    if hasattr(search_term, 'default'):
        search_term = None

    # 30-day sales subquery
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    sold_sub = db.query(
        DocumentLine.variant_id,
        func.sum(DocumentLine.quantity).label("qty_sold")
    ).join(
        Document, Document.id == DocumentLine.document_id
    ).filter(
        Document.type == 'INVOICE',
        Document.state != 'CANCELLED',
        Document.created_at >= thirty_days_ago
    ).group_by(
        DocumentLine.variant_id
    ).subquery()

    query = db.query(
        ProductVariant,
        Product,
        Tribute,
        func.coalesce(sold_sub.c.qty_sold, 0).label("qty_sold")
    ).join(
        Product, Product.id == ProductVariant.product_id
    ).outerjoin(
        Tribute, Tribute.id == Product.tax_id
    ).outerjoin(
        Category, Category.id == Product.category_id
    ).outerjoin(
        sold_sub, sold_sub.c.variant_id == ProductVariant.id
    )

    # 1. Supplier filter
    if supplier_ids:
        if isinstance(supplier_ids, (int, str)):
            supplier_ids = [int(supplier_ids)]
        query = query.join(SupplierProduct, SupplierProduct.variant_id == ProductVariant.id) \
                     .filter(SupplierProduct.supplier_id.in_(supplier_ids))

    # 2. Category hierarchy filter
    if category_ids:
        if isinstance(category_ids, (int, str)):
            category_ids = [int(category_ids)]
        cats = db.query(Category).filter(Category.id.in_(category_ids)).all()
        cat_conditions = []
        for c in cats:
            cat_conditions.append(Category.id == c.id)
            if c.path:
                cat_conditions.append(Category.path.like(f"{c.path}/%"))
        if cat_conditions:
            query = query.filter(or_(*cat_conditions))

    # 3. Brands filter (flat list supporting comma separation)
    if brands:
        if isinstance(brands, str):
            brands = [brands]
        flat_brands = []
        for b in brands:
            flat_brands.extend([x.strip() for x in b.split(",") if x.strip()])
        if flat_brands:
            query = query.filter(Product.brand.in_(flat_brands))

    # 4. Models filter (flat list supporting comma separation)
    if models:
        if isinstance(models, str):
            models = [models]
        flat_models = []
        for m in models:
            flat_models.extend([x.strip() for x in m.split(",") if x.strip()])
        if flat_models:
            query = query.filter(Product.model.in_(flat_models))

    # 5. Variant attribute key-value filter
    if attribute_key and attribute_value:
        query = query.filter(ProductVariant.attributes[attribute_key].astext == attribute_value)

    # 6. Fuzzy search term
    if search_term:
        clean_search = search_term.strip()
        if clean_search:
            query = query.filter(
                or_(
                    Product.name.ilike(f"%{clean_search}%"),
                    ProductVariant.sku.ilike(f"%{clean_search}%"),
                    ProductVariant.barcode.ilike(f"%{clean_search}%"),
                    ProductVariant.barcodes.any(ProductBarcode.barcode.ilike(f"%{clean_search}%"))
                )
            )

    # Ensure distinct records if joined with supplier products
    if supplier_ids:
        query = query.distinct()

    return query


def sanitize_pdf_text(text: Optional[str]) -> str:
    if text is None:
        return ""
    text = str(text)
    replacements = {
        '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"',
        '\u2013': '-', '\u2014': '-', '\u2026': '...', '\u2022': '*',
        '\u00a0': ' ', '\u200b': '', '\u20ac': 'EUR', '–': '-', '—': '-',
        '“': '"', '”': '"', '‘': "'", '’': "'"
    }
    for orig, rep in replacements.items():
        text = text.replace(orig, rep)
    return text.encode('latin-1', 'replace').decode('latin-1')


def fit_pdf_text(pdf: FPDF, text: Optional[str], max_w: float) -> str:
    sanitized = sanitize_pdf_text(text)
    if pdf.get_string_width(sanitized) <= max_w:
        return sanitized
    while len(sanitized) > 0 and pdf.get_string_width(sanitized + "...") > max_w:
        sanitized = sanitized[:-1]
    return sanitized + "..."


class PricingMarginPDF(FPDF):
    def __init__(self, filter_info: dict, kpis: dict, emission_date: str, *args, **kwargs):
        super().__init__(orientation='L', unit='mm', format='Letter', *args, **kwargs)
        self.set_auto_page_break(auto=True, margin=15)
        self.set_margins(10, 10, 10)
        self.alias_nb_pages()
        self.filter_info = filter_info
        self.kpis = kpis
        self.table_started = False
        self.emission_date = emission_date

    def header(self):
        if self.page_no() == 1:
            # Top accent bar (Emerald green)
            self.set_fill_color(16, 185, 129)
            self.rect(0, 0, 279.4, 3.5, 'F')
        elif self.table_started:
            # Compact header on subsequent pages
            self.set_font('Helvetica', 'B', 8)
            self.set_text_color(15, 23, 42)
            self.cell(140, 5, sanitize_pdf_text('NEO PRICING - Reporte de Precios y Márgenes'), ln=0, align='L')
            self.set_font('Helvetica', '', 7.5)
            self.set_text_color(100, 116, 139)
            self.cell(119, 5, sanitize_pdf_text(f'Emisión: {self.emission_date} | {self.filter_info.get("cost_label", "Costo Estándar")}'), ln=1, align='R')
            self.ln(1)
            self.draw_table_header()

    def footer(self):
        self.set_y(-12)
        self.set_font('Helvetica', 'I', 7.5)
        self.set_text_color(148, 163, 184)
        self.cell(130, 6, sanitize_pdf_text('Neo ERP - Módulo de Pricing y Análisis de Rentabilidad'), border=0, align='L')
        self.cell(129, 6, sanitize_pdf_text(f'Página {self.page_no()} de {{nb}}'), border=0, align='R')

    def draw_table_header(self):
        self.set_fill_color(30, 41, 59)  # Slate 800
        self.set_text_color(255, 255, 255)
        self.set_draw_color(30, 41, 59)
        self.set_font('Helvetica', 'B', 7.5)
        
        cols = [
            ('CÓDIGO / BARCODE', 32, 'L'),
            ('PRODUCTO', 92, 'L'),
            ('COSTO S/IVA', 23, 'R'),
            ('COSTO C/IVA', 23, 'R'),
            ('MARGEN %', 21, 'R'),
            ('PRECIO', 23, 'R'),
            ('PVP', 23, 'R'),
            ('VENTAS 30D', 22, 'R')
        ]
        for name, w, align in cols:
            self.cell(w, 6.5, sanitize_pdf_text(name), border=1, ln=0, align=align, fill=True)
        self.ln(6.5)

    def draw_page1_summary(self):
        # Header title
        self.set_xy(10, 8)
        self.set_font('Helvetica', 'B', 15)
        self.set_text_color(15, 23, 42)  # Slate 900
        self.cell(150, 7, sanitize_pdf_text('NEO PRICING - Reporte de Precios y Márgenes'), ln=0, align='L')
        
        self.set_font('Helvetica', '', 8)
        self.set_text_color(100, 116, 139)  # Slate 500
        self.cell(109, 7, sanitize_pdf_text(f'Fecha/Hora Emisión: {self.emission_date}'), ln=1, align='R')
        
        self.set_font('Helvetica', '', 8.5)
        self.set_text_color(71, 85, 105)
        self.cell(0, 4.5, sanitize_pdf_text('Auditoría comercial y financiera: márgenes brutos, costos ajustados con IVA y rotación a 30 días.'), ln=1)
        
        # Filters box
        self.ln(2)
        fy = self.get_y()
        self.set_fill_color(248, 250, 252)
        self.set_draw_color(226, 232, 240)
        self.rect(10, fy, 259, 13, 'DF')
        
        self.set_xy(13, fy + 1.5)
        self.set_font('Helvetica', 'B', 7.5)
        self.set_text_color(51, 65, 85)
        self.cell(18, 4.5, 'FILTROS:', ln=0)
        self.set_font('Helvetica', '', 7.5)
        self.set_text_color(71, 85, 105)
        
        filt1 = f'Costo: {self.filter_info.get("cost_label", "Estándar")}   |   Proveedores: {self.filter_info.get("suppliers", "Todos")}   |   Categorías: {self.filter_info.get("categories", "Todas")}'
        self.cell(0, 4.5, sanitize_pdf_text(filt1), ln=1)
        
        self.set_x(31)
        filt2 = f'Marcas: {self.filter_info.get("brands", "Todas")}   |   Modelos: {self.filter_info.get("models", "Todos")}   |   Atributos: {self.filter_info.get("attributes", "Ninguno")}   |   Búsqueda: {self.filter_info.get("search", "Ninguna")}'
        self.cell(0, 4.5, sanitize_pdf_text(filt2), ln=1)
        
        # KPI Cards
        self.set_y(fy + 16)
        ky = self.get_y()
        card_w = 83
        card_h = 16
        
        # Card 1: Total productos
        self.set_fill_color(241, 245, 249)  # Slate 100
        self.set_draw_color(203, 213, 225)
        self.rect(10, ky, card_w, card_h, 'DF')
        self.set_xy(13, ky + 2)
        self.set_font('Helvetica', 'B', 7)
        self.set_text_color(100, 116, 139)
        self.cell(card_w - 6, 3.5, sanitize_pdf_text('TOTAL PRODUCTOS ANALIZADOS'), ln=1)
        self.set_x(13)
        self.set_font('Helvetica', 'B', 12)
        self.set_text_color(15, 23, 42)
        self.cell(card_w - 6, 7, f'{self.kpis.get("total_products", 0):,}', ln=1)
        
        # Card 2: Margen Promedio
        self.set_fill_color(236, 253, 245)  # Emerald 50
        self.set_draw_color(167, 243, 208)
        self.rect(98, ky, card_w, card_h, 'DF')
        self.set_xy(101, ky + 2)
        self.set_font('Helvetica', 'B', 7)
        self.set_text_color(4, 120, 87)
        self.cell(card_w - 6, 3.5, sanitize_pdf_text('MARGEN PROMEDIO GENERAL'), ln=1)
        self.set_x(101)
        self.set_font('Helvetica', 'B', 12)
        self.set_text_color(6, 95, 70)
        self.cell(card_w - 6, 7, f'{self.kpis.get("avg_margin", 0):.2f}%', ln=1)
        
        # Card 3: Ventas 30d
        self.set_fill_color(245, 243, 255)  # Purple 50
        self.set_draw_color(221, 214, 254)
        self.rect(186, ky, card_w, card_h, 'DF')
        self.set_xy(189, ky + 2)
        self.set_font('Helvetica', 'B', 7)
        self.set_text_color(109, 40, 217)
        self.cell(card_w - 6, 3.5, sanitize_pdf_text('VENTAS 30 DÍAS ACUMULADAS'), ln=1)
        self.set_x(189)
        self.set_font('Helvetica', 'B', 12)
        self.set_text_color(91, 33, 182)
        self.cell(card_w - 6, 7, f'{self.kpis.get("total_sold", 0):,.0f} uds', ln=1)
        
        self.set_y(ky + card_h + 4)


def resolve_variant_barcodes_batch(db: Session, variants: List[ProductVariant]) -> dict:
    """
    Prefetches ProductBarcode records in batch for all variant IDs to prevent N+1 queries.
    Resolves barcode according to priority:
      * Priority 1: Unit barcode from ProductBarcode (code_type == 'BARCODE' and conversion_factor == 1.0).
      * Priority 2: Any ProductBarcode with code_type == 'BARCODE' (or variant.barcode).
      * Priority 3 (Fallback): Internal Neo code / SKU (variant.sku or fallback).
    Returns dict mapping variant_id to:
      {
        "codigo": resolved_code,
        "sku": variant.sku,
        "barcode": resolved_barcode
      }
    """
    if not variants:
        return {}

    variant_ids = list({v.id for v in variants if v.id is not None})
    barcodes_by_variant = {}
    if variant_ids:
        chunk_size = 1000
        for i in range(0, len(variant_ids), chunk_size):
            chunk = variant_ids[i:i + chunk_size]
            records = db.query(ProductBarcode).filter(
                ProductBarcode.product_variant_id.in_(chunk)
            ).order_by(ProductBarcode.id.asc()).all()
            for r in records:
                barcodes_by_variant.setdefault(r.product_variant_id, []).append(r)

    resolved_map = {}
    for v in variants:
        b_list = barcodes_by_variant.get(v.id, [])

        unit_bc = None
        for b in b_list:
            code_type = (b.code_type or 'BARCODE').strip().upper()
            if b.conversion_factor is not None:
                try:
                    conv = float(b.conversion_factor)
                except (ValueError, TypeError):
                    conv = 0.0
            else:
                conv = 1.0
            bc_str = str(b.barcode).strip() if b.barcode else ''
            if code_type == 'BARCODE' and abs(conv - 1.0) < 1e-4 and bc_str:
                unit_bc = bc_str
                break

        any_bc = None
        if not unit_bc:
            for b in b_list:
                code_type = (b.code_type or 'BARCODE').strip().upper()
                bc_str = str(b.barcode).strip() if b.barcode else ''
                if code_type == 'BARCODE' and bc_str:
                    any_bc = bc_str
                    break

        variant_bc = str(v.barcode).strip() if v.barcode else ''

        best_barcode = unit_bc or any_bc or (variant_bc if variant_bc else None)
        v_sku = str(v.sku).strip() if v.sku else None
        resolved_code = best_barcode or v_sku or f"VR-{v.id}"

        resolved_map[v.id] = {
            "codigo": resolved_code,
            "sku": v.sku,
            "barcode": best_barcode
        }

    return resolved_map


@router.get("/pricing-margin")
def get_pricing_margin_report(
    db: Session = Depends(deps.get_db),
    supplier_ids: Optional[List[int]] = Query(None),
    category_ids: Optional[List[int]] = Query(None),
    brands: Optional[List[str]] = Query(None),
    models: Optional[List[str]] = Query(None),
    attribute_key: Optional[str] = None,
    attribute_value: Optional[str] = None,
    search_term: Optional[str] = None,
    cost_type: str = "STANDARD",
    skip: int = 0,
    limit: int = 100
):
    if hasattr(supplier_ids, 'default'): supplier_ids = None
    if hasattr(category_ids, 'default'): category_ids = None
    if hasattr(brands, 'default'): brands = None
    if hasattr(models, 'default'): models = None
    if hasattr(attribute_key, 'default'): attribute_key = None
    if hasattr(attribute_value, 'default'): attribute_value = None
    if hasattr(search_term, 'default'): search_term = None

    query = _build_pricing_margin_query(
        db=db,
        supplier_ids=supplier_ids,
        category_ids=category_ids,
        brands=brands,
        models=models,
        attribute_key=attribute_key,
        attribute_value=attribute_value,
        search_term=search_term,
    )
    query = query.order_by(ProductVariant.id.desc())

    total = query.count()
    results = query.offset(skip).limit(limit).all()

    variants = [variant for variant, _, _, _ in results]
    barcodes_map = resolve_variant_barcodes_batch(db, variants)

    data = []
    for variant, product, tribute, qty_sold in results:
        if cost_type == "AVERAGE":
            cost_sin_iva = float(variant.average_cost or 0)
        elif cost_type == "REPLACEMENT":
            cost_sin_iva = float(variant.replacement_cost or 0)
        elif cost_type == "LAST":
            cost_sin_iva = float(variant.last_cost or 0)
        else:
            cost_sin_iva = float(variant.standard_cost or 0)

        tax_rate = float(tribute.rate or 0) if tribute else 0.0
        cost_con_iva = cost_sin_iva * (1.0 + tax_rate / 100.0)
        precio_venta = float(variant.sales_price or 0)
        margin = ((precio_venta - cost_sin_iva) / precio_venta * 100.0) if precio_venta > 0 else 0.0

        bc_info = barcodes_map.get(variant.id, {
            "codigo": variant.sku or f"VR-{variant.id}",
            "sku": variant.sku,
            "barcode": variant.barcode
        })

        data.append({
            "id": variant.id,
            "codigo": bc_info["codigo"],
            "sku": bc_info["sku"],
            "barcode": bc_info["barcode"],
            "producto": product.name,
            "costo_sin_iva": cost_sin_iva,
            "costo_con_iva": cost_con_iva,
            "margen": margin,
            "precio_venta": precio_venta,
            "unidades_vendidas": float(qty_sold)
        })

    return {"data": data, "total": total}


@router.get("/pricing-margin/pdf")
def get_pricing_margin_pdf(
    db: Session = Depends(deps.get_db),
    supplier_ids: Optional[List[int]] = Query(None),
    category_ids: Optional[List[int]] = Query(None),
    brands: Optional[List[str]] = Query(None),
    models: Optional[List[str]] = Query(None),
    attribute_key: Optional[str] = None,
    attribute_value: Optional[str] = None,
    search_term: Optional[str] = None,
    cost_type: str = "STANDARD",
    limit: int = 5000,
):
    if hasattr(supplier_ids, 'default'): supplier_ids = None
    if hasattr(category_ids, 'default'): category_ids = None
    if hasattr(brands, 'default'): brands = None
    if hasattr(models, 'default'): models = None
    if hasattr(attribute_key, 'default'): attribute_key = None
    if hasattr(attribute_value, 'default'): attribute_value = None
    if hasattr(search_term, 'default'): search_term = None
    query = _build_pricing_margin_query(
        db=db,
        supplier_ids=supplier_ids,
        category_ids=category_ids,
        brands=brands,
        models=models,
        attribute_key=attribute_key,
        attribute_value=attribute_value,
        search_term=search_term,
    )
    query = query.order_by(ProductVariant.id.desc())
    results = query.limit(limit).all()

    variants = [variant for variant, _, _, _ in results]
    barcodes_map = resolve_variant_barcodes_batch(db, variants)

    cost_labels = {
        "STANDARD": "Costo Estándar",
        "AVERAGE": "Costo Promedio",
        "REPLACEMENT": "Costo de Reposición",
        "LAST": "Último Costo"
    }
    cost_label = cost_labels.get(cost_type, "Costo Estándar")

    rows_data = []
    total_margin = 0.0
    total_sold = 0.0

    for variant, product, tribute, qty_sold in results:
        if cost_type == "AVERAGE":
            cost_sin_iva = float(variant.average_cost or 0)
        elif cost_type == "REPLACEMENT":
            cost_sin_iva = float(variant.replacement_cost or 0)
        elif cost_type == "LAST":
            cost_sin_iva = float(variant.last_cost or 0)
        else:
            cost_sin_iva = float(variant.standard_cost or 0)

        tax_rate = float(tribute.rate or 0) if tribute else 0.0
        cost_con_iva = cost_sin_iva * (1.0 + tax_rate / 100.0)
        precio_venta = float(variant.sales_price or 0)
        margin = ((precio_venta - cost_sin_iva) / precio_venta * 100.0) if precio_venta > 0 else 0.0
        pvp = precio_venta * (1.0 + (tax_rate / 100.0 if tribute and tribute.rate is not None else 0.16))
        qty_num = float(qty_sold or 0)

        total_margin += margin
        total_sold += qty_num

        bc_info = barcodes_map.get(variant.id, {
            "codigo": variant.sku or f"VR-{variant.id}",
            "sku": variant.sku,
            "barcode": variant.barcode
        })
        resolved_code = bc_info["codigo"]

        rows_data.append({
            "sku": resolved_code,
            "codigo": resolved_code,
            "producto": product.name or "Sin nombre",
            "costo_sin_iva": cost_sin_iva,
            "costo_con_iva": cost_con_iva,
            "margen": margin,
            "precio_venta": precio_venta,
            "pvp": pvp,
            "qty_sold": qty_num
        })

    count_rows = len(rows_data)
    avg_margin = (total_margin / count_rows) if count_rows > 0 else 0.0

    # Human-readable filter descriptions
    supplier_desc = "Todos"
    if supplier_ids:
        if isinstance(supplier_ids, (int, str)):
            supplier_ids = [int(supplier_ids)]
        sups = db.query(Supplier.name).filter(Supplier.id.in_(supplier_ids)).all()
        s_names = [s[0] for s in sups if s[0]]
        if s_names:
            supplier_desc = ", ".join(s_names[:3]) + (f" (+{len(s_names)-3})" if len(s_names) > 3 else "")

    category_desc = "Todas"
    if category_ids:
        if isinstance(category_ids, (int, str)):
            category_ids = [int(category_ids)]
        cats = db.query(Category.name).filter(Category.id.in_(category_ids)).all()
        c_names = [c[0] for c in cats if c[0]]
        if c_names:
            category_desc = ", ".join(c_names[:3]) + (f" (+{len(c_names)-3})" if len(c_names) > 3 else "")

    brands_desc = ", ".join(brands[:3]) if brands else "Todas"
    models_desc = ", ".join(models[:3]) if models else "Todos"
    attr_desc = f"{attribute_key}: {attribute_value}" if (attribute_key and attribute_value) else "Ninguno"
    search_desc = (search_term.strip() if search_term and search_term.strip() else "Ninguna")

    filter_info = {
        "cost_label": cost_label,
        "suppliers": supplier_desc,
        "categories": category_desc,
        "brands": brands_desc,
        "models": models_desc,
        "attributes": attr_desc,
        "search": search_desc
    }
    kpis = {
        "total_products": count_rows,
        "avg_margin": avg_margin,
        "total_sold": total_sold
    }

    emission_date = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    pdf = PricingMarginPDF(filter_info, kpis, emission_date)
    pdf.add_page()
    pdf.draw_page1_summary()
    pdf.table_started = True
    pdf.draw_table_header()

    if not rows_data:
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(100, 116, 139)
        pdf.cell(259, 10, sanitize_pdf_text("No se encontraron productos con los filtros seleccionados."), border='B', align='C')
    else:
        for idx, r in enumerate(rows_data):
            fill = (idx % 2 == 1)
            if fill:
                pdf.set_fill_color(248, 250, 252)  # Slate 50
            else:
                pdf.set_fill_color(255, 255, 255)
            pdf.set_text_color(30, 41, 59)
            pdf.set_draw_color(226, 232, 240)
            pdf.set_font("Helvetica", "", 7.5)

            code_str = fit_pdf_text(pdf, r.get("codigo") or r.get("sku"), 30)
            prod_str = fit_pdf_text(pdf, r["producto"], 90)

            pdf.cell(32, 5.5, code_str, border='B', fill=True)
            pdf.cell(92, 5.5, prod_str, border='B', fill=True)
            pdf.cell(23, 5.5, f"${r['costo_sin_iva']:,.2f}", border='B', align='R', fill=True)
            pdf.cell(23, 5.5, f"${r['costo_con_iva']:,.2f}", border='B', align='R', fill=True)

            if r["margen"] >= 25.0:
                pdf.set_text_color(4, 120, 87)
            elif r["margen"] < 15.0:
                pdf.set_text_color(190, 18, 60)
            else:
                pdf.set_text_color(30, 41, 59)
            pdf.cell(21, 5.5, f"{r['margen']:.2f}%", border='B', align='R', fill=True)

            pdf.set_text_color(30, 41, 59)
            pdf.cell(23, 5.5, f"${r['precio_venta']:,.2f}", border='B', align='R', fill=True)
            pdf.cell(23, 5.5, f"${r['pvp']:,.2f}", border='B', align='R', fill=True)
            pdf.cell(22, 5.5, f"{r['qty_sold']:,.0f}", border='B', align='R', fill=True)
            pdf.ln(5.5)

    pdf_bytes = pdf.output(dest='S')
    if isinstance(pdf_bytes, str):
        pdf_bytes = pdf_bytes.encode('latin-1', 'replace')
    else:
        pdf_bytes = bytes(pdf_bytes)

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": "attachment; filename=reporte_precios_margenes.pdf"
        }
    )


@router.post("/ai-chat")
def ai_chat_assistant(
    *,
    db: Session = Depends(deps.get_db),
    payload: AIChatRequest,
    current_user: User = Depends(deps.get_current_active_user)
):
    """
    General-purpose AI Assistant that answers questions about pricing, purchases, and WMS/inventory levels,
    generating tables and responsive SVG charts dynamically.
    """
    if not current_user.is_superuser and not any(role.can_use_oracle for role in current_user.roles if role.is_active):
        raise HTTPException(
            status_code=403,
            detail="No tiene privilegios de IA Oráculo asignados a su perfil."
        )

    from app.core.config import settings
    api_key = settings.GEMINI_API_KEY or settings.GOOGLE_API_KEY or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        return {
            "text_response": "⚠️ **API Key de Gemini no configurada**\n\nPor favor, configure la variable de entorno `GEMINI_API_KEY` en el archivo `.env` del proyecto y reinicie el servidor backend para habilitar el Asistente de IA.",
            "data_table": [],
            "chart": None
        }

    # Step 1: Entity Resolution using Gemini
    intent_prompt = (
        "Analiza el siguiente mensaje del usuario para el sistema ERP Morpheus.\n"
        "Identifica los nombres de productos, sucursales (tiendas/facilities), proveedores (suppliers), categorías o números de documentos y el tipo de intención.\n"
        "Genera una respuesta estrictamente en formato JSON plano sin bloques de código ni formato adicional, utilizando las siguientes claves:\n"
        "{\n"
        "  \"search_product\": \"nombre del producto o SKU a buscar (string o null)\",\n"
        "  \"search_facility\": \"nombre de la sucursal/tienda (string o null)\",\n"
        "  \"search_category\": \"nombre de la categoría o departamento (string o null)\",\n"
        "  \"search_supplier\": \"nombre del proveedor (string o null)\",\n"
        "  \"intent\": \"análisis solicitado ('pricing_margin' | 'inventory_levels' | 'purchases_orders' | 'comparison' | 'general')\"\n"
        "}\n\n"
        f"Mensaje del usuario: \"{payload.message}\""
    )

    resolved_entities = {
        "search_product": None,
        "search_facility": None,
        "search_category": None,
        "search_supplier": None,
        "intent": "general"
    }

    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
        gemini_payload = {
            "contents": [{"parts": [{"text": intent_prompt}]}],
            "generationConfig": {"responseMimeType": "application/json"}
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(gemini_payload).encode('utf-8'),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            raw_text = res_data['candidates'][0]['content']['parts'][0]['text']
            resolved_entities = json.loads(raw_text.strip())
    except Exception as e:
        print(f"Error parsing intent: {e}. Fallback to generic.")

    # Step 2: Query the DB based on resolved entities
    db_context = {}
    
    # Resolve Product
    resolved_product = None
    if resolved_entities.get("search_product"):
        prod_term = resolved_entities["search_product"]
        resolved_product = db.query(ProductVariant).join(Product).filter(
            or_(
                Product.name.ilike(f"%{prod_term}%"),
                ProductVariant.sku.ilike(f"%{prod_term}%")
            )
        ).first()
        if resolved_product:
            db_context["product"] = {
                "sku": resolved_product.sku,
                "name": resolved_product.product.name,
                "standard_cost": float(resolved_product.standard_cost or 0),
                "replacement_cost": float(resolved_product.replacement_cost or 0),
                "sales_price": float(resolved_product.sales_price or 0)
            }
            # Add branch prices overrides
            fps = db.query(ProductFacilityPrice, Facility).join(Facility).filter(
                ProductFacilityPrice.variant_id == resolved_product.id
            ).all()
            db_context["product"]["branch_prices"] = [
                {"facility": fac.name, "sales_price": float(fp.sales_price or 0)} for fp, fac in fps
            ]

    # Resolve Facility
    resolved_facility = None
    if resolved_entities.get("search_facility"):
        fac_term = resolved_entities["search_facility"]
        resolved_facility = db.query(Facility).filter(Facility.name.ilike(f"%{fac_term}%")).first()
        if resolved_facility:
            db_context["facility"] = {
                "id": resolved_facility.id,
                "name": resolved_facility.name
            }

    # Resolve Category
    if resolved_entities.get("search_category"):
        cat_term = resolved_entities["search_category"]
        resolved_cat = db.query(Category).filter(Category.name.ilike(f"%{cat_term}%")).first()
        if resolved_cat:
            # Query category products count
            prod_count = db.query(Product).filter(Product.category_id == resolved_cat.id).count()
            db_context["category"] = {
                "name": resolved_cat.name,
                "products_count": prod_count
            }

    # Resolve Supplier
    if resolved_entities.get("search_supplier"):
        sup_term = resolved_entities["search_supplier"]
        resolved_sup = db.query(Supplier).filter(Supplier.name.ilike(f"%{sup_term}%")).first()
        if resolved_sup:
            # Get supplier products count
            prod_count = db.query(SupplierProduct).filter(SupplierProduct.supplier_id == resolved_sup.id).count()
            db_context["supplier"] = {
                "name": resolved_sup.name,
                "products_count": prod_count
            }

    # Intent-specific contextual queries
    intent = resolved_entities.get("intent", "general")
    if intent == "pricing_margin" and resolved_product:
        # Fetch units sold last 30 days
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        qty_sold = db.query(func.sum(DocumentLine.quantity)).join(
            Document, Document.id == DocumentLine.document_id
        ).filter(
            DocumentLine.variant_id == resolved_product.id,
            Document.type == 'INVOICE',
            Document.state != 'CANCELLED',
            Document.created_at >= thirty_days_ago
        ).scalar() or 0
        db_context["sales_30_days"] = float(qty_sold)
        
    elif intent == "inventory_levels":
        # Query stock by location/warehouse for this product
        if resolved_product:
            from app.models.inventory import InventorySnapshot
            snaps = db.query(InventorySnapshot, Facility).join(Facility).filter(
                InventorySnapshot.variant_id == resolved_product.id
            ).all()
            db_context["stock_by_facility"] = [
                {"facility": fac.name, "qty": float(snap.stock_qty or 0)} for snap, fac in snaps
            ]
            
    elif intent == "purchases_orders":
        # Query recent purchase orders
        pos = db.query(PurchaseOrder, Supplier).join(Supplier).order_by(PurchaseOrder.created_at.desc()).limit(5).all()
        db_context["recent_purchase_orders"] = [
            {"ref": po.reference, "supplier": sup.name, "amount": float(po.total_amount), "status": po.status}
            for po, sup in pos
        ]

    # Step 3: Analysis & Formatting Response using Gemini
    final_prompt = (
        "Eres el Asistente Analítico Experto de Inteligencia Artificial para Morpheus ERP.\n"
        "Tu objetivo es dar una respuesta clara, profesional, y enriquecida con análisis estadísticos de inventarios, compras y ventas sobre la base de datos real del ERP.\n"
        "Te proveemos el contexto de datos exactos obtenidos de la base de datos para responder a la consulta del usuario. Utiliza EXCLUSIVAMENTE estos números y nombres en tus análisis. Si no hay datos disponibles, indícalo de forma constructiva.\n\n"
        "Debes estructurar tu respuesta en un formato JSON plano, con exactamente las siguientes claves:\n"
        "{\n"
        "  \"text_response\": \"Explicación analítica en español, profesional y detallada, usando formato Markdown (títulos, negritas, viñetas, tablas markdown).\",\n"
        "  \"data_table\": [ \n"
        "     { \"columna1\": \"valor\", \"columna2\": \"valor\" } \n"
        "  ],\n"
        "  \"chart\": {\n"
        "     \"type\": \"bar | line | pie\",\n"
        "     \"labels\": [\"etiqueta1\", \"etiqueta2\"],\n"
        "     \"datasets\": [\n"
        "        { \"label\": \"Título de la métrica\", \"data\": [10.0, 20.0] }\n"
        "     ]\n"
        "  } o null si no aplica o no se requiere un gráfico\n"
        "}\n\n"
        f"Datos del ERP: {json.dumps(db_context)}\n"
        f"Pregunta del usuario: \"{payload.message}\"\n\n"
        "Genera el objeto JSON limpio. No uses formato markdown de bloques de código en el texto devuelto (escribe directamente el JSON)."
    )

    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
        gemini_payload = {
            "contents": [{"parts": [{"text": final_prompt}]}],
            "generationConfig": {"responseMimeType": "application/json"}
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(gemini_payload).encode('utf-8'),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            text_content = res_data['candidates'][0]['content']['parts'][0]['text']
            return json.loads(text_content.strip())
    except Exception as e:
        print(f"Error calling Gemini in chat: {e}")
        return {
            "text_response": f"Lo siento, ocurrió un error al consultar con el Asistente de IA: {str(e)}",
            "data_table": [],
            "chart": None
        }
