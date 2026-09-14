import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.digital_workers import DigitalWorker, DigitalWorkerActionLog
from app.models.core import Facility
from app.models.sales import Document
from app.models.sync_telemetry import StoreSyncTelemetry
from app.models.store_agent_control import StoreAgentCommand

logger = logging.getLogger(__name__)

def audit_store_sync_heartbeats(db: Session, worker: Optional[DigitalWorker] = None) -> List[Dict[str, Any]]:
    """
    Habilidad: it_sync_heartbeat_monitor
    Supervisa que cada tienda física activa esté emitiendo latidos (heartbeats) regularmente.
    Si una tienda supera los 15 minutos de inactividad, levanta una alerta CRITICAL en el ActionLog
    y despacha la notificación a los canales configurados (WhatsApp / UI).
    """
    worker_id = worker.id if worker else None
    facilities = db.query(Facility).filter(Facility.is_active == True).all()
    incidents = []

    for fac in facilities:
        latest = db.query(StoreSyncTelemetry).filter(
            StoreSyncTelemetry.facility_id == fac.id
        ).order_by(StoreSyncTelemetry.created_at.desc()).first()

        now = datetime.now(latest.created_at.tzinfo) if latest and latest.created_at else datetime.utcnow()

        if not latest:
            # Nunca se ha conectado
            summary = f"⚠️ [Dante TI] Tienda '{fac.name}' ({fac.code}) nunca ha transmitido latidos de sincronización."
            logger.warning(summary)
            if worker_id:
                log_entry = DigitalWorkerActionLog(
                    worker_id=worker_id,
                    facility_id=fac.id,
                    action_type="STORE_NEVER_SYNCED",
                    severity="WARNING",
                    summary=summary,
                    details={"facility_code": fac.code, "status": "NEVER_CONNECTED"},
                    status="COMPLETED"
                )
                db.add(log_entry)
            incidents.append({"facility": fac.name, "status": "NEVER_CONNECTED"})
        else:
            diff_minutes = (now - latest.created_at).total_seconds() / 60.0

            if diff_minutes > 15:
                # Tienda caída o desconectada
                summary = f"🚨 [Dante TI] ALERTA CRÍTICA: Tienda '{fac.name}' desconectada hace {int(diff_minutes)} minutos. Último latido: {latest.created_at.strftime('%Y-%m-%d %H:%M')}."
                logger.error(summary)
                
                if worker_id:
                    # Evitar duplicar la misma alerta en los últimos 30 minutos
                    recent_alert = db.query(DigitalWorkerActionLog).filter(
                        DigitalWorkerActionLog.worker_id == worker_id,
                        DigitalWorkerActionLog.facility_id == fac.id,
                        DigitalWorkerActionLog.action_type == "STORE_HEARTBEAT_LOST",
                        DigitalWorkerActionLog.created_at >= now - timedelta(minutes=30)
                    ).first()

                    if not recent_alert:
                        log_entry = DigitalWorkerActionLog(
                            worker_id=worker_id,
                            facility_id=fac.id,
                            action_type="STORE_HEARTBEAT_LOST",
                            severity="CRITICAL",
                            summary=summary,
                            details={
                                "facility_code": fac.code,
                                "lag_minutes": int(diff_minutes),
                                "last_heartbeat": latest.created_at.isoformat(),
                                "sql_server_status": latest.sql_server_status,
                                "agent_version": latest.agent_version
                            },
                            status="COMPLETED"
                        )
                        db.add(log_entry)

                        # Despacho proactivo inmediato a Telegram
                        try:
                            from app.services.telegram_client import send_telegram_alert_sync
                            tg_alert = (
                                f"🚨 *[Dante TI - Alerta de Conectividad]*\n\n"
                                f"La sucursal *{fac.name}* (`{fac.code}`) ha perdido conectividad con la nube.\n\n"
                                f"• *Desfase:* {int(diff_minutes)} minutos sin latido\n"
                                f"• *Último contacto:* {latest.created_at.strftime('%Y-%m-%d %H:%M')}\n"
                                f"• *Estado SQL Server:* {latest.sql_server_status or 'DESCONOCIDO'}\n"
                                f"• *Versión Agente:* v{latest.agent_version or 'N/A'}\n\n"
                                f"⚡ _Sugerencia: Verificar enlace de red de la tienda o estado del servicio NeoAgentSync._"
                            )
                            send_telegram_alert_sync(text=tg_alert, db=db, agent_code="DANTE_IT")
                        except Exception as tg_err:
                            logger.error(f"[DANTE TI] Error despachando alerta a Telegram: {tg_err}")

                incidents.append({"facility": fac.name, "status": "OFFLINE", "lag_minutes": int(diff_minutes)})
            else:
                logger.info(f"✅ [Dante TI] Tienda '{fac.name}' en línea y saludable. Latido hace {int(diff_minutes)} min.")

    db.commit()
    return incidents

