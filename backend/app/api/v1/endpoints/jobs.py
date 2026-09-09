from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.models.core import SystemJob
from app.schemas.core import SystemJob as SystemJobSchema, SystemJobUpdate
from typing import List

router = APIRouter()

@router.get("/", response_model=List[SystemJobSchema])
def get_jobs(db: Session = Depends(get_db)):
    return db.query(SystemJob).all()

@router.put("/{job_code}", response_model=SystemJobSchema)
def update_job(
    job_code: str,
    payload: SystemJobUpdate,
    db: Session = Depends(get_db)
):
    job = db.query(SystemJob).filter(SystemJob.job_code == job_code).first()
    if not job:
        raise HTTPException(status_code=404, detail="Cron Job no encontrado")
        
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(job, field, value)
    
    db.commit()
    db.refresh(job)
    return job

@router.post("/{job_code}/run")
def run_job_now(
    job_code: str,
    db: Session = Depends(get_db)
):
    from datetime import datetime, timezone, timedelta
    try:
        from zoneinfo import ZoneInfo
        CARACAS_TZ = ZoneInfo("America/Caracas")
    except Exception:
        CARACAS_TZ = timezone(timedelta(hours=-4))

    job = db.query(SystemJob).filter(SystemJob.job_code == job_code).first()
    if not job:
        raise HTTPException(status_code=404, detail="Cron Job no encontrado")
        
    from app.services.jobs_service import execute_job_by_code
    try:
        execute_job_by_code(job_code, db)
        job.last_executed_at = datetime.now(CARACAS_TZ)
        db.commit()
        db.refresh(job)
        return {"message": f"Autómata '{job.name}' ejecutado con éxito.", "job": job}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error ejecutando autómata: {str(e)}")

