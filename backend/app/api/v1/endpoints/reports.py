from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, case, text, or_
from datetime import datetime, timedelta
import os
import urllib.request
import json
from pydantic import BaseModel

from app.api import deps
from app.models.inventory import StockMove, Product, ProductVariant, Warehouse, Location, Category, ProductFacilityPrice
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

@router.get("/kardex/{product_id}")
def get_kardex(
    product_id: int,
    db: Session = Depends(deps.get_db),
):
    """
    Get detailed history of movements for a product.
    """
    moves = db.query(StockMove).filter(
        StockMove.product_id == product_id,
        StockMove.state == 'DONE'
    ).order_by(StockMove.date.desc()).all()
    
    history = []
    for m in moves:
        history.append({
            "date": m.date,
            "reference": m.reference or f"MOVE-{m.id}",
            "location_from": m.location_src_id,
            "location_to": m.location_dest_id,
            "qty": float(m.quantity_done)
        })
        
    return history

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
    print("API RECEIVED FILTERS:", {
        "supplier_ids": supplier_ids,
        "category_ids": category_ids,
        "brands": brands,
        "models": models,
        "attribute_key": attribute_key,
        "attribute_value": attribute_value,
        "search_term": search_term
    })
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
        query = query.filter(
            or_(
                Product.name.ilike(f"%{search_term}%"),
                ProductVariant.sku.ilike(f"%{search_term}%")
            )
        )

    # Ensure distinct records if joined with supplier products
    if supplier_ids:
        query = query.distinct()

    query = query.order_by(ProductVariant.id.desc())

    total = query.count()
    results = query.offset(skip).limit(limit).all()

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

        data.append({
            "id": variant.id,
            "codigo": variant.sku,
            "producto": product.name,
            "costo_sin_iva": cost_sin_iva,
            "costo_con_iva": cost_con_iva,
            "margen": margin,
            "precio_venta": precio_venta,
            "unidades_vendidas": float(qty_sold)
        })

    return {"data": data, "total": total}

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
