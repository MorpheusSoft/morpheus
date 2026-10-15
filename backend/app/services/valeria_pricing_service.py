"""
Servicio Autónomo de Valeria (Neo Pricing / Costos y Precios)
Proporciona auditoría de márgenes, detección de alzas de costos, supervisión de sesiones
de precios, consistencia de precios multitienda y fichas técnicas de costo y PVP.
"""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, text

try:
    from zoneinfo import ZoneInfo
    CARACAS_TZ = ZoneInfo("America/Caracas")
except Exception:
    CARACAS_TZ = timezone(timedelta(hours=-4))

WEEKDAYS_ES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]

from app.models.inventory import (
    ProductVariant,
    Product,
    ProductBarcode,
    ProductFacilityPrice,
    PricingSession,
    PricingSessionLine,
    Category
)
from app.models.core import Facility, SystemSettings, User
from app.models.digital_workers import DigitalWorker, DigitalWorkerActionLog, DigitalWorkerConversation
from app.models.purchasing import PurchaseOrder
from app.services.nlp_search import search_product_variants
from app.services.telegram_client import send_telegram_message_sync

logger = logging.getLogger(__name__)


def audit_critical_margins(
    db: Session,
    min_margin_pct: float = 15.0,
    limit: int = 12
) -> List[Dict[str, Any]]:
    """
    Detecta productos con margen crítico o venta a pérdida (PVP <= Costo).
    Fórmula de Margen sobre Ventas: (PVP - Costo) / PVP * 100
    """
    results = []
    try:
        # Tomar variantes activas con precio de venta mayor a 0
        variants = db.query(ProductVariant).filter(
            ProductVariant.is_active == True,
            ProductVariant.sales_price > 0
        ).all()

        for v in variants:
            cost = float(v.replacement_cost or v.standard_cost or v.average_cost or 0)
            pvp = float(v.sales_price or 0)
            if pvp <= 0:
                continue

            margin_pct = ((pvp - cost) / pvp) * 100.0

            if margin_pct < min_margin_pct:
                prod_name = v.product.name if v.product else f"SKU {v.sku}"
                cat_name = v.product.category.name if v.product and v.product.category else "General"
                results.append({
                    "sku": v.sku,
                    "product_name": prod_name,
                    "category": cat_name,
                    "cost": round(cost, 4),
                    "sales_price": round(pvp, 4),
                    "margin_pct": round(margin_pct, 2),
                    "is_negative": margin_pct <= 0,
                    "loss_per_unit": round(cost - pvp, 4) if margin_pct <= 0 else 0.0
                })

        # Ordenar primero los negativos (peores) y luego los de menor margen
        results.sort(key=lambda x: x["margin_pct"])
        return results[:limit]
    except Exception as e:
        logger.error(f"[VALERIA SERVICE] Error en audit_critical_margins: {e}")
        return []


def audit_recent_cost_spikes(
    db: Session,
    limit: int = 8
) -> List[Dict[str, Any]]:
    """
    Detecta productos con alzas significativas de costo registradas en sesiones de fijación de precios.
    """
    results = []
    try:
        lines = db.query(PricingSessionLine).join(PricingSession).filter(
            PricingSessionLine.proposed_cost > PricingSessionLine.old_cost,
            PricingSessionLine.old_cost > 0
        ).order_by(desc(PricingSessionLine.id)).limit(limit * 2).all()

        for l in lines:
            old_c = float(l.old_cost or 0)
            new_c = float(l.proposed_cost or 0)
            pvp = float(l.old_price or 0)

            if old_c <= 0 or new_c <= old_c:
                continue

            cost_increase_pct = ((new_c - old_c) / old_c) * 100.0
            old_margin = ((pvp - old_c) / pvp * 100.0) if pvp > 0 else 0.0
            eroded_margin = ((pvp - new_c) / pvp * 100.0) if pvp > 0 else 0.0

            sku = l.variant_id
            p_name = l.external_reference_name or "Producto"
            if l.variant_id:
                var = db.query(ProductVariant).filter(ProductVariant.id == l.variant_id).first()
                if var:
                    sku = var.sku
                    p_name = var.product.name if var.product else var.sku

            results.append({
                "sku": str(sku),
                "product_name": p_name,
                "session_name": l.session.name if l.session else "Sesión",
                "old_cost": round(old_c, 4),
                "new_cost": round(new_c, 4),
                "cost_increase_pct": round(cost_increase_pct, 1),
                "current_pvp": round(pvp, 4),
                "old_margin_pct": round(old_margin, 1),
                "eroded_margin_pct": round(eroded_margin, 1),
                "margin_drop_pct": round(old_margin - eroded_margin, 1)
            })

        results.sort(key=lambda x: x["cost_increase_pct"], reverse=True)
        return results[:limit]
    except Exception as e:
        logger.error(f"[VALERIA SERVICE] Error en audit_recent_cost_spikes: {e}")
        return []


