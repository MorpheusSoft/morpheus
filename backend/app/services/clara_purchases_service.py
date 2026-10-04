"""
Servicio Autónomo de Clara (Neo Compras)
Proporciona:
1. Ficha Técnica 360° de Compras (Costos reposición/promedio/estándar, PVP, margen,
   existencias multitienda, velocidad de venta run_rate, cobertura runway y proveedor principal).
2. Generación Quirúrgica de Órdenes de Compra en Borrador (DRAFT):
   - Modo A (Sugerido MRP): Analiza quiebres y proyecta déficit por proveedor y sede.
   - Modo B (Personalizado): Agrega productos y cantidades dictadas por el usuario.
3. Formateo unificado para canales conversacionales (Telegram, WhatsApp y Chat Interno).
"""

import re
import uuid
import logging
from typing import List, Dict, Any, Optional, Tuple
from decimal import Decimal
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_, desc

from app.models.purchasing import (
    PurchaseOrder,
    PurchaseOrderLine,
    SupplierProduct
)
from app.models.inventory import (
    ProductVariant,
    Product,
    ProductBarcode,
    ProductPackaging,
    InventorySnapshot,
    ProductFacilityPrice,
    Category
)
from app.models.core import Supplier, Facility, Buyer
from app.models.sales import Document, DocumentLine
from app.models.digital_workers import DigitalWorker, DigitalWorkerActionLog
from app.services.mrp_bot_service import diagnose_stockouts, generate_supplier_po_draft
from app.services.nlp_search import search_product_variants

import unicodedata

logger = logging.getLogger(__name__)


def strip_accents(text: str) -> str:
    """Elimina diacríticos/acentos para comparaciones tolerantes a ortografía."""
    if not text:
        return ""
    return "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")