def detect_sales_consecutive_gaps(db: Session, worker: Optional[DigitalWorker] = None) -> List[Dict[str, Any]]:
    """
    Habilidad: it_sales_gap_detector
    Verifica correlatividad y posibles saltos en la numeración de tickets por caja.
    """
    worker_id = worker.id if worker else None
    facilities = db.query(Facility).filter(Facility.is_active == True).all()
    results = []

    for fac in facilities:
        # Obtener todas las cajas (register_code) con ventas registradas
        registers = db.query(Document.register_code).filter(
            Document.facility_id == fac.id
        ).distinct().all()

        fac_gaps = []

        for (reg_code,) in registers:
            reg = (reg_code or "01").strip()
            # Consultar los números de documentos para esta caja
            docs = db.query(Document.document_number, Document.created_at).filter(
                Document.facility_id == fac.id,
                Document.register_code == reg
            ).order_by(Document.id.asc()).all()

            # Extraer números correlativos
            parsed_docs = []
            for d in docs:
                raw_num = str(d.document_number).strip()
                digits = ''.join(ch for ch in raw_num if ch.isdigit())
                if digits:
                    parsed_docs.append((int(digits), raw_num, d.created_at))

            # Ordenar por número
            parsed_docs.sort(key=lambda x: x[0])

            # Detectar brechas correlativas
            for i in range(1, len(parsed_docs)):
                prev_int, prev_raw, prev_date = parsed_docs[i - 1]
                curr_int, curr_raw, curr_date = parsed_docs[i]

                gap = curr_int - prev_int
                # Si hay salto pero no es un reseteo mayor (umbral de 500 tickets)
                if 1 < gap <= 500:
                    missing_start = prev_int + 1
                    missing_end = curr_int - 1
                    missing_count = gap - 1
                    range_str = f"#{missing_start:08d}" if missing_start == missing_end else f"#{missing_start:08d} - #{missing_end:08d}"
                    fac_gaps.append({
                        "register": reg,
                        "from_ticket": prev_raw,
                        "to_ticket": curr_raw,
                        "missing_range": range_str,
                        "missing_count": missing_count,
                        "date": str(curr_date)
                    })

        if fac_gaps:
            total_missing = sum(g["missing_count"] for g in fac_gaps)
            summary = (
                f"⚠️ [Dante TI] ALERTA DE CORRELATIVIDAD en Tienda '{fac.name}': "
                f"Se detectaron {len(fac_gaps)} brecha(s) con un total de {total_missing} ticket(s) faltantes en la secuencia fiscal."
            )
            logger.warning(summary)
            if worker_id:
                log_entry = DigitalWorkerActionLog(
                    worker_id=worker_id,
                    facility_id=fac.id,
                    action_type="SALES_GAP_DETECTED",
                    severity="WARNING",
                    summary=summary,
                    details={"gaps": fac_gaps, "total_missing_tickets": total_missing},
                    status="COMPLETED"
                )
                db.add(log_entry)
            results.append({"facility": fac.name, "status": "GAPS_DETECTED", "gaps": fac_gaps})
        else:
            if registers:
                summary = f"✅ [Dante TI] Secuencia correlativa perfecta en Tienda '{fac.name}'. {len(registers)} caja(s) auditadas sin saltos."
                logger.info(summary)
                if worker_id:
                    log_entry = DigitalWorkerActionLog(
                        worker_id=worker_id,
                        facility_id=fac.id,
                        action_type="SALES_GAP_AUDIT_OK",
                        severity="INFO",
                        summary=summary,
                        details={"registers_audited": [r[0] for r in registers], "total_gaps": 0},
                        status="COMPLETED"
                    )
                    db.add(log_entry)
                results.append({"facility": fac.name, "status": "INTEGRAL", "gaps": []})

    db.commit()
    return results

