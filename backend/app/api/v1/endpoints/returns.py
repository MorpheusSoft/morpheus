from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func, or_, desc
from pydantic import BaseModel
from typing import List, Optional, Any
from datetime import date, datetime
from decimal import Decimal

from app.api.deps import get_db, get_current_active_user
from app.models.purchasing import PurchaseOrder, PurchaseOrderLine
from app.models.inventory import (
    SupplierReturn, SupplierReturnLine, VendorSwap, VendorSwapExecution,
    StockMove, Batch, InventorySnapshot, Location, Warehouse,
    ProductVariant, Product
)
from app.models.core import Facility, Supplier, User

router = APIRouter()

# ==============================================================================
# PYDANTIC SCHEMAS
# ==============================================================================

class ReturnLineInput(BaseModel):
    variant_id: int
    batch_id: Optional[int] = None
    quantity: float
    unit_cost: Optional[float] = 0.0
    reason: Optional[str] = "DEFECTO_FABRICA"

class SupplierReturnCreate(BaseModel):
    facility_id: int
    supplier_id: int
    purchase_order_id: Optional[int] = None
    carrier_name: Optional[str] = None
    carrier_id_doc: Optional[str] = None
    carrier_plate: Optional[str] = None
    notes: Optional[str] = None
    lines: List[ReturnLineInput]

class SupplierReturnDispatch(BaseModel):
    carrier_name: Optional[str] = None
    carrier_id_doc: Optional[str] = None
    carrier_plate: Optional[str] = None
    notes: Optional[str] = None

class VendorSwapCreate(BaseModel):
    facility_id: int
    supplier_id: int
    variant_id: int
    damaged_batch_id: Optional[int] = None
    qty_quarantined: float
    damage_reason: Optional[str] = None
    notes: Optional[str] = None

class VendorSwapExecute(BaseModel):
    qty: float
    new_batch_number: str
    new_expiration_date: date
    carrier_name: Optional[str] = None
    carrier_plate: Optional[str] = None


# ==============================================================================
# 1. DEVOLUCIONES A PROVEEDOR (RTV)
# ==============================================================================

