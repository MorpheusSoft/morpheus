from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Any
from app.api.deps import get_db
from app.models.inventory import PrintTemplate
from app.schemas.print_template import PrintTemplateCreate, PrintTemplateUpdate, PrintTemplate as PrintTemplateSchema

router = APIRouter()

@router.get("/", response_model=List[PrintTemplateSchema])
def get_templates(db: Session = Depends(get_db)) -> Any:
    return db.query(PrintTemplate).all()

@router.get("/{id}", response_model=PrintTemplateSchema)
def get_template(id: int, db: Session = Depends(get_db)) -> Any:
    template = db.query(PrintTemplate).filter(PrintTemplate.id == id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Print template not found")
    return template

@router.post("/", response_model=PrintTemplateSchema)
def create_template(*, db: Session = Depends(get_db), template_in: PrintTemplateCreate) -> Any:
    template = PrintTemplate(**template_in.model_dump())
    db.add(template)
    db.commit()
    db.refresh(template)
    return template

@router.put("/{id}", response_model=PrintTemplateSchema)
def update_template(*, db: Session = Depends(get_db), id: int, template_in: PrintTemplateUpdate) -> Any:
    template = db.query(PrintTemplate).filter(PrintTemplate.id == id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Print template not found")
    
    update_data = template_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(template, field, value)
    
    db.commit()
    db.refresh(template)
    return template

@router.delete("/{id}", response_model=PrintTemplateSchema)
def delete_template(id: int, db: Session = Depends(get_db)) -> Any:
    template = db.query(PrintTemplate).filter(PrintTemplate.id == id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Print template not found")
    
    db.delete(template)
    db.commit()
    return template
