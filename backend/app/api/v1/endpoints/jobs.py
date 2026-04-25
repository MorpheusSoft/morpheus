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
