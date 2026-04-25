from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Any, List
from app.api import deps
from app.models.core import Currency, ExchangeRate
from app.schemas.core import Currency as CurrencySchema, CurrencyCreate, CurrencyUpdate
from decimal import Decimal
from datetime import datetime

router = APIRouter()

@router.get("/", response_model=List[CurrencySchema])
def read_currencies(db: Session = Depends(deps.get_db)) -> Any:
    return db.query(Currency).all()

@router.post("/", response_model=CurrencySchema)
def create_currency(
    *,
    db: Session = Depends(deps.get_db),
    currency_in: CurrencyCreate,
) -> Any:
    currency = Currency(**currency_in.model_dump())
    db.add(currency)
    db.commit()
    db.refresh(currency)
    
    # Crea el primer histórico
    history = ExchangeRate(currency_id=currency.id, rate=currency.exchange_rate)
    db.add(history)
    db.commit()
    
    return currency

@router.put("/{currency_id}", response_model=CurrencySchema)
def update_currency(
    *,
    db: Session = Depends(deps.get_db),
    currency_id: int,
    currency_in: CurrencyUpdate,
) -> Any:
    currency = db.query(Currency).filter(Currency.id == currency_id).first()
    if not currency:
        raise HTTPException(status_code=404, detail="Currency not found")
    
    # If the rate changed, insert in history
    rate_changed = False
    new_rate = None
    if currency_in.exchange_rate is not None and Decimal(str(currency_in.exchange_rate)) != currency.exchange_rate:
         rate_changed = True
         new_rate = currency_in.exchange_rate
    
    update_data = currency_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(currency, field, value)
        
    db.add(currency)
    db.commit()
    db.refresh(currency)
    
    if rate_changed and new_rate is not None:
        history = ExchangeRate(currency_id=currency.id, rate=new_rate)
        db.add(history)
        db.commit()
        
    return currency

@router.get("/exchange-rates/latest")
def get_latest_exchange_rate(
    currency_id: int,
    db: Session = Depends(deps.get_db)
) -> Any:
    rate = db.query(ExchangeRate).filter(
        ExchangeRate.currency_id == currency_id
    ).order_by(ExchangeRate.effective_date.desc(), ExchangeRate.id.desc()).first()
    
    if not rate:
        cur = db.query(Currency).filter(Currency.id == currency_id).first()
        if not cur:
            raise HTTPException(status_code=404, detail="Moneda no encontrada")
        return {"rate": cur.exchange_rate or Decimal("1.0"), "effective_date": None}
        
    return {
        "rate": rate.rate,
        "effective_date": rate.effective_date.isoformat() if rate.effective_date else None
    }

@router.delete("/{currency_id}")
def delete_currency(
    *,
    db: Session = Depends(deps.get_db),
    currency_id: int,
) -> Any:
    currency = db.query(Currency).filter(Currency.id == currency_id).first()
    if not currency:
        raise HTTPException(status_code=404, detail="Currency not found")
        
    # Validation 1: Check if currency is used by ANY company as base currency_code
    from app.models.core import Company
    is_used_by_company = db.query(Company).filter(Company.currency_code == currency.code).first()
    if is_used_by_company:
        raise HTTPException(status_code=400, detail="Operación denegada. Esta divisa está configurada como moneda base en una o más empresas.")
        
    # Delete related historical exchange rates first to avoid FK constraints
    db.query(ExchangeRate).filter(ExchangeRate.currency_id == currency.id).delete()
    
    # Try Delete currency catching PostgreSQL IntegrityError
    try:
        db.delete(currency)
        db.commit()
    except Exception as e:
        db.rollback()
        # This will catch Foreign Key Constraint errors 
        # (e.g. used in configuration, system_settings, suppliers, etc.)
        raise HTTPException(
            status_code=400, 
            detail="No se puede eliminar la divisa. Se encuentra en uso por otros módulos transaccionales (Compras, Proveedores o Parámetros del Sistema)."
        )
        
    return {"message": "Currency deleted successfully"}

