from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api import deps
from app.models.sales import Customer
from app.schemas.customer import Customer as CustomerSchema, CustomerCreate, CustomerUpdate

router = APIRouter()

@router.get("/", response_model=List[CustomerSchema])
def read_customers(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    return db.query(Customer).offset(skip).limit(limit).all()

@router.post("/", response_model=CustomerSchema)
def create_customer(
    *,
    db: Session = Depends(deps.get_db),
    customer_in: CustomerCreate,
) -> Any:
    customer = db.query(Customer).filter(Customer.rif == customer_in.rif).first()
    if customer:
        raise HTTPException(
            status_code=400,
            detail="The customer with this RIF already exists in the system.",
        )
    customer = Customer(**customer_in.dict())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer

@router.get("/{id}", response_model=CustomerSchema)
def read_customer(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
) -> Any:
    customer = db.query(Customer).filter(Customer.id == id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer

@router.put("/{id}", response_model=CustomerSchema)
def update_customer(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    customer_in: CustomerUpdate,
) -> Any:
    customer = db.query(Customer).filter(Customer.id == id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    update_data = customer_in.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(customer, field, value)
        
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer

@router.delete("/{id}", response_model=CustomerSchema)
def delete_customer(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
) -> Any:
    customer = db.query(Customer).filter(Customer.id == id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    db.delete(customer)
    db.commit()
    return customer