@router.get("/returns")
def list_supplier_returns(
    facility_id: Optional[int] = None,
    supplier_id: Optional[int] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Listado general de órdenes de devolución a proveedor (RTV)."""
    q = db.query(SupplierReturn).options(
        selectinload(SupplierReturn.facility),
        selectinload(SupplierReturn.supplier),
        selectinload(SupplierReturn.purchase_order),
        selectinload(SupplierReturn.dispatched_by),
        selectinload(SupplierReturn.conciliated_by),
        selectinload(SupplierReturn.lines).selectinload(SupplierReturnLine.variant).selectinload(ProductVariant.product),
        selectinload(SupplierReturn.lines).selectinload(SupplierReturnLine.batch)
    )

    if facility_id:
        q = q.filter(SupplierReturn.facility_id == facility_id)
    if supplier_id:
        q = q.filter(SupplierReturn.supplier_id == supplier_id)
    if status:
        q = q.filter(SupplierReturn.status == status)
    if search:
        pattern = f"%{search}%"
        q = q.join(Supplier, SupplierReturn.supplier_id == Supplier.id).filter(
            or_(
                SupplierReturn.return_number.ilike(pattern),
                Supplier.name.ilike(pattern),
                SupplierReturn.carrier_name.ilike(pattern),
                SupplierReturn.carrier_plate.ilike(pattern)
            )
        )

    total = q.count()
    items = q.order_by(desc(SupplierReturn.id)).offset(skip).limit(limit).all()

    results = []
    for ret in items:
        results.append({
            "id": ret.id,
            "return_number": ret.return_number,
            "facility_id": ret.facility_id,
            "facility_name": ret.facility.name if ret.facility else "N/A",
            "supplier_id": ret.supplier_id,
            "supplier_name": ret.supplier.name if ret.supplier else "N/A",
            "supplier_tax_id": ret.supplier.tax_id if ret.supplier else "N/A",
            "purchase_order_id": ret.purchase_order_id,
            "purchase_order_number": ret.purchase_order.po_number if ret.purchase_order else (ret.purchase_order.reference if ret.purchase_order else None),
            "status": ret.status,
            "total_estimated_amount": float(ret.total_estimated_amount or 0),
            "carrier_name": ret.carrier_name,
            "carrier_id_doc": ret.carrier_id_doc,
            "carrier_plate": ret.carrier_plate,
            "notes": ret.notes,
            "dispatched_at": ret.dispatched_at.strftime("%d/%m/%Y %H:%M") if ret.dispatched_at else None,
            "dispatched_by": ret.dispatched_by.full_name if ret.dispatched_by else None,
            "buyer_approved_at": ret.buyer_approved_at.strftime("%d/%m/%Y %H:%M") if ret.buyer_approved_at else None,
            "credit_note_number": ret.credit_note_number,
            "credit_note_amount": float(ret.credit_note_amount) if ret.credit_note_amount else None,
            "credit_note_date": ret.credit_note_date.strftime("%d/%m/%Y") if ret.credit_note_date else None,
            "conciliated_at": ret.conciliated_at.strftime("%d/%m/%Y %H:%M") if ret.conciliated_at else None,
            "conciliated_by": ret.conciliated_by.full_name if ret.conciliated_by else None,
            "created_at": ret.created_at.strftime("%d/%m/%Y %H:%M") if ret.created_at else None,
            "lines_count": len(ret.lines),
            "lines": [
                {
                    "id": l.id,
                    "variant_id": l.variant_id,
                    "sku": l.variant.sku if l.variant else "N/A",
                    "product_name": l.variant.product.name if (l.variant and l.variant.product) else f"SKU {l.variant_id}",
                    "batch_id": l.batch_id,
                    "batch_number": l.batch.batch_number if l.batch else "S/L",
                    "quantity": float(l.quantity or 0),
                    "unit_cost": float(l.unit_cost or 0),
                    "subtotal": float(l.subtotal or 0),
                    "reason": l.reason
                }
                for l in ret.lines
            ]
        })

    return {"total": total, "items": results}


@router.get("/returns/{return_id}")
def get_supplier_return(
    return_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Detalle de una orden de devolución individual."""
    ret = db.query(SupplierReturn).options(
        selectinload(SupplierReturn.facility),
        selectinload(SupplierReturn.supplier),
        selectinload(SupplierReturn.purchase_order),
        selectinload(SupplierReturn.dispatched_by),
        selectinload(SupplierReturn.conciliated_by),
        selectinload(SupplierReturn.lines).selectinload(SupplierReturnLine.variant).selectinload(ProductVariant.product),
        selectinload(SupplierReturn.lines).selectinload(SupplierReturnLine.batch)
    ).filter(SupplierReturn.id == return_id).first()

    if not ret:
        raise HTTPException(status_code=404, detail="Orden de devolución no encontrada.")

    return {
        "id": ret.id,
        "return_number": ret.return_number,
        "facility_id": ret.facility_id,
        "facility_name": ret.facility.name if ret.facility else "N/A",
        "supplier_id": ret.supplier_id,
        "supplier_name": ret.supplier.name if ret.supplier else "N/A",
        "supplier_tax_id": ret.supplier.tax_id if ret.supplier else "N/A",
        "purchase_order_id": ret.purchase_order_id,
        "purchase_order_number": ret.purchase_order.po_number if ret.purchase_order else (ret.purchase_order.reference if ret.purchase_order else None),
        "status": ret.status,
        "total_estimated_amount": float(ret.total_estimated_amount or 0),
        "carrier_name": ret.carrier_name,
        "carrier_id_doc": ret.carrier_id_doc,
        "carrier_plate": ret.carrier_plate,
        "notes": ret.notes,
        "dispatched_at": ret.dispatched_at.strftime("%d/%m/%Y %H:%M") if ret.dispatched_at else None,
        "dispatched_by": ret.dispatched_by.full_name if ret.dispatched_by else None,
        "credit_note_number": ret.credit_note_number,
        "credit_note_amount": float(ret.credit_note_amount) if ret.credit_note_amount else None,
        "credit_note_date": ret.credit_note_date.strftime("%d/%m/%Y") if ret.credit_note_date else None,
        "conciliated_at": ret.conciliated_at.strftime("%d/%m/%Y %H:%M") if ret.conciliated_at else None,
        "lines": [
            {
                "id": l.id,
                "variant_id": l.variant_id,
                "sku": l.variant.sku if l.variant else "N/A",
                "product_name": l.variant.product.name if (l.variant and l.variant.product) else f"SKU {l.variant_id}",
                "batch_id": l.batch_id,
                "batch_number": l.batch.batch_number if l.batch else "S/L",
                "quantity": float(l.quantity or 0),
                "unit_cost": float(l.unit_cost or 0),
                "subtotal": float(l.subtotal or 0),
                "reason": l.reason
            }
            for l in ret.lines
        ]
    }


@router.post("/returns")
def create_supplier_return(
    payload: SupplierReturnCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Crea una nueva orden de devolución a proveedor en estado Borrador (DRAFT)."""
    if not payload.lines:
        raise HTTPException(status_code=400, detail="Debe incluir al menos un producto para la devolución.")

    facility = db.query(Facility).filter(Facility.id == payload.facility_id).first()
    if not facility:
        raise HTTPException(status_code=404, detail="Sucursal / Instalación no encontrada.")

    supplier = db.query(Supplier).filter(Supplier.id == payload.supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado.")

    if payload.purchase_order_id:
        po = db.query(PurchaseOrder).filter(PurchaseOrder.id == payload.purchase_order_id).first()
        if not po:
            raise HTTPException(status_code=404, detail="Orden de compra referenciada no existe.")

    # Generar correlativo RTV
    timestamp_str = datetime.now().strftime("%Y%m%d-%H%M%S")
    return_number = f"RTV-{timestamp_str}"

    total_amount = Decimal(0)
    return_obj = SupplierReturn(
        return_number=return_number,
        facility_id=payload.facility_id,
        supplier_id=payload.supplier_id,
        purchase_order_id=payload.purchase_order_id,
        status="DRAFT",
        total_estimated_amount=0,
        carrier_name=payload.carrier_name,
        carrier_id_doc=payload.carrier_id_doc,
        carrier_plate=payload.carrier_plate,
        notes=payload.notes,
        created_by_id=current_user.id
    )
    db.add(return_obj)
    db.flush()

    for line_data in payload.lines:
        variant = db.query(ProductVariant).filter(ProductVariant.id == line_data.variant_id).first()
        if not variant:
            raise HTTPException(status_code=404, detail=f"Variante #{line_data.variant_id} no encontrada.")

        cost = Decimal(str(line_data.unit_cost or variant.average_cost or variant.standard_cost or 0))
        qty = Decimal(str(line_data.quantity))
        subtotal = cost * qty
        total_amount += subtotal

        return_line = SupplierReturnLine(
            return_id=return_obj.id,
            variant_id=line_data.variant_id,
            batch_id=line_data.batch_id,
            quantity=qty,
            unit_cost=cost,
            subtotal=subtotal,
            reason=line_data.reason or "DEFECTO_FABRICA"
        )
        db.add(return_line)

    return_obj.total_estimated_amount = total_amount
    db.commit()
    db.refresh(return_obj)

    return {
        "status": "success",
        "message": f"Orden de devolución {return_obj.return_number} creada con éxito.",
        "id": return_obj.id,
        "return_number": return_obj.return_number
    }


@router.post("/returns/{return_id}/dispatch")
def dispatch_supplier_return(
    return_id: int,
    payload: Optional[SupplierReturnDispatch] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Ejecuta el despacho físico de la devolución en el muelle de carga:
    - Decrementa el Kardex y actualiza los saldos de inventario (StockMove).
    - Asienta datos del transportista.
    - Cambia estado a DISPATCHED.
    """
    ret = db.query(SupplierReturn).options(
        selectinload(SupplierReturn.lines).selectinload(SupplierReturnLine.variant)
    ).filter(SupplierReturn.id == return_id).first()

    if not ret:
        raise HTTPException(status_code=404, detail="Orden de devolución no encontrada.")

    if ret.status != "DRAFT":
        raise HTTPException(status_code=400, detail=f"La orden no puede ser despachada porque su estado es '{ret.status}'.")

    if not ret.lines:
        raise HTTPException(status_code=400, detail="La orden de devolución no tiene renglones.")

    # 1. Ubicaciones: Stock Interno -> Proveedor Externo
    stock_loc = db.query(Location).filter(Location.usage == "INTERNAL").first()
    if not stock_loc:
        stock_loc = Location(name="Almacén Principal", code="STOCK-INT", location_type="INTERNAL", usage="INTERNAL")
        db.add(stock_loc)
        db.flush()

    supplier_loc = db.query(Location).filter(Location.usage == "EXTERNAL", Location.code == "VEN").first()
    if not supplier_loc:
        supplier_loc = db.query(Location).filter(Location.usage == "EXTERNAL").first()
        if not supplier_loc:
            supplier_loc = Location(name="Ubicación Proveedores", code="VEN", location_type="SUPPLIER", usage="EXTERNAL")
            db.add(supplier_loc)
            db.flush()

    # 2. Actualizar datos de transportista si se proporcionan
    if payload:
        if payload.carrier_name:
            ret.carrier_name = payload.carrier_name
        if payload.carrier_id_doc:
            ret.carrier_id_doc = payload.carrier_id_doc
        if payload.carrier_plate:
            ret.carrier_plate = payload.carrier_plate
        if payload.notes:
            ret.notes = f"{ret.notes or ''}\n{payload.notes}".strip()

    # 3. Generar movimientos de salida en Kardex (StockMove) y descontar Snapshot
    user_ident = getattr(current_user, "full_name", None) or getattr(current_user, "email", "Usuario WMS")
    ref_label = f"RTV-SALIDA-{ret.return_number} | Chofer: {ret.carrier_name or 'N/A'}"

    for line in ret.lines:
        qty_to_deduct = float(line.quantity)
        line_cost = float(line.unit_cost or 0)

        # Kardex StockMove OUT
        move = StockMove(
            product_id=line.variant_id,
            location_src_id=stock_loc.id,
            location_dest_id=supplier_loc.id,
            quantity_demand=qty_to_deduct,
            quantity_done=qty_to_deduct,
            state="DONE",
            batch_id=line.batch_id,
            supplier_id=ret.supplier_id,
            unit_cost=line_cost,
            reference=ref_label,
            created_by_id=current_user.id
        )
        db.add(move)

        # Actualizar Snapshot
        snap = db.query(InventorySnapshot).filter(
            InventorySnapshot.variant_id == line.variant_id,
            InventorySnapshot.facility_id == ret.facility_id
        ).first()

        if snap:
            current_qty = float(snap.stock_qty or 0)
            snap.stock_qty = max(0.0, current_qty - qty_to_deduct)

    ret.status = "DISPATCHED"
    ret.dispatched_at = datetime.now()
    ret.dispatched_by_id = current_user.id

    db.commit()
    db.refresh(ret)

    return {
        "status": "success",
        "message": f"Devolución {ret.return_number} despachada correctamente. Inventario rebajado.",
        "return_number": ret.return_number,
        "dispatched_at": ret.dispatched_at.strftime("%d/%m/%Y %H:%M")
    }


@router.get("/returns/{return_id}/ticket-80mm")
def get_supplier_return_ticket_80mm(
    return_id: int,
    db: Session = Depends(get_db)
):
    """Comprobante térmico de salida 80mm para firma legal del transportista."""
    ret = db.query(SupplierReturn).options(
        selectinload(SupplierReturn.facility),
        selectinload(SupplierReturn.supplier),
        selectinload(SupplierReturn.purchase_order),
        selectinload(SupplierReturn.dispatched_by),
        selectinload(SupplierReturn.lines).selectinload(SupplierReturnLine.variant).selectinload(ProductVariant.product),
        selectinload(SupplierReturn.lines).selectinload(SupplierReturnLine.batch)
    ).filter(SupplierReturn.id == return_id).first()

    if not ret:
        raise HTTPException(status_code=404, detail="Orden de devolución no encontrada.")

    items = []
    for l in ret.lines:
        variant = l.variant
        product_name = variant.product.name if (variant and variant.product) else f"SKU: {l.variant_id}"
        sku = variant.sku if variant else "N/A"
        batch_num = l.batch.batch_number if l.batch else "S/L"
        expiry = l.batch.expiry_date.strftime("%d/%m/%Y") if (l.batch and l.batch.expiry_date) else None

        items.append({
            "variant_id": l.variant_id,
            "sku": sku,
            "product_name": product_name,
            "batch_number": batch_num,
            "expiry_date": expiry,
            "quantity": float(l.quantity),
            "unit_cost": float(l.unit_cost or 0),
            "subtotal": float(l.subtotal or 0),
            "reason": l.reason
        })

    return {
        "type": "RTV_DISPATCH",
        "return_number": ret.return_number,
        "created_at": ret.created_at.strftime("%d/%m/%Y %H:%M") if ret.created_at else "",
        "dispatched_at": ret.dispatched_at.strftime("%d/%m/%Y %H:%M") if ret.dispatched_at else "",
        "facility_name": ret.facility.name if ret.facility else "Almacén Principal",
        "supplier_name": ret.supplier.name if ret.supplier else "N/A",
        "supplier_tax_id": ret.supplier.tax_id if ret.supplier else "N/A",
        "po_reference": ret.purchase_order.po_number if ret.purchase_order else (ret.purchase_order.reference if ret.purchase_order else "SIN ORDEN PREVIA"),
        "carrier_name": ret.carrier_name or "Sin registrar",
        "carrier_id_doc": ret.carrier_id_doc or "N/A",
        "carrier_plate": ret.carrier_plate or "N/A",
        "dispatched_by": ret.dispatched_by.full_name if ret.dispatched_by else "Operador WMS",
        "status": ret.status,
        "total_amount": float(ret.total_estimated_amount or 0),
        "notes": ret.notes,
        "items": items
    }


# ==============================================================================
# 2. CANJES 1 A 1 DE MERCANCÍA DAÑADA (VENDOR SWAPS)
# ==============================================================================

@router.get("/swaps")
def list_vendor_swaps(
    facility_id: Optional[int] = None,
    supplier_id: Optional[int] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Listado de la bolsa de canjes 1 a 1 de mercancía averiada/cuarentena."""
    q = db.query(VendorSwap).options(
        selectinload(VendorSwap.facility),
        selectinload(VendorSwap.supplier),
        selectinload(VendorSwap.variant).selectinload(ProductVariant.product),
        selectinload(VendorSwap.damaged_batch),
        selectinload(VendorSwap.quarantined_by),
        selectinload(VendorSwap.executions).selectinload(VendorSwapExecution.executed_by)
    )

    if facility_id:
        q = q.filter(VendorSwap.facility_id == facility_id)
    if supplier_id:
        q = q.filter(VendorSwap.supplier_id == supplier_id)
    if status:
        q = q.filter(VendorSwap.status == status)
    if search:
        pattern = f"%{search}%"
        q = q.join(Supplier, VendorSwap.supplier_id == Supplier.id).filter(
            or_(
                VendorSwap.swap_number.ilike(pattern),
                Supplier.name.ilike(pattern),
                VendorSwap.damage_reason.ilike(pattern)
            )
        )

    total = q.count()
    items = q.order_by(desc(VendorSwap.id)).offset(skip).limit(limit).all()

    results = []
    for s in items:
        pending_qty = float(s.qty_quarantined) - float(s.qty_swapped)
        results.append({
            "id": s.id,
            "swap_number": s.swap_number,
            "facility_id": s.facility_id,
            "facility_name": s.facility.name if s.facility else "N/A",
            "supplier_id": s.supplier_id,
            "supplier_name": s.supplier.name if s.supplier else "N/A",
            "supplier_tax_id": s.supplier.tax_id if s.supplier else "N/A",
            "variant_id": s.variant_id,
            "sku": s.variant.sku if s.variant else "N/A",
            "product_name": s.variant.product.name if (s.variant and s.variant.product) else f"SKU {s.variant_id}",
            "damaged_batch_id": s.damaged_batch_id,
            "damaged_batch_number": s.damaged_batch.batch_number if s.damaged_batch else "S/L",
            "damaged_expiry_date": s.damaged_batch.expiry_date.strftime("%d/%m/%Y") if (s.damaged_batch and s.damaged_batch.expiry_date) else None,
            "qty_quarantined": float(s.qty_quarantined),
            "qty_swapped": float(s.qty_swapped),
            "qty_pending": max(0.0, pending_qty),
            "status": s.status,
            "damage_reason": s.damage_reason,
            "notes": s.notes,
            "quarantined_by": s.quarantined_by.full_name if s.quarantined_by else None,
            "quarantined_at": s.quarantined_at.strftime("%d/%m/%Y %H:%M") if s.quarantined_at else None,
            "executions_count": len(s.executions),
            "executions": [
                {
                    "id": ex.id,
                    "qty": float(ex.qty),
                    "new_batch_number": ex.new_batch_number,
                    "new_expiration_date": ex.new_expiration_date.strftime("%d/%m/%Y") if ex.new_expiration_date else None,
                    "carrier_name": ex.carrier_name,
                    "carrier_plate": ex.carrier_plate,
                    "executed_by": ex.executed_by.full_name if ex.executed_by else None,
                    "executed_at": ex.executed_at.strftime("%d/%m/%Y %H:%M") if ex.executed_at else None
                }
                for ex in s.executions
            ]
        })

    return {"total": total, "items": results}


@router.get("/swaps/{swap_id}")
def get_vendor_swap(
    swap_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Detalle completo de una bolsa de canje 1 a 1."""
    s = db.query(VendorSwap).options(
        selectinload(VendorSwap.facility),
        selectinload(VendorSwap.supplier),
        selectinload(VendorSwap.variant).selectinload(ProductVariant.product),
        selectinload(VendorSwap.damaged_batch),
        selectinload(VendorSwap.quarantined_by),
        selectinload(VendorSwap.executions).selectinload(VendorSwapExecution.executed_by)
    ).filter(VendorSwap.id == swap_id).first()

    if not s:
        raise HTTPException(status_code=404, detail="Registro de canje no encontrado.")

    pending_qty = float(s.qty_quarantined) - float(s.qty_swapped)
    return {
        "id": s.id,
        "swap_number": s.swap_number,
        "facility_id": s.facility_id,
        "facility_name": s.facility.name if s.facility else "N/A",
        "supplier_id": s.supplier_id,
        "supplier_name": s.supplier.name if s.supplier else "N/A",
        "supplier_tax_id": s.supplier.tax_id if s.supplier else "N/A",
        "variant_id": s.variant_id,
        "sku": s.variant.sku if s.variant else "N/A",
        "product_name": s.variant.product.name if (s.variant and s.variant.product) else f"SKU {s.variant_id}",
        "damaged_batch_id": s.damaged_batch_id,
        "damaged_batch_number": s.damaged_batch.batch_number if s.damaged_batch else "S/L",
        "damaged_expiry_date": s.damaged_batch.expiry_date.strftime("%d/%m/%Y") if (s.damaged_batch and s.damaged_batch.expiry_date) else None,
        "qty_quarantined": float(s.qty_quarantined),
        "qty_swapped": float(s.qty_swapped),
        "qty_pending": max(0.0, pending_qty),
        "status": s.status,
        "damage_reason": s.damage_reason,
        "notes": s.notes,
        "quarantined_by": s.quarantined_by.full_name if s.quarantined_by else None,
        "quarantined_at": s.quarantined_at.strftime("%d/%m/%Y %H:%M") if s.quarantined_at else None,
        "executions": [
            {
                "id": ex.id,
                "qty": float(ex.qty),
                "new_batch_number": ex.new_batch_number,
                "new_expiration_date": ex.new_expiration_date.strftime("%d/%m/%Y") if ex.new_expiration_date else None,
                "carrier_name": ex.carrier_name,
                "carrier_plate": ex.carrier_plate,
                "executed_by": ex.executed_by.full_name if ex.executed_by else None,
                "executed_at": ex.executed_at.strftime("%d/%m/%Y %H:%M") if ex.executed_at else None
            }
            for ex in s.executions
        ]
    }


@router.post("/swaps")
def create_vendor_swap(
    payload: VendorSwapCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Ingresa mercancía averiada/vencida a la bolsa de canjes en Cuarentena:
    - Bloquea el lote en cuarentena si se especifica.
    - Genera movimiento a la zona de cuarentena.
    - Crea el registro de canje con estado 'PENDING'.
    """
    facility = db.query(Facility).filter(Facility.id == payload.facility_id).first()
    if not facility:
        raise HTTPException(status_code=404, detail="Sucursal no encontrada.")

    supplier = db.query(Supplier).filter(Supplier.id == payload.supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado.")

    variant = db.query(ProductVariant).filter(ProductVariant.id == payload.variant_id).first()
    if not variant:
        raise HTTPException(status_code=404, detail="Variante de producto no encontrada.")

    if payload.qty_quarantined <= 0:
        raise HTTPException(status_code=400, detail="La cantidad en cuarentena debe ser mayor a 0.")

    # Generar correlativo SWAP
    timestamp_str = datetime.now().strftime("%Y%m%d-%H%M%S")
    swap_number = f"SWAP-{timestamp_str}"

    # Ubicaciones para movimiento de cuarentena
    quarantine_loc = db.query(Location).filter(Location.usage == "INVENTORY", Location.code == "QUARANTINE").first()
    if not quarantine_loc:
        quarantine_loc = Location(name="Zona de Cuarentena / Calidad", code="QUARANTINE", location_type="SHELF", usage="INVENTORY")
        db.add(quarantine_loc)
        db.flush()

    stock_loc = db.query(Location).filter(Location.usage == "INTERNAL").first()
    if not stock_loc:
        stock_loc = Location(name="Almacén Principal", code="STOCK-INT", location_type="INTERNAL", usage="INTERNAL")
        db.add(stock_loc)
        db.flush()

    # Si hay lote, marcarlo como en cuarentena
    if payload.damaged_batch_id:
        batch = db.query(Batch).filter(Batch.id == payload.damaged_batch_id).first()
        if batch:
            batch.is_quarantined = True

    # Asentar movimiento de Kardex a Cuarentena
    user_ident = getattr(current_user, "full_name", None) or getattr(current_user, "email", "Usuario WMS")
    move = StockMove(
        product_id=payload.variant_id,
        location_src_id=stock_loc.id,
        location_dest_id=quarantine_loc.id,
        quantity_demand=payload.qty_quarantined,
        quantity_done=payload.qty_quarantined,
        state="DONE",
        batch_id=payload.damaged_batch_id,
        supplier_id=payload.supplier_id,
        unit_cost=float(variant.average_cost or variant.standard_cost or 0),
        reference=f"AISLAMIENTO-CANJE-{swap_number} | Resp: {user_ident}",
        created_by_id=current_user.id
    )
    db.add(move)

    swap_obj = VendorSwap(
        swap_number=swap_number,
        facility_id=payload.facility_id,
        supplier_id=payload.supplier_id,
        variant_id=payload.variant_id,
        damaged_batch_id=payload.damaged_batch_id,
        qty_quarantined=Decimal(str(payload.qty_quarantined)),
        qty_swapped=Decimal(0),
        status="PENDING",
        damage_reason=payload.damage_reason or "ROTURA/AVERIA",
        notes=payload.notes,
        quarantined_by_id=current_user.id
    )
    db.add(swap_obj)
    db.commit()
    db.refresh(swap_obj)

    return {
        "status": "success",
        "message": f"Mercancía aislada para canje #{swap_obj.swap_number}.",
        "id": swap_obj.id,
        "swap_number": swap_obj.swap_number
    }


@router.post("/swaps/{swap_id}/execute")
def execute_vendor_swap(
    swap_id: int,
    payload: VendorSwapExecute,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Ejecuta el canje físico mano a mano en muelle con el chofer del proveedor:
    - Valida que la cantidad a canjear no exceda el saldo pendiente.
    - Registra el nuevo lote y su fecha de vencimiento sanitario.
    - Ejecuta movimientos atómicos de salida (averiado) y entrada (nuevo) en Kardex ($0 delta monetario).
    - Actualiza el estado a PARTIAL o COMPLETED.
    """
    swap = db.query(VendorSwap).options(
        selectinload(VendorSwap.variant)
    ).filter(VendorSwap.id == swap_id).first()

    if not swap:
        raise HTTPException(status_code=404, detail="Bolsa de canje no encontrada.")

    if swap.status == "COMPLETED":
        raise HTTPException(status_code=400, detail="Este canje ya ha sido completado en su totalidad.")
    if swap.status == "CANCELLED":
        raise HTTPException(status_code=400, detail="Este canje se encuentra cancelado.")

    remaining = float(swap.qty_quarantined) - float(swap.qty_swapped)
    if payload.qty <= 0:
        raise HTTPException(status_code=400, detail="La cantidad a canjear debe ser mayor a 0.")
    if payload.qty > remaining + 0.0001:
        raise HTTPException(status_code=400, detail=f"La cantidad ({payload.qty}) supera el saldo pendiente de canjear ({remaining}).")

    # Ubicaciones
    quarantine_loc = db.query(Location).filter(Location.usage == "INVENTORY", Location.code == "QUARANTINE").first()
    if not quarantine_loc:
        quarantine_loc = Location(name="Zona de Cuarentena / Calidad", code="QUARANTINE", location_type="SHELF", usage="INVENTORY")
        db.add(quarantine_loc)
        db.flush()

    stock_loc = db.query(Location).filter(Location.usage == "INTERNAL").first()
    if not stock_loc:
        stock_loc = Location(name="Almacén Principal", code="STOCK-INT", location_type="INTERNAL", usage="INTERNAL")
        db.add(stock_loc)
        db.flush()

    supplier_loc = db.query(Location).filter(Location.usage == "EXTERNAL", Location.code == "VEN").first()
    if not supplier_loc:
        supplier_loc = db.query(Location).filter(Location.usage == "EXTERNAL").first()
        if not supplier_loc:
            supplier_loc = Location(name="Ubicación Proveedores", code="VEN", location_type="SUPPLIER", usage="EXTERNAL")
            db.add(supplier_loc)
            db.flush()

    # 1. Registrar o recuperar el nuevo Lote sanitario
    clean_batch_number = payload.new_batch_number.strip().upper()
    new_batch = db.query(Batch).filter(
        Batch.product_variant_id == swap.variant_id,
        Batch.batch_number == clean_batch_number
    ).first()

    if not new_batch:
        new_batch = Batch(
            product_variant_id=swap.variant_id,
            batch_number=clean_batch_number,
            expiry_date=payload.new_expiration_date,
            is_quarantined=False
        )
        db.add(new_batch)
        db.flush()
    else:
        new_batch.expiry_date = payload.new_expiration_date
        new_batch.is_quarantined = False

    cost = float(swap.variant.average_cost or swap.variant.standard_cost or 0)

    # 2. Movimiento de Salida (Kardex OUT: Mercancía Averiada devuelta al chofer)
    user_ident = getattr(current_user, "full_name", None) or getattr(current_user, "email", "Usuario WMS")
    move_out = StockMove(
        product_id=swap.variant_id,
        location_src_id=quarantine_loc.id,
        location_dest_id=supplier_loc.id,
        quantity_demand=payload.qty,
        quantity_done=payload.qty,
        state="DONE",
        batch_id=swap.damaged_batch_id,
        supplier_id=swap.supplier_id,
        unit_cost=cost,
        reference=f"CANJE-SALIDA-{swap.swap_number} | Chofer: {payload.carrier_name or 'N/A'}",
        created_by_id=current_user.id
    )
    db.add(move_out)
    db.flush()

    # 3. Movimiento de Entrada (Kardex IN: Mercancía Nueva apta recibida del proveedor)
    move_in = StockMove(
        product_id=swap.variant_id,
        location_src_id=supplier_loc.id,
        location_dest_id=stock_loc.id,
        quantity_demand=payload.qty,
        quantity_done=payload.qty,
        state="DONE",
        batch_id=new_batch.id,
        supplier_id=swap.supplier_id,
        unit_cost=cost,
        reference=f"CANJE-ENTRADA-{swap.swap_number} | Lote: {new_batch.batch_number}",
        created_by_id=current_user.id
    )
    db.add(move_in)
    db.flush()

    # 4. Asentar la ejecución del canje
    execution = VendorSwapExecution(
        swap_id=swap.id,
        qty=Decimal(str(payload.qty)),
        new_batch_number=clean_batch_number,
        new_expiration_date=payload.new_expiration_date,
        carrier_name=payload.carrier_name,
        carrier_plate=payload.carrier_plate,
        stock_move_out_id=move_out.id,
        stock_move_in_id=move_in.id,
        executed_by_id=current_user.id
    )
    db.add(execution)

    # 5. Actualizar saldos del swap
    new_swapped_total = float(swap.qty_swapped) + payload.qty
    swap.qty_swapped = Decimal(str(new_swapped_total))
    if new_swapped_total >= float(swap.qty_quarantined) - 0.0001:
        swap.status = "COMPLETED"
    else:
        swap.status = "PARTIAL"

    db.commit()
    db.refresh(execution)
    db.refresh(swap)

    return {
        "status": "success",
        "message": f"Canje mano a mano ejecutado exitosamente. Se ingresó lote {new_batch.batch_number}.",
        "execution_id": execution.id,
        "swap_status": swap.status,
        "qty_swapped_total": float(swap.qty_swapped),
        "qty_pending": max(0.0, float(swap.qty_quarantined) - float(swap.qty_swapped))
    }


@router.get("/swaps/{swap_id}/ticket-80mm")
def get_vendor_swap_ticket_80mm(
    swap_id: int,
    db: Session = Depends(get_db)
):
    """Comprobante térmico de canje 1 a 1 para firma mano a mano en muelle."""
    s = db.query(VendorSwap).options(
        selectinload(VendorSwap.facility),
        selectinload(VendorSwap.supplier),
        selectinload(VendorSwap.variant).selectinload(ProductVariant.product),
        selectinload(VendorSwap.damaged_batch),
        selectinload(VendorSwap.quarantined_by),
        selectinload(VendorSwap.executions).selectinload(VendorSwapExecution.executed_by)
    ).filter(VendorSwap.id == swap_id).first()

    if not s:
        raise HTTPException(status_code=404, detail="Registro de canje no encontrado.")

    last_execution = s.executions[-1] if s.executions else None

    return {
        "type": "VENDOR_SWAP",
        "swap_number": s.swap_number,
        "quarantined_at": s.quarantined_at.strftime("%d/%m/%Y %H:%M") if s.quarantined_at else "",
        "facility_name": s.facility.name if s.facility else "Almacén Principal",
        "supplier_name": s.supplier.name if s.supplier else "N/A",
        "supplier_tax_id": s.supplier.tax_id if s.supplier else "N/A",
        "sku": s.variant.sku if s.variant else "N/A",
        "product_name": s.variant.product.name if (s.variant and s.variant.product) else f"SKU {s.variant_id}",
        "damaged_batch_number": s.damaged_batch.batch_number if s.damaged_batch else "S/L",
        "damaged_expiry_date": s.damaged_batch.expiry_date.strftime("%d/%m/%Y") if (s.damaged_batch and s.damaged_batch.expiry_date) else "N/A",
        "qty_quarantined": float(s.qty_quarantined),
        "qty_swapped": float(s.qty_swapped),
        "qty_pending": max(0.0, float(s.qty_quarantined) - float(s.qty_swapped)),
        "status": s.status,
        "damage_reason": s.damage_reason,
        "last_execution": {
            "qty": float(last_execution.qty) if last_execution else 0,
            "new_batch_number": last_execution.new_batch_number if last_execution else "",
            "new_expiration_date": last_execution.new_expiration_date.strftime("%d/%m/%Y") if (last_execution and last_execution.new_expiration_date) else "",
            "carrier_name": last_execution.carrier_name if last_execution else "",
            "carrier_plate": last_execution.carrier_plate if last_execution else "",
            "executed_by": last_execution.executed_by.full_name if (last_execution and last_execution.executed_by) else "Operador WMS",
            "executed_at": last_execution.executed_at.strftime("%d/%m/%Y %H:%M") if last_execution else ""
        } if last_execution else None,
        "executions": [
            {
                "qty": float(ex.qty),
                "new_batch_number": ex.new_batch_number,
                "new_expiration_date": ex.new_expiration_date.strftime("%d/%m/%Y") if ex.new_expiration_date else "",
                "carrier_name": ex.carrier_name,
                "carrier_plate": ex.carrier_plate,
                "executed_by": ex.executed_by.full_name if ex.executed_by else "Operador WMS",
                "executed_at": ex.executed_at.strftime("%d/%m/%Y %H:%M") if ex.executed_at else ""
            }
            for ex in s.executions
        ]
    }
