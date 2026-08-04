from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime
from app.api.deps import get_db, get_current_active_user
from app.models.purchasing import PurchaseOrder, PurchaseOrderLine
from app.models.inventory import (
    StockPicking, StockMove, StockPickingType, Batch, InventorySnapshot,
    Location, Warehouse, ProductVariant, Product, ProductFacilityPrice, ProductBarcode
)
from app.models.core import Facility, Supplier, User

router = APIRouter()

class ReceiptLineInput(BaseModel):
    po_line_id: Optional[int] = None
    variant_id: int
    received_qty: float
    damaged_qty: Optional[float] = 0.0
    lot_number: Optional[str] = None
    expiration_date: Optional[date] = None

class ReceiptPayload(BaseModel):
    warehouse_id: Optional[int] = None
    lines: List[ReceiptLineInput]

class DiscrepancyPayload(BaseModel):
    variant_id: int
    warehouse_id: Optional[int] = None
    damaged_qty: float
    reason: str
    lot_number: Optional[str] = None

class PutawayPayload(BaseModel):
    warehouse_id: int
    variant_id: int
    qty: float
    dest_location_id: int
    batch_id: Optional[int] = None

@router.post("/receipts/{order_id}")
def receive_purchase_order(order_id: int, payload: ReceiptPayload, db: Session = Depends(get_db)):
    # 1. Traer la Orden de Compra
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
        
    if order.status in ['draft', 'pending_approval', 'received']:
        raise HTTPException(status_code=400, detail="La orden no está en un estado válido para recepción.")

    # 2. Determinar Almacén de Destino
    warehouse = None
    if payload.warehouse_id:
        warehouse = db.query(Warehouse).filter(
            Warehouse.id == payload.warehouse_id,
            Warehouse.facility_id == order.dest_facility_id
        ).first()
    
    if not warehouse:
        # Usar el almacén principal por defecto de la sucursal
        warehouse = db.query(Warehouse).filter(
            Warehouse.facility_id == order.dest_facility_id,
            Warehouse.is_scrap == False,
            Warehouse.is_transit == False
        ).first()
        
    if not warehouse:
        facility = db.query(Facility).filter(Facility.id == order.dest_facility_id).first()
        facility_name = facility.name if facility else f"ID {order.dest_facility_id}"
        warehouse = Warehouse(
            facility_id=order.dest_facility_id,
            name=f"Almacén Principal {facility_name}",
            code=f"WH-{order.dest_facility_id}"
        )
        db.add(warehouse)
        db.flush()

    # 3. Configurar Picking Types y Ubicaciones
    picking_type = db.query(StockPickingType).filter(StockPickingType.code == 'RECEIPT').first()
    if not picking_type:
        picking_type = StockPickingType(name="Recepción de Compras", code="RECEIPT", sequence_prefix="IN")
        db.add(picking_type)
        db.flush()
        
    supplier_loc = db.query(Location).filter(Location.usage == 'EXTERNAL', Location.code == 'VEN').first()
    if not supplier_loc:
        supplier_loc = Location(name="Proveedores Externos", code="VEN", location_type="SHELF", usage="EXTERNAL")
        db.add(supplier_loc)
        db.flush()

    # Determinar si entra a Bahía (DOCK) o Almacén Directo (STOCK)
    if warehouse.requires_dock_staging:
        dest_loc = db.query(Location).filter(
            Location.warehouse_id == warehouse.id,
            Location.location_type == 'DOCK'
        ).first()
        if not dest_loc:
            dest_loc = Location(
                warehouse_id=warehouse.id,
                name=f"Bahía de Recepción {warehouse.code}",
                code=f"DOCK-{warehouse.code}",
                location_type='DOCK',
                usage='INTERNAL'
            )
            db.add(dest_loc)
            db.flush()
    else:
        dest_loc = db.query(Location).filter(
            Location.warehouse_id == warehouse.id,
            Location.usage == 'INTERNAL',
            Location.location_type == 'SHELF'
        ).first()
        if not dest_loc:
            dest_loc = Location(
                warehouse_id=warehouse.id,
                name=f"Almacén Principal {warehouse.code}",
                code=f"STOCK-{warehouse.code}",
                location_type='SHELF',
                usage='INTERNAL'
            )
            db.add(dest_loc)
            db.flush()

    # Ubicación de Averías / Scrap
    scrap_loc = db.query(Location).filter(
        Location.warehouse_id == warehouse.id,
        Location.location_type == 'LOSS'
    ).first()
    if not scrap_loc:
        scrap_loc = Location(
            warehouse_id=warehouse.id,
            name=f"Zona de Mermas y Averías {warehouse.code}",
            code=f"SCRAP-{warehouse.code}",
            location_type='LOSS',
            usage='INTERNAL'
        )
        db.add(scrap_loc)
        db.flush()

    # 4. Crear el Documento de Picking WMS
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

    # 5. Procesar Líneas y Asentar Inventario
    for in_line in payload.lines:
        fac_price = db.query(ProductFacilityPrice).filter(
            ProductFacilityPrice.variant_id == in_line.variant_id,
            ProductFacilityPrice.facility_id == order.dest_facility_id
        ).first()
        if fac_price and not fac_price.is_active:
            prod_name = db.query(Product.name).join(ProductVariant).filter(ProductVariant.id == in_line.variant_id).scalar() or "desconocido"
            raise HTTPException(
                status_code=400,
                detail=f"El producto '{prod_name}' está deshabilitado/bloqueado en la sucursal de destino."
            )

        po_line = None
        if in_line.po_line_id and in_line.po_line_id > 0:
            po_line = db.query(PurchaseOrderLine).filter(PurchaseOrderLine.id == in_line.po_line_id).first()

        # Si es un Producto Inesperado (no estaba en la ODC original), crear la línea en caliente
        if not po_line:
            variant = db.query(ProductVariant).filter(ProductVariant.id == in_line.variant_id).first()
            if not variant:
                continue
            unit_cost = float(variant.average_cost or variant.standard_cost or 0)
            po_line = PurchaseOrderLine(
                order_id=order.id,
                variant_id=in_line.variant_id,
                qty_ordered=0,
                expected_base_qty=0,
                received_base_qty=0,
                unit_cost=unit_cost
            )
            db.add(po_line)
            db.flush()

        qty_good = float(in_line.received_qty or 0)
        qty_damaged = float(in_line.damaged_qty or 0)
        total_line_received = qty_good + qty_damaged

        if total_line_received <= 0:
            continue

        po_line.received_base_qty = float(po_line.received_base_qty or 0) + total_line_received
        total_expected += float(po_line.expected_base_qty or 0)
        total_received += float(po_line.received_base_qty or 0)

        # Lote (FEFO)
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

        unit_cost = float(po_line.unit_cost or 0)

        # A) Stock Move para Unidades en Buen Estado
        if qty_good > 0:
            move_good = StockMove(
                picking_id=picking.id,
                product_id=in_line.variant_id,
                location_src_id=supplier_loc.id,
                location_dest_id=dest_loc.id,
                quantity_demand=po_line.expected_base_qty,
                quantity_done=qty_good,
                state='DONE',
                batch_id=batch_id,
                supplier_id=order.supplier_id,
                unit_cost=unit_cost,
                reference=order.reference
            )
            db.add(move_good)

            # Asentar en Snapshot Activo
            snapshot = db.query(InventorySnapshot).filter(
                InventorySnapshot.variant_id == in_line.variant_id,
                InventorySnapshot.facility_id == order.dest_facility_id
            ).first()

            if snapshot:
                old_qty = float(snapshot.stock_qty or 0)
                old_cost = float(snapshot.avg_cost or 0)
                total_val = (old_qty * old_cost) + (qty_good * unit_cost)
                new_qty = old_qty + qty_good
                snapshot.stock_qty = new_qty
                snapshot.avg_cost = (total_val / new_qty) if new_qty > 0 else unit_cost
            else:
                snapshot = InventorySnapshot(
                    variant_id=in_line.variant_id,
                    facility_id=order.dest_facility_id,
                    batch_id=batch_id,
                    stock_qty=qty_good,
                    avg_cost=unit_cost,
                    current_cost=unit_cost
                )
                db.add(snapshot)

        # B) Stock Move para Unidades Dañadas / Avería
        if qty_damaged > 0:
            move_scrap = StockMove(
                picking_id=picking.id,
                product_id=in_line.variant_id,
                location_src_id=supplier_loc.id,
                location_dest_id=scrap_loc.id,
                quantity_demand=0,
                quantity_done=qty_damaged,
                state='DONE',
                batch_id=batch_id,
                supplier_id=order.supplier_id,
                unit_cost=unit_cost,
                reference=f"SCRAP-{order.reference}"
            )
            db.add(move_scrap)

    # Cierre Logístico de la ODC
    if total_received >= total_expected and total_expected > 0:
        order.status = 'received'
    elif order.allow_partial_deliveries:
        order.status = 'partial'
    else:
        order.status = 'received'

    db.commit()
    return {
        "message": "Recepción Física completada",
        "picking_id": picking.id,
        "warehouse_id": warehouse.id,
        "location_dest": dest_loc.name,
        "new_status": order.status
    }

