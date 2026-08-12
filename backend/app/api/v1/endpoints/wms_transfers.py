from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from app.api.deps import get_db, get_current_active_user
from app.models.inventory import StockPicking, StockMove, StockPickingType, Location, InventorySnapshot, Warehouse
from app.models.core import User

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

# ==========================================
# SOLICITUDES DE REABASTECIMIENTO INTERNO
# ==========================================

class ReplenishmentRequestLineInput(BaseModel):
    variant_id: int
    qty: float
    batch_id: Optional[int] = None

class ReplenishmentRequestPayload(BaseModel):
    src_facility_id: int
    dest_facility_id: int
    notes: Optional[str] = None
    lines: List[ReplenishmentRequestLineInput]

@router.get("/requests")
def list_replenishment_requests(
    src_facility_id: Optional[int] = None,
    dest_facility_id: Optional[int] = None,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db)
):
    picking_type = db.query(StockPickingType).filter(StockPickingType.code == 'INTERNAL_REQ').first()
    if not picking_type:
        picking_type = db.query(StockPickingType).filter(StockPickingType.code == 'INTERNAL').first()
        if not picking_type:
            return []

    q = db.query(StockPicking).filter(
        StockPicking.picking_type_id == picking_type.id,
        StockPicking.origin_document.like("Solicitud Reabastecimiento%")
    )

    if src_facility_id:
        q = q.filter(StockPicking.facility_id == src_facility_id)
    if dest_facility_id:
        q = q.filter(StockPicking.dest_facility_id == dest_facility_id)
    if status_filter:
        q = q.filter(StockPicking.status == status_filter.upper())

    pickings = q.order_by(StockPicking.id.desc()).limit(100).all()

    facilities_map = {f.id: f.name for f in db.query(Facility).all()}

    results = []
    for p in pickings:
        src_name = facilities_map.get(p.facility_id, f"Sucursal #{p.facility_id}")
        dest_name = facilities_map.get(p.dest_facility_id, f"Sucursal #{p.dest_facility_id}") if p.dest_facility_id else "N/A"

        lines_detail = []
        for m in p.moves:
            variant = db.query(ProductVariant).filter(ProductVariant.id == m.product_id).first()
            p_name = variant.product.name if (variant and hasattr(variant, 'product') and variant.product) else "Producto"
            sku_code = variant.sku if variant else "N/A"
            lines_detail.append({
                "id": m.id,
                "variant_id": m.product_id,
                "product_name": p_name,
                "sku": sku_code,
                "quantity_demand": float(m.quantity_demand or 0),
                "quantity_done": float(m.quantity_done or 0),
                "state": m.state
            })

        results.append({
            "id": p.id,
            "name": p.name,
            "src_facility_id": p.facility_id,
            "src_facility_name": src_name,
            "dest_facility_id": p.dest_facility_id,
            "dest_facility_name": dest_name,
            "origin_document": p.origin_document,
            "status": p.status,
            "created_at": p.created_at.strftime("%Y-%m-%d %H:%M") if p.created_at else None,
            "lines_count": len(p.moves),
            "lines": lines_detail
        })
    return results