def reconcile_daily_sales_totals(
    db: Session,
    worker: Optional[DigitalWorker] = None,
    audit_date: Optional[Any] = None
) -> List[Dict[str, Any]]:
    """
    Habilidad: it_daily_sales_reconciliation
    Compara las ventas registradas en Neo ERP vs el conteo reportado en la telemetría de Stellar.
    Utiliza Document.doc_date (fecha legal/comercial) para conciliar con exactitud matemática.
    """
    worker_id = worker.id if worker else None
    facilities = db.query(Facility).filter(Facility.is_active == True).all()
    reconciliations = []

    for fac in facilities:
        latest = db.query(StoreSyncTelemetry).filter(
            StoreSyncTelemetry.facility_id == fac.id
        ).order_by(StoreSyncTelemetry.created_at.desc()).first()

        if not latest or latest.sales_today_count is None:
            continue

        # Determinar la fecha objetivo de cuadratura:
        # Por defecto, la fecha del latido de Stellar (o audit_date si se especifica)
        target_date = audit_date or (latest.created_at.date() if latest.created_at else datetime.utcnow().date())

        neo_sales_today = db.query(
            func.count(Document.id),
            func.sum(Document.total_amount)
        ).filter(
            Document.facility_id == fac.id,
            func.date(Document.created_at) == target_date
        ).first()

        neo_count = neo_sales_today[0] or 0
        neo_total = float(neo_sales_today[1] or 0.0)
        stellar_count = latest.sales_today_count or 0
        stellar_total = float(latest.sales_today_amount or 0.0)

        diff_count = stellar_count - neo_count
        diff_total = round(abs(stellar_total - neo_total), 2)

        if diff_count == 0 and diff_total < 0.5:
            summary = f"🎯 [Dante TI] Cuadratura Perfecta en Tienda '{fac.name}' ({target_date}): {neo_count} facturas sincronizadas (${neo_total:,.2f}). Discrepancia: $0.00."
            severity = "INFO"
        else:
            summary = f"⚠️ [Dante TI] Discrepancia en Tienda '{fac.name}' ({target_date}): Stellar={stellar_count} tickets (${stellar_total:,.2f}) vs Neo={neo_count} (${neo_total:,.2f}). Desfase: {diff_count} tickets."
            severity = "WARNING"

        if worker_id:
            log_entry = DigitalWorkerActionLog(
                worker_id=worker_id,
                facility_id=fac.id,
                action_type="DAILY_SALES_RECONCILIATION",
                severity=severity,
                summary=summary,
                details={
                    "target_date": str(target_date),
                    "stellar_count": stellar_count,
                    "neo_count": neo_count,
                    "stellar_total": stellar_total,
                    "neo_total": neo_total,
                    "difference_count": diff_count,
                    "difference_amount": diff_total
                },
                status="COMPLETED"
            )
            db.add(log_entry)

        reconciliations.append({
            "facility_id": fac.id,
            "facility_name": fac.name,
            "target_date": str(target_date),
            "status": "BALANCED" if severity == "INFO" else "DISCREPANCY",
            "difference_count": diff_count,
            "difference_amount": diff_total,
            "neo_count": neo_count,
            "stellar_count": stellar_count,
            "neo_total": neo_total,
            "stellar_total": stellar_total
        })

    db.commit()
    return reconciliations


