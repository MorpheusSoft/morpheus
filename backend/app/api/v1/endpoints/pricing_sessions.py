from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from app.api import deps
from app.models.inventory import PricingSession, PricingSessionLine, ProductVariant, Product
from app.schemas.pricing_session import (
    PricingSessionOut, PricingSessionCreate, PricingSessionUploadData
)

router = APIRouter()

@router.get("/", response_model=List[PricingSessionOut])
def get_pricing_sessions(db: Session = Depends(deps.get_db), skip: int = 0, limit: int = 100):
    sessions = db.query(PricingSession).offset(skip).limit(limit).all()
    return sessions

@router.post("/", response_model=PricingSessionOut)
def create_pricing_session(
    *,
    db: Session = Depends(deps.get_db),
    session_in: PricingSessionCreate
):
    # This endpoint allows passing lines embedded directly if needed
    db_session = PricingSession(
        name=session_in.name,
        source_type=session_in.source_type,
        status='DRAFT'
    )
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    
    if session_in.lines:
        for line in session_in.lines:
            db_line = PricingSessionLine(
                session_id=db_session.id,
                variant_id=line.variant_id,
                external_reference_name=line.external_reference_name,
                old_cost=line.old_cost,
                proposed_cost=line.proposed_cost,
                old_price=line.old_price,
                proposed_price=line.proposed_price,
                action=line.action
            )
            db.add(db_line)
        db.commit()
        db.refresh(db_session)
        
    return db_session

@router.post("/{session_id}/upload-data", response_model=PricingSessionOut)
def upload_pricing_data(
    *,
    db: Session = Depends(deps.get_db),
    session_id: int,
    upload_in: PricingSessionUploadData
):
    session = db.query(PricingSession).filter(PricingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Pricing Session not found")
        
    if session.status != 'DRAFT':
        raise HTTPException(status_code=400, detail="Can only upload data to DRAFT sessions")
        
    for line in upload_in.lines:
        db_line = PricingSessionLine(
            session_id=session.id,
            variant_id=line.variant_id,
            external_reference_name=line.external_reference_name,
            old_cost=line.old_cost,
            proposed_cost=line.proposed_cost,
            old_price=line.old_price,
            proposed_price=line.proposed_price,
            action=line.action
        )
        db.add(db_line)
        
    db.commit()
    db.refresh(session)
    return session

@router.post("/{session_id}/approve", response_model=PricingSessionOut)
def approve_pricing_session(
    *,
    db: Session = Depends(deps.get_db),
    session_id: int
):
    """
    EL BOTÓN MÁGICO.
    Applies the DRAFT session.
    1. Updates average_cost for UPDATE_COST lines.
    2. Creates new Product and Variant for CREATE_NEW lines that were foreign.
    3. Leaves IGNORE lines alone.
    """
    session = db.query(PricingSession).filter(PricingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Pricing Session not found")
        
    if session.status != 'DRAFT':
        raise HTTPException(status_code=400, detail="Session is already processed")
        
    lines = db.query(PricingSessionLine).filter(PricingSessionLine.session_id == session.id).all()
    
    for line in lines:
        if line.action == 'IGNORE':
            continue
            
        elif line.action == 'UPDATE_COST' and line.variant_id:
            variant = db.query(ProductVariant).filter(ProductVariant.id == line.variant_id).first()
            if variant:
                # Actualizamos margen de auditoría
                variant.last_cost = variant.average_cost
                variant.average_cost = line.proposed_cost
                if line.proposed_price > 0:
                    variant.sales_price = line.proposed_price
                db.add(variant)
                
        elif line.action == 'CREATE_NEW' and not line.variant_id:
            # AISLAMIENTO SEGURO: El usuario aceptó explícitamente añadir este artículo fantasma
            # Creamos el Master Product
            new_prod = Product(
                name=line.external_reference_name or "Unknown Item from PDF",
                product_type='STOCKED',
                uom_base='PZA'
            )
            db.add(new_prod)
            db.flush() # Para obtener ID
            
            # Generamos su SKU nativo PRD
            new_sku = f"PRD-{str(new_prod.id).zfill(5)}"
            
            new_var = ProductVariant(
                product_id=new_prod.id,
                sku=new_sku,
                average_cost=line.proposed_cost,
                last_cost=0,
                sales_price=line.proposed_price
            )
            db.add(new_var)
            db.flush()
            
            # Update the line to show it was permanently mapped
            line.variant_id = new_var.id

    # Marcar sesión como aplicada
    session.status = 'APPLIED'
    session.applied_at = datetime.utcnow()
    # TODO: Auth context for `session.created_by` or modified_by
    
    db.commit()
    db.refresh(session)
    return session
