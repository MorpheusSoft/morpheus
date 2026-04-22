from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.models.core import SystemJob
from pydantic import BaseModel
from typing import List, Optional
from datetime import time, datetime

router = APIRouter()

class SystemJobBase(BaseModel):
    is_enabled: bool
    execution_time: time

class SystemJobResponse(SystemJobBase):
    id: int
    job_code: str
    name: str
    last_executed_at: Optional[datetime] = None

    class Config:
        orm_mode = True

@router.get("/", response_model=List[SystemJobResponse])
def get_jobs(db: Session = Depends(get_db)):
    return db.query(SystemJob).all()

@router.put("/{job_code}", response_model=SystemJobResponse)
def update_job(
    job_code: str,
    payload: SystemJobBase,
    db: Session = Depends(get_db)
):
    job = db.query(SystemJob).filter(SystemJob.job_code == job_code).first()
    if not job:
        raise HTTPException(status_code=404, detail="Cron Job no encontrado")
        
    job.is_enabled = payload.is_enabled
    job.execution_time = payload.execution_time
    
    db.commit()
    db.refresh(job)
    return job
