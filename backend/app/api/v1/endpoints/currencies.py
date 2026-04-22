from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Any, List, Optional
from app.api import deps
from app.models.core import Currency, ExchangeRate
from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime

router = APIRouter()

class CurrencyResponse(BaseModel):
    id: int
    name: str
    code: str
    symbol: Optional[str] = None
    exchange_rate: Decimal
    decimal_places: int
    
    class Config:
        from_attributes = True

@router.get("/", response_model=List[CurrencyResponse])
def read_currencies(db: Session = Depends(deps.get_db)) -> Any:
    return db.query(Currency).filter(Currency.is_active == True).all()

@router.get("/exchange-rates/latest")
def get_latest_exchange_rate(
    currency_id: int,
    db: Session = Depends(deps.get_db)
) -> Any:
    rate = db.query(ExchangeRate).filter(
        ExchangeRate.currency_id == currency_id
    ).order_by(ExchangeRate.effective_date.desc(), ExchangeRate.id.desc()).first()
    
    if not rate:
        # Fallback to currency default if no explicit rate exists in history
        cur = db.query(Currency).filter(Currency.id == currency_id).first()
        if not cur:
            raise HTTPException(status_code=404, detail="Moneda no encontrada")
        return {"rate": cur.exchange_rate or Decimal("1.0"), "effective_date": None}
        
    return {
        "rate": rate.rate,
        "effective_date": rate.effective_date.isoformat() if rate.effective_date else None
    }