def lookup_purchasing_product_360(
    query_text: str,
    db: Session,
    limit: int = 5
) -> List[Dict[str, Any]]:
    """
    Consulta 360° de compras para uno o varios productos.
    Retorna costos, precios, stock por tienda, rotación (run_rate),
    días de cobertura (runway) y proveedor asignado.
    """
    results = []
    clean_q = (query_text or "").strip()
    if not clean_q:
        return []

    try:
        # Búsqueda inteligente tolerante a lenguaje natural (código de barras, SKU o tokens sustantivos con NLP)
        variants = search_product_variants(db, clean_q, limit=limit)

        # Mapeo de sedes para nombres amigables
        facilities = db.query(Facility).all()
        fac_map = {f.id: f.name for f in facilities}

        # Fecha base para análisis de ventas de los últimos 30 días
        since_30d = datetime.now(timezone.utc) - timedelta(days=30)

        for v in variants:
            std_cost = float(v.standard_cost or 0)
            avg_cost = float(v.average_cost or 0)
            rep_cost = float(v.replacement_cost or 0)
            ref_cost = rep_cost or std_cost or avg_cost
            pvp = float(v.sales_price or 0)
            margin_pct = ((pvp - ref_cost) / pvp * 100.0) if pvp > 0 else 0.0

            # Existencias por sede
            snaps = db.query(InventorySnapshot).filter(InventorySnapshot.variant_id == v.id).all()
            total_stock = 0.0
            stock_by_facility = []
            max_snapshot_run_rate = 0.0

            for s in snaps:
                qty = float(s.stock_qty or 0)
                total_stock += qty
                fac_name = fac_map.get(s.facility_id, f"Sede #{s.facility_id}")
                snap_rr = float(s.run_rate or 0)
                if snap_rr > max_snapshot_run_rate:
                    max_snapshot_run_rate = snap_rr
                stock_by_facility.append({
                    "facility_id": s.facility_id,
                    "facility": fac_name,
                    "stock_qty": qty,
                    "safety_stock": float(s.safety_stock or 0),
                    "run_rate": snap_rr
                })

            # Ventas reales últimos 30 días para cálculo de velocidad (run rate)
            sales_30d_qty = db.query(func.sum(DocumentLine.quantity)).join(
                Document, Document.id == DocumentLine.document_id
            ).filter(
                DocumentLine.variant_id == v.id,
                Document.created_at >= since_30d
            ).scalar() or 0.0
            sales_30d = float(sales_30d_qty)
            calc_run_rate = round(sales_30d / 30.0, 2)
            final_run_rate = calc_run_rate if calc_run_rate > 0 else round(max_snapshot_run_rate, 2)

            # Proveedor principal y empaque
            sp = db.query(SupplierProduct).filter(
                SupplierProduct.variant_id == v.id,
                SupplierProduct.is_active == True
            ).order_by(SupplierProduct.is_primary.desc(), SupplierProduct.id.asc()).first()

            supplier_info = None
            lead_time = 7
            pack_info = None

            if sp:
                sup = db.query(Supplier).filter(Supplier.id == sp.supplier_id).first()
                if sup:
                    lead_time = sup.lead_time_days or 7
                    supplier_info = {
                        "id": sup.id,
                        "name": sup.name,
                        "tax_id": sup.tax_id,
                        "lead_time_days": lead_time,
                        "supplier_sku": sp.supplier_sku or v.sku,
                        "supplier_cost": float(sp.replacement_cost or 0)
                    }

                # Información de empaque
                if sp.pack_id:
                    pack = db.query(ProductPackaging).filter(ProductPackaging.id == sp.pack_id).first()
                    if pack:
                        pack_info = {
                            "name": pack.name,
                            "qty_per_unit": float(pack.qty_per_unit or 1)
                        }

            # Si no hay empaque en SupplierProduct, buscar empaque de producto
            if not pack_info:
                p_pack = db.query(ProductPackaging).filter(ProductPackaging.product_id == v.product_id).first()
                if p_pack:
                    pack_info = {
                        "name": p_pack.name,
                        "qty_per_unit": float(p_pack.qty_per_unit or 1)
                    }

            # Cálculo de Días de Cobertura (Runway) y Semáforo de Reorden
            if total_stock <= 0:
                runway_days = 0.0
                runway_desc = "0 días (¡Agotado / Quiebre!)"
                urgency = "CRITICAL"
                status_badge = "🔴 QUIEBRE INMEDIATO"
            elif final_run_rate > 0:
                runway_days = round(total_stock / final_run_rate, 1)
                runway_desc = f"{runway_days} días de cobertura"
                if runway_days <= lead_time:
                    urgency = "CRITICAL"
                    status_badge = "🔴 REORDEN URGENTE (< Tiempo Entrega)"
                elif runway_days <= (lead_time * 2):
                    urgency = "WARNING"
                    status_badge = "🟡 REORDEN PREVENTIVO"
                else:
                    urgency = "HEALTHY"
                    status_badge = "🟢 SALUDABLE"
            else:
                runway_days = 999.0
                runway_desc = "Sin rotación reciente (Stock inmóvil)"
                urgency = "SLOW_MOVING"
                status_badge = "⚪ SIN ROTACIÓN"

            results.append({
                "variant_id": v.id,
                "sku": v.sku,
                "product_name": v.product.name if v.product else f"SKU {v.sku}",
                "category": v.product.category.name if v.product and v.product.category else "General",
                "standard_cost": std_cost,
                "average_cost": avg_cost,
                "replacement_cost": rep_cost,
                "reference_cost": ref_cost,
                "sales_price": pvp,
                "margin_pct": round(margin_pct, 1),
                "is_negative_margin": margin_pct <= 0,
                "total_stock": total_stock,
                "stock_by_facility": stock_by_facility,
                "sales_30d": sales_30d,
                "run_rate": final_run_rate,
                "runway_days": runway_days,
                "runway_desc": runway_desc,
                "urgency": urgency,
                "status_badge": status_badge,
                "supplier": supplier_info,
                "packaging": pack_info
            })

        return results
    except Exception as e:
        logger.error(f"[CLARA PURCHASES SERVICE] Error en lookup_purchasing_product_360: {e}", exc_info=True)
        return []


