import logging
from datetime import datetime, timezone, timedelta
try:
    from zoneinfo import ZoneInfo
    CARACAS_TZ = ZoneInfo("America/Caracas")
except Exception:
    CARACAS_TZ = timezone(timedelta(hours=-4))
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

# Import models to ensure foreign keys are resolved
from app.models.purchasing import PurchaseOrder
from app.models.inventory import InventoryAdjustment
from app.models.digital_workers import DigitalWorker, DigitalSkill, DigitalWorkerSkill, DigitalWorkerActionLog
from app.models.core import User
from app.agents.skills.wms_skills import audit_negative_stock, audit_dock_returns_and_scrap, audit_unreconciled_orders
from app.agents.skills.purchases_skills import run_mrp_draft_generation

logger = logging.getLogger(__name__)

SKILL_DISPATCHER = {
    'negative_stock_auditor': audit_negative_stock,
    'dock_returns_and_scrap_monitor': audit_dock_returns_and_scrap,
    '3way_unreconciled_watchdog': audit_unreconciled_orders,
    'mrp_purchase_suggester': run_mrp_draft_generation,
}

def run_worker_cycle(agent_code: str, db: Session) -> Dict[str, Any]:
    """
    Ejecuta el ciclo de auditoría y operaciones autónomas de un Usuario Digital.
    Itera sobre las habilidades activas asignadas y despacha cada función nativa.
    """
    worker = db.query(DigitalWorker).filter(DigitalWorker.agent_code == agent_code).first()
    if not worker:
        raise ValueError(f"Trabajador digital no encontrado: {agent_code}")

    logger.info(f"[DIGITAL WORKER DAEMON] Iniciando ciclo para {worker.display_title} ({worker.agent_code})...")
    cycle_summary = {
        "agent_code": worker.agent_code,
        "display_title": worker.display_title,
        "executed_skills": [],
        "errors": []
    }

    active_skills = db.query(DigitalWorkerSkill).join(DigitalSkill).filter(
        DigitalWorkerSkill.worker_id == worker.id,
        DigitalWorkerSkill.is_enabled == True
    ).all()

    for ws in active_skills:
        skill_code = ws.skill.skill_code
        handler = SKILL_DISPATCHER.get(skill_code)

        if not handler:
            logger.warning(f"[{worker.agent_code}] Habilidad sin handler nativo registrado: {skill_code}")
            continue

        try:
            logger.info(f"[{worker.agent_code}] Ejecutando habilidad: {ws.skill.name} ({skill_code})...")
            result = handler(db, worker)
            cycle_summary["executed_skills"].append({
                "skill_code": skill_code,
                "name": ws.skill.name,
                "items_processed": len(result) if isinstance(result, list) else 1
            })
        except Exception as e:
            error_msg = f"Error ejecutando {skill_code}: {str(e)}"
            logger.error(f"[{worker.agent_code}] {error_msg}")
            cycle_summary["errors"].append(error_msg)
            # Log failure in action log
            try:
                db.rollback()
                fail_log = DigitalWorkerActionLog(
                    worker_id=worker.id,
                    action_type=f"{skill_code.upper()}_ERROR",
                    severity='CRITICAL',
                    summary=f"Fallo durante la ejecución de la habilidad {ws.skill.name}: {str(e)}",
                    status='FAILED'
                )
                db.add(fail_log)
                db.commit()
            except Exception:
                db.rollback()

    # Actualizar última ejecución
    worker.last_scan_at = datetime.now(CARACAS_TZ)
    db.commit()
    db.refresh(worker)

    logger.info(f"[DIGITAL WORKER DAEMON] Ciclo completado para {worker.display_title}.")
    return cycle_summary

def poll_and_run_due_workers(db: Optional[Session] = None):
    """
    Evalúa si ha vencido el intervalo de escaneo de los trabajadores autónomos activos.
    """
    should_close = False
    if db is None:
        from app.api.deps import SessionLocal
        db = SessionLocal()
        should_close = True

    try:
        now = datetime.now(CARACAS_TZ)
        active_workers = db.query(DigitalWorker).filter(DigitalWorker.is_autonomous_active == True).all()

        for worker in active_workers:
            interval = timedelta(minutes=worker.scan_interval_minutes or 60)
            should_run = (worker.last_scan_at is None) or ((now - worker.last_scan_at) >= interval)

            if should_run:
                try:
                    run_worker_cycle(worker.agent_code, db)
                except Exception as e:
                    logger.error(f"[POLLER ERROR] Error en trabajador {worker.agent_code}: {e}")
    finally:
        if should_close:
            db.close()

def get_all_workers(db: Session) -> List[DigitalWorker]:
    return db.query(DigitalWorker).all()

def get_worker_by_id(worker_id: int, db: Session) -> Optional[DigitalWorker]:
    return db.query(DigitalWorker).filter(DigitalWorker.id == worker_id).first()

def get_worker_by_code(agent_code: str, db: Session) -> Optional[DigitalWorker]:
    return db.query(DigitalWorker).filter(DigitalWorker.agent_code == agent_code).first()

def get_all_skills(db: Session) -> List[DigitalSkill]:
    return db.query(DigitalSkill).all()

def toggle_worker_skill(worker_id: int, skill_id: int, is_enabled: bool, parameters: Optional[dict], db: Session) -> DigitalWorkerSkill:
    assignment = db.query(DigitalWorkerSkill).filter(
        DigitalWorkerSkill.worker_id == worker_id,
        DigitalWorkerSkill.skill_id == skill_id
    ).first()

    if not assignment:
        assignment = DigitalWorkerSkill(
            worker_id=worker_id,
            skill_id=skill_id,
            is_enabled=is_enabled,
            parameters=parameters or {}
        )
        db.add(assignment)
    else:
        assignment.is_enabled = is_enabled
        if parameters is not None:
            assignment.parameters = parameters

    db.commit()
    db.refresh(assignment)
    return assignment

def get_worker_actions(worker_id: int, db: Session, limit: int = 50) -> List[DigitalWorkerActionLog]:
    return db.query(DigitalWorkerActionLog).filter(
        DigitalWorkerActionLog.worker_id == worker_id
    ).order_by(DigitalWorkerActionLog.created_at.desc()).limit(limit).all()
