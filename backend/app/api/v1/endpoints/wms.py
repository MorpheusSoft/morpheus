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
    reject_at_dock: Optional[bool] = True
    rejection_reason: Optional[str] = None
    lot_number: Optional[str] = None
    expiration_date: Optional[date] = None

class ReceiptPayload(BaseModel):
    warehouse_id: Optional[int] = None
    invoice_number: Optional[str] = None
    receipt_date: Optional[date] = None
    lines: List[ReceiptLineInput]

class DiscrepancyPayload(BaseModel):
    variant_id: int
    warehouse_id: Optional[int] = None
    damaged_qty: float
    reason: str
    reject_at_dock: Optional[bool] = True
    lot_number: Optional[str] = None

class PutawayPayload(BaseModel):
    warehouse_id: int
    variant_id: int
    qty: float
    dest_location_id: int
    batch_id: Optional[int] = None

class DirectReceiptLineInput(BaseModel):
    variant_id: int
    expected_qty: Optional[float] = None
    received_qty: float
    unit_cost: Optional[float] = 0.0
    damaged_qty: Optional[float] = 0.0
    rejection_reason: Optional[str] = None
    lot_number: Optional[str] = None
    expiration_date: Optional[date] = None

class DirectReceiptPayload(BaseModel):
    supplier_id: int
    facility_id: int
    warehouse_id: Optional[int] = None
    invoice_number: Optional[str] = None
    receipt_date: Optional[date] = None
    notes: Optional[str] = None
    lines: List[DirectReceiptLineInput]

