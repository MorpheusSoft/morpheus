from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api import deps
from app.schemas import inventory_session as schemas
from app.models.inventory import InventorySession, InventoryLine, ProductVariant, Location, StockMove, InventorySnapshot, ProductBarcode
from datetime import datetime

router = APIRouter()

@router.get("/", response_model=List[schemas.InventorySession])
def read_inventory_sessions(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    return db.query(InventorySession).offset(skip).limit(limit).all()

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