def audit_pending_pricing_sessions(
    db: Session,
    limit: int = 6
) -> List[Dict[str, Any]]:
    """
    Supervisa las sesiones de precios abiertas (DRAFT) pendientes por aplicar.
    """
    results = []
    try:
        sessions = db.query(PricingSession).filter(
            PricingSession.status == 'DRAFT'
        ).order_by(desc(PricingSession.id)).limit(limit).all()

        for s in sessions:
            supplier_name = s.supplier.name if s.supplier else "Catálogo General / Varios"
            results.append({
                "id": s.id,
                "name": s.name,
                "supplier": supplier_name,
                "source_type": s.source_type,
                "update_type": s.update_type,
                "created_at": s.created_at.strftime("%Y-%m-%d %H:%M") if s.created_at else "N/A",
                "lines_count": len(s.lines)
            })
        return results
    except Exception as e:
        logger.error(f"[VALERIA SERVICE] Error en audit_pending_pricing_sessions: {e}")
        return []


def audit_cross_store_price_discrepancies(
    db: Session,
    limit: int = 8
) -> List[Dict[str, Any]]:
    """
    Compara los precios de venta por sucursal (ProductFacilityPrice) para detectar discrepancias
    no homologadas entre tiendas.
    """
    results = []
    try:
        # Buscar variantes con múltiples precios en sedes activas
        grouped = db.query(
            ProductFacilityPrice.variant_id,
            func.count(func.distinct(ProductFacilityPrice.sales_price)).label("price_variants"),
            func.min(ProductFacilityPrice.sales_price).label("min_price"),
            func.max(ProductFacilityPrice.sales_price).label("max_price")
        ).filter(
            ProductFacilityPrice.is_active == True,
            ProductFacilityPrice.sales_price > 0
        ).group_by(ProductFacilityPrice.variant_id).having(
            func.count(func.distinct(ProductFacilityPrice.sales_price)) > 1
        ).limit(limit).all()

        for g in grouped:
            var = db.query(ProductVariant).filter(ProductVariant.id == g.variant_id).first()
            if not var:
                continue

            fac_prices = db.query(ProductFacilityPrice, Facility).join(
                Facility, ProductFacilityPrice.facility_id == Facility.id
            ).filter(
                ProductFacilityPrice.variant_id == var.id,
                ProductFacilityPrice.is_active == True
            ).all()

            price_breakdown = [
                {"facility": fac.name, "price": float(fp.sales_price)}
                for fp, fac in fac_prices
            ]

            results.append({
                "sku": var.sku,
                "product_name": var.product.name if var.product else var.sku,
                "min_price": float(g.min_price),
                "max_price": float(g.max_price),
                "discrepancy_amount": float(g.max_price - g.min_price),
                "store_prices": price_breakdown
            })
        return results
    except Exception as e:
        logger.error(f"[VALERIA SERVICE] Error en audit_cross_store_price_discrepancies: {e}")
        return []


