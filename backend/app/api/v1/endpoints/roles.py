from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app.models.core import Role
from app.schemas.core import Role as RoleSchema, RoleCreate, RoleUpdate

router = APIRouter()

@router.get("/", response_model=List[RoleSchema])
def read_roles(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    roles = db.query(Role).offset(skip).limit(limit).all()
    return roles

@router.post("/", response_model=RoleSchema)
def create_role(
    *,
    db: Session = Depends(deps.get_db),
    role_in: RoleCreate,
) -> Any:
    role = Role(
        name=role_in.name,
        description=role_in.description,
        can_use_oracle=role_in.can_use_oracle,
        is_active=role_in.is_active
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    return role

@router.put("/{id}", response_model=RoleSchema)
def update_role(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    role_in: RoleUpdate,
) -> Any:
    role = db.query(Role).filter(Role.id == id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    update_data = role_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(role, field, value)
        
    db.commit()
    db.refresh(role)
    return role
