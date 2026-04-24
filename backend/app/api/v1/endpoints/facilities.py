from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.models.core import Facility
from app.schemas.core import Facility as FacilitySchema, FacilityCreate, FacilityUpdate

router = APIRouter()

@router.get("/", response_model=List[FacilitySchema])
def read_facilities(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    facilities = db.query(Facility).offset(skip).limit(limit).all()
    return facilities

@router.post("/", response_model=FacilitySchema)
def create_facility(
    *,
    db: Session = Depends(deps.get_db),
    facility_in: FacilityCreate,
) -> Any:
    facility = Facility(**facility_in.model_dump())
    db.add(facility)
    db.commit()
    db.refresh(facility)
    return facility

@router.put("/{facility_id}", response_model=FacilitySchema)
def update_facility(
    *,
    db: Session = Depends(deps.get_db),
    facility_id: int,
    facility_in: FacilityUpdate,
) -> Any:
    facility = db.query(Facility).filter(Facility.id == facility_id).first()
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    
    update_data = facility_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(facility, field, value)
        
    db.add(facility)
    db.commit()
    db.refresh(facility)
    return facility
