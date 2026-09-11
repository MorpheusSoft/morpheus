from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta
try:
    from zoneinfo import ZoneInfo
    CARACAS_TZ = ZoneInfo("America/Caracas")
except Exception:
    CARACAS_TZ = timezone(timedelta(hours=-4))
import asyncio
import logging

logger = logging.getLogger(__name__)

def execute_job_by_code(job_code: str, db: Session):
    """
    Ejecuta la rutina asociada al código del autómata especificado.
    """
    if job_code == 'mrp_nightly_consolidation':
        execute_mrp_consolidation(db)
    elif job_code == 'bcv_daily_rate_sync':
        execute_bcv_rate_sync(db)
    elif job_code == 'monthly_purchases_audit_report':
        from app.services.monthly_reports_service import execute_scheduled_monthly_job
        execute_scheduled_monthly_job(db)
    else:
        logger.warning(f"[CRON DAEMON] Código de job desconocido: {job_code}")


def poll_and_execute_jobs():
    from app.db.base_class import Base  # Just to ensure models are loaded
    from app.api.deps import SessionLocal
    from app.models.core import SystemJob
    
    db: Session = SessionLocal()
    try:
        # Get current time in Caracas timezone
        now = datetime.now(CARACAS_TZ)
        current_time = now.time()
        
        # Look for enabled jobs
        jobs = db.query(SystemJob).filter(SystemJob.is_enabled == True).all()
        for job in jobs:
            # If job execution time has passed today, and it hasn't been executed today
            is_time_to_run = current_time >= job.execution_time
            
            last_exec_date = job.last_executed_at.astimezone(CARACAS_TZ).date() if job.last_executed_at else None
            has_run_today = last_exec_date == now.date()
            
            if is_time_to_run and not has_run_today:
                print(f"[CRON DAEMON] Ejecutando Autómata: {job.job_code}...")
                
                try:
                    execute_job_by_code(job.job_code, db)
                        
                    # Mark as executed
                    job.last_executed_at = now
                    db.commit()
                    print(f"[CRON DAEMON] Éxito absoluto para: {job.job_code}")
                except Exception as e:
                    db.rollback()
                    print(f"[CRON DAEMON ERROR] Falló {job.job_code}: {e}")

    finally:
        db.close()

def execute_mrp_consolidation(db: Session):
    # This acts as the MRP consolidation simulator API Endpoint we built in Phase 5
    pass

def execute_bcv_rate_sync(db: Session):
    """
    Invoca la sincronización oficial de la tasa de cambio del BCV.
    """
    from app.services.currency_service import CurrencyService
    print("[CRON DAEMON] Sincronizando tasa oficial BCV con el Banco Central de Venezuela...")
    CurrencyService.sync_daily_bcv_rate(db)

