import random
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_active_user
from app.models.core import User
from app.models.digital_workers import DigitalWorker, DigitalSkill, DigitalWorkerSkill, DigitalWorkerActionLog
from app.schemas.digital_workers import (
    DigitalWorkerResponse,
    DigitalWorkerCreate,
    DigitalWorkerUpdate,
    DigitalSkill as DigitalSkillSchema,
    DigitalWorkerActionLogResponse,
    SkillToggleRequest,
    WorkerRunResponse
)
from app.services.digital_worker_service import (
    get_all_workers,
    get_worker_by_id,
    get_all_skills,
    toggle_worker_skill,
    get_worker_actions,
    run_worker_cycle
)

router = APIRouter()

@router.get("/", response_model=List[DigitalWorkerResponse])
def read_workers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Retorna la lista de todos los Usuarios Digitales (AI Workers) configurados.
    """
    return get_all_workers(db)

@router.get("/skills", response_model=List[DigitalSkillSchema])
def read_all_skills(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Retorna el catálogo global de habilidades disponibles en la plataforma.
    """
    return get_all_skills(db)

@router.get("/{worker_id}", response_model=DigitalWorkerResponse)
def read_worker(
    worker_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    worker = get_worker_by_id(worker_id, db)
    if not worker:
        raise HTTPException(status_code=404, detail="Usuario Digital no encontrado")
    return worker

@router.put("/{worker_id}", response_model=DigitalWorkerResponse)
def update_worker(
    worker_id: int,
    payload: DigitalWorkerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    worker = get_worker_by_id(worker_id, db)
    if not worker:
        raise HTTPException(status_code=404, detail="Usuario Digital no encontrado")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(worker, field, value)

    db.commit()
    db.refresh(worker)
    return worker

@router.post("/{worker_id}/skills/{skill_id}/toggle")
def toggle_skill(
    worker_id: int,
    skill_id: int,
    payload: SkillToggleRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    worker = get_worker_by_id(worker_id, db)
    if not worker:
        raise HTTPException(status_code=404, detail="Usuario Digital no encontrado")

    skill = db.query(DigitalSkill).filter(DigitalSkill.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Habilidad no encontrada")

    assignment = toggle_worker_skill(
        worker_id=worker_id,
        skill_id=skill_id,
        is_enabled=payload.is_enabled,
        parameters=payload.parameters,
        db=db
    )
    return {
        "message": f"Habilidad '{skill.name}' {'activada' if payload.is_enabled else 'desactivada'} exitosamente.",
        "assignment_id": assignment.id,
        "is_enabled": assignment.is_enabled
    }

@router.post("/{worker_id}/run", response_model=WorkerRunResponse)
def trigger_worker_run(
    worker_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Dispara la ejecución manual inmediata de todas las habilidades activas del Usuario Digital.
    """
    worker = get_worker_by_id(worker_id, db)
    if not worker:
        raise HTTPException(status_code=404, detail="Usuario Digital no encontrado")

    try:
        summary = run_worker_cycle(worker.agent_code, db)
        return WorkerRunResponse(
            status="SUCCESS",
            agent_code=worker.agent_code,
            summary=summary
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error ejecutando ciclo: {str(e)}")

@router.get("/{worker_id}/actions", response_model=List[DigitalWorkerActionLogResponse])
def read_worker_actions(
    worker_id: int,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Retorna la bitácora de auditoría y acciones ejecutadas por el Usuario Digital.
    """
    worker = get_worker_by_id(worker_id, db)
    if not worker:
        raise HTTPException(status_code=404, detail="Usuario Digital no encontrado")

    return get_worker_actions(worker_id, db, limit=limit)

@router.post("/{worker_id}/generate-pin")
def generate_pairing_pin(
    worker_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Genera un nuevo PIN de vinculación de 6 dígitos para asociar WhatsApp de un supervisor a este Usuario Digital.
    """
    worker = get_worker_by_id(worker_id, db)
    if not worker or not worker.user:
        raise HTTPException(status_code=404, detail="Usuario Digital no encontrado o sin usuario base asociado")

    new_pin = f"{random.randint(100000, 999999)}"
    worker.user.pairing_pin = new_pin
    worker.user.is_phone_verified = False
    db.commit()
    db.refresh(worker.user)

    return {
        "worker_id": worker.id,
        "agent_code": worker.agent_code,
        "display_title": worker.display_title,
        "pairing_pin": new_pin,
        "instructions": f"Para vincular su WhatsApp, envíe un mensaje al número corporativo con el texto: 'Vincular {new_pin}'"
    }
