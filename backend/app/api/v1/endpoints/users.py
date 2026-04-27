from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app.models.core import User, Role, Facility
from app.schemas.core import User as UserSchema, UserCreate, UserUpdate
from app.core.security import get_password_hash

router = APIRouter()

@router.get("/", response_model=List[UserSchema])
def read_users(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    users = db.query(User).offset(skip).limit(limit).all()
    return users

@router.post("/", response_model=UserSchema)
def create_user(
    *,
    db: Session = Depends(deps.get_db),
    user_in: UserCreate,
) -> Any:
    user = db.query(User).filter(User.email == user_in.email).first()
    if user:
        raise HTTPException(status_code=400, detail="The user with this email already exists in the system.")
    
    hashed_password = get_password_hash(user_in.password)
    user = User(
        email=user_in.email,
        hashed_password=hashed_password,
        full_name=user_in.full_name,
        is_active=user_in.is_active,
        is_superuser=user_in.is_superuser,
    )
    
    if user_in.role_ids:
        roles = db.query(Role).filter(Role.id.in_(user_in.role_ids)).all()
        user.roles = roles
        
    if user_in.facility_ids:
        facilities = db.query(Facility).filter(Facility.id.in_(user_in.facility_ids)).all()
        user.facilities = facilities

    try:
        db.add(user)
        db.commit()
        db.refresh(user)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error details: {str(e)}")
    return user

@router.put("/{user_id}", response_model=UserSchema)
def update_user(
    *,
    db: Session = Depends(deps.get_db),
    user_id: int,
    user_in: UserUpdate,
) -> Any:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user_in.email and user_in.email != user.email:
        existing_user = db.query(User).filter(User.email == user_in.email).first()
        if existing_user:
             raise HTTPException(status_code=400, detail="Email already registered")
        user.email = user_in.email

    if user_in.full_name is not None:
        user.full_name = user_in.full_name
    
    if user_in.is_active is not None:
        user.is_active = user_in.is_active
        
    if user_in.password:
        user.hashed_password = get_password_hash(user_in.password)
        
    if user_in.role_ids is not None:
        roles = db.query(Role).filter(Role.id.in_(user_in.role_ids)).all()
        user.roles = roles
        
    if user_in.facility_ids is not None:
        facilities = db.query(Facility).filter(Facility.id.in_(user_in.facility_ids)).all()
        user.facilities = facilities
        
    try:
        db.add(user)
        db.commit()
        db.refresh(user)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error details: {str(e)}")
    return user