def format_product_360_telegram(item: Dict[str, Any]) -> str:
    """
    Formatea la ficha técnica 360° en Markdown amigable para Telegram / WhatsApp.
    """
    m_icon = "🔴" if item["is_negative_margin"] else ("🟡" if item["margin_pct"] < 18 else "🟢")
    sup = item.get("supplier")
    sup_text = f"*{sup['name']}* (Entrega: {sup['lead_time_days']}d)" if sup else "_Sin proveedor asignado en catálogo_"
    
    pack = item.get("packaging")
    pack_text = f"• *Empaque Maestro:* {pack['name']} ({pack['qty_per_unit']:.0f} uds/bulto)\n" if pack else ""

    stock_lines = []
    for s in item.get("stock_by_facility", []):
        stock_lines.append(f"     ▪ {s['facility']}: *{s['stock_qty']:,.0f}* uds")
    stock_text = "\n".join(stock_lines) if stock_lines else "     ▪ _Sin inventario físico en sedes_"

    return (
        f"📦 *{item['product_name']}* (`{item['sku']}`)\n"
        f"• *Estado:* {item['status_badge']}\n"
        f"• *Costos:* Reposición: *${item['replacement_cost']:,.2f}* | Promedio: ${item['average_cost']:,.2f} | Estándar: ${item['standard_cost']:,.2f}\n"
        f"• *PVP Maestro:* *${item['sales_price']:,.2f}* | Margen: {m_icon} *{item['margin_pct']}%*\n"
        f"• *Inventario Total:* *{item['total_stock']:,.0f}* unidades\n"
        f"{stock_text}\n"
        f"• *Velocidad de Ventas:* *{item['sales_30d']:,.0f}* uds (últimos 30 días) ➡️ Run Rate: *{item['run_rate']:.1f} uds/día*\n"
        f"• *Cobertura (Runway):* *{item['runway_desc']}*\n"
        f"{pack_text}"
        f"• *Proveedor:* {sup_text}"
    )


KNOWN_FACILITIES = ["tucacas", "belisa", "cumboto", "maracay", "cendi", "trigal", "palma", "moron"]