@router.post("/receipts/{order_id}/discrepancy")
def report_receipt_discrepancy(order_id: int, payload: DiscrepancyPayload, db: Session = Depends(get_db)):
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")

    warehouse = None
    if payload.warehouse_id:
        warehouse = db.query(Warehouse).filter(Warehouse.id == payload.warehouse_id).first()
    if not warehouse:
        warehouse = db.query(Warehouse).filter(
            Warehouse.facility_id == order.dest_facility_id,
            Warehouse.is_scrap == False
        ).first()

    if not warehouse:
        raise HTTPException(status_code=404, detail="Almacén no encontrado para registrar avería.")

    supplier_loc = db.query(Location).filter(Location.usage == 'EXTERNAL', Location.code == 'VEN').first()
    scrap_loc = db.query(Location).filter(
        Location.warehouse_id == warehouse.id,
        Location.location_type == 'LOSS'
    ).first()

    if not scrap_loc:
        scrap_loc = Location(
            warehouse_id=warehouse.id,
            name=f"Zona de Mermas {warehouse.code}",
            code=f"SCRAP-{warehouse.code}",
            location_type='LOSS',
            usage='INTERNAL'
        )
        db.add(scrap_loc)
        db.flush()

    batch_id = None
    if payload.lot_number:
        batch = db.query(Batch).filter(
            Batch.product_variant_id == payload.variant_id,
            Batch.batch_number == payload.lot_number
        ).first()
        if batch:
            batch_id = batch.id

    variant = db.query(ProductVariant).filter(ProductVariant.id == payload.variant_id).first()
    unit_cost = float(variant.average_cost or variant.standard_cost or 0) if variant else 0.0

    move = StockMove(
        product_id=payload.variant_id,
        location_src_id=supplier_loc.id if supplier_loc else 1,
        location_dest_id=scrap_loc.id,
        quantity_demand=payload.damaged_qty,
        quantity_done=payload.damaged_qty,
        state='DONE',
        batch_id=batch_id,
        unit_cost=unit_cost,
        reference=f"DISCREPANCY-{order.reference}: {payload.reason}"
    )
    db.add(move)
    db.commit()
    return {"message": "Avería reportada exitosamente", "move_id": move.id, "location": scrap_loc.name}

