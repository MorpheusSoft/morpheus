"""
Servicio Proactivo de Clara (Neo Compras)
Genera el diagnóstico matutino de compras, quiebres por proveedor, sucursal y categoría,
y difunde el briefing ejecutivo con sugerencias de acción directa por Telegram.
"""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc

from app.models.core import Facility, User, Supplier
from app.models.purchasing import PurchaseOrder, SupplierFacilitySchedule
from app.models.inventory import Category
from app.models.digital_workers import DigitalWorker, DigitalWorkerActionLog, DigitalWorkerConversation
from app.services.mrp_bot_service import diagnose_stockouts
from app.services.telegram_client import send_telegram_message_sync

logger = logging.getLogger(__name__)

try:
    from zoneinfo import ZoneInfo
    CARACAS_TZ = ZoneInfo("America/Caracas")
except Exception:
    CARACAS_TZ = timezone(timedelta(hours=-4))

WEEKDAYS_ES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]


def get_weekly_procurement_calendar(db: Session) -> str:
    """
    Retorna el cronograma semanal de compras configurado para visualización ejecutiva.
    """
    schedules = db.query(SupplierFacilitySchedule).filter(
        SupplierFacilitySchedule.is_active == True
    ).order_by(SupplierFacilitySchedule.order_day_of_week.asc()).all()

    suppliers_with_day = db.query(Supplier).filter(
        Supplier.order_day_of_week.isnot(None),
        Supplier.is_active == True
    ).all()

    by_day: Dict[int, List[str]] = {i: [] for i in range(7)}

    for s in schedules:
        day = s.order_day_of_week
        sup_name = s.supplier.name if s.supplier else f"Proveedor #{s.supplier_id}"
        fac_name = s.facility.name if s.facility else f"Sede #{s.facility_id}"
        cadence = f"cadencia {s.review_cadence_days}d"
        by_day[day].append(f"• *{sup_name}* ➔ {fac_name} ({cadence})")

    for sup in suppliers_with_day:
        day = sup.order_day_of_week
        already = any(s.supplier_id == sup.id for s in schedules if s.order_day_of_week == day)
        if not already:
            cadence = f"cadencia {sup.restock_coverage_days or 7}d"
            by_day[day].append(f"• *{sup.name}* (Todas las tiendas | {cadence})")

    now_caracas = datetime.now(CARACAS_TZ)
    current_day = now_caracas.weekday()

    lines = [
        "🗓️ *Cronograma Semanal de Compras | Neo ERP*",
        "🤖 *Agenda de Atención de Proveedores (Clara)*\n"
    ]

    has_entries = False
    for day_idx in range(5):  # Lunes a Viernes
        day_name = WEEKDAYS_ES[day_idx]
        entries = by_day.get(day_idx, [])
        is_today = (day_idx == current_day)
        marker = " 👈 *(HOY)*" if is_today else ""
        lines.append(f"📌 *{day_name}*{marker}:")
        if entries:
            has_entries = True
            lines.extend(entries[:4])
            if len(entries) > 4:
                lines.append(f"  _... y {len(entries) - 4} asignaciones adicionales._")
        else:
            lines.append("  _Sin proveedores específicos asignados._")
        lines.append("")

    if not has_entries:
        lines.append("💡 _Aún no se han configurado cronogramas por sucursal. Clara evalúa todos los proveedores activos según rotación real y cobertura._")

    lines.append("───────────────────")
    lines.append("💡 *Comandos Rápidos:*")
    lines.append("• `/proactivo`: Ver sugeridos del día de hoy")
    lines.append("• `/sugeridos [Proveedor]`: Diagnosticar un proveedor específico")
    lines.append("• `/crear_odc [Proveedor] en [Sede]`: Generar borrador de orden")

    return "\n".join(lines)


