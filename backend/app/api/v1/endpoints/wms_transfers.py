from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from app.api.deps import get_db, get_current_active_user
from app.models.inventory import StockPicking, StockMove, StockPickingType, Location, InventorySnapshot, Warehouse, ProductVariant
from app.models.core import User, Facility

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

def get_or_create_facility_warehouse_and_location(db: Session, facility_id: int):
    wh = db.query(Warehouse).filter(Warehouse.facility_id == facility_id, Warehouse.is_scrap == False).first()
    if not wh:
        wh = db.query(Warehouse).filter(Warehouse.facility_id == facility_id).first()
    if not wh:
        fac = db.query(Facility).filter(Facility.id == facility_id).first()
        fac_name = fac.name if fac else f"Sucursal #{facility_id}"
        wh = Warehouse(
            name=f"Almacén Principal {fac_name}",
            code=f"WH-{facility_id}",
            facility_id=facility_id,
            is_scrap=False
        )
        db.add(wh)
        db.flush()

    loc = db.query(Location).filter(Location.warehouse_id == wh.id, Location.usage == 'INTERNAL').first()
    if not loc:
        loc = db.query(Location).filter(Location.warehouse_id == wh.id).first()
    if not loc:
        fac = db.query(Facility).filter(Facility.id == facility_id).first()
        fac_name = fac.name if fac else f"Sucursal #{facility_id}"
        loc = Location(
            name=f"Ubicación Principal {fac_name}",
            code=f"LOC-{facility_id}-01",
            barcode=f"LOC-FAC-{facility_id}-01",
            warehouse_id=wh.id,
            usage="INTERNAL"
        )
        db.add(loc)
        db.flush()

    return wh, loc

def get_or_create_transit_warehouse_and_location(db: Session):
    wh = db.query(Warehouse).filter(Warehouse.is_transit == True).first()
    if not wh:
        wh = db.query(Warehouse).filter(Warehouse.code == 'WH-TRANSIT').first()
    if not wh:
        wh = Warehouse(
            name="Almacén de Tránsito Virtual",
            code="WH-TRANSIT",
            facility_id=1,
            is_transit=True
        )
        db.add(wh)
        db.flush()

    loc = db.query(Location).filter(Location.warehouse_id == wh.id).first()
    if not loc:
        loc = Location(
            name="Ubicación de Tránsito Virtual",
            code="LOC-TRANSIT-01",
            barcode="LOC-TRANSIT-01",
            warehouse_id=wh.id,
            usage="TRANSIT"
        )
        db.add(loc)
        db.flush()

    return wh, loc

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

    src_wh, src_loc = get_or_create_facility_warehouse_and_location(db, payload.src_facility_id)
    dest_wh, dest_loc = get_or_create_facility_warehouse_and_location(db, payload.dest_facility_id)
    transit_wh, transit_loc = get_or_create_transit_warehouse_and_location(db)

    picking_type = db.query(StockPickingType).filter(StockPickingType.code == 'INTERNAL').first()
    if not picking_type:
        picking_type = StockPickingType(name="Transferencia Interna", code="INTERNAL", sequence_prefix="INT")
        db.add(picking_type)
        db.flush()

    ref = f"INT-{payload.src_facility_id}->{payload.dest_facility_id}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    user_id_val = getattr(current_user, 'id', None)

    picking = StockPicking(
        picking_type_id=picking_type.id,
        name=ref,
        origin_document=f"Despacho Directo Sucursal #{payload.src_facility_id} a #{payload.dest_facility_id}",
        facility_id=payload.src_facility_id,
        dest_facility_id=payload.dest_facility_id,
        status='IN_TRANSIT',
        shipped_at=func.now(),
        shipped_by_id=user_id_val,
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
            location_dest_id=transit_loc.id,
            quantity_demand=qty,
            quantity_done=0.0,
            state='IN_TRANSIT',
            batch_id=line.batch_id,
            reference=ref,
            created_by_id=user_id_val
        )
        db.add(move)

        # Descontar del inventario disponible de Origen
        src_snap = db.query(InventorySnapshot).filter(
            InventorySnapshot.variant_id == line.variant_id,
            InventorySnapshot.facility_id == payload.src_facility_id
        ).first()
        if src_snap:
            src_snap.stock_qty = max(0.0, float(src_snap.stock_qty or 0) - qty)

    db.commit()
    return {"message": "Despacho directo en tránsito creado con éxito", "picking_id": picking.id, "reference": ref, "status": "IN_TRANSIT"}

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

class ReceptionLineInput(BaseModel):
    move_id: int
    quantity_received: float
    notes: Optional[str] = None

class ReceiveReplenishmentPayload(BaseModel):
    lines: List[ReceptionLineInput]

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
    users_map = {u.id: f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email for u in db.query(User).all()}

    results = []
    for p in pickings:
        src_name = facilities_map.get(p.facility_id, f"Sucursal #{p.facility_id}")
        dest_name = facilities_map.get(p.dest_facility_id, f"Sucursal #{p.dest_facility_id}") if p.dest_facility_id else "N/A"
        shipped_by_name = users_map.get(p.shipped_by_id, "N/A") if p.shipped_by_id else "N/A"
        received_by_name = users_map.get(p.received_by_id, "N/A") if p.received_by_id else "N/A"
        created_by_name = users_map.get(p.created_by_id, "N/A") if p.created_by_id else "N/A"

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
                "state": m.state,
                "notes": m.notes or ""
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
            "notes": p.notes or "",
            "created_at": p.created_at.strftime("%Y-%m-%d %H:%M") if p.created_at else None,
            "created_by_name": created_by_name,
            "shipped_at": p.shipped_at.strftime("%Y-%m-%d %H:%M") if p.shipped_at else None,
            "shipped_by_name": shipped_by_name,
            "date_done": p.date_done.strftime("%Y-%m-%d %H:%M") if p.date_done else None,
            "received_by_name": received_by_name,
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
        status='REQUESTED',
        notes=payload.notes,
        created_by_id=user_id_val
    )
    db.add(picking)
    db.flush()

    src_wh, src_loc = get_or_create_facility_warehouse_and_location(db, payload.src_facility_id)
    dest_wh, dest_loc = get_or_create_facility_warehouse_and_location(db, payload.dest_facility_id)

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
            quantity_done=0.0,
            state='REQUESTED',
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
        "status": "REQUESTED"
    }

