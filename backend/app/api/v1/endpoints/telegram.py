import re
import json
import logging
import os
import urllib.request
from typing import Optional, Dict, Any, List
from datetime import datetime

from fastapi import APIRouter, Request, Response, Depends, HTTPException, Header, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.core.config import settings
from app.api.deps import get_db, get_current_active_superuser
from app.models.core import User, Facility, Supplier
from app.models.purchasing import PurchaseOrder
from app.models.digital_workers import DigitalWorker, DigitalWorkerConversation, DigitalWorkerMessage, DigitalWorkerActionLog
from app.models.sync_telemetry import StoreSyncTelemetry
from app.agents.whatsapp_agent import (
    execute_stock_lookup,
    execute_negative_stock_lookup,
    execute_unreconciled_orders_lookup,
    execute_returns_lookup,
    diagnose_stockouts
)
from app.services.telegram_client import (
    send_telegram_message,
    set_telegram_webhook,
    get_telegram_webhook_info,
    get_bot_me,
    get_bot_token,
    get_bot_username
)
from app.services.device_pairing_service import (
    pair_telegram_by_pin,
    get_authenticated_user_by_telegram
)
from app.services.dante_it_service import (
    audit_store_sync_heartbeats,
    detect_sales_consecutive_gaps,
    reconcile_daily_sales_totals,
    auto_remediate_sales_lag
)

logger = logging.getLogger(__name__)

router = APIRouter()


class TelegramSimulateRequest(BaseModel):
    chat_id: int
    text: str
    username: Optional[str] = "supervisor_ti"
    first_name: Optional[str] = "Supervisor"
    agent_code: Optional[str] = "DANTE_IT"


class SetWebhookRequest(BaseModel):
    webhook_url: str
    secret_token: Optional[str] = None