def run_clara_proactive_purchasing_scan(
    db: Session,
    worker: Optional[DigitalWorker] = None,
    force_notify: bool = False,
    specific_chat_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Ejecuta el escaneo proactivo de abastecimiento de Clara (Neo Compras).
    Identifica proveedores y sucursales en quiebre urgente, agrupa por categorías,
    prioriza los proveedores del cronograma de hoy y despacha el briefing ejecutivo.
    """
    logger.info("[CLARA PROACTIVO] Iniciando escaneo de compras y sugeridos...")

    # 1. Obtener trabajador digital Clara Compras
    if not worker:
        worker = db.query(DigitalWorker).filter(DigitalWorker.agent_code == "CLARA_COMPRAS").first()

    now_caracas = datetime.now(CARACAS_TZ)
    date_str = now_caracas.strftime("%d/%m/%Y %I:%M %p")
    weekday_idx = now_caracas.weekday()
    weekday_name = WEEKDAYS_ES[weekday_idx]

    # 2. Ejecutar diagnóstico de quiebres MRP en memoria
    diag = diagnose_stockouts(db, target_weekday=weekday_idx)
    suppliers = diag.get("suppliers", [])

    # Filtrar proveedores con urgencia CRITICAL o WARNING
    urgent_suppliers = [
        s for s in suppliers 
        if s.get("urgency") in ("CRITICAL", "WARNING") and s.get("items")
    ]

    # Filtrar posibles anomalías numéricas en costos si existieran y ordenar por capital requerido razonable
    valid_urgent = []
    for s in urgent_suppliers:
        cost = s.get("estimated_total_cost", 0.0)
        # Excluir anomalías gigantescas de pruebas (ej: > 1,000,000,000 USD)
        if cost < 500000000.0:
            valid_urgent.append(s)

    # Proveedores programados para hoy tienen máxima prioridad
    valid_urgent.sort(key=lambda s: (
        0 if s.get("is_scheduled_today") else 1,
        0 if s.get("urgency") == "CRITICAL" else 1,
        -s.get("estimated_total_cost", 0.0)
    ))

    # Si no hay quiebres ni proveedores urgentes
    if not valid_urgent:
        logger.info("[CLARA PROACTIVO] No se encontraron proveedores en quiebre crítico.")
        if force_notify and specific_chat_id:
            msg_ok = (
                f"🎯 *Briefing Proactivo de Compras | Neo ERP*\n"
                f"🤖 *Clara (Neo Compras)*\n"
                f"📅 _{date_str}_ (*{weekday_name} de Compras*)\n\n"
                f"✅ *Excelente noticia:* Todos los proveedores analizados presentan cobertura saludable en todas las sucursales. "
                f"No se detectaron quiebres de inventario que requieran órdenes de compra hoy."
            )
            send_telegram_message_sync(chat_id=specific_chat_id, text=msg_ok, agent_code="CLARA_COMPRAS")

        return {
            "success": True,
            "urgent_suppliers_count": 0,
            "total_capital_required": 0.0,
            "notifications_sent": 0,
            "message": "Niveles de inventario saludables en toda la cadena."
        }

    # 3. Construir Resumen Ejecutivo para Telegram
    scheduled_today = [s for s in valid_urgent if s.get("is_scheduled_today")]
    top_candidates = valid_urgent[:4]
    total_skus_in_breach = sum(s.get("skus_in_breach", 0) for s in valid_urgent)
    total_capital = sum(s.get("estimated_total_cost", 0.0) for s in valid_urgent)

    blocks = [
        f"🎯 *Briefing Proactivo de Compras | Neo ERP*",
        f"🤖 *Clara (Neo Compras)* - Diagnóstico Matutino",
        f"📅 _{date_str}_ (*{weekday_name} de Compras*)\n",
        f"📊 *Diagnóstico Global de Abastecimiento:*",
        f"• Proveedores con Déficit: *{len(valid_urgent)}*",
        f"• Renglones en Riesgo/Quiebre: *{total_skus_in_breach} SKUs activos*",
        f"• Capital Estimado Requerido: *${total_capital:,.2f} USD*",
    ]

    if scheduled_today:
        sched_names = ", ".join(f"*{s.get('supplier_name')}*" for s in scheduled_today[:3])
        blocks.append(f"🗓️ *Cronograma de Hoy:* {sched_names}")

    blocks.append(f"\n───────────────────")
    blocks.append(f"🚨 *Proveedores Prioritarios para Reabastecer Hoy:*\n")

    emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"]
    for idx, s in enumerate(top_candidates):
        emo = emojis[idx] if idx < len(emojis) else "▫️"
        s_name = s.get("supplier_name", f"Proveedor #{s.get('supplier_id')}")
        urg = "🔴 CRÍTICO" if s.get("urgency") == "CRITICAL" else "🟡 ALERTA"
        lt = s.get("lead_time_days", 3)
        cov = s.get("restock_coverage_days", 7)
        cost = s.get("estimated_total_cost", 0.0)
        items = s.get("items", [])
        skus_cnt = len(items)

        is_sched = " 🗓️ *(Programado Hoy)*" if s.get("is_scheduled_today") else ""

        # Desglose por sucursales
        fac_breakdown: Dict[str, Dict[str, Any]] = {}
        for it in items:
            fn = it.get("facility_name", "Tienda")
            if fn not in fac_breakdown:
                fac_breakdown[fn] = {"count": 0, "cost": 0.0}
            fac_breakdown[fn]["count"] += 1
            fac_breakdown[fn]["cost"] += it.get("estimated_subtotal", 0.0)

        fac_lines = [
            f"  • *{fn}:* {d['count']} SKUs (~${d['cost']:,.2f} USD)"
            for fn, d in fac_breakdown.items()
        ]
        fac_str = "\n".join(fac_lines[:3])

        # Categorías afectadas
        cat_summaries = s.get("categories_summary", [])
        cat_names = [f"{c['name']} ({c['count']})" for c in cat_summaries[:2]]
        cat_str = ", ".join(cat_names) if cat_names else "General"

        # Borrador existente
        draft_ref = s.get("existing_draft_po_reference")
        draft_txt = f"• ⚠️ *Borrador existente:* `{draft_ref}`" if draft_ref else "• 📝 *Sin orden previa*"

        # Acciones inmediatas por tienda
        first_fac = list(fac_breakdown.keys())[0] if fac_breakdown else "todas"

        sup_block = (
            f"{emo} *{s_name}*{is_sched} ({urg} | Cobertura: {cov}d + {lt}d entrega)\n"
            f"• Déficit Total: *{skus_cnt}* renglones | Sugerido: *${cost:,.2f} USD*\n"
            f"• *Por Sucursal:*\n{fac_str}\n"
            f"• Rubros: _{cat_str}_\n"
            f"{draft_txt}\n"
            f"👉 *Acción Inmediata:*\n"
            f"• `/crear_odc {s_name} en {first_fac}`\n"
            + (f"• `/crear_odc {s_name} en todas`\n" if len(fac_breakdown) > 1 else "")
        )
        blocks.append(sup_block)

    blocks.append("───────────────────")
    blocks.append(
        "💡 *¿Cómo proceder?*\n"
        "• Puedes responder directamente: *\"Clara, genera ODC de Alimentos Polar en Belisa\"*\n"
        "• Para ver el calendario semanal: `/cronograma` o `/calendario_compras`\n"
        "• Para ver la ficha técnica de un producto: `/producto [nombre o SKU]`"
    )

    telegram_text = "\n".join(blocks)

    # 4. Despachar a destinatarios oficiales
    notifications_sent = 0
    target_chats = set()

    if specific_chat_id:
        target_chats.add(str(specific_chat_id))
    else:
        # A. Usuarios vinculados con roles de compras, supervisión o administración
        try:
            users_linked = db.query(User.telegram_chat_id).filter(
                User.telegram_chat_id.isnot(None),
                User.is_active == True
            ).all()
            for (cid,) in users_linked:
                if cid:
                    target_chats.add(str(cid))
        except Exception as e:
            logger.warning(f"[CLARA PROACTIVO] Error consultando usuarios vinculados: {e}")

        # B. Conversaciones previas autenticadas con Clara
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
                logger.warning(f"[CLARA PROACTIVO] Error consultando conversaciones de Clara: {e}")

    for cid in target_chats:
        ok = send_telegram_message_sync(
            chat_id=cid,
            text=telegram_text,
            agent_code="CLARA_COMPRAS"
        )
        if ok:
            notifications_sent += 1

    # 5. Registrar en Bitácora de Acciones de Clara
    if worker:
        try:
            action_log = DigitalWorkerActionLog(
                worker_id=worker.id,
                facility_id=None,
                action_type="PROACTIVE_PURCHASING_SCAN",
                severity="INFO",
                summary=(
                    f"Briefing matutino de compras generado: {len(valid_urgent)} proveedores con déficit "
                    f"(${total_capital:,.2f} USD). {notifications_sent} notificaciones enviadas vía Telegram."
                ),
                details={
                    "total_urgent_suppliers": len(valid_urgent),
                    "total_skus_in_breach": total_skus_in_breach,
                    "total_capital_required": float(total_capital),
                    "notifications_sent": notifications_sent,
                    "target_chats": list(target_chats),
                    "top_suppliers": [s.get("supplier_name") for s in top_candidates]
                },
                recipient_target="Analistas y Supervisores de Compras",
                status="COMPLETED"
            )
            db.add(action_log)
            db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"[CLARA PROACTIVO] Error guardando log de acción: {e}")

    logger.info(f"[CLARA PROACTIVO] Escaneo finalizado. {notifications_sent} alertas enviadas.")
    return {
        "success": True,
        "urgent_suppliers_count": len(valid_urgent),
        "total_capital_required": float(total_capital),
        "notifications_sent": notifications_sent,
        "message_preview": telegram_text
    }
