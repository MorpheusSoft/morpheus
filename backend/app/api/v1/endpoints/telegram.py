import re
import json
import logging
import os
import time
import urllib.request
from typing import Optional, Dict, Any, List
from datetime import datetime

from fastapi import APIRouter, Request, Response, Depends, HTTPException, Header, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from app.core.config import settings
from app.api.deps import get_db, get_current_active_superuser
from app.models.core import User, Facility, Supplier
from app.models.purchasing import PurchaseOrder
from app.models.sales import Document
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
    send_telegram_document_sync,
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
from app.services.valeria_pricing_service import (
    audit_critical_margins,
    audit_recent_cost_spikes,
    audit_pending_pricing_sessions,
    audit_cross_store_price_discrepancies,
    lookup_product_price_and_cost
)
from app.services.clara_purchases_service import (
    lookup_purchasing_product_360,
    format_product_360_telegram,
    parse_order_intent,
    create_supplier_po_from_chat
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
        try:
            prod_lookup = lookup_purchasing_product_360(user_question, db, limit=3)
            if prod_lookup:
                formatted_list = [format_product_360_telegram(p) for p in prod_lookup]
                header = f"🤖 *{worker_title}*: Aquí tienes la información de inventario en vivo de Neo ERP:\n\n"
                return header + "\n\n---\n\n".join(formatted_list)
        except Exception:
            pass

        return (
            f"🤖 *{worker_title}*: Recibí tu consulta: \"{user_question}\".\n\n"
            f"Para consultas analíticas avanzadas, configura la clave `GEMINI_API_KEY` en el entorno.\n"
            f"Puedes usar los comandos directos disponibles en `/ayuda`."
        )

    context_data: Dict[str, Any] = {}

    if "CLARA" in clean_code:
        # Contexto de Compras: ODCs pendientes de conciliar, devoluciones, proveedores, quiebres
        # 1. Búsqueda de producto en vivo si la pregunta menciona uno (prioridad máxima)
        try:
            prod_lookup = lookup_purchasing_product_360(user_question, db, limit=3)
            if prod_lookup:
                context_data["productos_consultados_en_vivo"] = prod_lookup
        except Exception as e:
            logger.warning(f"Error en lookup_purchasing_product_360 para Clara: {e}")
            try:
                db.rollback()
            except Exception:
                pass

        # Si el usuario preguntó por un producto específico, enfocar el contexto en ese producto para no saturar tokens (429)
        if "productos_consultados_en_vivo" not in context_data:
            try:
                context_data["ordenes_pendientes_conciliacion"] = execute_unreconciled_orders_lookup(db)[:5]
            except Exception as e:
                logger.warning(f"Error en unreconciled para Clara: {e}")
                try:
                    db.rollback()
                except Exception:
                    pass

            try:
                context_data["devoluciones_en_muelle"] = execute_returns_lookup(db)[:5]
            except Exception as e:
                logger.warning(f"Error en returns para Clara: {e}")
                try:
                    db.rollback()
                except Exception:
                    pass

            try:
                context_data["proveedores_activos"] = [
                    {"id": s.id, "name": s.name, "lead_time_days": getattr(s, "lead_time_days", 7)}
                    for s in db.query(Supplier).limit(8).all()
                ]
            except Exception as e:
                logger.warning(f"Error en suppliers para Clara: {e}")
                try:
                    db.rollback()
                except Exception:
                    pass

            try:
                diag = diagnose_stockouts(db)
                raw_supps = diag.get("suppliers", []) if isinstance(diag, dict) else (diag if isinstance(diag, list) else [])
                # Extraer únicamente resumen ejecutivo ligero para evitar agotar cuotas de tokens (429)
                light_stockouts = [
                    {
                        "proveedor": s.get("supplier_name", f"Proveedor {s.get('supplier_id')}"),
                        "urgencia": s.get("urgency"),
                        "skus_criticos": s.get("critical_skus_count", 0),
                        "skus_alerta": s.get("warning_skus_count", 0),
                        "costo_estimado": s.get("estimated_total_cost", 0.0)
                    }
                    for s in raw_supps[:5]
                ]
                context_data["quiebres_y_sugeridos_resumen"] = light_stockouts
            except Exception as e:
                logger.warning(f"Error en stockouts para Clara: {e}")
                try:
                    db.rollback()
                except Exception:
                    pass

        system_prompt = (
            worker.system_prompt if worker else
            "Eres Clara, Analista Estratégica de Compras y Rentabilidad de Neo ERP. "
            "Supervisas órdenes de compra, abastecimiento, inventario, quiebres de stock, rotación de productos, costos y relaciones con proveedores."
        )
        system_prompt += (
            "\nTienes acceso a la ficha 360° de productos (costos de reposición, promedio, estándar, PVP, margen %, "
            "stock por tienda, rotación diaria en unidades y días de cobertura/runway). "
            "Si el usuario pregunta por productos sin venta, rotación o dead stock, indícale que en el sistema web está disponible "
            "en el menú 'Reportes -> Rotación & Dead Stock' de Neo Compras, y que puedes generarle y enviarle el informe ejecutivo en PDF directamente con el comando /dead_stock. "
            "NUNCA inventes nombres de menús o reportes inexistentes. "
            "Si el usuario te solicita crear una orden de compra o consultar sugeridos, indícale claramente cómo generarla "
            "o confírmale los datos con precisión ejecutiva."
        )

    elif "ARTURO" in clean_code:
        # Contexto de WMS: existencias negativas, devoluciones, almacenes
        # 1. Búsqueda de producto en vivo si la pregunta menciona uno
        try:
            prod_lookup = lookup_purchasing_product_360(user_question, db, limit=3)
            if prod_lookup:
                context_data["productos_consultados_en_vivo"] = prod_lookup
        except Exception as e:
            logger.warning(f"Error en lookup producto para Arturo: {e}")
            try:
                db.rollback()
            except Exception:
                pass

        if "productos_consultados_en_vivo" not in context_data:
            try:
                context_data["existencias_negativas"] = execute_negative_stock_lookup(db)[:8]
            except Exception as e:
                logger.warning(f"Error en existencias negativas para Arturo: {e}")
                try:
                    db.rollback()
                except Exception:
                    pass

            try:
                context_data["devoluciones_pendientes"] = execute_returns_lookup(db)[:5]
            except Exception as e:
                logger.warning(f"Error en devoluciones para Arturo: {e}")
                try:
                    db.rollback()
                except Exception:
                    pass

            try:
                context_data["almacenes_activos"] = [
                    {"id": f.id, "name": f.name, "code": f.code}
                    for f in db.query(Facility).filter(Facility.is_active == True).all()
                ]
            except Exception as e:
                logger.warning(f"Error en almacenes para Arturo: {e}")
                try:
                    db.rollback()
                except Exception:
                    pass

        system_prompt = (
            worker.system_prompt if worker else
            "Eres Arturo, Supervisor Autónomo de Almacenes de Neo ERP. "
            "Supervisas la exactitud de inventario, stock físico en almacenes, existencias negativas y recepciones."
        )
        system_prompt += (
            "\nTienes acceso a la consulta en vivo de existencias de productos por almacén y sede física. "
            "Si el usuario te consulta por existencias o ubicación de un producto, reporta el stock por sucursal "
            "con precisión ejecutiva."
        )

    elif "VALERIA" in clean_code or "PRICING" in clean_code:
        # Contexto de Valeria: márgenes críticos, sesiones pendientes, alzas de costo y PVP
        # 1. Búsqueda de producto en vivo si la pregunta menciona uno
        try:
            prod_lookup = lookup_product_price_and_cost(user_question, db)
            if prod_lookup:
                context_data["productos_consultados_en_vivo"] = prod_lookup
        except Exception as e:
            logger.warning(f"Error en lookup_product_price_and_cost para Valeria: {e}")
            try:
                db.rollback()
            except Exception:
                pass

        if "productos_consultados_en_vivo" not in context_data:
            try:
                crit_margins = audit_critical_margins(db, min_margin_pct=15.0, limit=8)
                cost_spikes = audit_recent_cost_spikes(db, limit=6)
                pending_sess = audit_pending_pricing_sessions(db, limit=5)
                cross_prices = audit_cross_store_price_discrepancies(db, limit=5)
                context_data.update({
                    "productos_margen_critico_o_perdida": crit_margins,
                    "alzas_recientes_costos_proveedores": cost_spikes,
                    "sesiones_fijacion_precios_pendientes": pending_sess,
                    "discrepancias_precios_sucursales": cross_prices
                })
            except Exception as e:
                logger.warning(f"Error recopilando contexto analítico para Valeria Pricing: {e}")
                try:
                    db.rollback()
                except Exception:
                    pass

        system_prompt = (
            worker.system_prompt if worker else
            "Eres Valeria, Estratega Autónoma de Precios, Costos y Rentabilidad Comercial de Neo ERP. "
            "Tu personalidad es analítica, ágil, orientada al margen y a la protección del flujo financiero. "
            "Supervisas márgenes mínimos, alzas de costo de proveedores, sesiones de fijación de precios y habladores de anaquel."
        )

    else:
        # Contexto de Dante TI: telemetría de tiendas, latidos, SQL Server, ventas e histórico de facturación
        try:
            # 1. Auditoría histórica de facturas sincronizadas por sucursal
            doc_stats = db.query(
                Document.facility_id,
                func.min(Document.created_at).label("min_date"),
                func.max(Document.created_at).label("max_date"),
                func.count(Document.id).label("total_docs"),
                func.count(func.distinct(Document.register_code)).label("total_registers")
            ).group_by(Document.facility_id).all()

            fac_historical_map = {}
            for s in doc_stats:
                first_doc = db.query(
                    Document.document_number,
                    Document.total_amount,
                    Document.register_code
                ).filter(
                    Document.facility_id == s.facility_id,
                    Document.created_at == s.min_date
                ).first()

                fac_historical_map[s.facility_id] = {
                    "total_documentos_historicos": s.total_docs,
                    "primera_factura_fecha": s.min_date.strftime("%Y-%m-%d %H:%M:%S") if s.min_date else "N/A",
                    "primera_factura_numero": first_doc.document_number if first_doc else "N/A",
                    "primera_factura_monto": float(first_doc.total_amount or 0) if first_doc else 0,
                    "primera_factura_caja": first_doc.register_code if first_doc else "N/A",
                    "ultima_factura_fecha": s.max_date.strftime("%Y-%m-%d %H:%M:%S") if s.max_date else "N/A",
                    "total_cajas_activas": s.total_registers
                }

            telemetry_data = []
            facilities = db.query(Facility).filter(Facility.is_active == True).all()
            for fac in facilities:
                hist = fac_historical_map.get(fac.id)
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
                        "sales_today_amount": float(latest.sales_today_amount or 0),
                        "last_sale_time": latest.last_synced_sale_time.strftime("%Y-%m-%d %H:%M:%S") if latest.last_synced_sale_time else "N/A",
                        "pending_queue_count": latest.pending_queue_count,
                        "lag_minutes": latest.lag_minutes,
                        "status": latest.status,
                        "historico_sincronizacion": hist if hist else "Sin facturas sincronizadas registradas aún"
                    })
                else:
                    telemetry_data.append({
                        "facility": fac.name,
                        "code": fac.code,
                        "status": "SIN_CONEXION_PREVIA",
                        "historico_sincronizacion": hist if hist else "Sin facturas sincronizadas registradas aún"
                    })
            context_data = {"telemetria_y_sincronizacion_sucursales": telemetry_data}

            # Búsqueda puntual si el usuario preguntó por un número de documento específico
            doc_matches = re.findall(r'\b\d{5,12}\b', user_question)
            if doc_matches:
                found_docs = []
                for d_num in doc_matches[:3]:
                    d_row = db.query(Document).filter(Document.document_number == d_num).first()
                    if d_row:
                        fac_row = db.query(Facility).filter(Facility.id == d_row.facility_id).first()
                        found_docs.append({
                            "numero": d_row.document_number,
                            "tipo": str(d_row.type.value if hasattr(d_row.type, 'value') else d_row.type),
                            "fecha": d_row.created_at.strftime("%Y-%m-%d %H:%M:%S") if d_row.created_at else "N/A",
                            "monto": float(d_row.total_amount or 0),
                            "caja": d_row.register_code,
                            "sucursal": fac_row.name if fac_row else f"ID {d_row.facility_id}"
                        })
                if found_docs:
                    context_data["documentos_encontrados_por_numero"] = found_docs
        except Exception as e:
            logger.warning(f"Error recopilando contexto para Dante TI: {e}")

        system_prompt = (
            worker.system_prompt if worker else
            "Eres Dante TI, Guardián Autónomo de Sincronización e Infraestructura de Neo ERP. "
            "Tu personalidad es técnica, analítica, concisa, proactiva y ejecutiva. "
            "Supervisas la sincronización de tiendas físicas (Stellar POS hacia Neo ERP), conectividad SQL Server y cuadratura fiscal."
        )
        system_prompt += (
            "\nTienes acceso completo tanto a la telemetría en tiempo real como a la auditoría histórica de sincronización "
            "de facturas de cada tienda (fecha de inicio/primera factura sincronizada con número y caja emisora, última factura, "
            "volumen total de documentos y cajas registradoras detectadas). Usa estos datos para responder con total precisión "
            "a preguntas sobre fechas, facturas históricas, estados y sincronización."
        )

    try:
        context_json_str = json.dumps(context_data, ensure_ascii=False, indent=2, default=str)
        prompt = (
            f"{system_prompt}\n\n"
            f"Estás respondiendo por Telegram al supervisor {user_name}.\n"
            f"Pregunta del usuario: \"{user_question}\"\n\n"
            f"Contexto operativo en vivo del sistema Neo ERP:\n"
            f"{context_json_str}\n\n"
            f"Instrucciones:\n"
            f"- Responde con claridad en español profesional, conciso y cordial.\n"
            f"- Usa formato limpio de Telegram (*negrita*, viñetas •, emojis operativos).\n"
            f"- Basa tu respuesta en los datos provistos y sé preciso con nombres, códigos, montos o cantidades."
        )

        models_to_try = ["gemini-2.5-flash", "gemini-flash-latest"]
        last_error = None

        for idx, model in enumerate(models_to_try):
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            payload = {"contents": [{"parts": [{"text": prompt}]}]}
            req = urllib.request.Request(
                url,
                data=json.dumps(payload, default=str).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            try:
                with urllib.request.urlopen(req, timeout=12) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    return data["candidates"][0]["content"]["parts"][0]["text"].strip()
            except urllib.error.HTTPError as he:
                last_error = he
                logger.warning(f"[{clean_code}] Error HTTP {he.code} con modelo {model}: {he.reason}")
                if he.code == 429 and idx < len(models_to_try) - 1:
                    time.sleep(1.0)
                    continue
                break
            except Exception as ex:
                last_error = ex
                logger.warning(f"[{clean_code}] Excepción con modelo {model}: {ex}")
                if idx < len(models_to_try) - 1:
                    continue
                break

        if last_error:
            raise last_error
    except Exception as e:
        logger.error(f"[{clean_code} GEMINI ERROR] Error invocando modelo de IA: {e}", exc_info=True)

        # Respaldo de alta disponibilidad: Si teníamos datos de productos consultados en vivo, mostrárselos al usuario directamente
        if "productos_consultados_en_vivo" in context_data and context_data["productos_consultados_en_vivo"]:
            prods = context_data["productos_consultados_en_vivo"]
            formatted_list = [format_product_360_telegram(p) for p in prods]
            header = f"🤖 *{worker_title}*: Aquí tienes la información de inventario en vivo de Neo ERP:\n\n"
            return header + "\n\n---\n\n".join(formatted_list)

        return (
            f"🤖 *{worker_title}*: No pude conectar con el motor cognitivo ({str(e)}).\n"
            f"Sin embargo, puedes consultar información directa usando `/ayuda` o comandos rápidos como `/producto <nombre>`."
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
                f"• `/dead_stock` [días]: Auditoría de productos sin venta, capital atrapado y despacho de reporte PDF\n"
                f"• `/producto <nombre o sku>`: Ficha 360° de compra (costos, stock por tienda, rotación y proveedor)\n"
                f"• `/crear_odc <proveedor>`: Generar ODC borrador sugerida (MRP) o con ítems específicos\n"
                f"• `/odc` o `/ordenes`: Órdenes de compra recientes y su estado\n"
                f"• `/conciliacion`: ODCs pendientes de conciliar vs recepción física y factura\n"
                f"• `/sugeridos`: Diagnóstico de quiebres de stock y sugeridos de compra\n"
                f"• `/proveedores`: Proveedores registrados y condiciones de despacho\n"
                f"• `/devoluciones`: Devoluciones pendientes en muelle\n"
                f"• `/vincular <PIN>`: Vincular este chat con tu usuario de Neo ERP\n\n"
                f"💬 *Consultas en lenguaje natural:*\n"
                f"Puedes preguntarme por ejemplo:\n"
                f"_• \"Clara cuál es la existencia de los productos con 0 ventas en 30 días\"_\n"
                f"_• \"Envíame el reporte de rotación y dead stock en PDF\"_\n"
                f"_• \"Ficha de compra de Harina PAN\"_\n"
                f"_• \"Clara, genera una orden de compra para Alimentos Polar\"_\n"
                f"_• \"Crea orden para Alimentos Polar con 50 Harina Pan y 20 Primor\"_\n"
                f"_• \"¿Cuáles productos tienen riesgo de quiebre?\"_"
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
        elif "VALERIA" in clean_agent_code or "PRICING" in clean_agent_code:
            return (
                f"💎 *¡Hola {first_name}! Soy {worker_title}*\n"
                f"*Estratega Autónoma de Precios, Costos y Rentabilidad* de *Neo ERP*.\n\n"
                f"Superviso en tiempo real la protección de márgenes comerciales, alzas de costos de proveedores, sesiones de fijación de precios y consistencia en anaquel.\n\n"
                f"📌 *Comandos Disponibles:*\n"
                f"• `/margen_critico`: Alerta de productos vendiéndose a pérdida o con margen < 15%\n"
                f"• `/sesiones`: Sesiones de fijación de precios en borrador pendientes por aplicar\n"
                f"• `/aumentos`: Productos con alzas recientes de costo y cálculo de caída de margen\n"
                f"• `/discrepancias`: Detección de precios desalineados entre tiendas físicas\n"
                f"• `/precio <producto>`: Consulta inmediata de costo reposición, PVP y margen\n"
                f"• `/vincular <PIN>`: Vincular este chat con tu usuario de Neo ERP\n\n"
                f"💬 *Consultas en lenguaje natural:*\n"
                f"Puedes preguntarme directamente:\n"
                f"_• \"¿Qué productos están en venta a pérdida hoy?\"_\n"
                f"_• \"¿A cómo tenemos el costo y PVP del Arroz Mary?\"_\n"
                f"_• \"¿Hay sesiones de precios pendientes por publicar?\"_"
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
                f"• `/historial`: Auditoría histórica de facturas sincronizadas y cajas por tienda\n"
                f"• `/remediar`: Auto-remediar desfases de sincronización de ventas\n"
                f"• `/vincular <PIN>`: Vincular este chat con tu usuario de Neo ERP\n\n"
                f"💬 *Consultas en lenguaje natural:*\n"
                f"Puedes hacerme cualquier pregunta técnica directa, por ejemplo:\n"
                f"_• \"¿Cuál es la primera fecha de factura que tenemos en Belisa?\"_\n"
                f"_• \"¿Cómo están las cajas en Tucacas?\"_\n"
                f"_• \"¿A qué hora fue la última venta de Maracay?\"_\n"
                f"_• \"¿Hay alertas críticas en el sistema?\"_"
            )

    # 3. Verificación de Autenticación
    # En chats privados se requiere vinculación previa.
    # En grupos se permite si el grupo está configurado o si hay un usuario autenticado.
    user = get_authenticated_user_by_telegram(chat_id, db)

    # 3.1. Chequeo de seguridad: Si el usuario vinculado fue desactivado en Neo ERP
    if not user:
        # Verificar si este chat_id o conversación pertenecía a un usuario que ahora está INACTIVO
        deactivated_user = db.query(User).filter(
            User.telegram_chat_id == chat_id,
            User.is_active == False
        ).first()
        if not deactivated_user:
            deactivated_conv = db.query(DigitalWorkerConversation).filter(
                DigitalWorkerConversation.channel == "TELEGRAM",
                DigitalWorkerConversation.external_sender_id == str(chat_id),
                DigitalWorkerConversation.sender_user_id.isnot(None)
            ).first()
            if deactivated_conv and deactivated_conv.sender_user_id:
                deactivated_user = db.query(User).filter(
                    User.id == deactivated_conv.sender_user_id,
                    User.is_active == False
                ).first()

        if deactivated_user:
            return (
                f"⛔ *Acceso Revocado*\n\n"
                f"Hola *{deactivated_user.full_name}*, tu cuenta de usuario en *Neo ERP* se encuentra actualmente desactivada o suspendida.\n\n"
                f"Por políticas de seguridad corporativa, tu acceso a los asistentes digitales ha sido cancelado de inmediato. Si consideras que se trata de un error, por favor contacta al administrador del sistema."
            )

    # 3.2. Auto-vinculación transparente si el Administrador ya registró el @username en Neo Core > Usuarios
    if chat_type == "private" and not user and username:
        clean_uname = username.lstrip("@").strip().lower()
        pre_registered_user = db.query(User).filter(
            func.lower(User.telegram_username) == clean_uname
        ).first()

        if pre_registered_user:
            if not pre_registered_user.is_active:
                return (
                    f"⛔ *Acceso Denegado*\n\n"
                    f"El usuario de Telegram `@{username.lstrip('@')}` está asociado a *{pre_registered_user.full_name}* en *Neo ERP*, pero dicha cuenta se encuentra actualmente desactivada o suspendida.\n\n"
                    f"Por favor contacta al administrador del sistema."
                )

            # Auto-vincular de inmediato este chat_id
            logger.info(f"[TELEGRAM AUTO-PAIR] Auto-vinculando Telegram @{username} (chat_id: {chat_id}) al usuario {pre_registered_user.full_name} (ID: {pre_registered_user.id})")
            if not pre_registered_user.telegram_chat_id:
                pre_registered_user.telegram_chat_id = chat_id
            db.commit()

            # Asegurar conversación en todos los asistentes digitales
            all_workers = db.query(DigitalWorker).all()
            for w in all_workers:
                conv = db.query(DigitalWorkerConversation).filter(
                    DigitalWorkerConversation.worker_id == w.id,
                    DigitalWorkerConversation.channel == "TELEGRAM",
                    DigitalWorkerConversation.external_sender_id == str(chat_id)
                ).first()
                if not conv:
                    conv = DigitalWorkerConversation(
                        worker_id=w.id,
                        channel="TELEGRAM",
                        external_sender_id=str(chat_id),
                        sender_user_id=pre_registered_user.id,
                        is_authenticated=True,
                        context_data={
                            "user_email": pre_registered_user.email,
                            "full_name": pre_registered_user.full_name,
                            "telegram_username": username.lstrip("@")
                        }
                    )
                    db.add(conv)
                else:
                    conv.is_authenticated = True
                    conv.sender_user_id = pre_registered_user.id
                    if conv.context_data:
                        conv.context_data["telegram_username"] = username.lstrip("@")
            db.commit()

            user = pre_registered_user

            # Si el mensaje inicial fue /start o saludo, dar la bienvenida oficial
            if raw_text.startswith("/start") or raw_text.lower() in ["/help", "/ayuda", "hola", "buenos dias", "buenas"]:
                worker_title = worker.display_title if worker else "Asistente Digital Neo"
                return (
                    f"🎉 *¡Bienvenido {user.full_name}!*\n\n"
                    f"Tu cuenta de Telegram (`@{username.lstrip('@')}`) ha sido vinculada exitosamente a *Neo ERP*.\n"
                    f"Soy *{worker_title}*.\n\n"
                    f"A partir de este momento puedes interactuar conmigo directamente. Escribe `/ayuda` para ver mis comandos o hazme cualquier consulta en lenguaje natural."
                )

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

        worker_title = worker.display_title if worker else "Asistente Digital"
        return (
            f"🔒 *Acceso no autenticado*\n\n"
            f"Tu chat de Telegram (`{chat_id}`) no está vinculado a ningún usuario activo de *Neo ERP*.\n\n"
            f"📌 *¿Cómo obtener acceso?*\n"
            f"1. Solicita al Administrador del sistema que agregue tu usuario de Telegram (`@{username or 'tu_usuario'}`) en tu ficha de **Neo Core > Usuarios**.\n"
            f"2. O si tienes un PIN de invitación de 6 dígitos, envíalo por aquí con: `/vincular <TU_PIN>`"
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
        # DETECCIÓN DE DEAD STOCK / ROTACIÓN / PRODUCTOS SIN VENTA (Comando directo o Lenguaje Natural)
        is_dead_stock_intent = (
            lower_text.startswith("/dead_stock") or
            lower_text.startswith("/deadstock") or
            lower_text.startswith("/reporte_dead_stock") or
            lower_text.startswith("/rotacion") or
            lower_text in ["dead stock", "deadstock", "rotacion", "rotación", "reporte dead stock"] or
            (
                any(w in lower_text for w in ["sin venta", "cero venta", "0 venta", "0 ventas", "cero ventas", "sin movimiento", "inmovilizado", "inmovilizados", "muerto", "dead stock", "rotacion", "rotación"]) and
                any(w in lower_text for w in ["producto", "productos", "existencia", "existencias", "stock", "reporte", "informe", "articulo", "articulos", "artículos", "dias", "días", "cual es", "cuál es", "cuáles", "cuales", "ver"])
            )
        )

        if is_dead_stock_intent:
            days_threshold = 30
            d_match = re.search(r'\b(\d{1,3})\s*(?:dias|días)?\b', lower_text)
            if d_match:
                try:
                    val = int(d_match.group(1))
                    if 1 <= val <= 365:
                        days_threshold = val
                except Exception:
                    pass

            try:
                from app.services.dead_stock_pdf_service import generate_dead_stock_pdf
                pdf_res = await asyncio.to_thread(generate_dead_stock_pdf, db=db, days_threshold=days_threshold)

                total_cap = pdf_res.get("total_capital_immobilized_usd", 0.0)
                dead_skus = pdf_res.get("total_dead_stock", 0)
                slow_skus = pdf_res.get("total_slow_moving", 0)
                top_items = pdf_res.get("top_items", [])

                summary_lines = [
                    f"📊 *Auditoría de Rotación & Dead Stock ({days_threshold} días)*",
                    f"He evaluado el inventario y las ventas registradas en *Neo ERP*:\n",
                    f"💰 *Capital Inmovilizado:* `${total_cap:,.2f} USD`",
                    f"🛑 *SKUs Inmóviles (0 ventas):* `{dead_skus}`",
                    f"⚠️ *SKUs Rotación Lenta:* `{slow_skus}`\n",
                    f"🏆 *Top SKUs con Mayor Capital Atrapado:*"
                ]
                for it in top_items[:5]:
                    name = it.get("product_name", "SKU")
                    sku = it.get("sku", "")
                    stk = it.get("qty_on_hand", 0)
                    val = it.get("stock_valuation_usd", 0)
                    summary_lines.append(f"• *{name}* (`{sku}`): Stock: *{stk:,.0f}* | Capital: *${val:,.2f}*")

                summary_lines.append(f"\n📎 *Te he enviado el Reporte Ejecutivo en PDF* con los gráficos estadísticos, análisis de Pareto y detalle completo.")
                summary_lines.append(f"🌐 En el sistema web de *Neo Compras* puedes consultarlo y descargarlo en: *Reportes -> Rotación & Dead Stock*")

                # Enviar PDF adjunto al chat de Telegram
                filename = f"NeoERP_Reporte_Dead_Stock_{days_threshold}dias.pdf"
                await asyncio.to_thread(
                    send_telegram_document_sync,
                    chat_id=chat_id,
                    file_bytes=pdf_res["pdf_bytes"],
                    filename=filename,
                    caption=f"📄 Neo ERP • Reporte Dead Stock & Rotación ({days_threshold} días)",
                    agent_code=clean_agent_code
                )

                return "\n".join(summary_lines)

            except Exception as e:
                logger.error(f"Error generando reporte dead stock para Clara: {e}", exc_info=True)
                return (
                    f"⚠️ Ocurrió un inconveniente generando el reporte PDF de dead stock: {str(e)}.\n"
                    f"Sin embargo, puedes consultarlo en la web de *Neo Compras* en *Reportes -> Rotación & Dead Stock*."
                )

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

        # COMANDO: /producto <nombre o sku>
        if lower_text.startswith("/producto") or lower_text.startswith("producto") or lower_text.startswith("/articulo") or lower_text.startswith("articulo"):
            query_prod = re.sub(r"^/(?:producto|articulo)\s*|^(?:producto|articulo)\s*", "", raw_text, flags=re.IGNORECASE).strip()
            if not query_prod:
                return "🔍 Por favor indica qué producto consultar. Ejemplo: `/producto Harina PAN` o `/producto PRD-114675`"
            prods = lookup_purchasing_product_360(query_prod, db)
            if not prods:
                return f"🔍 No encontré productos que coincidan con '{query_prod}' en el catálogo de compras."
            blocks = [format_product_360_telegram(p) for p in prods]
            return f"📋 *Ficha 360° de Compras para '{query_prod}':*\n\n" + "\n\n───────────────\n\n".join(blocks)

        # COMANDO O LENGUAJE NATURAL: /crear_odc o crear orden de compra
        is_create_po = (
            lower_text.startswith("/crear_odc") or
            lower_text.startswith("/crear_orden") or
            lower_text.startswith("/odc_crear") or
            (
                any(w in lower_text for w in ["genera", "generar", "crea", "crear", "haz", "hacer", "prepara", "preparar", "emitir"]) and
                any(w in lower_text for w in ["odc", "orden de compra", "pedido de compra", "orden"])
            )
        )
        if is_create_po:
            sup_query, custom_items = parse_order_intent(raw_text)
            if not sup_query:
                return (
                    "❓ Por favor indica el proveedor para generar la orden de compra.\n\n"
                    "Ejemplos:\n"
                    "• `/crear_odc Alimentos Polar` (Modo sugerido MRP por quiebres)\n"
                    "• `/crear_odc Alimentos Polar | 50 Harina Pan, 20 Primor` (Modo con renglones específicos)\n"
                    "• *\"Clara, genera una orden de compra para Alimentos Polar\"*"
                )
            target_fac_id = user.facilities[0].id if (user and user.facilities) else 1
            po_result = create_supplier_po_from_chat(
                db=db,
                supplier_query=sup_query,
                user_name=user_name,
                facility_id=target_fac_id,
                custom_items=custom_items,
                channel="Telegram"
            )
            if po_result.get("success"):
                return po_result["message"]
            elif po_result.get("no_deficit"):
                return po_result["message"]
            else:
                return f"⚠️ *No se pudo generar la orden*: {po_result.get('error', 'Error desconocido')}"

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

    # === COMANDOS DE VALERIA (PRECIOS Y COSTOS) ===
    if "VALERIA" in clean_agent_code or "PRICING" in clean_agent_code:
        if lower_text in ["/margen_critico", "margen critico", "margen_critico", "perdida", "venta a perdida", "/perdida"]:
            crits = audit_critical_margins(db, min_margin_pct=15.0, limit=10)
            if not crits:
                return "✅ *Escudo de Margen*: No se detectaron productos vendiéndose a pérdida ni con margen crítico (< 15%)."
            lines = ["🛡️ *Alerta de Margen Crítico y Venta a Pérdida:*\n"]
            for c in crits:
                icon = "🔴 PÉRDIDA" if c["is_negative"] else "🟡 BAJO"
                lines.append(
                    f"• *{c['product_name']}* (`{c['sku']}`):\n"
                    f"   - Estado: *{icon}* | Margen: *{c['margin_pct']}%*\n"
                    f"   - Costo: ${c['cost']:,.4f} | PVP: ${c['sales_price']:,.4f}\n"
                )
            return "\n".join(lines)

        if lower_text in ["/sesiones", "sesiones", "/sesion", "sesiones de precio", "sesiones pendientes"]:
            sess = audit_pending_pricing_sessions(db)
            if not sess:
                return "✅ *Sesiones de Precios*: No hay sesiones en borrador pendientes por aprobar ni aplicar."
            lines = ["📑 *Sesiones de Fijación de Precios Pendientes (DRAFT):*\n"]
            for s in sess:
                lines.append(
                    f"• *Sesión #{s['id']} - {s['name']}*:\n"
                    f"   - Proveedor/Origen: {s['supplier']} ({s['source_type']})\n"
                    f"   - Líneas a actualizar: *{s['lines_count']} productos*\n"
                    f"   - Creada: {s['created_at']}\n"
                )
            return "\n".join(lines)

        if lower_text in ["/aumentos", "aumentos", "alzas", "alzas de costo"]:
            spikes = audit_recent_cost_spikes(db)
            if not spikes:
                return "✅ *Vigilante de Costos*: No se registran aumentos recientes de costo en sesiones de precios."
            lines = ["📈 *Alzas Recientes de Costo de Proveedores:*\n"]
            for sp in spikes:
                lines.append(
                    f"• *{sp['product_name']}* (`{sp['sku']}`):\n"
                    f"   - Costo: ${sp['old_cost']:,.4f} ➡️ *${sp['new_cost']:,.4f}* (+{sp['cost_increase_pct']}%)\n"
                    f"   - PVP Actual: ${sp['current_pvp']:,.4f} (Caída de margen: -{sp['margin_drop_pct']}%)\n"
                )
            return "\n".join(lines)

        if lower_text in ["/discrepancias", "discrepancias", "precios tiendas", "precios sedes"]:
            disc = audit_cross_store_price_discrepancies(db)
            if not disc:
                return "✅ *Consistencia de Precios*: Precios 100% homologados entre todas las tiendas físicas activas."
            lines = ["⚖️ *Discrepancias de Precios Detectadas Entre Sucursales:*\n"]
            for d in disc:
                lines.append(f"• *{d['product_name']}* (`{d['sku']}`): Rango ${d['min_price']:,.2f} a ${d['max_price']:,.2f}")
                for sp in d["store_prices"]:
                    lines.append(f"   - {sp['facility']}: ${sp['price']:,.2f}")
            return "\n".join(lines)

        if lower_text.startswith("/precio") or lower_text.startswith("precio") or lower_text.startswith("/costo") or lower_text.startswith("costo"):
            query_prod = re.sub(r"^/(precio|costo)\s*|^(precio|costo)\s*", "", raw_text, flags=re.IGNORECASE).strip()
            if not query_prod:
                return "🔍 Por favor indica qué producto consultar. Ejemplo: `/precio Harina PAN` o `/precio 75912345`"
            prods = lookup_product_price_and_cost(query_prod, db)
            if not prods:
                return f"🔍 No encontré productos que coincidan con '{query_prod}'."
            lines = [f"🏷️ *Ficha de Costo y Precio para '{query_prod}':*\n"]
            for p in prods:
                m_color = "🔴" if p["is_negative"] else ("🟡" if p["margin_pct"] < 20 else "🟢")
                lines.append(
                    f"• *{p['product_name']}* (`{p['sku']}`):\n"
                    f"   - Categoría: {p['category']}\n"
                    f"   - Costo Reposición: *${p['replacement_cost']:,.4f}* (Prom: ${p['average_cost']:,.4f})\n"
                    f"   - PVP Maestro: *${p['sales_price']:,.4f}*\n"
                    f"   - Margen Estimado: {m_color} *{p['margin_pct']}%*\n"
                )
                if p["facility_prices"]:
                    lines.append("   - *Precios por Tienda:*")
                    for fp in p["facility_prices"]:
                        lines.append(f"     ▪ {fp['facility']}: ${fp['sales_price']:,.2f}")
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

    # COMANDO: /historial o /facturas
    if lower_text in ["/historial", "historial", "/facturas", "facturas", "/auditoria", "auditoria"]:
        doc_stats = db.query(
            Document.facility_id,
            func.min(Document.created_at).label("min_date"),
            func.max(Document.created_at).label("max_date"),
            func.count(Document.id).label("total_docs"),
            func.count(func.distinct(Document.register_code)).label("total_registers")
        ).group_by(Document.facility_id).all()

        lines = ["📚 *Historial y Auditoría de Facturación Sincronizada:*\n"]
        for s in doc_stats:
            fac = db.query(Facility).filter(Facility.id == s.facility_id).first()
            fac_name = fac.name if fac else f"Sede #{s.facility_id}"
            first_doc = db.query(Document).filter(
                Document.facility_id == s.facility_id,
                Document.created_at == s.min_date
            ).first()
            lines.append(
                f"🏛️ *{fac_name}*:\n"
                f"   • *Total facturas sincronizadas:* {s.total_docs:,}\n"
                f"   • *Primera factura:* #{first_doc.document_number if first_doc else 'N/A'} (Fecha: {s.min_date.strftime('%d/%m/%Y %H:%M:%S') if s.min_date else 'N/A'})\n"
                f"   • *Caja de origen:* `{first_doc.register_code if first_doc else 'N/A'}` | Monto: ${float(first_doc.total_amount or 0):,.2f}\n"
                f"   • *Última factura:* {s.max_date.strftime('%d/%m/%Y %H:%M:%S') if s.max_date else 'N/A'}\n"
                f"   • *Cajas activas detectadas:* {s.total_registers} estaciones\n"
            )
        if not doc_stats:
            lines.append("No se registran facturas sincronizadas en el repositorio central de Neo ERP.")
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
        try:
            await send_telegram_message(
                chat_id=chat_id,
                text="⚠️ Disculpa, ocurrió un inconveniente interno procesando tu consulta. Por favor intenta de nuevo en unos momentos o usa `/ayuda`.",
                agent_code=clean_code
            )
        except Exception:
            pass

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