def call_worker_gemini(
    user_name: str,
    user_question: str,
    db: Session,
    worker: Optional[DigitalWorker] = None,
    agent_code: str = "DANTE_IT"
) -> str:
    """
    Invoca a Gemini con el rol, personalidad y contexto operativo de cada Usuario Digital (Dante, Clara, Arturo).
    """
    api_key = settings.GEMINI_API_KEY or settings.GOOGLE_API_KEY or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    worker_title = worker.display_title if worker else agent_code
    clean_code = (agent_code or "").upper()

    if not api_key:
        return (
            f"🤖 *{worker_title}*: Recibí tu consulta: \"{user_question}\".\n\n"
            f"Para consultas analíticas avanzadas, configura la clave `GEMINI_API_KEY` en el entorno.\n"
            f"Puedes usar los comandos directos disponibles en `/ayuda`."
        )

    context_data: Dict[str, Any] = {}

    if "CLARA" in clean_code:
        # Contexto de Compras: ODCs pendientes de conciliar, devoluciones, proveedores, quiebres
        try:
            unreconciled = execute_unreconciled_orders_lookup(db)
            returns = execute_returns_lookup(db)
            suppliers = [
                {"id": s.id, "name": s.name, "lead_time_days": getattr(s, "lead_time_days", 7)}
                for s in db.query(Supplier).limit(8).all()
            ]
            stockouts = diagnose_stockouts(db)
            context_data = {
                "ordenes_pendientes_conciliacion": unreconciled[:5],
                "devoluciones_en_muelle": returns[:5],
                "proveedores_activos": suppliers,
                "quiebres_y_sugeridos": stockouts[:5]
            }
        except Exception as e:
            logger.warning(f"Error recopilando contexto para Clara: {e}")

        system_prompt = (
            worker.system_prompt if worker else
            "Eres Clara, Analista Estratégica de Compras y Rentabilidad de Neo ERP. "
            "Supervisas órdenes de compra, conciliación 3-way match, reposición, rotación y rentabilidad con proveedores."
        )

    elif "ARTURO" in clean_code:
        # Contexto de WMS: existencias negativas, devoluciones, almacenes
        try:
            negative = execute_negative_stock_lookup(db)
            returns = execute_returns_lookup(db)
            facilities = [{"id": f.id, "name": f.name, "code": f.code} for f in db.query(Facility).filter(Facility.is_active == True).all()]
            context_data = {
                "existencias_negativas": negative[:8],
                "devoluciones_pendientes": returns[:5],
                "almacenes_activos": facilities
            }
        except Exception as e:
            logger.warning(f"Error recopilando contexto para Arturo: {e}")

        system_prompt = (
            worker.system_prompt if worker else
            "Eres Arturo, Supervisor Autónomo de Almacenes de Neo ERP. "
            "Supervisas la exactitud de inventario, stock físico en almacenes, existencias negativas y recepciones."
        )

    else:
        # Contexto de Dante TI: telemetría de tiendas, latidos, SQL Server, ventas
        try:
            telemetry_data = []
            facilities = db.query(Facility).filter(Facility.is_active == True).all()
            for fac in facilities:
                latest = db.query(StoreSyncTelemetry).filter(
                    StoreSyncTelemetry.facility_id == fac.id
                ).order_by(desc(StoreSyncTelemetry.created_at)).first()
                if latest:
                    telemetry_data.append({
                        "facility": fac.name,
                        "code": fac.code,
                        "last_heartbeat": latest.created_at.strftime("%Y-%m-%d %H:%M:%S") if latest.created_at else "N/A",
                        "sql_server": latest.sql_server_status,
                        "agent_version": latest.agent_version,
                        "sales_today_count": latest.sales_today_count,
                        "sales_today_amount": latest.sales_today_amount,
                        "last_sale_time": latest.last_synced_sale_time.strftime("%Y-%m-%d %H:%M:%S") if latest.last_synced_sale_time else "N/A"
                    })
                else:
                    telemetry_data.append({"facility": fac.name, "code": fac.code, "status": "SIN_CONEXION_PREVIA"})
            context_data = {"telemetria_sucursales": telemetry_data}
        except Exception as e:
            logger.warning(f"Error recopilando contexto para Dante TI: {e}")

        system_prompt = (
            worker.system_prompt if worker else
            "Eres Dante TI, Guardián Autónomo de Sincronización e Infraestructura de Neo ERP. "
            "Tu personalidad es técnica, analítica, concisa, proactiva y ejecutiva. "
            "Supervisas la sincronización de tiendas físicas (Stellar POS hacia Neo ERP), conectividad SQL Server y cuadratura fiscal."
        )

    prompt = (
        f"{system_prompt}\n\n"
        f"Estás respondiendo por Telegram al supervisor {user_name}.\n"
        f"Pregunta del usuario: \"{user_question}\"\n\n"
        f"Contexto operativo en vivo del sistema Neo ERP:\n"
        f"{json.dumps(context_data, ensure_ascii=False, indent=2)}\n\n"
        f"Instrucciones:\n"
        f"- Responde con claridad en español profesional, conciso y cordial.\n"
        f"- Usa formato limpio de Telegram (*negrita*, viñetas •, emojis operativos).\n"
        f"- Basa tu respuesta en los datos provistos y sé preciso con nombres, códigos, montos o cantidades."
    )

    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
        payload = {"contents": [{"parts": [{"text": prompt}]}]}
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception as e:
        logger.error(f"[{clean_code} GEMINI ERROR] Error invocando modelo de IA: {e}")
        return (
            f"🤖 *{worker_title}*: No pude conectar con el motor cognitivo ({str(e)}).\n"
            f"Sin embargo, puedes consultar información directa usando `/ayuda`."
        )