def lookup_product_price_and_cost(
    query_text: str,
    db: Session
) -> List[Dict[str, Any]]:
    """
    Búsqueda rápida de costo, PVP y rentabilidad por SKU, código de barras o nombre.
    """
    results = []
    clean_q = (query_text or "").strip()
    if not clean_q:
        return []

    try:
        # Búsqueda inteligente tolerante a lenguaje natural (código de barras, SKU o tokens sustantivos con NLP)
        variants = search_product_variants(db, clean_q, limit=5)

        for v in variants:
            std_cost = float(v.standard_cost or 0)
            avg_cost = float(v.average_cost or 0)
            rep_cost = float(v.replacement_cost or 0)
            ref_cost = rep_cost or std_cost or avg_cost
            pvp = float(v.sales_price or 0)
            margin_pct = ((pvp - ref_cost) / pvp * 100.0) if pvp > 0 else 0.0

            # Precios por sede
            fac_map = {f.id: f.name for f in db.query(Facility).all()}
            fac_prices = []
            for fp in v.facility_prices:
                if fp.is_active:
                    fac_name = fac_map.get(fp.facility_id, f"Sede #{fp.facility_id}")
                    fac_prices.append({
                        "facility": fac_name,
                        "sales_price": float(fp.sales_price or 0),
                        "target_utility_pct": float(fp.target_utility_pct) if fp.target_utility_pct else None
                    })

            results.append({
                "sku": v.sku,
                "product_name": v.product.name if v.product else "N/A",
                "category": v.product.category.name if v.product and v.product.category else "General",
                "standard_cost": std_cost,
                "average_cost": avg_cost,
                "replacement_cost": rep_cost,
                "sales_price": pvp,
                "margin_pct": round(margin_pct, 2),
                "is_negative": margin_pct <= 0,
                "facility_prices": fac_prices
            })

        return results
    except Exception as e:
        logger.error(f"[VALERIA SERVICE] Error en lookup_product_price_and_cost: {e}")
        return []