@router.post("/requests/{request_id}/accept")
def accept_replenishment_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    picking = db.query(StockPicking).filter(StockPicking.id == request_id).first()
    if not picking:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada.")

    if picking.status not in ['REQUESTED', 'DRAFT']:
        raise HTTPException(status_code=400, detail=f"No se puede aceptar una solicitud en estado {picking.status}.")

    picking.status = 'IN_PREPARATION'
    for m in picking.moves:
        m.state = 'IN_PREPARATION'

    db.commit()
    return {"message": "Solicitud aceptada y puesta en preparación", "request_id": picking.id, "status": "IN_PREPARATION"}

@router.post("/requests/{request_id}/dispatch")
def dispatch_replenishment_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    picking = db.query(StockPicking).filter(StockPicking.id == request_id).first()
    if not picking:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada.")

    if picking.status in ['IN_TRANSIT', 'DONE', 'CANCELLED']:
        raise HTTPException(status_code=400, detail=f"No se puede despachar una orden en estado {picking.status}.")

    user_id_val = getattr(current_user, 'id', None)

    for move in picking.moves:
        qty = float(move.quantity_demand or 0)
        move.state = 'IN_TRANSIT'

        # Descontar de sucursal origen (pasa a Tránsito)
        src_snap = db.query(InventorySnapshot).filter(
            InventorySnapshot.variant_id == move.product_id,
            InventorySnapshot.facility_id == picking.facility_id
        ).first()
        if src_snap:
            src_snap.stock_qty = max(0.0, float(src_snap.stock_qty or 0) - qty)

    picking.status = 'IN_TRANSIT'
    picking.shipped_at = func.now()
    if user_id_val:
        picking.shipped_by_id = user_id_val

    db.commit()
    return {"message": "Guía de despacho emitida. Mercancía ahora en tránsito", "request_id": picking.id, "status": "IN_TRANSIT"}

@router.post("/requests/{request_id}/receive")
def receive_replenishment_request(
    request_id: int,
    payload: ReceiveReplenishmentPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    picking = db.query(StockPicking).filter(StockPicking.id == request_id).first()
    if not picking:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada.")

    if picking.status == 'DONE':
        raise HTTPException(status_code=400, detail="Esta orden ya fue completada previamente.")

    user_id_val = getattr(current_user, 'id', None)
    lines_dict = {l.move_id: l for l in payload.lines}

    for move in picking.moves:
        reception_input = lines_dict.get(move.id)
        qty_received = float(reception_input.quantity_received) if reception_input else float(move.quantity_demand or 0)
        
        move.quantity_done = qty_received
        move.state = 'DONE'
        if reception_input and reception_input.notes:
            move.notes = reception_input.notes

        # Sumar a sucursal destino
        dest_snap = db.query(InventorySnapshot).filter(
            InventorySnapshot.variant_id == move.product_id,
            InventorySnapshot.facility_id == picking.dest_facility_id
        ).first()
        
        src_snap = db.query(InventorySnapshot).filter(
            InventorySnapshot.variant_id == move.product_id,
            InventorySnapshot.facility_id == picking.facility_id
        ).first()

        if dest_snap:
            dest_snap.stock_qty = float(dest_snap.stock_qty or 0) + qty_received
        else:
            dest_snap = InventorySnapshot(
                variant_id=move.product_id,
                facility_id=picking.dest_facility_id,
                batch_id=move.batch_id,
                stock_qty=qty_received,
                avg_cost=src_snap.avg_cost if src_snap else 0.0,
                current_cost=src_snap.current_cost if src_snap else 0.0
            )
            db.add(dest_snap)

    picking.status = 'DONE'
    picking.date_done = func.now()
    if user_id_val:
        picking.received_by_id = user_id_val

    db.commit()
    return {"message": "Mercancía recibida conforme y stock cargado en destino", "request_id": picking.id, "status": "DONE"}

@router.post("/requests/{request_id}/reject")
def reject_replenishment_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    picking = db.query(StockPicking).filter(StockPicking.id == request_id).first()
    if not picking:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada.")

    if picking.status in ['DONE', 'CANCELLED']:
        raise HTTPException(status_code=400, detail=f"No se puede rechazar una orden en estado {picking.status}.")

    # Si ya estaba en tránsito, devolver stock al origen
    if picking.status == 'IN_TRANSIT':
        for m in picking.moves:
            qty = float(m.quantity_demand or 0)
            src_snap = db.query(InventorySnapshot).filter(
                InventorySnapshot.variant_id == m.product_id,
                InventorySnapshot.facility_id == picking.facility_id
            ).first()
            if src_snap:
                src_snap.stock_qty = float(src_snap.stock_qty or 0) + qty

    picking.status = 'CANCELLED'
    for m in picking.moves:
        m.state = 'CANCELLED'

    db.commit()
    return {"message": "Solicitud rechazada/cancelada exitosamente", "request_id": picking.id, "status": "CANCELLED"}