async def process_telegram_message(
    chat_id: int,
    chat_type: str,
    text: str,
    username: Optional[str],
    first_name: str,
    agent_code: str,
    db: Session
) -> str:
    """
    Motor central de comandos y razonamiento para bots de Telegram en Neo ERP.
    """
    raw_text = (text or "").strip()
    clean_agent_code = agent_code.upper()
    worker = db.query(DigitalWorker).filter(DigitalWorker.agent_code == clean_agent_code).first()
    bot_username = get_bot_username(clean_agent_code, db=db)

    # 1. Comando de Vinculación: /start VINCULAR_<PIN> o /vincular <PIN>
    pin_match = (
        re.search(r"^/start\s+VINCULAR_(\d{6})", raw_text, re.IGNORECASE) or
        re.search(r"^/start\s+(\d{6})", raw_text, re.IGNORECASE) or
        re.search(r"(?:/vincular|vincular|link|pin)\s*[:=]?\s*(\d{6})", raw_text, re.IGNORECASE)
    )
    if pin_match:
        pin = pin_match.group(1)
        result = pair_telegram_by_pin(
            chat_id=chat_id,
            pin=pin,
            db=db,
            username=username,
            agent_code=clean_agent_code
        )
        return result["message"]

    # 2. Comando /start (bienvenida y menú de ayuda)
    if raw_text == "/start" or raw_text.startswith("/start@") or raw_text.lower() in ["/help", "/ayuda", "ayuda", "help"]:
        worker_title = worker.display_title if worker else clean_agent_code

        if "CLARA" in clean_agent_code:
            return (
                f"💜 *¡Hola {first_name}! Soy {worker_title}*\n"
                f"*Analista Estratégica de Compras y Rentabilidad* de *Neo ERP*.\n\n"
                f"Superviso órdenes de compra, conciliación 3-way match, abastecimiento y acuerdos comerciales.\n\n"
                f"📌 *Comandos Disponibles:*\n"
                f"• `/odc` o `/ordenes`: Órdenes de compra abiertas y su estado\n"
                f"• `/conciliacion`: ODCs pendientes de conciliar vs recepción física y factura\n"
                f"• `/sugeridos`: Diagnóstico de quiebres de stock y sugeridos de compra\n"
                f"• `/proveedores`: Proveedores registrados y condiciones de despacho\n"
                f"• `/devoluciones`: Devoluciones pendientes en muelle\n"
                f"• `/vincular <PIN>`: Vincular este chat con tu usuario de Neo ERP\n\n"
                f"💬 *Consultas en lenguaje natural:*\n"
                f"Puedes preguntarme por ejemplo:\n"
                f"_• \"¿Qué órdenes de compra están pendientes de conciliar?\"_\n"
                f"_• \"¿Cuáles productos tienen riesgo de quiebre?\"_\n"
                f"_• \"¿Cómo está el abastecimiento de Harina PAN?\"_"
            )
        elif "ARTURO" in clean_agent_code:
            return (
                f"📦 *¡Hola {first_name}! Soy {worker_title}*\n"
                f"*Supervisor Autónomo de Almacenes* de *Neo ERP*.\n\n"
                f"Superviso el inventario físico, recepciones en muelle, existencias negativas y transferencias.\n\n"
                f"📌 *Comandos Disponibles:*\n"
                f"• `/negativos`: Detección de inventario negativo por almacén\n"
                f"• `/devoluciones`: Devoluciones a proveedores pendientes de despacho\n"
                f"• `/stock <producto>`: Consulta de existencia en tiempo real\n"
                f"• `/vincular <PIN>`: Vincular este chat con tu usuario de Neo ERP\n\n"
                f"💬 *Consultas en lenguaje natural:*\n"
                f"Puedes preguntarme por ejemplo:\n"
                f"_• \"¿Hay existencia negativa en Patio Trigal?\"_\n"
                f"_• \"Consultar stock de Azúcar Montalbán\"_\n"
                f"_• \"¿Qué devoluciones tenemos en muelle?\"_"
            )
        else:
            return (
                f"🛡️ *¡Hola {first_name}! Soy {worker_title}*\n"
                f"*Guardián Autónomo de Sincronización e Infraestructura* de *Neo ERP*.\n\n"
                f"Superviso en tiempo real la conectividad de tiendas físicas, latidos de agentes de sincronización y cuadratura fiscal.\n\n"
                f"📌 *Comandos Disponibles:*\n"
                f"• `/estado` o `/tiendas`: Diagnóstico de latidos y conectividad de sucursales\n"
                f"• `/cuadratura`: Conciliación matemática de ventas Stellar vs Neo ERP\n"
                f"• `/correlatividad`: Detección de saltos en numeración fiscal de cajas\n"
                f"• `/remediar`: Auto-remediar desfases de sincronización de ventas\n"
                f"• `/vincular <PIN>`: Vincular este chat con tu usuario de Neo ERP\n\n"
                f"💬 *Consultas en lenguaje natural:*\n"
                f"Puedes hacerme cualquier pregunta técnica directa, por ejemplo:\n"
                f"_• \"¿Cómo están las cajas en Tucacas?\"_\n"
                f"_• \"¿A qué hora fue la última venta de Maracay?\"_\n"
                f"_• \"¿Hay alertas críticas en el sistema?\"_"
            )

    # 3. Verificación de Autenticación
    # En chats privados se requiere vinculación previa.
    # En grupos se permite si el grupo está configurado o si hay un usuario autenticado.
    user = get_authenticated_user_by_telegram(chat_id, db)
    
    if chat_type == "private" and not user:
        # Verificar si el usuario mandó solo un número de 6 dígitos
        if raw_text.isdigit() and len(raw_text) == 6:
            result = pair_telegram_by_pin(
                chat_id=chat_id,
                pin=raw_text,
                db=db,
                username=username,
                agent_code=clean_agent_code
            )
            return result["message"]

        return (
            f"🔒 *Acceso no autenticado*\n\n"
            f"Tu chat de Telegram (`{chat_id}`) no está vinculado a ningún supervisor de *Neo ERP*.\n\n"
            f"Para vincular tu cuenta:\n"
            f"1. Inicia sesión en Neo ERP > *Neo Core* > *Usuarios Digitales*.\n"
            f"2. En la tarjeta de *{worker.display_title if worker else 'Dante TI'}*, haz clic en *Vincular Telegram*.\n"
            f"3. Genera tu PIN de 6 dígitos.\n"
            f"4. Envía por aquí el comando: `/vincular <TU_PIN>`\n"
            f"   (o abre el enlace directo provisto por el sistema)."
        )

    # Registrar mensaje en historial de conversación
    user_name = user.full_name if user else first_name
    if worker:
        conv = db.query(DigitalWorkerConversation).filter(
            DigitalWorkerConversation.worker_id == worker.id,
            DigitalWorkerConversation.channel == "TELEGRAM",
            DigitalWorkerConversation.external_sender_id == str(chat_id)
        ).first()

        if not conv:
            conv = DigitalWorkerConversation(
                worker_id=worker.id,
                channel="TELEGRAM",
                external_sender_id=str(chat_id),
                sender_user_id=user.id if user else None,
                is_authenticated=True if user else False,
                context_data={"username": username, "first_name": first_name}
            )
            db.add(conv)
            db.commit()
            db.refresh(conv)

        # Mensaje entrante
        db.add(DigitalWorkerMessage(
            conversation_id=conv.id,
            sender_type="USER",
            content=raw_text
        ))
        db.commit()

    # 4. Despacho de Comandos Operativos
    lower_text = raw_text.lower().strip()

    # Limpiar mención al bot en grupos (ej: /estado@dante_neo_erp_bot -> /estado)
    if "@" in lower_text:
        lower_text = re.sub(r"@[a-zA-Z0-9_]+", "", lower_text).strip()

    # === COMANDOS DE CLARA (COMPRAS) ===
    if "CLARA" in clean_agent_code:
        if lower_text in ["/odc", "/ordenes", "odc", "ordenes", "ordenes de compra"]:
            orders = db.query(PurchaseOrder).order_by(PurchaseOrder.id.desc()).limit(8).all()
            if not orders:
                return "📋 *Órdenes de Compra*: No se encontraron órdenes registradas en el sistema."
            lines = ["📋 *Órdenes de Compra Recientes:*\n"]
            for o in orders:
                s_name = "Proveedor"
                if o.supplier:
                    s_name = o.supplier.name
                lines.append(f"• *{o.reference or f'ODC-{o.id}'}* | {s_name} | Total: ${float(o.total_amount or 0):,.2f} | Estado: `{o.status}`")
            return "\n".join(lines)

        if lower_text in ["/conciliacion", "/conciliar", "conciliacion", "conciliar"]:
            unrec = execute_unreconciled_orders_lookup(db)
            if not unrec:
                return "🎯 *Conciliación 3-Way*: Todas las órdenes de compra recibidas están 100% conciliadas con sus facturas."
            lines = ["⚠️ *Órdenes Pendientes de Conciliar (3-Way Match):*\n"]
            for u in unrec:
                lines.append(f"• *{u['order_number']}* ({u['supplier']}) | Monto: ${u['total_usd']:,.2f} | Estado: `{u['status']}`")
            return "\n".join(lines)

        if lower_text in ["/sugeridos", "/quiebres", "sugeridos", "quiebres"]:
            so = diagnose_stockouts(db)
            if not so:
                return "✅ *Abastecimiento*: No se detectaron productos en quiebre crítico de stock en este momento."
            lines = ["🚨 *Quiebres y Sugeridos de Compra:* \n"]
            for item in so[:8]:
                lines.append(f"• *{item['product_name']}* (`{item['sku']}`): Stock={item['stock_qty']} | Sugerido: *+{item['suggested_reorder_qty']}* unid.")
            return "\n".join(lines)

        if lower_text in ["/proveedores", "proveedores"]:
            sups = db.query(Supplier).filter(Supplier.is_active == True).limit(10).all()
            if not sups:
                return "🏢 *Proveedores*: No hay proveedores activos registrados."
            lines = ["🏢 *Catálogo de Proveedores Principales:*\n"]
            for s in sups:
                lead = getattr(s, "lead_time_days", 7) or 7
                lines.append(f"• *{s.name}* (`{s.code or s.tax_id or 'N/A'}`) | Lead time: {lead} días")
            return "\n".join(lines)

        if lower_text in ["/devoluciones", "devoluciones"]:
            rets = execute_returns_lookup(db)
            if not rets:
                return "📦 *Devoluciones*: No hay devoluciones a proveedores pendientes en muelle."
            lines = ["📦 *Devoluciones Pendientes a Proveedores:*\n"]
            for r in rets:
                lines.append(f"• *{r['return_number']}* | Estado: `{r['status']}` | Motivo: {r['reason']}")
            return "\n".join(lines)

    # === COMANDOS DE ARTURO (ALMACÉN) ===
    if "ARTURO" in clean_agent_code:
        if lower_text in ["/negativos", "negativos", "existencia negativa"]:
            negs = execute_negative_stock_lookup(db)
            if not negs:
                return "✅ *Inventario*: No hay existencias negativas en ninguno de los almacenes."
            lines = ["⚠️ *Existencias Negativas Detectadas en Almacén:*\n"]
            for n in negs[:10]:
                lines.append(f"• *{n['facility']}*: {n['product']} (`{n['sku']}`) -> *{n['quantity_negative']}*")
            return "\n".join(lines)

        if lower_text in ["/devoluciones", "devoluciones"]:
            rets = execute_returns_lookup(db)
            if not rets:
                return "📦 *Devoluciones*: No hay devoluciones pendientes en muelle."
            lines = ["📦 *Devoluciones en Muelle:*\n"]
            for r in rets:
                lines.append(f"• *{r['return_number']}* | Estado: `{r['status']}` | Motivo: {r['reason']}")
            return "\n".join(lines)

        if lower_text.startswith("/stock") or lower_text.startswith("stock"):
            query_item = re.sub(r"^/stock\s*|^stock\s*", "", raw_text, flags=re.IGNORECASE).strip()
            if not query_item:
                return "🔍 Por favor indica qué producto buscar. Ejemplo: `/stock Harina PAN`"
            results = execute_stock_lookup(query_item, db)
            if not results:
                return f"🔍 No se encontraron productos que coincidan con '{query_item}'."
            lines = [f"📦 *Existencias para '{query_item}':*\n"]
            for item in results:
                lines.append(f"• *{item['product_name']}* (`{item['sku']}`):")
                for s in item["stock_by_facility"]:
                    lines.append(f"   - {s['facility']}: *{s['on_hand']}* unid.")
            return "\n".join(lines)

    # === COMANDOS DE DANTE (TI & INFRAESTRUCTURA) ===
    # COMANDO: /estado o /tiendas
    if lower_text in ["/estado", "/tiendas", "estado", "tiendas", "status"] or (
        any(w in lower_text for w in ["latido", "latidos", "conectividad"]) and
        any(w in lower_text for w in ["tienda", "tiendas", "sucursal", "sucursales", "como estan", "cómo están"])
    ):
        facilities = db.query(Facility).filter(Facility.is_active == True).all()
        now = datetime.utcnow()
        lines = ["📡 *Diagnóstico de Conectividad y Latidos (Neo WMS / POS):*\n"]

        for fac in facilities:
            latest = db.query(StoreSyncTelemetry).filter(
                StoreSyncTelemetry.facility_id == fac.id
            ).order_by(desc(StoreSyncTelemetry.created_at)).first()

            if not latest or not latest.created_at:
                lines.append(f"⚠️ *{fac.name}* (`{fac.code}`): Sin historial de conexión.")
                continue

            ref_now = datetime.now(latest.created_at.tzinfo) if latest.created_at.tzinfo else now
            diff_min = int((ref_now - latest.created_at).total_seconds() / 60.0)

            if diff_min <= 15:
                status_icon = "🟢"
                status_desc = f"En línea ({diff_min} min)"
            elif diff_min <= 60:
                status_icon = "🟡"
                status_desc = f"Retraso ({diff_min} min)"
            else:
                status_icon = "🔴"
                hours = diff_min // 60
                status_desc = f"DESCONECTADA hace {hours}h {diff_min % 60}m"

            sql_desc = "SQL Server: Conectado" if latest.sql_server_status == "CONNECTED" else f"SQL Server: {latest.sql_server_status}"
            v_agent = f"v{latest.agent_version}" if latest.agent_version else ""
            lines.append(f"{status_icon} *{fac.name}*: {status_desc} | {sql_desc} {v_agent}")

        lines.append(f"\n_Auditado en vivo por Dante TI a las {datetime.now().strftime('%H:%M:%S')}._")
        return "\n".join(lines)

    # COMANDO: /cuadratura
    if lower_text in ["/cuadratura", "cuadratura", "conciliacion", "/conciliacion"] or (
        any(w in lower_text for w in ["cuadrar", "cuadratura", "conciliar", "conciliacion"]) and
        any(w in lower_text for w in ["ventas", "facturas", "stellar", "hoy"])
    ):
        reconciliations = reconcile_daily_sales_totals(db, worker=worker)
        if not reconciliations:
            return "🎯 *Cuadratura de Ventas*: No hay telemetría de ventas reportada para hoy en las tiendas activas."

        lines = ["📊 *Conciliación Diaria de Ventas (Stellar POS vs Neo ERP):*\n"]
        for r in reconciliations:
            fac_name = r["facility_name"]
            st_count = r["stellar_count"]
            st_total = r["stellar_total"]
            ne_count = r["neo_count"]
            ne_total = r["neo_total"]
            diff_cnt = r["difference_count"]
            diff_amt = r["difference_amount"]

            if r["status"] == "BALANCED":
                lines.append(
                    f"🎯 *{fac_name}* (Fecha: {r['target_date']}):\n"
                    f"   • Ventas: *{ne_count} facturas* (${ne_total:,.2f})\n"
                    f"   • Discrepancia: *$0.00* (100% Cuadrado)\n"
                )
            else:
                lines.append(
                    f"⚠️ *{fac_name}* (Fecha: {r['target_date']}):\n"
                    f"   • Stellar: {st_count} tickets (${st_total:,.2f})\n"
                    f"   • Neo ERP: {ne_count} tickets (${ne_total:,.2f})\n"
                    f"   • Desfase: *{diff_cnt} tickets* (${diff_amt:,.2f})\n"
                )

        return "\n".join(lines)

    # COMANDO: /correlatividad
    if lower_text in ["/correlatividad", "correlatividad", "saltos"] or "correlatividad" in lower_text or "tickets saltados" in lower_text:
        gap_results = detect_sales_consecutive_gaps(db, worker=worker)
        lines = ["🧾 *Auditoría de Correlatividad Fiscal de Tickets:*\n"]
        total_gaps_found = 0

        for res in gap_results:
            fac_name = res["facility"]
            if res["status"] == "INTEGRAL":
                lines.append(f"✅ *{fac_name}*: Secuencia correlativa perfecta. Sin saltos de numeración.")
            else:
                gaps = res.get("gaps", [])
                total_gaps_found += len(gaps)
                lines.append(f"⚠️ *{fac_name}*: {len(gaps)} brecha(s) detectadas:")
                for g in gaps:
                    lines.append(f"   • Caja `{g['register']}`: Faltan tickets {g['missing_range']} ({g['missing_count']} tickets)")

        if total_gaps_found == 0:
            lines.append("\n🎯 *Todas las cajas auditadas presentan correlatividad fiscal íntegra.*")

        return "\n".join(lines)

    # COMANDO: /remediar
    if lower_text in ["/remediar", "remediar", "/sync", "forzar sincronizacion", "forzar sync"]:
        actions = auto_remediate_sales_lag(db, worker=worker)
        if not actions:
            return (
                f"✅ *Diagnóstico de Auto-Remediación:*\n\n"
                f"No se detectaron tiendas en línea con retrasos desatendidos.\n"
                f"Todos los agentes locales están al día o ya tienen órdenes de sincronización activas en cola."
            )

        lines = ["⚡ *Órdenes de Auto-Remediación Despachadas:* \n"]
        for a in actions:
            lines.append(f"• *{a['facility']}*: Despachada orden `{a['command_type']}` (Desfase: {a['lag_hours']:.1f}h)")

        lines.append("\n_Las órdenes serán procesadas automáticamente por NeoAgentSync en el próximo ciclo de sondeo._")
        return "\n".join(lines)

    # 5. Consulta en Lenguaje Natural con Inteligencia Artificial (Gemini)
    ai_reply = call_worker_gemini(
        user_name=user_name,
        user_question=raw_text,
        db=db,
        worker=worker,
        agent_code=clean_agent_code
    )

    # Registrar mensaje saliente
    if worker and conv:
        db.add(DigitalWorkerMessage(
            conversation_id=conv.id,
            sender_type="WORKER",
            content=ai_reply
        ))
        db.commit()

    return ai_reply