def parse_order_intent(text: str) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[List[Dict[str, Any]]]]:
    """
    Analiza una instrucción conversacional o comando para extraer multidimensionalmente:
    1. Proveedor objetivo (nombre, código o ID).
    2. Sede objetivo (nombre de sucursal, CENDI o 'todas').
    3. Categoría objetivo (ej: Víveres, Farmacia, Charcutería).
    4. Ítems personalizados (si se especificaron productos y cantidades) para Modo B.
       Si no se especificaron ítems, retorna None en custom_items para Modo A (Sugerido MRP).
    """
    clean = text.strip()

    # 1. Modo estructurado con barra vertical:
    # Ej: /crear_odc Alimentos Polar | Tucacas | Víveres | 50 Harina Pan, 20 Primor
    if "|" in clean:
        parts = [p.strip() for p in clean.split("|")]
        sup = re.sub(r"^/(?:crear_odc|crear_orden|orden_crear|odc_crear|odc)\s*", "", parts[0], flags=re.IGNORECASE)
        sup = re.sub(r"^(?:clara,?\s*)?(?:por favor\s*)?(?:genera|crea|haz|prepara|emitir)\s*(?:una\s*)?(?:orden de compra|odc|pedido de compra|orden|sugerido)?\s*(?:para|a|al proveedor|de|del proveedor)?\s*", "", sup, flags=re.IGNORECASE).strip()

        fac = None
        cat = None
        items = None

        for p in parts[1:]:
            p_lower = p.lower()
            # A. Ítems con cantidades
            has_quantities = bool(re.search(r"\d+\s*(?:bultos?|cajas?|uds?|unidades?|fardos?|paquetes?|kgs?|kg)?\s*(?:de)?\s*[a-zA-Z]", p, re.IGNORECASE))
            if has_quantities or ("," in p and any(c.isdigit() for c in p)):
                items = []
                for it in p.split(","):
                    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:bultos?|cajas?|uds?|unidades?|fardos?|paquetes?|kgs?|kg)?\s*(?:de)?\s*(.+)", it.strip(), re.IGNORECASE)
                    if m:
                        items.append({"qty": float(m.group(1)), "query": m.group(2).strip()})
                    elif it.strip():
                        items.append({"qty": 1.0, "query": it.strip()})
            # B. Categoría explícita
            elif re.search(r"\b(?:categor[ií]a|rubro|dpto|departamento)\b", p, re.IGNORECASE):
                cat = re.sub(r"\b(?:categor[ií]a|rubro|dpto|departamento)\b\s*", "", p, flags=re.IGNORECASE).strip()
            # C. Sede explícita o 'todas'
            elif any(w in p_lower for w in ["todas", "cendi", "sucursal", "sede", "tienda"]) or any(kf in p_lower for kf in KNOWN_FACILITIES):
                fac = re.sub(r"\b(?:sede|sucursal|tienda|en|para)\b\s*", "", p, flags=re.IGNORECASE).strip()
            # D. Asignaciones posicionales
            elif not fac and not cat:
                fac = p.strip()
            elif fac and not cat:
                cat = p.strip()

        return (sup if sup else None), fac, cat, items

    # 2. Modo Lenguaje Natural
    # A. Extraer ítems personalizados si tiene cláusula 'con ...'
    custom_items = None
    con_match = re.split(r"\b(?:con\s+(?:\d+|los productos|los siguientes renglones)|incluyendo\s+(?:\d+|los productos))\b", clean, flags=re.IGNORECASE)
    if len(con_match) > 1:
        items_part = clean[len(con_match[0]):].strip()
        clean = con_match[0].strip()
        items_part = re.sub(r"^(?:con|incluyendo)\s*", "", items_part, flags=re.IGNORECASE)
        # Extraer posible sede al final del bloque de ítems
        m_end_fac = re.search(r"\s+\b(?:en|para)\s+([a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]+)$", items_part, re.IGNORECASE)
        if m_end_fac and any(kf in m_end_fac.group(1).lower() for kf in KNOWN_FACILITIES + ["todas", "cendi"]):
            fac_from_items = m_end_fac.group(1).strip()
            items_part = items_part[:m_end_fac.start()].strip()
        else:
            fac_from_items = None

        custom_items = []
        for it in re.split(r"[,;]|\s+y\s+", items_part):
            m = re.search(r"(\d+(?:\.\d+)?)\s*(?:bultos?|cajas?|uds?|unidades?|fardos?|paquetes?|kgs?|kg)?\s*(?:de)?\s*(.+)", it.strip(), re.IGNORECASE)
            if m:
                custom_items.append({"qty": float(m.group(1)), "query": m.group(2).strip()})
            elif it.strip():
                custom_items.append({"qty": 1.0, "query": it.strip()})
    else:
        fac_from_items = None

    # B. Extraer Categoría
    cat_query = None
    m_cat = re.search(r"\b(?:en la categor[ií]a|en categor[ií]a|de la categor[ií]a|categor[ií]a|rubro|departamento)\s+(.+?)(?=\s+(?:para|en|sede|sucursal|tienda|con)\b|$)", clean, re.IGNORECASE)
    if m_cat:
        cat_query = m_cat.group(1).strip()
        clean = clean[:m_cat.start()] + " " + clean[m_cat.end():]

    # C. Extraer Sede / Sucursales
    fac_query = fac_from_items
    if not fac_query:
        # Chequear 'en todas las sucursales / tiendas'
        m_todas = re.search(r"\b(?:en todas las sucursales|en todas las tiendas|en todas las sedes|en todas|para todas las tiendas|para todas las sucursales|todas las tiendas|todas las sucursales|todas)\b", clean, re.IGNORECASE)
        if m_todas:
            fac_query = "todas"
            clean = clean[:m_todas.start()] + " " + clean[m_todas.end():]
        else:
            # Chequear 'sucursal X' / 'sede X' / 'tienda X'
            m_fac = re.search(r"\b(?:sucursal|sede|tienda)\s+([a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]+)", clean, re.IGNORECASE)
            if m_fac:
                fac_query = m_fac.group(1).strip()
                clean = clean[:m_fac.start()] + " " + clean[m_fac.end():]
            else:
                for kf in KNOWN_FACILITIES:
                    m_kf = re.search(rf"\b(?:en|para)\s+({kf})\b", clean, re.IGNORECASE)
                    if m_kf:
                        fac_query = m_kf.group(1).strip()
                        clean = clean[:m_kf.start()] + " " + clean[m_kf.end():]
                        break

    # D. Limpiar comandos y verbos iniciales para aislar proveedor
    clean = re.sub(
        r"^(?:/(?:crear_odc|crear_orden|orden_crear|odc_crear|odc)\s*|(?:clara,?\s*)?(?:por favor\s*)?(?:genera|crea|haz|prepara|emitir)\s*(?:una\s*)?(?:orden de compra|odc|pedido de compra|orden|sugerido)?\s*(?:para|a|al proveedor|de|del proveedor)?\s*)",
        "",
        clean,
        flags=re.IGNORECASE
    ).strip()

    # Limpiar conectores residuales al inicio o final
    clean = re.sub(r"^(?:de|para|al?)\s+", "", clean, flags=re.IGNORECASE).strip()
    clean = re.sub(r"\s+(?:en\s+la|en\s+el|en|para\s+la|para\s+el|para|de\s+la|de\s+el|de|al?)\s*$", "", clean, flags=re.IGNORECASE).strip()

    sup_query = clean if clean else None
    return sup_query, fac_query, cat_query, custom_items


