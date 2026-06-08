from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api import deps
from app.schemas import inventory_session as schemas
from app.models.inventory import InventorySession, InventoryLine, ProductVariant, Location, StockMove, InventorySnapshot, ProductBarcode, Category
from datetime import datetime

router = APIRouter()

def attach_anomaly_fields(session: InventorySession, db: Session):
    for line in session.lines:
        line.is_anomaly = False
        line.anomaly_reason = None
        
        diff = float(line.counted_qty or 0) - float(line.theoretical_qty or 0)
        abs_diff = abs(diff)
        
        if abs_diff > 0:
            variant = db.query(ProductVariant).filter(ProductVariant.id == line.product_variant_id).first()
            if variant:
                cost = float(variant.standard_cost or variant.replacement_cost or 0)
                if cost > 50.0:
                    line.is_anomaly = True
                    line.anomaly_reason = f"Diferencia en artículo de alto valor ({cost} USD). Delta: {diff} unidades."
                elif line.theoretical_qty and (abs_diff / float(line.theoretical_qty)) > 0.5 and abs_diff > 5:
                    line.is_anomaly = True
                    line.anomaly_reason = f"Desviación significativa (>50%). Teórico: {line.theoretical_qty}, Contado: {line.counted_qty}."
                elif not line.theoretical_qty and abs_diff > 20:
                    line.is_anomaly = True
                    line.anomaly_reason = f"Cantidad contada inesperada sin stock teórico previo ({line.counted_qty} unidades)."

@router.get("/", response_model=List[schemas.InventorySession])
def read_inventory_sessions(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: Any = Depends(deps.get_current_active_user)
) -> Any:
    sessions = db.query(InventorySession).offset(skip).limit(limit).all()
    is_supervisor = False
    if hasattr(current_user, 'roles'):
        is_supervisor = any(r.name.upper() in ('SUPERVISOR', 'ADMIN', 'GERENTE') for r in current_user.roles)
        
    for s in sessions:
        if is_supervisor:
            attach_anomaly_fields(s, db)
        else:
            for line in s.lines:
                line.theoretical_qty = None
                line.difference_qty = None
                line.is_anomaly = False
                line.anomaly_reason = None
    return sessions