@router.post("/dante/webhook")
async def dante_telegram_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """
    Webhook oficial para Dante TI (recibe actualizaciones de Telegram).
    """
    # Verificar secreto de webhook si fue configurado
    expected_secret = settings.TELEGRAM_DANTE_WEBHOOK_SECRET
    if expected_secret and x_telegram_bot_api_secret_token != expected_secret:
        logger.warning("[TELEGRAM SECURITY] Secreto de Webhook inválido o ausente.")
        raise HTTPException(status_code=403, detail="Secreto de webhook no coincide")

    try:
        data = await request.json()
    except Exception:
        return {"status": "ignored"}

    # Extraer mensaje del payload de Telegram
    message = data.get("message") or data.get("edited_message") or data.get("channel_post")
    if not message:
        return {"status": "ignored"}

    chat = message.get("chat", {})
    chat_id = chat.get("id")
    chat_type = chat.get("type", "private")
    from_user = message.get("from", {})
    username = from_user.get("username")
    first_name = from_user.get("first_name", "Usuario")
    text = message.get("text", "")

    if not chat_id or not text:
        return {"status": "ignored"}

    try:
        reply = await process_telegram_message(
            chat_id=chat_id,
            chat_type=chat_type,
            text=text,
            username=username,
            first_name=first_name,
            agent_code="DANTE_IT",
            db=db
        )

        # Despachar respuesta de vuelta al usuario / grupo
        await send_telegram_message(
            chat_id=chat_id,
            text=reply,
            agent_code="DANTE_IT"
        )
    except Exception as err:
        logger.error(f"[TELEGRAM DANTE ERROR] Error procesando mensaje de {chat_id}: {err}", exc_info=True)

    # Retornar siempre 200 OK a Telegram para no bloquear la cola de updates
    return {"status": "ok"}


