"""
Servicio Proactivo de Arturo (Neo WMS / Logística y Almacén)
Genera el diagnóstico matutino de existencias negativas, devoluciones en muelle
y recepciones pendientes de conciliar (3-Way Match), despachando el briefing ejecutivo
a los supervisores de almacén y logística vía Telegram.
"""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from sqlalchemy.orm import Session

from app.models.core import Facility, User
from app.models.digital_workers import DigitalWorker, DigitalWorkerActionLog, DigitalWorkerConversation
from app.agents.skills.wms_skills import (
    audit_negative_stock,
    audit_dock_returns_and_scrap,
    audit_unreconciled_orders
)
from app.agents.whatsapp_agent import (
    execute_negative_stock_lookup,
    execute_returns_lookup,
    execute_unreconciled_orders_lookup
)
from app.services.telegram_client import send_telegram_message_sync

logger = logging.getLogger(__name__)

try:
    from zoneinfo import ZoneInfo
    CARACAS_TZ = ZoneInfo("America/Caracas")
except Exception:
    CARACAS_TZ = timezone(timedelta(hours=-4))

WEEKDAYS_ES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]


def run_arturo_proactive_wms_scan(
    db: Session,
    worker: Optional[DigitalWorker] = None,
    force_notify: bool = False,
    specific_chat_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Ejecuta el escaneo proactivo de almacenes y logística de Arturo (Neo WMS).
    Audita existencias negativas, devoluciones en muelle y recepciones sin conciliar,
    generando los borradores de regularización y enviando el resumen a supervisores.
    """
    logger.info("[ARTURO PROACTIVO] Iniciando escaneo matutino de almacenes y existencias...")

    if not worker:
        worker = db.query(DigitalWorker).filter(DigitalWorker.agent_code == "ARTURO_WMS").first()

    now_caracas = datetime.now(CARACAS_TZ)
    date_str = now_caracas.strftime("%d/%m/%Y %I:%M %p")
    weekday_idx = now_caracas.weekday()
    weekday_name = WEEKDAYS_ES[weekday_idx]

    # 1. Ejecutar auditorías nativas
    if worker:
        neg_items = audit_negative_stock(db, worker)
        dock_items = audit_dock_returns_and_scrap(db, worker)
        unrec_items = audit_unreconciled_orders(db, worker)
    else:
        neg_items = execute_negative_stock_lookup(db)
        dock_items = execute_returns_lookup(db)
        unrec_items = execute_unreconciled_orders_lookup(db)

    has_anomalies = bool(neg_items or dock_items or unrec_items)

    # 2. Si todo está en orden
    if not has_anomalies:
        logger.info("[ARTURO PROACTIVO] Sin anomalías detectadas en almacenes.")
        msg_ok = (
            f"🎯 *Briefing Proactivo de Almacén | Neo ERP*\n"
            f"🤖 *Arturo (Neo WMS / Logística)*\n"
            f"📅 _{date_str}_ (*{weekday_name} de Operaciones*)\n\n"
            f"✅ *Excelente noticia:* Todos los almacenes operan con normalidad.\n"
            f"• Sin saldos negativos de inventario.\n"
            f"• Sin devoluciones acumuladas en muelle.\n"
            f"• Sin recepciones pendientes de conciliar.\n\n"
            f"💡 _Para auditorías específicas puedes usar `/negativos` o `/stock [producto]`._"
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
                ok = send_telegram_message_sync(chat_id=cid, text=msg_ok, agent_code="ARTURO_WMS")
                if ok:
                    notifications_sent += 1

        return {
            "success": True,
            "negative_stock_count": 0,
            "dock_returns_count": 0,
            "unreconciled_orders_count": 0,
            "notifications_sent": notifications_sent,
            "message": "Operaciones de almacén e inventario en perfecto orden.",
            "message_preview": msg_ok
        }

    # 3. Construir Resumen Ejecutivo para Telegram
    blocks = [
        f"🎯 *Briefing Proactivo de Almacén | Neo ERP*",
        f"🤖 *Arturo (Neo WMS / Logística)* - Diagnóstico Matutino",
        f"📅 _{date_str}_ (*{weekday_name} de Operaciones*)\n",
        f"📊 *Diagnóstico Operativo de la Cadena:*",
        f"• Existencias Negativas: *{len(neg_items)} SKUs afectados*",
        f"• Devoluciones / Rechazos en Muelle: *{len(dock_items)} órdenes*",
        f"• Recepciones Físicas por Conciliar: *{len(unrec_items)} órdenes*",
    ]

    # Sección A: Existencias Negativas
    if neg_items:
        blocks.append(f"\n───────────────────")
        blocks.append(f"🚨 *Existencias Negativas Detectadas (Requieren Conteo Físico):*")
        for it in neg_items[:6]:
            prod = it.get("product") or it.get("product_name") or "Producto"
            sku = it.get("sku") or "N/A"
            fac = it.get("facility") or "Almacén"
            qty = abs(it.get("stock_qty") or it.get("quantity_negative") or 0.0)
            adj = it.get("adjustment_number")
            adj_str = f" (Ajuste propuesto: `{adj}`)" if adj else ""
            blocks.append(f"• *{fac}*: {prod} (`{sku}`) ➔ *{qty:,.0f} unid.*{adj_str}")
        if len(neg_items) > 6:
            blocks.append(f"  _... y {len(neg_items) - 6} existencias negativas adicionales._")

    # Sección B: Devoluciones en Muelle
    if dock_items:
        blocks.append(f"\n───────────────────")
        blocks.append(f"📦 *Devoluciones y Rechazos Pendientes en Muelle:*")
        for it in dock_items[:5]:
            ref = it.get("order_reference") or it.get("return_number") or "ORDEN"
            sup = it.get("supplier") or "Proveedor"
            tot = it.get("total_amount") or 0.0
            blocks.append(f"• *{sup}*: Orden `{ref}` por *${tot:,.2f} USD* (Requiere gestión de NC)")
        if len(dock_items) > 5:
            blocks.append(f"  _... y {len(dock_items) - 5} devoluciones adicionales._")

    # Sección C: Recepciones Físicas sin Factura (3-Way)
    if unrec_items:
        blocks.append(f"\n───────────────────")
        blocks.append(f"📋 *Recepciones Físicas Pendientes de Factura (3-Way Match):*")
        for it in unrec_items[:5]:
            ref = it.get("order_reference") or it.get("order_number") or "ORDEN"
            sup = it.get("supplier") or "Proveedor"
            tot = it.get("total_amount") or it.get("total_usd") or 0.0
            blocks.append(f"• *{sup}*: Recepción `{ref}` por *${tot:,.2f} USD* (Pendiente cruce)")
        if len(unrec_items) > 5:
            blocks.append(f"  _... y {len(unrec_items) - 5} recepciones adicionales._")

    blocks.append("\n───────────────────")
    blocks.append(
        "💡 *Comandos Rápidos:*\n"
        "• `/negativos`: Ver detalle de inventarios negativos\n"
        "• `/devoluciones`: Listar devoluciones y mermas en muelle\n"
        "• `/stock [producto]`: Consultar existencia multitienda"
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
            logger.warning(f"[ARTURO PROACTIVO] Error consultando usuarios vinculados: {e}")

        # B. Conversaciones previas autenticadas con Arturo
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
                logger.warning(f"[ARTURO PROACTIVO] Error consultando conversaciones de Arturo: {e}")

    for cid in target_chats:
        ok = send_telegram_message_sync(
            chat_id=cid,
            text=telegram_text,
            agent_code="ARTURO_WMS"
        )
        if ok:
            notifications_sent += 1

    # 5. Registrar en Bitácora de Acciones de Arturo
    if worker:
        try:
            action_log = DigitalWorkerActionLog(
                worker_id=worker.id,
                facility_id=None,
                action_type="PROACTIVE_WMS_SCAN",
                severity="WARNING" if neg_items else "INFO",
                summary=(
                    f"Briefing matutino WMS: {len(neg_items)} existencias negativas, "
                    f"{len(dock_items)} devoluciones en muelle, {len(unrec_items)} recepciones sin conciliar. "
                    f"{notifications_sent} alertas enviadas vía Telegram."
                ),
                details={
                    "negative_stock_count": len(neg_items),
                    "dock_returns_count": len(dock_items),
                    "unreconciled_orders_count": len(unrec_items),
                    "notifications_sent": notifications_sent,
                    "target_chats": list(target_chats)
                },
                recipient_target="Supervisores de Almacén y Logística",
                status="COMPLETED"
            )
            db.add(action_log)
            db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"[ARTURO PROACTIVO] Error guardando log de acción: {e}")

    logger.info(f"[ARTURO PROACTIVO] Escaneo finalizado. {notifications_sent} alertas enviadas.")
    return {
        "success": True,
        "negative_stock_count": len(neg_items),
        "dock_returns_count": len(dock_items),
        "unreconciled_orders_count": len(unrec_items),
        "notifications_sent": notifications_sent,
        "message_preview": telegram_text
    }
