from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import List, Optional
from datetime import date
from app.api.deps import get_db
from app.models.purchasing import PurchaseOrder, PurchaseOrderLine
from app.models.inventory import StockPicking, StockMove, StockPickingType, Batch, InventorySnapshot, Location

router = APIRouter()

class ReceiptLineInput(BaseModel):
    po_line_id: int
    variant_id: int
    received_qty: float
    lot_number: Optional[str] = None
    expiration_date: Optional[date] = None

class ReceiptPayload(BaseModel):
    lines: List[ReceiptLineInput]

@router.post("/receipts/{order_id}")
def receive_purchase_order(order_id: int, payload: ReceiptPayload, db: Session = Depends(get_db)):
    # 1. Traer la Orden de Compra
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
        
    if order.status in ['draft', 'pending_approval', 'received']:
        raise HTTPException(status_code=400, detail="La orden no está en un estado válido para recepción.")

    # 2. Configurar Picking Types (WMS base)
    picking_type = db.query(StockPickingType).filter(StockPickingType.code == 'RECEIPT').first()
    if not picking_type:
        picking_type = StockPickingType(name="Recepción de Compras", code="RECEIPT", sequence_prefix="IN")
        db.add(picking_type)
        db.flush()
        
    # Localizaciones Maestras por defecto
    supplier_loc = db.query(Location).filter(Location.usage == 'EXTERNAL', Location.code == 'VEN').first()
    if not supplier_loc:
        supplier_loc = Location(name="Proveedores Externos", code="VEN", location_type="SHELF", usage="EXTERNAL")
        db.add(supplier_loc)
        
    internal_loc = db.query(Location).filter(Location.usage == 'INTERNAL').first()
    if not internal_loc:
        internal_loc = Location(name="Almacén Principal", code="WH", location_type="SHELF", usage="INTERNAL")
        db.add(internal_loc)
    db.flush()

    # 3. Crear el Documento de Picking WMS
    picking = StockPicking(
        picking_type_id=picking_type.id,
        name=f"IN-{order.reference}",
        origin_document=order.reference,
        facility_id=order.dest_facility_id,
        status='DONE',
        date_done=func.now()
    )
    db.add(picking)
    db.flush()

    total_expected = 0
    total_received = 0

    # 4. Procesar Lineas y asentar Inventario
    for in_line in payload.lines:
        po_line = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.id == in_line.po_line_id).first()
        if not po_line:
            continue
            
        qty = in_line.received_qty
        if qty <= 0:
            continue

        po_line.received_base_qty = float(po_line.received_base_qty or 0) + qty
        total_expected += po_line.expected_base_qty
        total_received += po_line.received_base_qty

        # A) Rastreo de Lote (FEFO)
        batch_id = None
        if in_line.lot_number:
            batch = db.query(Batch).filter(
                Batch.product_variant_id == in_line.variant_id,
                Batch.batch_number == in_line.lot_number
            ).first()
            if not batch:
                batch = Batch(
                    product_variant_id=in_line.variant_id,
                    batch_number=in_line.lot_number,
                    expiry_date=in_line.expiration_date
                )
                db.add(batch)
                db.flush()
            batch_id = batch.id

        # B) Asentar Movimiento Físico (Stock Move)
        move = StockMove(
            picking_id=picking.id,
            product_id=in_line.variant_id,
            location_src_id=supplier_loc.id,
            location_dest_id=internal_loc.id,
            quantity_demand=po_line.expected_base_qty,
            quantity_done=qty,
            state='DONE',
            batch_id=batch_id,
            supplier_id=order.supplier_id,
            unit_cost=po_line.unit_cost, # Costo provisional importado de la ODC
            reference=order.reference
        )
        db.add(move)

        # C) Asentar en el Snapshot Financiero (Inventario Activo Comercial)
        snapshot = db.query(InventorySnapshot).filter(
            InventorySnapshot.variant_id == in_line.variant_id,
            InventorySnapshot.facility_id == order.dest_facility_id
        ).first()

        if snapshot:
            snapshot.stock_qty = float(snapshot.stock_qty) + float(qty)
            # Re-promediar tentativamente el consto WAVG con recibos WMS (Opción configurable, lo haremos por seguridad)
            total_value = float(snapshot.stock_qty) * float(snapshot.avg_cost)
            inc_value = float(qty) * float(po_line.unit_cost)
            new_qty = float(snapshot.stock_qty) + float(qty)
            snapshot.avg_cost = (total_value + inc_value) / new_qty if new_qty > 0 else po_line.unit_cost
        else:
            snapshot = InventorySnapshot(
                variant_id=in_line.variant_id,
                facility_id=order.dest_facility_id,
                batch_id=batch_id,
                stock_qty=qty,
                avg_cost=po_line.unit_cost,
                current_cost=po_line.unit_cost
            )
            db.add(snapshot)

    # 5. Cierre Legal de ODC (Flujo WMS)
    if total_received >= total_expected:
        order.status = 'received'
    elif order.allow_partial_deliveries:
        order.status = 'partial'
    else:
        # Cerrada por corte de Backorders
        order.status = 'received'

    db.commit()
    return {"message": "Recepción Física completada", "picking_id": picking.id, "new_status": order.status}
