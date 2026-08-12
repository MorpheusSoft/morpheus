from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from app.api.deps import get_db
from app.models.inventory import StockPicking, StockMove, StockPickingType, Location, InventorySnapshot, Warehouse

router = APIRouter()

class TransferLineInput(BaseModel):
    variant_id: int
    qty: float
    batch_id: Optional[int] = None

class TransferCreatePayload(BaseModel):
    src_facility_id: int
    dest_facility_id: int
    src_warehouse_id: Optional[int] = None
    dest_warehouse_id: Optional[int] = None
    lines: List[TransferLineInput]

@router.get("/")
def list_transfers(facility_id: Optional[int] = None, db: Session = Depends(get_db)):
    picking_type = db.query(StockPickingType).filter(StockPickingType.code == 'INTERNAL').first()
    if not picking_type:
        return []
    
    q = db.query(StockPicking).filter(StockPicking.picking_type_id == picking_type.id)
    if facility_id:
        q = q.filter(StockPicking.facility_id == facility_id)
    
    pickings = q.order_by(StockPicking.id.desc()).limit(100).all()
    results = []
    for p in pickings:
        results.append({
            "id": p.id,
            "name": p.name,
            "facility_id": p.facility_id,
            "status": p.status,
            "created_at": p.created_at.strftime("%Y-%m-%d %H:%M") if p.created_at else None,
            "lines_count": len(p.moves)
        })
    return results

@router.post("/")
def create_inter_facility_transfer(
    payload: TransferCreatePayload, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    if payload.src_facility_id == payload.dest_facility_id:
        raise HTTPException(status_code=400, detail="La sucursal de origen y destino no pueden ser la misma.")

    src_wh = None
    if payload.src_warehouse_id:
        src_wh = db.query(Warehouse).filter(Warehouse.id == payload.src_warehouse_id).first()
    if not src_wh:
        src_wh = db.query(Warehouse).filter(Warehouse.facility_id == payload.src_facility_id, Warehouse.is_scrap == False).first()

    dest_wh = None
    if payload.dest_warehouse_id:
        dest_wh = db.query(Warehouse).filter(Warehouse.id == payload.dest_warehouse_id).first()
    if not dest_wh:
        dest_wh = db.query(Warehouse).filter(Warehouse.facility_id == payload.dest_facility_id, Warehouse.is_scrap == False).first()

    if not src_wh or not dest_wh:
        raise HTTPException(status_code=400, detail="Depósito de origen o destino no encontrado.")

    src_loc = db.query(Location).filter(Location.warehouse_id == src_wh.id, Location.usage == 'INTERNAL').first()
    dest_loc = db.query(Location).filter(Location.warehouse_id == dest_wh.id, Location.usage == 'INTERNAL').first()

    if not src_loc or not dest_loc:
        raise HTTPException(status_code=400, detail="Ubicación interna de origen o destino no encontrada.")

    picking_type = db.query(StockPickingType).filter(StockPickingType.code == 'INTERNAL').first()
    if not picking_type:
        picking_type = StockPickingType(name="Transferencia Interna", code="INTERNAL", sequence_prefix="INT")
        db.add(picking_type)
        db.flush()

    ref = f"TRF-{payload.src_facility_id}->{payload.dest_facility_id}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    user_id_val = getattr(current_user, 'id', None)

    picking = StockPicking(
        picking_type_id=picking_type.id,
        name=ref,
        origin_document=f"Transferencia Sucursal {payload.src_facility_id} a {payload.dest_facility_id}",
        facility_id=payload.src_facility_id,
        status='DONE',
        date_done=func.now(),
        created_by_id=user_id_val
    )
    db.add(picking)
    db.flush()

    for line in payload.lines:
        qty = float(line.qty)
        if qty <= 0:
            continue

        move = StockMove(
            picking_id=picking.id,
            product_id=line.variant_id,
            location_src_id=src_loc.id,
            location_dest_id=dest_loc.id,
            quantity_demand=qty,
            quantity_done=qty,
            state='DONE',
            batch_id=line.batch_id,
            reference=ref,
            created_by_id=user_id_val
        )
        db.add(move)

        # Descontar del origen
        src_snap = db.query(InventorySnapshot).filter(
            InventorySnapshot.variant_id == line.variant_id,
            InventorySnapshot.facility_id == payload.src_facility_id
        ).first()
        if src_snap:
            src_snap.stock_qty = max(0.0, float(src_snap.stock_qty or 0) - qty)

        # Sumar al destino
        dest_snap = db.query(InventorySnapshot).filter(
            InventorySnapshot.variant_id == line.variant_id,
            InventorySnapshot.facility_id == payload.dest_facility_id
        ).first()
        if dest_snap:
            dest_snap.stock_qty = float(dest_snap.stock_qty or 0) + qty
        else:
            dest_snap = InventorySnapshot(
                variant_id=line.variant_id,
                facility_id=payload.dest_facility_id,
                batch_id=line.batch_id,
                stock_qty=qty,
                avg_cost=src_snap.avg_cost if src_snap else 0.0,
                current_cost=src_snap.current_cost if src_snap else 0.0
            )
            db.add(dest_snap)

    db.commit()
    return {"message": "Transferencia ejecutada con éxito", "picking_id": picking.id, "reference": ref}