@router.get("/{id}", response_model=schemas.InventorySession)
def get_inventory_session(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    current_user: Any = Depends(deps.get_current_active_user)
) -> Any:
    session = db.query(InventorySession).filter(InventorySession.id == id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    is_supervisor = False
    if hasattr(current_user, 'roles'):
        is_supervisor = any(r.name.upper() in ('SUPERVISOR', 'ADMIN', 'GERENTE') for r in current_user.roles)
        
    if is_supervisor:
        attach_anomaly_fields(session, db)
    else:
        for line in session.lines:
            line.theoretical_qty = None
            line.difference_qty = None
            line.is_anomaly = False
            line.anomaly_reason = None
            
    return session

@router.post("/", response_model=schemas.InventorySession)
def create_inventory_session(
    *,
    db: Session = Depends(deps.get_db),
    session_in: schemas.InventorySessionCreate,
) -> Any:
    db_obj = InventorySession(
        name=session_in.name,
        facility_id=session_in.facility_id,
        warehouse_id=session_in.warehouse_id,
        scope_type=session_in.scope_type,
        scope_value=session_in.scope_value,
        state="DRAFT"
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

@router.post("/{id}/lines/bulk", response_model=schemas.InventorySession)
def bulk_upload_lines(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    bulk_in: schemas.InventoryLineBulkUpload,
) -> Any:
    session = db.query(InventorySession).filter(InventorySession.id == id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    count_inserted = 0
    for item in bulk_in.lines:
        variant = db.query(ProductVariant).filter(ProductVariant.sku == item.sku).first()
        if not variant:
            barcode = db.query(ProductBarcode).filter(ProductBarcode.barcode == item.sku).first()
            if barcode:
                variant = db.query(ProductVariant).filter(ProductVariant.id == barcode.product_variant_id).first()
                
        location = db.query(Location).filter(Location.code == item.location_code).first()
        
        if not variant or not location:
            # Saltamos silenciosamente los SKUs o Ubicaciones no encontrados
            continue
            
        # Validar Filtros de Alcance (Scope Filters)
        if session.scope_type == 'WAREHOUSE' and session.scope_value:
            try:
                scope_wh_id = int(session.scope_value)
                if location.warehouse_id != scope_wh_id:
                    continue
            except ValueError:
                pass
        elif session.scope_type == 'LOCATION' and session.scope_value:
            try:
                scope_loc_id = int(session.scope_value)
                if location.id != scope_loc_id:
                    continue
            except ValueError:
                if location.code != session.scope_value:
                    continue
        elif session.scope_type == 'CATEGORY' and session.scope_value and variant.product:
            try:
                scope_cat_id = int(session.scope_value)
                if variant.product.category_id != scope_cat_id:
                    cat = db.query(Category).filter(Category.id == variant.product.category_id).first()
                    parent_cat = db.query(Category).filter(Category.id == scope_cat_id).first()
                    if not (cat and parent_cat and cat.path and parent_cat.path and cat.path.startswith(parent_cat.path)):
                        continue
            except ValueError:
                pass
            
        # Calcular Stock Teórico dinámico desde InventorySnapshot
        snapshot = db.query(InventorySnapshot).filter_by(
            variant_id=variant.id,
            facility_id=session.facility_id
        ).first()
        
        theoretical = float(snapshot.stock_qty) if snapshot else 0.0
        
        db_line = InventoryLine(
            session_id=session.id,
            product_variant_id=variant.id,
            location_id=location.id,
            theoretical_qty=theoretical,
            counted_qty=item.counted_qty,
            notes=item.notes
        )
        db.add(db_line)
        
        # Mapeo vital de costos para la carga inicial
        if item.cost is not None:
             variant.average_cost = item.cost
             variant.last_cost = item.cost
             variant.standard_cost = item.cost
             
        count_inserted += 1
    
    db.commit()
    db.refresh(session)
    return session
    
@router.post("/{id}/validate")
def validate_session(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
) -> Any:
    session = db.query(InventorySession).filter(InventorySession.id == id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    if session.state == "DONE":
        raise HTTPException(status_code=400, detail="Ya se encuentra consolidada.")
        
    virtual_loss_loc = db.query(Location).filter(Location.code == "INV_ADJ").first()
    if not virtual_loss_loc:
        raise HTTPException(status_code=500, detail="Ubicación virtual de mermas INV_ADJ no existe en base de datos.")
        
    # Consolidar líneas (Delta Dinámico)
    for line in session.lines:
        # En SQLAlchemy Computed columns (difference_qty) solo existen luego del commit final
        # Por lo tanto, calculamos el Delta en RAM:
        diff = float(line.counted_qty) - float(line.theoretical_qty)
        
        if diff == 0:
            continue
            
        # Generar movimientos matemáticos compensatorios
        src_id = virtual_loss_loc.id if diff > 0 else line.location_id
        dest_id = line.location_id if diff > 0 else virtual_loss_loc.id
        
        # Consultar Costo en tiempo real
        variant = db.query(ProductVariant).filter(ProductVariant.id == line.product_variant_id).first()
        current_cost = variant.average_cost if variant else 0
        
        move = StockMove(
            product_id=line.product_variant_id,
            location_src_id=src_id,
            location_dest_id=dest_id,
            quantity_demand=abs(diff),
            quantity_done=abs(diff),
            state="DONE",
            reference=f"TOMA-FISICA-{session.id}",
            unit_cost=current_cost
        )
        db.add(move)
        
        # Actualización de la Pizarra Snapshot
        snapshot = db.query(InventorySnapshot).filter_by(
            variant_id=line.product_variant_id,
            facility_id=session.facility_id
        ).first()
        
        if not snapshot:
            snapshot = InventorySnapshot(
                variant_id=line.product_variant_id,
                facility_id=session.facility_id,
                stock_qty=0,
                avg_cost=current_cost
            )
            db.add(snapshot)
            
        snapshot.stock_qty = float(snapshot.stock_qty) + diff
        
    session.state = "DONE"
    session.date_end = datetime.now()
    db.commit()
    return {"status": "success", "message": "Inventario validado y transferido exitosamente."}