@router.post("/{agent_code}/webhook")
async def generic_telegram_webhook(
    agent_code: str,
    request: Request,
    x_telegram_bot_api_secret_token: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """
    Webhook multicanal extensible para cualquier Trabajador Digital de Neo ERP.
    """
    clean_code = agent_code.upper()
    try:
        data = await request.json()
    except Exception:
        return {"status": "ignored"}

    message = data.get("message") or data.get("channel_post")
    if not message:
        return {"status": "ignored"}

    chat = message.get("chat", {})
    chat_id = chat.get("id")
    chat_type = chat.get("type", "private")
    from_user = message.get("from", {})
    username = from_user.get("username")
    first_name = from_user.get("first_name", "Usuario")
    text = message.get("text", "")

    if not chat_id or not text:
        return {"status": "ignored"}

    try:
        reply = await process_telegram_message(
            chat_id=chat_id,
            chat_type=chat_type,
            text=text,
            username=username,
            first_name=first_name,
            agent_code=clean_code,
            db=db
        )

        await send_telegram_message(
            chat_id=chat_id,
            text=reply,
            agent_code=clean_code
        )
    except Exception as err:
        logger.error(f"[TELEGRAM ERROR {clean_code}] {err}", exc_info=True)

    return {"status": "ok"}


@router.post("/simulate")
async def simulate_telegram_message(
    payload: TelegramSimulateRequest,
    db: Session = Depends(get_db)
):
    """
    Permite simular mensajes entrantes de Telegram directamente desde Swagger o pruebas unitarias
    sin requerir conexión a los servidores de Telegram.
    """
    reply = await process_telegram_message(
        chat_id=payload.chat_id,
        chat_type="private",
        text=payload.text,
        username=payload.username,
        first_name=payload.first_name or "Supervisor",
        agent_code=payload.agent_code or "DANTE_IT",
        db=db
    )
    return {
        "success": True,
        "input": payload.text,
        "reply": reply,
        "bot_username": get_bot_username(payload.agent_code or "DANTE_IT", db=db)
    }


@router.get("/{agent_code}/webhook-info")
async def read_webhook_info(
    agent_code: str,
    current_user: User = Depends(get_current_active_superuser)
):
    """
    Consulta en tiempo real la configuración del webhook directamente en Telegram API.
    """
    return await get_telegram_webhook_info(agent_code=agent_code.upper())


@router.post("/{agent_code}/set-webhook")
async def update_webhook_url(
    agent_code: str,
    payload: SetWebhookRequest,
    current_user: User = Depends(get_current_active_superuser)
):
    """
    Registra una nueva URL de Webhook en Telegram API.
    """
    result = await set_telegram_webhook(
        webhook_url=payload.webhook_url,
        secret_token=payload.secret_token,
        agent_code=agent_code.upper()
    )
    return result


@router.get("/{agent_code}/bot-info")
async def read_bot_identity(
    agent_code: str,
    current_user: User = Depends(get_current_active_superuser)
):
    """
    Verifica las credenciales y devuelve la información del bot en Telegram.
    """
    return await get_bot_me(agent_code=agent_code.upper())
