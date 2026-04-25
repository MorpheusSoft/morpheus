from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app.models.core import Company
from app.schemas.core import Company as CompanySchema, CompanyCreate, CompanyUpdate

router = APIRouter()

@router.get("/", response_model=List[CompanySchema])
def read_companies(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    companies = db.query(Company).offset(skip).limit(limit).all()
    return companies

@router.post("/", response_model=CompanySchema)
def create_company(
    *,
    db: Session = Depends(deps.get_db),
    company_in: CompanyCreate,
) -> Any:
    company = Company(
        name=company_in.name,
        tax_id=company_in.tax_id,
        currency_code=company_in.currency_code
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    return company

@router.put("/{id}", response_model=CompanySchema)
def update_company(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    company_in: CompanyUpdate,
) -> Any:
    company = db.query(Company).filter(Company.id == id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    update_data = company_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(company, field, value)
        
    db.commit()
    db.refresh(company)
    return company