def run_valeria_proactive_pricing_scan(
    db: Session,
    worker: Optional[DigitalWorker] = None,
    force_notify: bool = False,
    specific_chat_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Ejecuta el escaneo proactivo de precios, costos y rentabilidad de Valeria (Neo Pricing).
    Audita márgenes críticos, alzas de costo de proveedores, sesiones en borrador
    y discrepancias de precio multitienda, despachando el briefing ejecutivo a gerencia.
    """
    logger.info("[VALERIA PROACTIVO] Iniciando escaneo matutino de precios y rentabilidad...")

    if not worker:
        worker = db.query(DigitalWorker).filter(DigitalWorker.agent_code == "VALERIA_PRICING").first()

    now_caracas = datetime.now(CARACAS_TZ)
    date_str = now_caracas.strftime("%d/%m/%Y %I:%M %p")
    weekday_idx = now_caracas.weekday()
    weekday_name = WEEKDAYS_ES[weekday_idx]

    # 1. Ejecutar auditorías nativas
    critical_margins = audit_critical_margins(db, min_margin_pct=15.0, limit=8)
    cost_spikes = audit_recent_cost_spikes(db, limit=6)
    pending_sessions = audit_pending_pricing_sessions(db, limit=5)
    discrepancies = audit_cross_store_price_discrepancies(db, limit=5)

    has_alerts = bool(critical_margins or cost_spikes or pending_sessions or discrepancies)

    # 2. Si no hay alertas
    if not has_alerts:
        logger.info("[VALERIA PROACTIVO] Sin alertas críticas de precios ni márgenes.")
        msg_ok = (
            f"🎯 *Briefing Proactivo de Precios y Rentabilidad | Neo ERP*\n"
            f"🤖 *Valeria (Neo Pricing / Costos)*\n"
            f"📅 _{date_str}_ (*{weekday_name} de Operaciones*)\n\n"
            f"✅ *Excelente noticia:* Todos los precios y márgenes comerciales se encuentran en estado óptimo.\n"
            f"• Sin productos vendiéndose a pérdida ni con margen crítico (< 15%).\n"
            f"• Sin incrementos imprevistos de costos en compras recientes.\n"
            f"• Sin sesiones de precios pendientes por aplicar.\n"
            f"• Consistencia total de precios entre tiendas físicas.\n\n"
            f"💡 _Puedes consultar cualquier producto con `/precio [nombre o SKU]`._"
        )

        notifications_sent = 0
        if force_notify:
            target_chats = set()
            if specific_chat_id:
                target_chats.add(str(specific_chat_id))
            else:
                users_linked = db.query(User.telegram_chat_id).filter(
                    User.telegram_chat_id.isnot(None),
                    User.is_active == True
                ).all()
                for (cid,) in users_linked:
                    if cid:
                        target_chats.add(str(cid))

            for cid in target_chats:
                ok = send_telegram_message_sync(chat_id=cid, text=msg_ok, agent_code="VALERIA_PRICING")
                if ok:
                    notifications_sent += 1

        return {
            "success": True,
            "critical_margins_count": 0,
            "cost_spikes_count": 0,
            "pending_sessions_count": 0,
            "discrepancies_count": 0,
            "notifications_sent": notifications_sent,
            "message": "Márgenes comerciales y costos en perfecto orden.",
            "message_preview": msg_ok
        }

    # 3. Construir Resumen Ejecutivo para Telegram
    blocks = [
        f"🎯 *Briefing Proactivo de Precios y Rentabilidad | Neo ERP*",
        f"🤖 *Valeria (Neo Pricing / Costos)* - Diagnóstico Matutino",
        f"📅 _{date_str}_ (*{weekday_name} de Operaciones*)\n",
        f"📊 *Diagnóstico Global de Rentabilidad:*",
        f"• SKUs en Margen Crítico / Pérdida: *{len(critical_margins)}*",
        f"• Alzas Recientes de Costo: *{len(cost_spikes)} casos*",
        f"• Sesiones de Precios en Borrador: *{len(pending_sessions)} pendientes*",
        f"• Discrepancias Multitienda: *{len(discrepancies)} productos*",
    ]

    # Sección A: Margen Crítico y Pérdida
    if critical_margins:
        blocks.append(f"\n───────────────────")
        blocks.append(f"🛡️ *Productos en Margen Crítico o Venta a Pérdida:*")
        for c in critical_margins[:5]:
            icon = "🔴 PÉRDIDA" if c.get("is_negative") else "🟡 MARGEN BAJO"
            p_name = c.get("product_name") or "Producto"
            sku = c.get("sku") or "N/A"
            margin = c.get("margin_pct", 0.0)
            cost = c.get("cost", 0.0)
            pvp = c.get("sales_price", 0.0)
            blocks.append(
                f"• *{p_name}* (`{sku}`):\n"
                f"   - Estado: *{icon}* | Margen: *{margin}%*\n"
                f"   - Costo: ${cost:,.4f} | PVP: ${pvp:,.4f}"
            )
        if len(critical_margins) > 5:
            blocks.append(f"  _... y {len(critical_margins) - 5} productos adicionales en riesgo._")

    # Sección B: Alzas de Costo
    if cost_spikes:
        blocks.append(f"\n───────────────────")
        blocks.append(f"📈 *Alzas Recientes de Costo de Proveedores:*")
        for sp in cost_spikes[:4]:
            p_name = sp.get("product_name") or "Producto"
            sku = sp.get("sku") or "N/A"
            old_c = sp.get("old_cost", 0.0)
            new_c = sp.get("new_cost", 0.0)
            inc_pct = sp.get("cost_increase_pct", 0.0)
            pvp = sp.get("current_pvp", 0.0)
            drop = sp.get("margin_drop_pct", 0.0)
            blocks.append(
                f"• *{p_name}* (`{sku}`): Costo +*{inc_pct}%* (${old_c:,.4f} ➔ ${new_c:,.4f})\n"
                f"   - PVP Actual: ${pvp:,.4f} (Erosión margen: -{drop}%)"
            )
        if len(cost_spikes) > 4:
            blocks.append(f"  _... y {len(cost_spikes) - 4} aumentos adicionales de costo._")

    # Sección C: Sesiones de Precios Pendientes
    if pending_sessions:
        blocks.append(f"\n───────────────────")
        blocks.append(f"📑 *Sesiones de Fijación de Precios Pendientes (DRAFT):*")
        for s in pending_sessions[:3]:
            sid = s.get("id")
            sname = s.get("name")
            sup = s.get("supplier") or "Varios"
            cnt = s.get("lines_count", 0)
            blocks.append(f"• *Sesión #{sid} - {sname}* ({sup}): *{cnt}* productos listos para publicar")
        if len(pending_sessions) > 3:
            blocks.append(f"  _... y {len(pending_sessions) - 3} sesiones adicionales en borrador._")

    # Sección D: Discrepancias Multitienda
    if discrepancies:
        blocks.append(f"\n───────────────────")
        blocks.append(f"🏬 *Discrepancias de Precio entre Sucursales:*")
        for d in discrepancies[:3]:
            p_name = d.get("product_name") or "Producto"
            sku = d.get("sku") or "N/A"
            min_p = d.get("min_price", 0.0)
            max_p = d.get("max_price", 0.0)
            diff = d.get("discrepancy_amount", 0.0)
            blocks.append(f"• *{p_name}* (`{sku}`): Rango ${min_p:,.2f} - ${max_p:,.2f} (Diferencia: ${diff:,.2f})")
        if len(discrepancies) > 3:
            blocks.append(f"  _... y {len(discrepancies) - 3} productos desalineados adicionales._")

    blocks.append("\n───────────────────")
    blocks.append(
        "💡 *Comandos Rápidos:*\n"
        "• `/margen_critico`: Ver productos con margen bajo o pérdida\n"
        "• `/aumentos`: Auditar alzas de costo de proveedores\n"
        "• `/sesiones`: Revisar sesiones de precios pendientes\n"
        "• `/precio [producto]`: Consultar ficha técnica de costo y PVP"
    )

    telegram_text = "\n".join(blocks)

    # 4. Despachar a destinatarios oficiales
    notifications_sent = 0
    target_chats = set()

    if specific_chat_id:
        target_chats.add(str(specific_chat_id))
    else:
        # A. Usuarios activos vinculados
        try:
            users_linked = db.query(User.telegram_chat_id).filter(
                User.telegram_chat_id.isnot(None),
                User.is_active == True
            ).all()
            for (cid,) in users_linked:
                if cid:
                    target_chats.add(str(cid))
        except Exception as e:
            logger.warning(f"[VALERIA PROACTIVO] Error consultando usuarios vinculados: {e}")

        # B. Conversaciones previas autenticadas con Valeria
        if worker:
            try:
                convs = db.query(DigitalWorkerConversation.external_sender_id).filter(
                    DigitalWorkerConversation.worker_id == worker.id,
                    DigitalWorkerConversation.channel == "TELEGRAM",
                    DigitalWorkerConversation.is_authenticated == True
                ).all()
                for (cid,) in convs:
                    if cid:
                        target_chats.add(str(cid))
            except Exception as e:
                logger.warning(f"[VALERIA PROACTIVO] Error consultando conversaciones de Valeria: {e}")

    for cid in target_chats:
        ok = send_telegram_message_sync(
            chat_id=cid,
            text=telegram_text,
            agent_code="VALERIA_PRICING"
        )
        if ok:
            notifications_sent += 1

    # 5. Registrar en Bitácora de Acciones de Valeria
    if worker:
        try:
            action_log = DigitalWorkerActionLog(
                worker_id=worker.id,
                facility_id=None,
                action_type="PROACTIVE_PRICING_SCAN",
                severity="WARNING" if critical_margins else "INFO",
                summary=(
                    f"Briefing matutino de Precios: {len(critical_margins)} SKUs en margen crítico, "
                    f"{len(cost_spikes)} alzas de costo, {len(pending_sessions)} sesiones DRAFT. "
                    f"{notifications_sent} alertas enviadas vía Telegram."
                ),
                details={
                    "critical_margins_count": len(critical_margins),
                    "cost_spikes_count": len(cost_spikes),
                    "pending_sessions_count": len(pending_sessions),
                    "discrepancies_count": len(discrepancies),
                    "notifications_sent": notifications_sent,
                    "target_chats": list(target_chats)
                },
                recipient_target="Analistas y Supervisores de Precios",
                status="COMPLETED"
            )
            db.add(action_log)
            db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"[VALERIA PROACTIVO] Error guardando log de acción: {e}")

    logger.info(f"[VALERIA PROACTIVO] Escaneo finalizado. {notifications_sent} alertas enviadas.")
    return {
        "success": True,
        "critical_margins_count": len(critical_margins),
        "cost_spikes_count": len(cost_spikes),
        "pending_sessions_count": len(pending_sessions),
        "discrepancies_count": len(discrepancies),
        "notifications_sent": notifications_sent,
        "message_preview": telegram_text
    }