@router.get("/receipts/{order_id}/ticket-80mm")
def get_receipt_ticket_80mm(order_id: int, db: Session = Depends(get_db)):
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")

    supplier = db.query(Supplier).filter(Supplier.id == order.supplier_id).first()
    facility = db.query(Facility).filter(Facility.id == order.dest_facility_id).first()

    items = []
    for l in order.lines:
        variant = db.query(ProductVariant).filter(ProductVariant.id == l.variant_id).first()
        product_name = variant.product.name if (variant and variant.product) else f"SKU: {l.variant_id}"
        sku = variant.sku if variant else "N/A"
        barcode = variant.barcode if variant else "N/A"
        items.append({
            "line_id": l.id,
            "variant_id": l.variant_id,
            "sku": sku,
            "barcode": barcode,
            "product_name": product_name,
            "expected_qty": float(l.expected_base_qty),
            "received_qty": float(l.received_base_qty or 0)
        })

    ticket_data = {
        "order_reference": order.reference,
        "created_at": order.created_at.strftime("%d/%m/%Y %H:%M") if order.created_at else "",
        "supplier_name": supplier.name if supplier else "N/A",
        "facility_name": facility.name if facility else "N/A",
        "items": items
    }
    return ticket_data

@router.get("/lots")
def get_wms_lots(
    facility_id: Optional[int] = None,
    query: Optional[str] = None,
    db: Session = Depends(get_db)
):
    q = db.query(Batch, ProductVariant, Product).join(
        ProductVariant, Batch.product_variant_id == ProductVariant.id
    ).join(
        Product, ProductVariant.product_id == Product.id
    )

    if query:
        search_pattern = f"%{query}%"
        q = q.filter(
            (Batch.batch_number.ilike(search_pattern)) |
            (ProductVariant.sku.ilike(search_pattern)) |
            (Product.name.ilike(search_pattern))
        )

    results = []
    today = date.today()

    for batch, variant, product in q.limit(100).all():
        snapshot_q = db.query(InventorySnapshot).filter(InventorySnapshot.variant_id == variant.id)
        if facility_id:
            snapshot_q = snapshot_q.filter(InventorySnapshot.facility_id == facility_id)
        
        total_stock = sum([float(s.stock_qty or 0) for s in snapshot_q.all()])

        status = "OK"
        days_to_expire = None
        if batch.expiry_date:
            days_to_expire = (batch.expiry_date - today).days
            if days_to_expire < 0:
                status = "EXPIRED"
            elif days_to_expire <= 30:
                status = "WARNING"

        results.append({
            "id": batch.id,
            "batch_number": batch.batch_number,
            "expiry_date": batch.expiry_date.strftime("%Y-%m-%d") if batch.expiry_date else None,
            "days_to_expire": days_to_expire,
            "status": status,
            "variant_id": variant.id,
            "sku": variant.sku,
            "product_name": product.name,
            "total_stock": total_stock
        })

    return results

