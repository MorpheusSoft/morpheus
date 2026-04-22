from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from app.api import deps
from app.models.inventory import InventorySession
from app.schemas import inventory as schemas
from app.services.inventory_service import InventoryService

router = APIRouter()

@router.post("/sessions/", response_model=schemas.InventorySession)
def create_session(
    *,
    db: Session = Depends(deps.get_db),
    session_in: schemas.InventorySessionCreate,
) -> Any:
    return InventoryService.create_session(db, session_in)

@router.get("/sessions/", response_model=List[schemas.InventorySession])
def read_sessions(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    return db.query(InventorySession).offset(skip).limit(limit).all()

@router.get("/sessions/{id}", response_model=schemas.InventorySession)
def read_session(
    id: int,
    db: Session = Depends(deps.get_db),
) -> Any:
    session = db.query(InventorySession).get(id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@router.post("/sessions/{id}/start", response_model=schemas.InventorySession)
def start_session(
    id: int,
    db: Session = Depends(deps.get_db),
) -> Any:
    return InventoryService.start_session(db, id)

@router.post("/sessions/{id}/lines", response_model=schemas.InventoryLine)
def add_line(
    id: int,
    line_in: schemas.InventoryLineCreate,
    db: Session = Depends(deps.get_db),
) -> Any:
    return InventoryService.add_line(db, id, line_in)

@router.put("/lines/{line_id}", response_model=schemas.InventoryLine)
def update_line(
    line_id: int,
    line_update: schemas.InventoryLineUpdate,
    db: Session = Depends(deps.get_db),
) -> Any:
    return InventoryService.update_line_count(db, line_id, line_update.counted_qty)

@router.post("/sessions/{id}/validate", response_model=schemas.InventorySession)
def validate_session(
    id: int,
    db: Session = Depends(deps.get_db),
) -> Any:
    return InventoryService.validate_session(db, id)