def create_supplier_po_from_chat(
    db: Session,
    supplier_query: str,
    user_name: str,
    facility_query: Optional[str] = None,
    category_query: Optional[str] = None,
    facility_id: Optional[int] = None,
    custom_items: Optional[List[Dict[str, Any]]] = None,
    channel: str = "Telegram"
) -> Dict[str, Any]:
    """
    Crea una Orden de Compra en borrador (DRAFT) a través de la interfaz conversacional de Clara (Neo Compras).
    Soporta:
      - Modo A (Sugerido MRP):
        * Multitienda: genera borradores independientes para cada sede con déficit.
        * Por Sede: genera para una tienda específica.
        * Por Categoría: filtra ítems exclusivamente de la categoría / departamento indicado.
      - Modo B (Personalizado): Creación a la medida con los productos dictados por el usuario.
    """
    clean_sup_q = (supplier_query or "").strip()
    if not clean_sup_q:
        return {
            "success": False,
            "error": "Debes indicar el nombre o código del proveedor para generar la orden de compra."
        }

    # 1. Búsqueda y Resolución de Proveedor
    supplier = None
    if clean_sup_q.isdigit():
        supplier = db.query(Supplier).filter(Supplier.id == int(clean_sup_q)).first()

    if not supplier:
        supplier = db.query(Supplier).filter(
            Supplier.is_active == True,
            Supplier.name.ilike(f"%{clean_sup_q}%")
        ).first()

    if not supplier:
        supplier = db.query(Supplier).filter(
            Supplier.is_active == True,
            Supplier.tax_id.ilike(f"%{clean_sup_q}%")
        ).first()

    if not supplier:
        words = [w for w in re.findall(r"\b[a-zA-ZáéíóúÁÉÍÓÚñÑ]{4,}\b", clean_sup_q)]
        for w in words:
            cand = db.query(Supplier).filter(
                Supplier.is_active == True,
                Supplier.name.ilike(f"%{w}%")
            ).first()
            if cand:
                supplier = cand
                break

    if not supplier:
        return {
            "success": False,
            "error": f"No se encontró ningún proveedor activo que coincida con '{clean_sup_q}'."
        }

    # 2. Resolución de Sede / Sucursal
    is_multi_facility = False
    target_facility_id = None
    target_facility_name = None

    if facility_query:
        clean_fq = strip_accents(facility_query.strip().lower())
        if any(w in clean_fq for w in ["todas", "todas las tiendas", "todas las sucursales", "todas las sedes", "todos los almacenes"]):
            is_multi_facility = True
        else:
            all_active_facs = db.query(Facility).filter(Facility.is_active == True).all()
            matched_fac = next((f for f in all_active_facs if clean_fq in strip_accents(f.name.lower()) or clean_fq in strip_accents((f.code or '').lower())), None)
            if matched_fac:
                target_facility_id = matched_fac.id
                target_facility_name = matched_fac.name
            elif any(w in clean_fq for w in ["cendi", "distribucion"]):
                cendi = db.query(Facility).filter(Facility.is_active == True, Facility.is_distribution_center == True).first()
                if cendi:
                    target_facility_id = cendi.id
                    target_facility_name = cendi.name

    if not is_multi_facility and not target_facility_id:
        if facility_id:
            fac_obj = db.query(Facility).filter(Facility.id == facility_id).first()
        else:
            fac_obj = db.query(Facility).filter(Facility.is_active == True).first()
        target_facility_id = fac_obj.id if fac_obj else None
        target_facility_name = fac_obj.name if fac_obj else "Sede Central"

    facility_name = target_facility_name or "Sede Central"

    # 3. Resolución de Categoría (Tolerante a acentos y mayúsculas/minúsculas)
    target_category_id = None
    target_category_name = None
    if category_query:
        clean_cq = strip_accents(category_query.strip().lower())
        all_active_cats = db.query(Category).filter(Category.is_active == True).all()
        # Coincidencia exacta primero
        matched_cat = next((c for c in all_active_cats if strip_accents(c.name.lower()) == clean_cq or strip_accents((c.slug or '').lower()) == clean_cq), None)
        # Coincidencia parcial si no hubo exacta
        if not matched_cat:
            matched_cat = next((c for c in all_active_cats if clean_cq in strip_accents(c.name.lower())), None)

        if matched_cat:
            target_category_id = matched_cat.id
            target_category_name = matched_cat.name
        else:
            top_cats = [c.name for c in db.query(Category).filter(Category.parent_id == None, Category.is_active == True).limit(8).all()]
            return {
                "success": False,
                "error": f"No se encontró la categoría '{category_query.strip()}'. Categorías principales disponibles: {', '.join(top_cats)}."
            }

    cat_txt = f" en la categoría *{target_category_name}*" if target_category_name else ""

    # =========================================================================
    # MODO A: SUGERIDO MRP (Sin renglones personalizados)
    # =========================================================================
    if not custom_items:
        try:
            # Caso 1: Multitienda ("en todas las tiendas")
            if is_multi_facility:
                active_facilities = db.query(Facility).filter(Facility.is_active == True).order_by(Facility.id.asc()).all()
                created_orders = []
                healthy_stores = []
                total_global_amount = Decimal("0.00")
                total_global_lines = 0

                for fac in active_facilities:
                    diag = diagnose_stockouts(
                        db,
                        facility_id=fac.id,
                        supplier_id=supplier.id,
                        category_id=target_category_id
                    )
                    s_diag = next((s for s in diag.get("suppliers", []) if s["supplier_id"] == supplier.id), None)
                    if s_diag and s_diag.get("items"):
                        po_res = generate_supplier_po_draft(
                            db=db,
                            supplier_id=supplier.id,
                            facility_id=fac.id,
                            category_id=target_category_id,
                            notes=f"Orden sugerida multitienda ({fac.name}) generada vía {channel} por instrucción de {user_name}."
                        )
                        created_orders.append(po_res)
                        total_global_amount += Decimal(str(po_res["total_amount"]))
                        total_global_lines += po_res["lines_count"]
                    else:
                        healthy_stores.append(fac.name)

                if not created_orders:
                    return {
                        "success": False,
                        "no_deficit": True,
                        "supplier_name": supplier.name,
                        "message": (
                            f"El proveedor *{supplier.name}* presenta niveles de stock saludables en **todas las sucursales**{cat_txt}. "
                            f"No se detectaron quiebres ni déficit urgente en este momento.\n\n"
                            f"_💡 Si deseas generar una orden de compra manual con productos específicos, indícame:_\n"
                            f"• `/crear_odc {supplier.name} | [sucursal] | 50 [producto], 20 [otro]`"
                        )
                    }

                orders_lines = []
                for o in created_orders:
                    orders_lines.append(f"🏢 *{o['facility_name']}*: `{o['order_reference']}` ➡️ *${o['total_amount']:,.2f} USD* ({o['lines_count']} renglones)")

                healthy_note = f"\n_💡 Sedes con cobertura suficiente (sin déficit): {', '.join(healthy_stores)}._" if healthy_stores else ""

                return {
                    "success": True,
                    "mode": "MRP_MULTI_FACILITY",
                    "orders": created_orders,
                    "supplier_name": supplier.name,
                    "total_amount": float(total_global_amount),
                    "lines_count": total_global_lines,
                    "message": (
                        f"✅ *Órdenes de Compra Creadas por Sucursal (Multitienda)*\n\n"
                        f"He evaluado el déficit de *{supplier.name}*{cat_txt} y generado los borradores correspondientes:\n\n"
                        + "\n".join(orders_lines) +
                        f"\n\n💰 *Total Global Estimado:* *${float(total_global_amount):,.2f} USD* ({total_global_lines} renglones en total)\n"
                        f"🏷️ *Estado:* `DRAFT` (Borradores independientes listos para revisión y firma)"
                        f"{healthy_note}\n\n"
                        f"_Disponibles en Neo ERP > Neo Compras para su gestión._"
                    )
                }

            # Caso 2: Sede Única
            diag = diagnose_stockouts(
                db,
                facility_id=target_facility_id,
                supplier_id=supplier.id,
                category_id=target_category_id
            )
            suppliers_list = diag.get("suppliers", [])
            supplier_diag = next((s for s in suppliers_list if s["supplier_id"] == supplier.id), None)

            if not supplier_diag or not supplier_diag.get("items"):
                return {
                    "success": False,
                    "no_deficit": True,
                    "supplier_name": supplier.name,
                    "facility_name": target_facility_name,
                    "message": (
                        f"El proveedor *{supplier.name}* presenta niveles de stock saludables en *{target_facility_name}*{cat_txt}. "
                        f"No se detectaron quiebres ni déficit urgente en este momento.\n\n"
                        f"_💡 Si deseas generar una orden de compra manual con productos específicos, indícame:_\n"
                        f"• `/crear_odc {supplier.name} | 50 [producto], 20 [otro]`"
                    )
                }

            # Generar ODC borrador con el motor MRP
            po_res = generate_supplier_po_draft(
                db=db,
                supplier_id=supplier.id,
                facility_id=target_facility_id,
                category_id=target_category_id,
                notes=f"Orden sugerida MRP generada vía {channel} por instrucción de {user_name}."
            )

            return {
                "success": True,
                "mode": "MRP_SUGGESTED",
                "order_id": po_res["order_id"],
                "order_reference": po_res["order_reference"],
                "supplier_name": supplier.name,
                "facility_name": target_facility_name,
                "category_name": target_category_name,
                "total_amount": po_res["total_amount"],
                "lines_count": po_res["lines_count"],
                "message": (
                    f"✅ *Orden de Compra Borrador Creada (Sugerido MRP)*\n\n"
                    f"He preparado la orden *{po_res['order_reference']}* para *{supplier.name}* con destino a *{target_facility_name}*{cat_txt}.\n\n"
                    f"• Total Estimado: *${po_res['total_amount']:,.2f} USD*\n"
                    f"• Renglones en Quiebre: *{po_res['lines_count']} ítems calculados*\n"
                    f"• Estado: `DRAFT` (Borrador para confirmación y firma)\n\n"
                    f"_Disponible en Neo ERP > Neo Compras para revisión._"
                )
            }
        except Exception as e:
            logger.error(f"[CLARA COMPRAS] Error generando ODC sugerida MRP: {e}", exc_info=True)
            return {
                "success": False,
                "error": f"Ocurrió un error al calcular el sugerido de compra: {str(e)}"
            }

    # =========================================================================
    # MODO B: RENGLONES PERSONALIZADOS DICTADOS POR EL USUARIO
    # =========================================================================
    try:
        buyer = db.query(Buyer).filter(Buyer.id == 1).first() or db.query(Buyer).first()
        buyer_id = buyer.id if buyer else None
        year = datetime.now().year

        po = PurchaseOrder(
            supplier_id=supplier.id,
            buyer_id=buyer_id,
            dest_facility_id=target_facility_id,
            status="draft",
            total_amount=Decimal("0.00"),
            reference=f"ODC-{year}-TEMP-{uuid.uuid4().hex[:8]}",
            notes=f"Orden borrador generada vía {channel} a petición de {user_name}. Contiene {len(custom_items)} ítems solicitados."
        )
        db.add(po)
        db.flush()

        po.reference = f"ODC-{year}-{po.id:05d}"
        total_order_amount = Decimal("0.00")
        resolved_lines = []
        unresolved_queries = []

        for item in custom_items:
            q_text = item.get("query", "").strip()
            qty = Decimal(str(item.get("qty", 1)))
            if not q_text:
                continue

            # Buscar primero entre productos asociados al proveedor
            tokens = [t for t in q_text.split() if len(t) > 1]
            sp_token_filters = [
                or_(
                    ProductVariant.sku.ilike(f"%{t}%"),
                    Product.name.ilike(f"%{t}%"),
                    SupplierProduct.supplier_sku.ilike(f"%{t}%")
                )
                for t in tokens
            ] if tokens else [Product.name.ilike(f"%{q_text}%")]

            sp = db.query(SupplierProduct).join(ProductVariant).join(Product).filter(
                SupplierProduct.supplier_id == supplier.id,
                SupplierProduct.is_active == True,
                and_(*sp_token_filters)
            ).first()

            variant = None
            pack_id = None
            unit_cost = Decimal("0.00")

            if sp:
                variant = db.query(ProductVariant).filter(ProductVariant.id == sp.variant_id).first()
                pack_id = sp.pack_id
                if variant:
                    unit_cost = Decimal(str(sp.replacement_cost or variant.replacement_cost or variant.standard_cost or variant.average_cost or "1.00"))
            else:
                # Si no está explícitamente vinculado al proveedor, buscar en catálogo general
                gen_filters = [
                    or_(
                        ProductVariant.sku.ilike(f"%{t}%"),
                        Product.name.ilike(f"%{t}%")
                    )
                    for t in tokens
                ] if tokens else [Product.name.ilike(f"%{q_text}%")]

                variant = db.query(ProductVariant).join(Product).filter(
                    ProductVariant.is_active == True,
                    and_(*gen_filters)
                ).first()
                if variant:
                    unit_cost = Decimal(str(variant.replacement_cost or variant.standard_cost or variant.average_cost or "1.00"))

            if not variant:
                unresolved_queries.append(q_text)
                continue

            # Calcular unidades base según empaque si existe
            expected_base_qty = qty
            if pack_id:
                pack = db.query(ProductPackaging).filter(ProductPackaging.id == pack_id).first()
                if pack and pack.qty_per_unit and pack.qty_per_unit > 0:
                    expected_base_qty = qty * Decimal(str(pack.qty_per_unit))

            line = PurchaseOrderLine(
                order_id=po.id,
                variant_id=variant.id,
                pack_id=pack_id,
                qty_ordered=qty,
                expected_base_qty=expected_base_qty,
                unit_cost=unit_cost
            )
            db.add(line)
            line_subtotal = expected_base_qty * unit_cost
            total_order_amount += line_subtotal

            resolved_lines.append({
                "sku": variant.sku,
                "product_name": variant.product.name if variant.product else variant.sku,
                "qty_ordered": float(qty),
                "expected_base_qty": float(expected_base_qty),
                "unit_cost": float(unit_cost),
                "subtotal": float(line_subtotal)
            })

        if not resolved_lines:
            db.rollback()
            return {
                "success": False,
                "error": f"No se pudo identificar ninguno de los productos indicados ({', '.join(unresolved_queries)})."
            }

        po.total_amount = total_order_amount

        # Registrar en la bitácora de Clara Compras
        worker = db.query(DigitalWorker).filter(DigitalWorker.agent_code == "CLARA_COMPRAS").first()
        if worker:
            action_log = DigitalWorkerActionLog(
                worker_id=worker.id,
                facility_id=target_facility_id,
                action_type="CUSTOM_PO_CREATED",
                target_entity_type="purchase_order",
                target_entity_id=str(po.id),
                severity="INFO",
                summary=f"ODC Manual Borrador para {supplier.name}: {po.reference} (${total_order_amount:,.2f} USD, {len(resolved_lines)} renglones).",
                details={
                    "order_reference": po.reference,
                    "supplier_name": supplier.name,
                    "facility_name": facility_name,
                    "total_amount": float(total_order_amount),
                    "items_count": len(resolved_lines),
                    "channel": channel,
                    "requested_by": user_name,
                    "lines": resolved_lines[:10]
                },
                recipient_target="Analista de Compras",
                status="COMPLETED"
            )
            db.add(action_log)

        db.commit()
        db.refresh(po)

        # Construir desglose de respuesta
        lines_summary = []
        for rl in resolved_lines[:6]:
            lines_summary.append(f"• *{rl['product_name']}* (`{rl['sku']}`): {rl['qty_ordered']:.0f} bultos/uds (${rl['subtotal']:,.2f})")
        if len(resolved_lines) > 6:
            lines_summary.append(f"• _... y {len(resolved_lines) - 6} ítems adicionales._")

        unresolved_note = ""
        if unresolved_queries:
            unresolved_note = f"\n\n⚠️ _No se encontraron los siguientes ítems: {', '.join(unresolved_queries)}._"

        return {
            "success": True,
            "mode": "CUSTOM_ITEMS",
            "order_id": po.id,
            "order_reference": po.reference,
            "supplier_name": supplier.name,
            "facility_name": facility_name,
            "total_amount": float(total_order_amount),
            "lines_count": len(resolved_lines),
            "message": (
                f"✅ *Orden de Compra Borrador Creada*\n\n"
                f"He generado la orden *{po.reference}* para *{supplier.name}* en *{facility_name}*:\n\n"
                + "\n".join(lines_summary) +
                f"\n\n💰 *Total Estimado:* ${float(total_order_amount):,.2f} USD\n"
                f"📋 *Renglones:* {len(resolved_lines)} productos\n"
                f"🏷️ *Estado:* `DRAFT` (Borrador)"
                f"{unresolved_note}\n\n"
                f"_Ya está disponible en Neo ERP para revisión y firma._"
            )
        }

    except Exception as e:
        db.rollback()
        logger.error(f"[CLARA COMPRAS] Error creando ODC personalizada: {e}", exc_info=True)
        return {
            "success": False,
            "error": f"Error registrando orden de compra: {str(e)}"
        }