@router.get("/locations/tree")
def get_locations_tree(facility_id: Optional[int] = None, db: Session = Depends(get_db)):
    warehouses_q = db.query(Warehouse)
    if facility_id:
        warehouses_q = warehouses_q.filter(Warehouse.facility_id == facility_id)
    
    warehouses = warehouses_q.all()
    tree = []

    for wh in warehouses:
        locs = db.query(Location).filter(Location.warehouse_id == wh.id).all()
        loc_data = []
        for l in locs:
            loc_data.append({
                "id": l.id,
                "name": l.name,
                "code": l.code,
                "barcode": l.barcode,
                "location_type": l.location_type,
                "usage": l.usage,
                "is_blocked": l.is_blocked,
                "parent_id": l.parent_id
            })
        
        tree.append({
            "id": wh.id,
            "name": wh.name,
            "code": wh.code,
            "facility_id": wh.facility_id,
            "requires_dock_staging": wh.requires_dock_staging,
            "locations": loc_data
        })

    return tree

@router.post("/putaway")
def execute_putaway(payload: PutawayPayload, db: Session = Depends(get_db)):
    warehouse = db.query(Warehouse).filter(Warehouse.id == payload.warehouse_id).first()
    if not warehouse:
        raise HTTPException(status_code=404, detail="Almacén no encontrado.")

    dock_loc = db.query(Location).filter(
        Location.warehouse_id == warehouse.id,
        Location.location_type == 'DOCK'
    ).first()

    dest_loc = db.query(Location).filter(Location.id == payload.dest_location_id).first()
    if not dest_loc:
        raise HTTPException(status_code=404, detail="Ubicación de destino no encontrada.")

    picking_type = db.query(StockPickingType).filter(StockPickingType.code == 'INTERNAL').first()
    if not picking_type:
        picking_type = StockPickingType(name="Transferencia Interna", code="INTERNAL", sequence_prefix="INT")
        db.add(picking_type)
        db.flush()

    picking = StockPicking(
        picking_type_id=picking_type.id,
        name=f"PUTAWAY-{warehouse.code}-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        facility_id=warehouse.facility_id,
        status='DONE',
        date_done=func.now()
    )
    db.add(picking)
    db.flush()

    move = StockMove(
        picking_id=picking.id,
        product_id=payload.variant_id,
        location_src_id=dock_loc.id if dock_loc else dest_loc.id,
        location_dest_id=dest_loc.id,
        quantity_demand=payload.qty,
        quantity_done=payload.qty,
        state='DONE',
        batch_id=payload.batch_id,
        reference=f"PUTAWAY-{warehouse.code}"
    )
    db.add(move)
    db.commit()

    return {"message": "Ubicación Putaway completada con éxito", "move_id": move.id}
