from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Any
from app.api.deps import get_db
from app.models.core import Buyer
from app.schemas.buyer import BuyerCreate, BuyerUpdate, BuyerResponse

router = APIRouter()

@router.get("/", response_model=List[BuyerResponse])
def get_buyers(db: Session = Depends(get_db)) -> Any:
    return db.query(Buyer).all()

@router.post("/", response_model=BuyerResponse)
def create_buyer(*, db: Session = Depends(get_db), buyer_in: BuyerCreate) -> Any:
    existing = db.query(Buyer).filter(Buyer.user_id == buyer_in.user_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Buyer for this user already exists")
    buyer = Buyer(**buyer_in.model_dump())
    db.add(buyer)
    db.commit()
    db.refresh(buyer)
    return buyer

@router.put("/{buyer_id}", response_model=BuyerResponse)
def update_buyer(*, db: Session = Depends(get_db), buyer_id: int, buyer_in: BuyerUpdate) -> Any:
    buyer = db.query(Buyer).filter(Buyer.id == buyer_id).first()
    if not buyer:
        raise HTTPException(status_code=404, detail="Buyer not found")
    update_data = buyer_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(buyer, field, value)
    db.commit()
    db.refresh(buyer)
    return buyer
