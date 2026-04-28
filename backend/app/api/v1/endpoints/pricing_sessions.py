from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from datetime import datetime

from app.api import deps
from app.models.inventory import PricingSession, PricingSessionLine, ProductVariant, ProductBarcode, Product, Category
from app.models.purchasing import SupplierProduct
from app.models.core import Tribute
from app.schemas.pricing_session import (
    PricingSessionCreate,
    PricingSessionOut,
    PricingSessionLineUpdate,
    PricingSessionLineCreate,
    PricingSessionBulkFilterRequest
)

router = APIRouter()

@router.post("/", response_model=PricingSessionOut)
def create_pricing_session(
    *,
    db: Session = Depends(deps.get_db),
    session_in: PricingSessionCreate,
    current_user: Any = Depends(deps.get_current_active_user)
) -> Any:
    """ Create a new Pricing Session """
    db_session = PricingSession(
        name=session_in.name,
        source_type=session_in.source_type,
        target_cost_type=session_in.target_cost_type,
        status='DRAFT',
        created_by=current_user.id
    )
    db.add(db_session)
    db.flush()
    
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

@router.get("/", response_model=List[PricingSessionOut])
def read_pricing_sessions(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """ Get all pricing sessions """
    return db.query(PricingSession).order_by(PricingSession.id.desc()).offset(skip).limit(limit).all()

@router.get("/{id}", response_model=PricingSessionOut)
def get_pricing_session(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
) -> Any:
    """ Get a pricing session by ID with lines """
    session = db.query(PricingSession).filter(PricingSession.id == id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Pricing Session not found")
    return session

@router.post("/{session_id}/lines", response_model=Any)
def add_session_line(
    *,
    db: Session = Depends(deps.get_db),
    session_id: int,
    line_in: PricingSessionLineCreate
) -> Any:
    """ Add a single line to a draft session """
    session = db.query(PricingSession).filter(PricingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != 'DRAFT':
        raise HTTPException(status_code=400, detail="Cannot manually add lines to applied sessions")

    # Si nos pasan variant_id, rellenar valores de viejo costo
    db_line = PricingSessionLine(
        session_id=session_id,
        variant_id=line_in.variant_id,
        external_reference_name=line_in.external_reference_name,
        old_cost=line_in.old_cost,
        proposed_cost=line_in.proposed_cost,
        old_price=line_in.old_price,
        proposed_price=line_in.proposed_price,
        action=line_in.action
    )
    if line_in.variant_id:
        v = db.query(ProductVariant).filter(ProductVariant.id == line_in.variant_id).first()
        if v:
            db_line.old_cost = v.replacement_cost if session.target_cost_type == 'REPLACEMENT' else v.standard_cost
            db_line.old_price = v.sales_price
            if not db_line.external_reference_name:
                db_line.external_reference_name = f"{v.sku} - {v.product.name if v.product else 'Variante'}"

    db.add(db_line)
    db.commit()
    return {"message": "Line added"}

@router.put("/{session_id}/lines/{line_id}", response_model=Any)
def update_session_line(
    *,
    db: Session = Depends(deps.get_db),
    session_id: int,
    line_id: int,
    line_in: PricingSessionLineUpdate
) -> Any:
    """ Update a single line in a draft session """
    line = db.query(PricingSessionLine).filter(
        PricingSessionLine.id == line_id, 
        PricingSessionLine.session_id == session_id
    ).first()
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")
        
    session = db.query(PricingSession).filter(PricingSession.id == session_id).first()
    if session.status != 'DRAFT':
        raise HTTPException(status_code=400, detail="Can only edit DRAFT sessions")
        
    update_data = line_in.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(line, field, value)
        
    db.commit()
    return {"message": "Line updated"}

@router.post("/{id}/apply", response_model=Any)
def apply_pricing_session(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    current_user: Any = Depends(deps.get_current_active_user)
) -> Any:
    """ ATOMICALLY APPLY pricing session to real standard costs / replacement costs """
    session = db.query(PricingSession).filter(PricingSession.id == id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != 'DRAFT':
        raise HTTPException(status_code=400, detail="Session already processed/applied")
        
    # Transaction begins
    for line in session.lines:
        if line.action == 'IGNORE':
            continue
            
        if line.variant_id:
            variant = db.query(ProductVariant).filter(ProductVariant.id == line.variant_id).first()
            if variant:
                # Actualizamos según target
                if session.target_cost_type == 'STANDARD':
                    variant.standard_cost = line.proposed_cost
                elif session.target_cost_type == 'REPLACEMENT':
                    variant.replacement_cost = line.proposed_cost
                
                # Update price
                variant.sales_price = line.proposed_price
                variant.last_price_updated_by_id = current_user.id
                variant.last_price_updated_at = func.now()
                
    session.status = 'APPLIED'
    session.applied_at = datetime.utcnow()
    db.commit()
    return {"message": "Pricing applied successfully"}

import csv
import io
from fastapi import UploadFile, File

@router.post("/{id}/upload-csv", response_model=Any)
def upload_csv_to_session(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    file: UploadFile = File(...)
) -> Any:
    """ Sube un CSV y lo parsea para inyectar PricingSessionLines """
    session = db.query(PricingSession).filter(PricingSession.id == id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != 'DRAFT':
        raise HTTPException(status_code=400, detail="Solamente puedes importar a borradores (DRAFT)")
        
    contents = file.file.read()
    buffer = io.StringIO(contents.decode('utf-8'))
    csv_reader = csv.DictReader(buffer)
    
    # Expected columns: sku, nuevo_costo, nuevo_precio
    lines_created = 0
    
    for row in csv_reader:
        # Normalize keys
        r_keys = list(row.keys())
        sku_key = next((k for k in r_keys if k and k.strip().lower() == 'sku'), None)
        cost_key = next((k for k in r_keys if k and k.strip().lower() in ['nuevo_costo', 'costo']), None)
        price_key = next((k for k in r_keys if k and k.strip().lower() in ['nuevo_precio', 'precio']), None)
        
        if not sku_key:
            continue # Salta lineas rotas o sin sku
            
        sku_val = row[sku_key].strip()
        new_cost = float(row[cost_key]) if cost_key and row.get(cost_key) else 0.0
        new_price = float(row[price_key]) if price_key and row.get(price_key) else 0.0
        
        # Buscar la variante por SKU maestro o por cualquiera de sus códigos Multi-Unidad/Barras
        variant = db.query(ProductVariant).filter(
            (ProductVariant.sku == sku_val) |
            (ProductVariant.barcodes.any(ProductBarcode.barcode == sku_val))
        ).first()
        
        if variant:
            db_line = PricingSessionLine(
                session_id=session.id,
                variant_id=variant.id,
                external_reference_name=f"{sku_val} (Encontrado via CSV)",
                old_cost=variant.replacement_cost if session.target_cost_type == 'REPLACEMENT' else variant.standard_cost,
                proposed_cost=new_cost,
                old_price=variant.sales_price,
                proposed_price=new_price,
                action='UPDATE_COST'
            )
        else:
             db_line = PricingSessionLine(
                session_id=session.id,
                variant_id=None,
                external_reference_name=f"SKU Inexistente: {sku_val}",
                old_cost=0,
                proposed_cost=new_cost,
                old_price=0,
                proposed_price=new_price,
                action='IGNORE'
            )
            
        db.add(db_line)
        lines_created += 1
        
    db.commit()
    return {"message": "CSV Procesado correctamente", "lines_created": lines_created}

@router.post("/{session_id}/lines/bulk-filter", response_model=Any)
def bulk_filter_lines(
    *,
    db: Session = Depends(deps.get_db),
    session_id: int,
    payload: PricingSessionBulkFilterRequest
) -> Any:
    """ Genera multiples lineas basadas en un filtro + formula matematica """
    session = db.query(PricingSession).filter(PricingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != 'DRAFT':
        raise HTTPException(status_code=400, detail="Cannot manually add lines to applied sessions")

    query = db.query(ProductVariant).join(ProductVariant.product)
    
    if payload.filters.supplier_ids:
        query = query.join(SupplierProduct, SupplierProduct.variant_id == ProductVariant.id)
        query = query.filter(SupplierProduct.supplier_id.in_(payload.filters.supplier_ids))
        
    if payload.filters.category_ids:
        from sqlalchemy import or_
        cats = db.query(Category).filter(Category.id.in_(payload.filters.category_ids)).all()
        if cats:
            query = query.join(Category, Product.category_id == Category.id)
            cat_conditions = []
            for c in cats:
                cat_conditions.append(Category.id == c.id)
                if c.path:
                    cat_conditions.append(Category.path.like(f"{c.path}/%"))
            query = query.filter(or_(*cat_conditions))
        
    if payload.filters.search_term:
        query = query.filter(Product.name.ilike(f"%{payload.filters.search_term}%"))
    
    variants = query.all()
    lines_created = 0
    
    for v in variants:
        existing_line = db.query(PricingSessionLine).filter(
             PricingSessionLine.session_id == session_id,
             PricingSessionLine.variant_id == v.id
        ).first()

        old_cost = float(v.replacement_cost if session.target_cost_type == 'REPLACEMENT' else v.standard_cost)
        old_price = float(v.sales_price)
        
        # Cost Rule
        base_cost = old_cost
        if payload.cost_rule.base_target == 'CURRENT_PRICE':
            base_cost = old_price
             
        new_cost = old_cost
        if payload.cost_rule.action == 'SET_FIXED':
            new_cost = payload.cost_rule.value
        elif payload.cost_rule.action == 'ADD_FIXED':
            new_cost = base_cost + payload.cost_rule.value
        elif payload.cost_rule.action == 'ADD_PERCENTAGE':
            new_cost = base_cost * (1.0 + (payload.cost_rule.value / 100.0))

        # Price Rule
        base_price = old_price
        if payload.price_rule.base_target == 'CURRENT_COST':
            base_price = old_cost
        elif payload.price_rule.base_target == 'NEW_COST':
            base_price = new_cost

        new_price = old_price
        if payload.price_rule.action == 'SET_FIXED':
            new_price = payload.price_rule.value
        elif payload.price_rule.action == 'ADD_FIXED':
            new_price = base_price + payload.price_rule.value
        elif payload.price_rule.action == 'ADD_PERCENTAGE':
            new_price = base_price * (1.0 + (payload.price_rule.value / 100.0))

        if payload.price_rule.include_tax and v.product and v.product.tax_id:
            tribute = db.query(Tribute).filter(Tribute.id == v.product.tax_id).first()
            if tribute:
                new_price = new_price * (1.0 + (float(tribute.rate) / 100.0))
            
        if existing_line:
            existing_line.proposed_cost = new_cost
            existing_line.proposed_price = new_price
        else:
            db_line = PricingSessionLine(
                session_id=session_id,
                variant_id=v.id,
                external_reference_name=f"{v.sku} - {v.product.name if v.product else 'Variante'}",
                old_cost=old_cost,
                proposed_cost=float(new_cost),
                old_price=old_price,
                proposed_price=float(new_price),
                action='UPDATE_COST'
            )
            db.add(db_line)
        lines_created += 1

    db.commit()
    return {"message": "Bulk lines processed", "lines_created": lines_created}

@router.delete("/{session_id}")
def delete_session(session_id: str, db: Session = Depends(deps.get_db)) -> Any:
    """
    Delete a draft pricing session and its lines.
    """
    session = db.query(PricingSession).filter(PricingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Pricing session not found")
        
    if session.status != 'DRAFT':
        raise HTTPException(status_code=400, detail="Only DRAFT sessions can be deleted.")
        
    db.delete(session)
    db.commit()
    return {"message": "Session deleted successfully"}