@router.post("/receipts/direct")
def create_direct_receipt(
    payload: DirectReceiptPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # 1. Verificar permiso RBAC: superuser o cualquier usuario activo autenticado en el sistema
    has_perm = current_user.is_superuser or current_user.is_active
    if current_user.roles:
        for r in current_user.roles:
            perms = r.permissions or {}
            log_perms = perms.get("neo_logistics", {})
            dr_perms = log_perms.get("direct_receipts", {})
            if dr_perms.get("write") or dr_perms.get("approve") or dr_perms.get("read") or log_perms.get("receipts", {}).get("write"):
                has_perm = True
                break

    if not has_perm:
        raise HTTPException(
            status_code=403,
            detail="Su perfil de usuario no posee el permiso 'Recepciones Directas (Sin ODC)' para ejecutar esta operación."
        )

    # 2. Validar Proveedor y Sucursal
    supplier = db.query(Supplier).filter(Supplier.id == payload.supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Proveedor especificado no existe.")

    facility = db.query(Facility).filter(Facility.id == payload.facility_id).first()
    if not facility:
        raise HTTPException(status_code=404, detail="Sucursal especificada no existe.")

    # 3. Crear Registro de Orden de Compra Directa (REC-DIR-...)
    ref_code = f"REC-DIR-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    
    total_amount = sum(float(l.received_qty * (l.unit_cost or 0)) for l in payload.lines)
    receipt_dt = payload.receipt_date or date.today()
    date_done_val = datetime.combine(receipt_dt, datetime.now().time()) if isinstance(receipt_dt, date) else datetime.now()
    
    order = PurchaseOrder(
        supplier_id=payload.supplier_id,
        dest_facility_id=payload.facility_id,
        reference=ref_code,
        status='received',
        total_amount=total_amount,
        invoice_number=payload.invoice_number,
        invoice_date=receipt_dt,
        notes=f"Recepción Directa sin ODC. Factura/Guía: {payload.invoice_number or 'S/N'}. {payload.notes or ''}".strip(),
        currency_id=supplier.currency_id
    )
    db.add(order)
    db.flush()

    # 4. Determinar Almacén y Ubicación de Destino
    warehouse = None
    if payload.warehouse_id:
        warehouse = db.query(Warehouse).filter(
            Warehouse.id == payload.warehouse_id,
            Warehouse.facility_id == payload.facility_id
        ).first()
    
    if not warehouse:
        warehouse = db.query(Warehouse).filter(
            Warehouse.facility_id == payload.facility_id,
            Warehouse.is_scrap == False,
            Warehouse.is_transit == False
        ).first()

    if not warehouse:
        warehouse = Warehouse(
            facility_id=payload.facility_id,
            name=f"Almacén Principal {facility.name}",
            code=f"WH-{payload.facility_id}"
        )
        db.add(warehouse)
        db.flush()

    dest_loc = db.query(Location).filter(
        Location.warehouse_id == warehouse.id,
        Location.usage == 'INTERNAL'
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

    supplier_loc = db.query(Location).filter(Location.usage == 'EXTERNAL', Location.code == 'VEN').first()
    if not supplier_loc:
        supplier_loc = Location(name="Proveedores Externos", code="VEN", location_type="SHELF", usage="EXTERNAL")
        db.add(supplier_loc)
        db.flush()

    picking_type = db.query(StockPickingType).filter(StockPickingType.code == 'RECEIPT').first()
    if not picking_type:
        picking_type = StockPickingType(name="Recepción de Compras", code="RECEIPT", sequence_prefix="IN")
        db.add(picking_type)
        db.flush()

    user_id_val = getattr(current_user, 'id', None)

    picking = StockPicking(
        picking_type_id=picking_type.id,
        name=f"IN-{ref_code}",
        origin_document=payload.invoice_number or ref_code,
        facility_id=payload.facility_id,
        status='DONE',
        date_done=date_done_val,
        created_by_id=user_id_val
    )
    db.add(picking)
    db.flush()

    # 5. Crear Renglones e Ingresar a Inventario
    for l in payload.lines:
        variant = db.query(ProductVariant).filter(ProductVariant.id == l.variant_id).first()
        if not variant:
            continue

        cost = float(l.unit_cost or variant.average_cost or variant.standard_cost or 0)
        expected = float(l.expected_qty if l.expected_qty is not None else l.received_qty)
        po_line = PurchaseOrderLine(
            order_id=order.id,
            variant_id=l.variant_id,
            qty_ordered=expected,
            expected_base_qty=expected,
            received_base_qty=l.received_qty,
            unit_cost=cost
        )
        db.add(po_line)
        db.flush()

        qty_good = float(l.received_qty or 0)
        if qty_good > 0:
            move = StockMove(
                picking_id=picking.id,
                product_id=l.variant_id,
                location_src_id=supplier_loc.id,
                location_dest_id=dest_loc.id,
                quantity_demand=qty_good,
                quantity_done=qty_good,
                state='DONE',
                supplier_id=payload.supplier_id,
                unit_cost=cost,
                reference=ref_code,
                created_by_id=user_id_val
            )
            db.add(move)

            snapshot = db.query(InventorySnapshot).filter(
                InventorySnapshot.variant_id == l.variant_id,
                InventorySnapshot.facility_id == payload.facility_id
            ).first()

            if snapshot:
                old_qty = float(snapshot.stock_qty or 0)
                old_cost = float(snapshot.avg_cost or 0)
                total_val = (old_qty * old_cost) + (qty_good * cost)
                new_qty = old_qty + qty_good
                snapshot.stock_qty = new_qty
                snapshot.avg_cost = (total_val / new_qty) if new_qty > 0 else cost
            else:
                snapshot = InventorySnapshot(
                    variant_id=l.variant_id,
                    facility_id=payload.facility_id,
                    stock_qty=qty_good,
                    avg_cost=cost,
                    current_cost=cost
                )
                db.add(snapshot)

    db.commit()
    db.refresh(order)
    return {
        "status": "success",
        "id": order.id,
        "order_id": order.id,
        "reference": order.reference,
        "message": f"Recepción directa {ref_code} procesada exitosamente."
    }

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

    # Ubicación de Averías / Scrap (Solo si se decide conservar mercancía dañada)
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

    # 4. Actualizar Número de Factura y Fecha de Recepción en la ODC
    if payload.invoice_number:
        order.invoice_number = payload.invoice_number
    if payload.receipt_date:
        order.invoice_date = payload.receipt_date

    receipt_dt = payload.receipt_date or date.today()
    date_done_val = datetime.combine(receipt_dt, datetime.now().time()) if isinstance(receipt_dt, date) else datetime.now()

    # 5. Crear el Documento de Picking WMS
    user_id_val = getattr(current_user, 'id', None)

    picking = StockPicking(
        picking_type_id=picking_type.id,
        name=f"IN-{order.reference}",
        origin_document=payload.invoice_number or order.reference,
        facility_id=order.dest_facility_id,
        status='DONE',
        date_done=date_done_val,
        created_by_id=user_id_val
    )
    db.add(picking)
    db.flush()

    total_expected = 0
    total_received = 0
    rejection_notes = []

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

        # Si se rechazó en muelle, solo la cantidad en buen estado ingresa a inventario
        po_line.received_base_qty = float(po_line.received_base_qty or 0) + qty_good
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

        # A) Stock Move para Unidades en Buen Estado (Ingresan a Inventario)
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
                reference=order.reference,
                created_by_id=user_id_val
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

        # B) Manejo de Rechazo vs Avería Interna
        if qty_damaged > 0:
            if in_line.reject_at_dock:
                # Rechazo en Puerta: NO entra a inventario SCRAP, solo se registra para la acta/comprobante
                variant = db.query(ProductVariant).filter(ProductVariant.id == in_line.variant_id).first()
                sku = variant.sku if variant else "N/A"
                reason_str = in_line.rejection_reason or "Rechazado en muelle / Devuelto al chofer"
                rejection_notes.append(f"{sku}: {qty_damaged} unds devueltas al chofer ({reason_str})")
            else:
                # Merma/Avería Interna: Se conserva y mueve a ubicación SCRAP
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
                    reference=f"SCRAP-{order.reference}",
                    created_by_id=user_id_val
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

    user_id_val = getattr(current_user, 'id', None)
    move = StockMove(
        product_id=payload.variant_id,
        location_src_id=supplier_loc.id if supplier_loc else 1,
        location_dest_id=scrap_loc.id,
        quantity_demand=payload.damaged_qty,
        quantity_done=payload.damaged_qty,
        state='DONE',
        batch_id=batch_id,
        unit_cost=unit_cost,
        reference=f"DISCREPANCY-{order.reference}: {payload.reason}",
        created_by_id=user_id_val
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

    is_confirmed = (order.status == 'received')
    items = []
    has_discrepancies = False
    for l in order.lines:
        variant = db.query(ProductVariant).filter(ProductVariant.id == l.variant_id).first()
        product_name = variant.product.name if (variant and variant.product) else f"SKU: {l.variant_id}"
        sku = variant.sku if variant else "N/A"
        barcode = variant.barcode if variant else "N/A"
        exp_q = float(l.expected_base_qty or 0)
        rec_q = float(l.received_base_qty or 0) if is_confirmed else 0.0
        rej_q = max(0.0, exp_q - rec_q) if is_confirmed else 0.0
        if is_confirmed and rej_q > 0:
            has_discrepancies = True
            
        items.append({
            "line_id": l.id,
            "variant_id": l.variant_id,
            "sku": sku,
            "barcode": barcode,
            "product_name": product_name,
            "expected_qty": exp_q,
            "received_qty": rec_q,
            "rejected_qty": rej_q
        })

    ticket_data = {
        "order_reference": order.reference,
        "created_at": order.created_at.strftime("%d/%m/%Y %H:%M") if order.created_at else "",
        "supplier_name": supplier.name if supplier else "N/A",
        "facility_name": facility.name if facility else "N/A",
        "order_status": order.status,
        "is_confirmed": is_confirmed,
        "has_discrepancies": has_discrepancies,
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
        if batch.is_quarantined:
            status = "BLOCKED"
        days_to_expire = None
        if batch.expiry_date:
            days_to_expire = (batch.expiry_date - today).days
            if status != "BLOCKED":
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
            "is_quarantined": bool(batch.is_quarantined),
            "variant_id": variant.id,
            "sku": variant.sku,
            "product_name": product.name,
            "total_stock": total_stock
        })

    return results

@router.post("/lots/{batch_id}/toggle-quarantine")
def toggle_batch_quarantine(
    batch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Validar Permisos RBAC
    has_perm = False
    if current_user.is_superuser:
        has_perm = True
    elif current_user.roles:
        for r in current_user.roles:
            perms = r.permissions or {}
            log_perms = perms.get("neo_logistics", {})
            lot_perms = log_perms.get("lots", {})
            if lot_perms.get("write") or lot_perms.get("approve") or lot_perms.get("quarantine"):
                has_perm = True
                break

    if not has_perm:
        raise HTTPException(
            status_code=403,
            detail="Su perfil de usuario no posee el permiso de Calidad/Control de Lotes ('quarantine') para ejecutar esta operación."
        )

    batch = db.query(Batch).filter(Batch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Lote no encontrado.")
    
    batch.is_quarantined = not (batch.is_quarantined or False)
    
    # 1. Ubicación de Cuarentena y Ubicación de Stock Interno
    quarantine_loc = db.query(Location).filter(Location.usage == 'INVENTORY', Location.code == 'QUARANTINE').first()
    if not quarantine_loc:
        quarantine_loc = Location(name="Zona de Cuarentena / Calidad", code="QUARANTINE", location_type="SHELF", usage="INVENTORY")
        db.add(quarantine_loc)
        db.flush()

    stock_loc = db.query(Location).filter(Location.usage == 'INTERNAL').first()
    src_loc_id = stock_loc.id if stock_loc else 1
    dest_loc_id = quarantine_loc.id

    if not batch.is_quarantined:
        # Liberación de Cuarentena -> Stock Disponible
        src_loc_id, dest_loc_id = dest_loc_id, src_loc_id

    # 2. Obtener saldo actual para el asiento del Kardex
    snap = db.query(InventorySnapshot).filter(InventorySnapshot.variant_id == batch.product_variant_id).first()
    qty_move = float(snap.stock_qty) if snap and snap.stock_qty else 1.0

    # 3. Asentar Movimiento de Kardex con Auditoría de Usuario (stock_moves)
    user_ident = getattr(current_user, 'full_name', None) or getattr(current_user, 'email', 'Usuario WMS')
    action_prefix = "BLOQUEO-CUARENTENA" if batch.is_quarantined else "LIBERACION-CUARENTENA"
    ref_label = f"{action_prefix}-{batch.batch_number} | Resp: {user_ident}"

    user_id_val = getattr(current_user, 'id', None)
    move = StockMove(
        product_id=batch.product_variant_id,
        location_src_id=src_loc_id,
        location_dest_id=dest_loc_id,
        quantity_demand=qty_move,
        quantity_done=qty_move,
        state='DONE',
        batch_id=batch.id,
        reference=ref_label,
        created_by_id=user_id_val
    )
    db.add(move)
    db.commit()
    db.refresh(batch)

    state_str = "RETENIDO EN CUARENTENA (BLOQUEADO PARA PICKING)" if batch.is_quarantined else "LIBERADO A STOCK DISPONIBLE"
    return {
        "status": "success",
        "is_quarantined": batch.is_quarantined,
        "move_id": move.id,
        "message": f"Lote {batch.batch_number} {state_str}. Asiento registrado en Kardex ({ref_label})."
    }

@router.get("/locations/tree")
def get_locations_tree(facility_id: Optional[int] = None, db: Session = Depends(get_db)):
    warehouses_q = db.query(Warehouse)
    if facility_id:
        warehouses_q = warehouses_q.filter(Warehouse.facility_id == facility_id)
    
    warehouses = warehouses_q.all()
    tree = []

    facilities_map = {f.id: f.name for f in db.query(Facility).all()}

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
                "capacity_volume": float(l.capacity_volume or 100.0),
                "usage": l.usage,
                "is_blocked": l.is_blocked,
                "parent_id": l.parent_id
            })
        
        fac_name = facilities_map.get(wh.facility_id, f"Sucursal #{wh.facility_id}") if wh.facility_id else "General / Global"
        tree.append({
            "id": wh.id,
            "name": wh.name,
            "code": wh.code,
            "facility_id": wh.facility_id,
            "facility_name": fac_name,
            "requires_dock_staging": wh.requires_dock_staging,
            "locations": loc_data
        })

    return tree

@router.post("/putaway")
def execute_putaway(
    payload: PutawayPayload, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
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

    user_id_val = getattr(current_user, 'id', None)

    picking = StockPicking(
        picking_type_id=picking_type.id,
        name=f"REUBICACION-{warehouse.code}-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        origin_document=f"Reubicación Interna {warehouse.name}",
        facility_id=warehouse.facility_id,
        status='DONE',
        date_done=func.now(),
        created_by_id=user_id_val,
        shipped_by_id=user_id_val,
        received_by_id=user_id_val
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
        reference=f"REUBICACION-{warehouse.code}",
        created_by_id=user_id_val
    )
    db.add(move)
    db.commit()

    return {"message": "Reubicación de mercancía realizada con éxito", "move_id": move.id}




# ==============================================================================
# OUTBOUND SHIPMENTS & PICKING WAVES (SALIDAS Y DESPACHOS WMS)
# ==============================================================================

class ShipmentLineInput(BaseModel):
    variant_id: int
    quantity: float
    location_src_id: Optional[int] = None
    batch_id: Optional[int] = None

class CreateShipmentPayload(BaseModel):
    facility_id: int
    destination_name: Optional[str] = "Cliente / Despacho"
    origin_document: Optional[str] = None
    scheduled_date: Optional[datetime] = None
    lines: List[ShipmentLineInput]

@router.get("/shipments")
def get_wms_shipments(
    facility_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Obtener el listado de despachos / órdenes de picking de salida (DELIVERY / OUT).
    """
    picking_types = db.query(StockPickingType).filter(
        StockPickingType.code.in_(["DELIVERY", "OUT", "PICKING"])
    ).all()
    type_ids = [pt.id for pt in picking_types]
    
    query = db.query(StockPicking)
    if type_ids:
        query = query.filter(StockPicking.picking_type_id.in_(type_ids))
    if facility_id:
        query = query.filter(StockPicking.facility_id == facility_id)
    if status:
        query = query.filter(StockPicking.status == status)
        
    pickings = query.order_by(StockPicking.created_at.desc()).limit(100).all()
    
    results = []
    for p in pickings:
        moves_data = []
        for m in p.moves:
            variant = db.query(ProductVariant).filter(ProductVariant.id == m.product_id).first()
            product_name = variant.product.name if variant and variant.product else "Producto Desconocido"
            sku = variant.sku if variant else "N/A"
            loc_src = db.query(Location).filter(Location.id == m.location_src_id).first()
            loc_dest = db.query(Location).filter(Location.id == m.location_dest_id).first()
            
            moves_data.append({
                "id": m.id,
                "variant_id": m.product_id,
                "product_name": product_name,
                "sku": sku,
                "quantity_demand": float(m.quantity_demand or 0),
                "quantity_done": float(m.quantity_done or 0),
                "location_src_name": loc_src.name if loc_src else "N/A",
                "location_dest_name": loc_dest.name if loc_dest else "N/A",
                "unit_cost": float(m.unit_cost or 0)
            })
            
        results.append({
            "id": p.id,
            "name": p.name,
            "origin_document": p.origin_document or "N/A",
            "facility_id": p.facility_id,
            "status": p.status,
            "scheduled_date": p.scheduled_date.isoformat() if p.scheduled_date else None,
            "date_done": p.date_done.isoformat() if p.date_done else None,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "total_items": len(moves_data),
            "moves": moves_data
        })
        
    return results

@router.post("/shipments")
def create_wms_shipment(
    payload: CreateShipmentPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Crear una nueva Orden de Despacho / Picking de Salida.
    """
    facility = db.query(Facility).filter(Facility.id == payload.facility_id).first()
    if not facility:
        raise HTTPException(status_code=404, detail="Sucursal no encontrada.")
        
    picking_type = db.query(StockPickingType).filter(StockPickingType.code == 'DELIVERY').first()
    if not picking_type:
        picking_type = StockPickingType(name="Despachos a Clientes", code="DELIVERY", sequence_prefix="OUT")
        db.add(picking_type)
        db.flush()
        
    ref_code = f"OUT-{datetime.now().strftime('%Y%m%d%H%M%S')}"
    user_id_val = getattr(current_user, 'id', None)
    
    picking = StockPicking(
        picking_type_id=picking_type.id,
        name=ref_code,
        origin_document=payload.origin_document or "Despacho Manual",
        facility_id=payload.facility_id,
        status='READY',
        scheduled_date=payload.scheduled_date or datetime.now(),
        created_by_id=user_id_val
    )
    db.add(picking)
    db.flush()
    
    customer_loc = db.query(Location).filter(Location.usage == 'CUSTOMER').first()
    if not customer_loc:
        customer_loc = Location(name="Clientes / Salidas", code="OUT", location_type="SHELF", usage="CUSTOMER")
        db.add(customer_loc)
        db.flush()
        
    for l in payload.lines:
        variant = db.query(ProductVariant).filter(ProductVariant.id == l.variant_id).first()
        if not variant:
            continue
            
        src_loc_id = l.location_src_id
        if not src_loc_id:
            internal_loc = db.query(Location).filter(Location.usage == 'INTERNAL').first()
            src_loc_id = internal_loc.id if internal_loc else customer_loc.id
            
        move = StockMove(
            picking_id=picking.id,
            product_id=l.variant_id,
            location_src_id=src_loc_id,
            location_dest_id=customer_loc.id,
            quantity_demand=l.quantity,
            quantity_done=0.0,
            state='READY',
            batch_id=l.batch_id,
            unit_cost=float(variant.average_cost or variant.standard_cost or 0),
            reference=ref_code,
            created_by_id=user_id_val
        )
        db.add(move)
        
    db.commit()
    db.refresh(picking)
    
    return {
        "status": "success",
        "id": picking.id,
        "name": picking.name,
        "message": f"Orden de Despacho {ref_code} creada exitosamente en estado READY."
    }

@router.post("/shipments/{picking_id}/execute")
def execute_wms_shipment(
    picking_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Confirmar y procesar la salida física del picking.
    """
    picking = db.query(StockPicking).filter(StockPicking.id == picking_id).first()
    if not picking:
        raise HTTPException(status_code=404, detail="Orden de despacho no encontrada.")
        
    if picking.status == 'DONE':
        raise HTTPException(status_code=400, detail="Esta orden de despacho ya fue procesada anteriormente.")
        
    for m in picking.moves:
        qty_to_dispatch = float(m.quantity_demand or 0)
        m.quantity_done = qty_to_dispatch
        m.state = 'DONE'
        
        snapshot = db.query(InventorySnapshot).filter(
            InventorySnapshot.variant_id == m.product_id,
            InventorySnapshot.facility_id == picking.facility_id
        ).first()
        
        if snapshot:
            snapshot.stock_qty = max(0.0, float(snapshot.stock_qty or 0) - qty_to_dispatch)
            
    picking.status = 'DONE'
    picking.date_done = datetime.now()
    
    db.commit()
    
    return {
        "status": "success",
        "id": picking.id,
        "name": picking.name,
        "message": f"Despacho {picking.name} completado y procesado exitosamente."
    }

@router.get("/picking-waves")
def get_picking_waves(
    facility_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Obtener las olas de picking agrupadas por pasillo / ubicación para optimizar las rutas de salida del almacenista.
    """
    query = db.query(StockMove).join(StockPicking).filter(
        StockPicking.status.in_(["READY", "WAITING", "DRAFT"])
    )
    if facility_id:
        query = query.filter(StockPicking.facility_id == facility_id)
        
    moves = query.all()
    
    location_groups = {}
    for m in moves:
        loc = db.query(Location).filter(Location.id == m.location_src_id).first()
        loc_name = loc.name if loc else "Ubicación General"
        loc_code = loc.code if loc else "STOCK"
        
        variant = db.query(ProductVariant).filter(ProductVariant.id == m.product_id).first()
        product_name = variant.product.name if variant and variant.product else "Producto Desconocido"
        sku = variant.sku if variant else "N/A"
        
        if loc_code not in location_groups:
            location_groups[loc_code] = {
                "location_code": loc_code,
                "location_name": loc_name,
                "total_items": 0,
                "items": []
            }
            
        location_groups[loc_code]["items"].append({
            "move_id": m.id,
            "picking_id": m.picking_id,
            "picking_name": m.picking.name if m.picking else "N/A",
            "variant_id": m.product_id,
            "product_name": product_name,
            "sku": sku,
            "quantity_demand": float(m.quantity_demand or 0),
            "quantity_done": float(m.quantity_done or 0)
        })
        location_groups[loc_code]["total_items"] += 1
        
    return list(location_groups.values())

# ==============================================================================
# ALGORITMO Y SUGERENCIA FEFO (FIRST EXPIRED, FIRST OUT)
# ==============================================================================

@router.get("/fefo-suggestions")
def get_fefo_suggestions(
    variant_id: int,
    facility_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Obtener la lista de lotes disponibles para una variante ordenados estrictamente por estrategia FEFO
    (First Expired, First Out - los lotes que vencen primero van primero). Excluye lotes en cuarentena.
    """
    query = db.query(Batch).filter(
        Batch.product_variant_id == variant_id,
        Batch.is_quarantined == False
    )
    
    batches = query.order_by(Batch.expiry_date.asc().nulls_last()).all()
    
    results = []
    today = date.today()
    for idx, b in enumerate(batches):
        days_to_expire = (b.expiry_date - today).days if b.expiry_date else None
        results.append({
            "id": b.id,
            "batch_number": b.batch_number,
            "expiry_date": b.expiry_date.isoformat() if b.expiry_date else None,
            "manufacturing_date": b.manufacturing_date.isoformat() if b.manufacturing_date else None,
            "days_to_expire": days_to_expire,
            "is_quarantined": b.is_quarantined,
            "is_fefo_recommended": (idx == 0)
        })
        
    return results

# ==============================================================================
# DÍA 3: FLUJO DE CUARENTENA E INSPECCIÓN TÉCNICA
# ==============================================================================

class QuarantineReleasePayload(BaseModel):
    batch_id: int
    action: str # 'RELEASE' o 'SCRAP'
    notes: Optional[str] = None

@router.get("/quarantine")
def get_quarantined_items(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Obtener el listado de lotes e ítems actualmente en estado de Cuarentena.
    """
    batches = db.query(Batch).filter(Batch.is_quarantined == True).all()
    results = []
    for b in batches:
        variant = db.query(ProductVariant).filter(ProductVariant.id == b.product_variant_id).first()
        product_name = variant.product.name if variant and variant.product else "Producto Desconocido"
        sku = variant.sku if variant else "N/A"
        
        results.append({
            "id": b.id,
            "batch_number": b.batch_number,
            "product_name": product_name,
            "sku": sku,
            "expiry_date": b.expiry_date.isoformat() if b.expiry_date else None,
            "manufacturing_date": b.manufacturing_date.isoformat() if b.manufacturing_date else None,
            "is_quarantined": True
        })
    return results

@router.post("/quarantine/release")
def process_quarantine_release(
    payload: QuarantineReleasePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Procesar inspección técnica: Aprobar lote (quitar cuarentena) o enviar a merma/scrap.
    """
    batch = db.query(Batch).filter(Batch.id == payload.batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Lote no encontrado.")
        
    if payload.action == 'RELEASE':
        batch.is_quarantined = False
        msg = f"Lote {batch.batch_number} liberado de cuarentena y marcado como disponible."
    elif payload.action == 'SCRAP':
        batch.is_quarantined = True
        msg = f"Lote {batch.batch_number} marcado como rechazado/merma."
    else:
        raise HTTPException(status_code=400, detail="Acción no válida. Use RELEASE o SCRAP.")
        
    db.commit()
    return {"status": "success", "message": msg}

# ==============================================================================
# DÍA 4: MAPA TÉRMICO Y OCUPACIÓN VOLUMÉTRICA POR UBICACIÓN
# ==============================================================================

@router.get("/locations/occupancy")
def get_locations_occupancy(
    facility_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Obtener el mapa térmico de ocupación volumétrica y porcentaje de llenado por ubicación/estante.
    """
    query = db.query(Location)
    if facility_id:
        query = query.join(Warehouse).filter(Warehouse.facility_id == facility_id)
        
    locations = query.all()
    results = []
    
    for loc in locations:
        cap_vol = float(loc.capacity_volume or 100.0)
        moves_count = db.query(func.count(StockMove.id)).filter(
            StockMove.location_dest_id == loc.id,
            StockMove.state == 'DONE'
        ).scalar() or 0
        
        estimated_used = min(cap_vol, float(moves_count * 5.0))
        pct_used = round((estimated_used / cap_vol) * 100.0, 1) if cap_vol > 0 else 0.0
        
        thermal_status = "LOW"
        if pct_used >= 90.0:
            thermal_status = "CRITICAL"
        elif pct_used >= 70.0:
            thermal_status = "MEDIUM"
            
        results.append({
            "id": loc.id,
            "name": loc.name,
            "code": loc.code,
            "barcode": loc.barcode,
            "capacity_volume": cap_vol,
            "used_volume": estimated_used,
            "percentage_used": pct_used,
            "thermal_status": thermal_status,
            "is_blocked": loc.is_blocked
        })
        
    return results