@router.post("/requests")
def create_replenishment_request(
    payload: ReplenishmentRequestPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    if payload.src_facility_id == payload.dest_facility_id:
        raise HTTPException(status_code=400, detail="La sucursal de origen y destino deben ser distintas.")

    src_fac = db.query(Facility).filter(Facility.id == payload.src_facility_id).first()
    dest_fac = db.query(Facility).filter(Facility.id == payload.dest_facility_id).first()
    if not src_fac or not dest_fac:
        raise HTTPException(status_code=400, detail="Sucursal de origen o destino no existe.")

    picking_type = db.query(StockPickingType).filter(StockPickingType.code == 'INTERNAL_REQ').first()
    if not picking_type:
        picking_type = StockPickingType(name="Solicitud Reabastecimiento", code="INTERNAL_REQ", sequence_prefix="REQ-INT")
        db.add(picking_type)
        db.flush()

    ref = f"REQ-INT-{payload.src_facility_id}->{payload.dest_facility_id}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    user_id_val = getattr(current_user, 'id', None)

    picking = StockPicking(
        picking_type_id=picking_type.id,
        name=ref,
        origin_document=f"Solicitud Reabastecimiento {src_fac.name} -> {dest_fac.name}",
        facility_id=payload.src_facility_id,
        dest_facility_id=payload.dest_facility_id,
        status='PENDING',
        created_by_id=user_id_val
    )
    db.add(picking)
    db.flush()

    src_wh = db.query(Warehouse).filter(Warehouse.facility_id == payload.src_facility_id, Warehouse.is_scrap == False).first()
    dest_wh = db.query(Warehouse).filter(Warehouse.facility_id == payload.dest_facility_id, Warehouse.is_scrap == False).first()
    src_loc = db.query(Location).filter(Location.warehouse_id == src_wh.id).first() if src_wh else None
    dest_loc = db.query(Location).filter(Location.warehouse_id == dest_wh.id).first() if dest_wh else None

    dummy_loc = db.query(Location).first()
    src_loc_id = src_loc.id if src_loc else (dummy_loc.id if dummy_loc else 1)
    dest_loc_id = dest_loc.id if dest_loc else (dummy_loc.id if dummy_loc else 1)

    for line in payload.lines:
        qty = float(line.qty)
        if qty <= 0:
            continue
        move = StockMove(
            picking_id=picking.id,
            product_id=line.variant_id,
            location_src_id=src_loc_id,
            location_dest_id=dest_loc_id,
            quantity_demand=qty,
            quantity_done=0.0,
            state='PENDING',
            batch_id=line.batch_id,
            reference=ref,
            created_by_id=user_id_val
        )
        db.add(move)

    db.commit()
    return {
        "message": "Solicitud de reabastecimiento creada exitosamente",
        "request_id": picking.id,
        "reference": ref,
        "status": "PENDING"
    }

@router.post("/requests/{request_id}/fulfill")
def fulfill_replenishment_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    picking = db.query(StockPicking).filter(StockPicking.id == request_id).first()
    if not picking:
        raise HTTPException(status_code=404, detail="Solicitud de reabastecimiento no encontrada.")

    if picking.status == 'DONE':
        raise HTTPException(status_code=400, detail="Esta solicitud ya fue completada previamente.")

    src_wh = db.query(Warehouse).filter(Warehouse.facility_id == picking.facility_id, Warehouse.is_scrap == False).first()
    dest_wh = db.query(Warehouse).filter(Warehouse.facility_id == picking.dest_facility_id, Warehouse.is_scrap == False).first()

    if not src_wh or not dest_wh:
        raise HTTPException(status_code=400, detail="Almacén de origen o destino no disponible.")

    user_id_val = getattr(current_user, 'id', None)

    for move in picking.moves:
        qty = float(move.quantity_demand or 0)
        move.quantity_done = qty
        move.state = 'DONE'

        # Descontar de sucursal origen
        src_snap = db.query(InventorySnapshot).filter(
            InventorySnapshot.variant_id == move.product_id,
            InventorySnapshot.facility_id == picking.facility_id
        ).first()
        if src_snap:
            src_snap.stock_qty = max(0.0, float(src_snap.stock_qty or 0) - qty)

        # Sumar a sucursal destino
        dest_snap = db.query(InventorySnapshot).filter(
            InventorySnapshot.variant_id == move.product_id,
            InventorySnapshot.facility_id == picking.dest_facility_id
        ).first()
        if dest_snap:
            dest_snap.stock_qty = float(dest_snap.stock_qty or 0) + qty
        else:
            dest_snap = InventorySnapshot(
                variant_id=move.product_id,
                facility_id=picking.dest_facility_id,
                batch_id=move.batch_id,
                stock_qty=qty,
                avg_cost=src_snap.avg_cost if src_snap else 0.0,
                current_cost=src_snap.current_cost if src_snap else 0.0
            )
            db.add(dest_snap)

    picking.status = 'DONE'
    picking.date_done = func.now()
    if user_id_val:
        picking.created_by_id = user_id_val

    db.commit()
    return {"message": "Solicitud despachada y transferida con éxito", "request_id": picking.id, "status": "DONE"}
