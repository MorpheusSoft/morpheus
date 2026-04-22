from sqlalchemy.orm import Session
from datetime import datetime
import asyncio
import pytz

def poll_and_execute_jobs():
    from app.db.base_class import Base  # Just to ensure models are loaded
    from app.api.deps import SessionLocal
    from app.models.core import SystemJob
    
    db: Session = SessionLocal()
    try:
        # Get current time in Caracas timezone (or system timezone)
        tz = pytz.timezone("America/Caracas")
        now = datetime.now(tz)
        current_time = now.time()
        
        # Look for enabled jobs
        jobs = db.query(SystemJob).filter(SystemJob.is_enabled == True).all()
        for job in jobs:
            # If job execution time has passed today, and it hasn't been executed today
            is_time_to_run = current_time >= job.execution_time
            
            last_exec_date = job.last_executed_at.astimezone(tz).date() if job.last_executed_at else None
            has_run_today = last_exec_date == now.date()
            
            if is_time_to_run and not has_run_today:
                print(f"[CRON DAEMON] Ejecutando Autómata: {job.job_code}...")
                
                try:
                    if job.job_code == 'mrp_nightly_consolidation':
                        execute_mrp_consolidation(db)
                        
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
    # We will trigger the same business logic or call the endpoint internally
    pass