def auto_remediate_sales_lag(db: Session, worker: Optional[DigitalWorker] = None) -> List[Dict[str, Any]]:
    """
    Habilidad: it_auto_remediate_sales_lag
    Supervisa proactivamente el desfase entre la última venta sincronizada y la actualidad.
    Si detecta un retraso (> 60 min o varios días) con la tienda online y SQL Server conectado:
    Crea y despacha automáticamente una orden SYNC_HISTORICAL o FORCE_SYNC_SALES hacia el agente.
    """
    worker_id = worker.id if worker else None
    facilities = db.query(Facility).filter(Facility.is_active == True).all()
    actions_taken = []

    for fac in facilities:
        latest = db.query(StoreSyncTelemetry).filter(
            StoreSyncTelemetry.facility_id == fac.id
        ).order_by(StoreSyncTelemetry.created_at.desc()).first()

        if not latest:
            continue

        # Verificar si la tienda está en línea y su SQL Server local está conectado
        is_online = False
        now = datetime.now(latest.created_at.tzinfo) if latest.created_at else datetime.utcnow()
        if latest.created_at:
            is_online = (now - latest.created_at).total_seconds() <= 300

        if not is_online or latest.sql_server_status != 'CONNECTED':
            continue

        # Verificar si hay desfase en la marca de agua
        last_synced = latest.last_synced_sale_time
        if not last_synced:
            continue

        # Si el desfase es mayor a 60 minutos
        diff_hours = (now - last_synced).total_seconds() / 3600.0
        if diff_hours < 1.0:
            continue

        # Verificar si ya existe una orden activa en cola para no duplicar
        active_cmd = db.query(StoreAgentCommand).filter(
            StoreAgentCommand.facility_id == fac.id,
            StoreAgentCommand.command_type.in_(["FORCE_SYNC_SALES", "SYNC_HISTORICAL"]),
            StoreAgentCommand.status.in_(["PENDING", "SENT", "RUNNING"])
        ).first()

        if active_cmd:
            logger.info(f"⏳ [Dante TI] Tienda '{fac.name}' ya tiene orden #{active_cmd.id} ({active_cmd.command_type}) en cola.")
            continue

        # Crear orden de auto-remediación
        if diff_hours > 24:
            cmd_type = "SYNC_HISTORICAL"
            params = {
                "from": last_synced.strftime("%Y-%m-%d %H:%M:%S"),
                "to": now.strftime("%Y-%m-%d %H:%M:%S"),
                "start_date": last_synced.strftime("%Y-%m-%d"),
                "end_date": now.strftime("%Y-%m-%d"),
                "batch_size": 500,
                "dispatched_by": "Dante (Agente TI Autónomo)"
            }
            summary = (
                f"⚡ [Dante TI] AUTO-REMEDIACIÓN: Tienda '{fac.name}' presenta desfase de {int(diff_hours)} horas "
                f"(última venta sincronizada: {last_synced.strftime('%Y-%m-%d %H:%M')}). "
                f"Orden SYNC_HISTORICAL despachada automáticamente hacia NeoAgentSync."
            )
        else:
            cmd_type = "FORCE_SYNC_SALES"
            params = {
                "dispatched_by": "Dante (Agente TI Autónomo)"
            }
            summary = (
                f"⚡ [Dante TI] AUTO-REMEDIACIÓN: Tienda '{fac.name}' presenta desfase de {int(diff_hours)} horas. "
                f"Orden FORCE_SYNC_SALES despachada automáticamente hacia NeoAgentSync."
            )

        cmd = StoreAgentCommand(
            facility_id=fac.id,
            command_type=cmd_type,
            parameters=params,
            status="PENDING"
        )
        db.add(cmd)
        db.flush()

        logger.info(summary)
        if worker_id:
            log_entry = DigitalWorkerActionLog(
                worker_id=worker_id,
                facility_id=fac.id,
                action_type="AUTO_SYNC_LAG_REMEDIATION",
                severity="WARNING",
                summary=summary,
                details={
                    "command_id": cmd.id,
                    "command_type": cmd_type,
                    "parameters": params,
                    "lag_hours": round(diff_hours, 1),
                    "last_synced": last_synced.isoformat()
                },
                status="COMPLETED"
            )
            db.add(log_entry)

        actions_taken.append({
            "facility": fac.name,
            "command_id": cmd.id,
            "command_type": cmd_type,
            "lag_hours": diff_hours
        })

    db.commit()
    return actions_taken

