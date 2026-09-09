from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import desc, func, or_
from decimal import Decimal
from datetime import datetime, date

from pydantic import BaseModel
from app.api import deps
from app.models.purchasing import PurchaseOrder, PurchaseOrderLine, SupplierProduct
from app.models.inventory import ProductVariant, Product, ProductPackaging, InventorySnapshot, SupplierReturn, SupplierReturnLine
from app.models.core import Supplier, Currency, Facility, User, Company
from app.schemas.reconciliation import (
    ReconciliationOrderDetail,
    ReconciliationLineOut,
    ReconciliationOrderListItem,
    ReconciliationProcessPayload,
    ReconciliationProcessResponse,
    ReconciliationKPIs
)

router = APIRouter()

@router.get("/kpis", response_model=ReconciliationKPIs)
def get_reconciliation_kpis(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
) -> Any:
    # 1. Órdenes pendientes de conciliación (status = 'received' y reconciliation_status != 'MATCH_EXACT' y != 'MATCH_WITH_DEBIT_NOTE')
    pending_orders = db.query(PurchaseOrder).filter(
        PurchaseOrder.status == 'received',
        or_(
            PurchaseOrder.reconciliation_status == 'PENDING',
            PurchaseOrder.reconciliation_status == None,
            PurchaseOrder.reconciliation_status == 'REJECTED'
        )
    ).all()
    
    pending_count = len(pending_orders)
    pending_usd = Decimal(0)
    pending_ves = Decimal(0)
    for o in pending_orders:
        rate = Decimal(str(o.exchange_rate or 1.0))
        amt = Decimal(str(o.total_amount or 0))
        pending_usd += amt
        pending_ves += (amt * rate)

    # 2. Órdenes conciliadas (status = 'conciliated')
    conciliated_orders = db.query(PurchaseOrder).filter(
        PurchaseOrder.status == 'conciliated'
    ).all()
    conciliated_count = len(conciliated_orders)
    conciliated_usd = sum(Decimal(str(o.total_amount or 0)) for o in conciliated_orders)

    # 3. Notas de Débito emitidas
    nd_orders = db.query(PurchaseOrder).filter(
        PurchaseOrder.debit_note_amount > 0
    ).all()
    debit_notes_count = len(nd_orders)
    debit_notes_usd = Decimal(0)
    debit_notes_ves = Decimal(0)
    for o in nd_orders:
        rate = Decimal(str(o.exchange_rate or 1.0))
        nd_amt = Decimal(str(o.debit_note_amount or 0))
        debit_notes_usd += nd_amt
        debit_notes_ves += (nd_amt * rate)

    return ReconciliationKPIs(
        pending_count=pending_count,
        pending_amount_usd=round(pending_usd, 2),
        pending_amount_ves=round(pending_ves, 2),
        conciliated_count=conciliated_count,
        conciliated_amount_usd=round(conciliated_usd, 2),
        debit_notes_count=debit_notes_count,
        debit_notes_amount_usd=round(debit_notes_usd, 2),
        debit_notes_amount_ves=round(debit_notes_ves, 2)
    )

@router.get("/", response_model=List[ReconciliationOrderListItem])
def list_reconciliation_orders(
    db: Session = Depends(deps.get_db),
    tab: str = Query("pending", enum=["pending", "conciliated", "all"]),
    supplier_id: Optional[int] = None,
    facility_id: Optional[int] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(deps.get_current_active_user)
) -> Any:
    query = db.query(PurchaseOrder).options(
        selectinload(PurchaseOrder.lines),
        selectinload(PurchaseOrder.supplier),
        selectinload(PurchaseOrder.dest_facility)
    )

    if tab == "pending":
        query = query.filter(
            PurchaseOrder.status == 'received',
            or_(
                PurchaseOrder.reconciliation_status == 'PENDING',
                PurchaseOrder.reconciliation_status == None,
                PurchaseOrder.reconciliation_status == 'REJECTED'
            )
        )
    elif tab == "conciliated":
        query = query.filter(PurchaseOrder.status == 'conciliated')
    else:  # all
        query = query.filter(
            PurchaseOrder.status.in_(['received', 'conciliated'])
        )

    if supplier_id:
        query = query.filter(PurchaseOrder.supplier_id == supplier_id)
    if facility_id:
        query = query.filter(PurchaseOrder.dest_facility_id == facility_id)

    if search:
        search_term = f"%{search.strip()}%"
        query = query.join(Supplier, PurchaseOrder.supplier_id == Supplier.id, isouter=True).filter(
            or_(
                PurchaseOrder.reference.ilike(search_term),
                PurchaseOrder.invoice_number.ilike(search_term),
                Supplier.name.ilike(search_term),
                Supplier.tax_id.ilike(search_term)
            )
        )

    orders = query.order_by(desc(PurchaseOrder.id)).offset(skip).limit(limit).all()

    results = []
    for o in orders:
        supp = o.supplier
        fac = o.dest_facility
        total_ordered = Decimal(str(o.total_amount or 0))
        total_received = sum(
            Decimal(str(line.received_base_qty or 0)) * Decimal(str(line.unit_cost or 0))
            for line in o.lines
        )
        
        # Determine currency
        cur = db.query(Currency).filter(Currency.id == o.currency_id).first() if o.currency_id else None
        cur_code = cur.code if cur else "USD"
        cur_symbol = cur.symbol if cur else "$"

        results.append(ReconciliationOrderListItem(
            id=o.id,
            reference=o.reference,
            created_at=o.created_at,
            supplier_id=supp.id if supp else 0,
            supplier_name=supp.name if supp else "N/A",
            supplier_tax_id=supp.tax_id if supp else None,
            dest_facility_name=fac.name if fac else "N/A",
            currency_code=cur_code,
            currency_symbol=cur_symbol,
            exchange_rate=Decimal(str(o.exchange_rate or 1.0)),
            status=o.status,
            reconciliation_status=o.reconciliation_status or ("MATCH_EXACT" if o.status == 'conciliated' else "PENDING"),
            total_ordered=round(total_ordered, 4),
            total_received=round(total_received, 4),
            items_count=len(o.lines),
            invoice_number=o.invoice_number,
            invoice_date=o.invoice_date,
            debit_note_number=o.debit_note_number,
            debit_note_amount=Decimal(str(o.debit_note_amount or 0)),
            conciliated_at=o.conciliated_at
        ))

    return results

@router.get("/{order_id}", response_model=ReconciliationOrderDetail)
def get_reconciliation_order_detail(
    *,
    db: Session = Depends(deps.get_db),
    order_id: int,
    current_user: User = Depends(deps.get_current_active_user)
) -> Any:
    order = db.query(PurchaseOrder).options(
        selectinload(PurchaseOrder.lines),
        selectinload(PurchaseOrder.supplier),
        selectinload(PurchaseOrder.dest_facility)
    ).filter(PurchaseOrder.id == order_id).first()

    if not order:
        raise HTTPException(status_code=404, detail="Orden de compra no encontrada")

    supp = order.supplier
    fac = order.dest_facility
    cur = db.query(Currency).filter(Currency.id == order.currency_id).first() if order.currency_id else None
    cur_code = cur.code if cur else "USD"
    cur_symbol = cur.symbol if cur else "$"

    conciliated_by_user = None
    if order.conciliated_by_id:
        conc_user = db.query(User).filter(User.id == order.conciliated_by_id).first()
        if conc_user:
            conciliated_by_user = conc_user.full_name

    lines_out: List[ReconciliationLineOut] = []
    total_ordered = Decimal(0)
    total_received = Decimal(0)
    total_billed = Decimal(0)
    total_debit_note = Decimal(0)

    for line in order.lines:
        variant = db.query(ProductVariant).filter(ProductVariant.id == line.variant_id).first()
        prod = db.query(Product).filter(Product.id == variant.product_id).first() if variant else None
        pack = db.query(ProductPackaging).filter(ProductPackaging.id == line.pack_id).first() if line.pack_id else None

        q_ord = Decimal(str(line.qty_ordered or 0))
        base_ord = Decimal(str(line.expected_base_qty or 0))
        c_ord = Decimal(str(line.unit_cost or 0))
        q_rec = Decimal(str(line.received_base_qty or 0))

        line_ord_subtotal = base_ord * c_ord
        line_rec_subtotal = q_rec * c_ord
        total_ordered += line_ord_subtotal
        total_received += line_rec_subtotal

        # Default or recorded billed quantities & costs
        q_billed = Decimal(str(line.billed_qty)) if line.billed_qty is not None else q_rec
        c_billed = Decimal(str(line.billed_unit_cost)) if line.billed_unit_cost is not None else c_ord
        line_billed_subtotal = q_billed * c_billed
        total_billed += line_billed_subtotal

        # Variances
        q_variance = q_billed - q_rec
        c_variance = c_billed - c_ord
        line_discrepancy = line_billed_subtotal - line_rec_subtotal

        # If overbilled, suggest debit note
        if line_discrepancy > 0:
            total_debit_note += line_discrepancy

        # Line status determination
        has_qty_diff = abs(q_variance) > Decimal('0.0001')
        has_cost_diff = abs(c_variance) > Decimal('0.0001')

        if not has_qty_diff and not has_cost_diff:
            line_status = "EXACT_MATCH"
        elif has_qty_diff and not has_cost_diff:
            line_status = "QTY_DISCREPANCY"
        elif not has_qty_diff and has_cost_diff:
            line_status = "PRICE_DISCREPANCY"
        else:
            line_status = "DOUBLE_DISCREPANCY"

        # Margin analysis
        sales_price = Decimal(str(variant.sales_price or 0)) if variant else Decimal(0)
        cur_margin = Decimal(0)
        new_margin = Decimal(0)
        if sales_price > 0:
            cur_margin = ((sales_price - c_ord) / sales_price) * Decimal(100)
            new_margin = ((sales_price - c_billed) / sales_price) * Decimal(100)

        lines_out.append(ReconciliationLineOut(
            id=line.id,
            variant_id=line.variant_id,
            sku=variant.sku if variant else "N/A",
            product_name=prod.name if prod else "N/A",
            uom_base=prod.uom_base if prod else "PZA",
            pack_name=pack.name if pack else "Und. Base",
            qty_per_pack=Decimal(str(pack.qty_per_unit or 1)) if pack else Decimal(1),
            qty_ordered=q_ord,
            expected_base_qty=base_ord,
            unit_cost=c_ord,
            line_ordered_subtotal=round(line_ord_subtotal, 4),
            received_base_qty=q_rec,
            line_received_subtotal=round(line_rec_subtotal, 4),
            billed_qty=q_billed,
            billed_unit_cost=c_billed,
            line_billed_subtotal=round(line_billed_subtotal, 4),
            qty_variance=round(q_variance, 4),
            cost_variance=round(c_variance, 4),
            line_discrepancy_amount=round(line_discrepancy, 4),
            line_status=line_status,
            current_sales_price=round(sales_price, 4),
            current_margin_pct=round(cur_margin, 2),
            new_margin_pct=round(new_margin, 2)
        ))

    net_payable = total_billed - total_debit_note

    return ReconciliationOrderDetail(
        id=order.id,
        reference=order.reference,
        status=order.status,
        reconciliation_status=order.reconciliation_status or ("MATCH_EXACT" if order.status == 'conciliated' else "PENDING"),
        created_at=order.created_at,
        dest_facility_id=order.dest_facility_id,
        dest_facility_name=fac.name if fac else "N/A",
        supplier_id=supp.id if supp else 0,
        supplier_name=supp.name if supp else "N/A",
        supplier_tax_id=supp.tax_id if supp else "N/A",
        supplier_phone=supp.commercial_contact_phone if supp and supp.commercial_contact_phone else "N/A",
        supplier_email=supp.commercial_email if supp and supp.commercial_email else "N/A",
        currency_id=order.currency_id,
        currency_code=cur_code,
        currency_symbol=cur_symbol,
        exchange_rate=Decimal(str(order.exchange_rate or 1.0)),
        invoice_number=order.invoice_number,
        invoice_date=order.invoice_date,
        conciliated_at=order.conciliated_at,
        conciliated_by_name=conciliated_by_user,
        debit_note_number=order.debit_note_number,
        debit_note_amount=Decimal(str(order.debit_note_amount or 0)),
        reconciliation_notes=order.reconciliation_notes,
        total_ordered_amount=round(total_ordered, 4),
        total_received_amount=round(total_received, 4),
        total_billed_amount=round(total_billed, 4),
        total_debit_note_suggested=round(total_debit_note, 4),
        net_payable_suggested=round(net_payable, 4),
        lines=lines_out
    )

@router.post("/{order_id}/process", response_model=ReconciliationProcessResponse)
def process_reconciliation(
    *,
    db: Session = Depends(deps.get_db),
    order_id: int,
    payload: ReconciliationProcessPayload,
    current_user: User = Depends(deps.get_current_active_user)
) -> Any:
    order = db.query(PurchaseOrder).options(
        selectinload(PurchaseOrder.lines)
    ).filter(PurchaseOrder.id == order_id).first()

    if not order:
        raise HTTPException(status_code=404, detail="Orden de compra no encontrada.")

    if order.status not in ['received', 'conciliated']:
        raise HTTPException(
            status_code=400,
            detail="Solo las órdenes en estado 'Recibido' (con mercancía ingresada en WMS) pueden ser conciliadas."
        )

    action = payload.action.upper()
    if action not in ["EXACT_MATCH", "APPROVE_WITH_DEBIT_NOTE", "REJECT"]:
        raise HTTPException(status_code=400, detail=f"Acción '{payload.action}' no válida. Opciones: EXACT_MATCH, APPROVE_WITH_DEBIT_NOTE, REJECT.")

    # 1. Manejo de Rechazo Contable
    if action == "REJECT":
        order.reconciliation_status = "REJECTED"
        order.invoice_number = payload.invoice_number
        order.invoice_date = payload.invoice_date
        rejection_reason = payload.debit_note_reason or "Factura devuelta al proveedor por discrepancia física o comercial."
        order.reconciliation_notes = f"[FACTURA RECHAZADA el {datetime.utcnow().strftime('%d/%m/%Y %H:%M')} por {current_user.full_name}]: {rejection_reason}"
        db.commit()
        return ReconciliationProcessResponse(
            status="rejected",
            order_id=order.id,
            order_reference=order.reference,
            invoice_number=payload.invoice_number,
            reconciliation_status="REJECTED",
            debit_note_number=None,
            debit_note_amount=Decimal(0),
            total_invoiced=Decimal(0),
            total_net_payable=Decimal(0),
            message=f"Factura {payload.invoice_number} rechazada contablemente. Se generó acta de devolución al proveedor."
        )

    # 2. Validación de Líneas y Cálculo de Discrepancias
    line_map = {line.id: line for line in order.lines}
    total_billed = Decimal(0)
    total_received_val = Decimal(0)
    total_debit_note = Decimal(0)
    discrepancy_details = []

    for l_in in payload.lines:
        db_line = line_map.get(l_in.id)
        if not db_line:
            continue

        q_billed = Decimal(str(l_in.billed_qty))
        c_billed = Decimal(str(l_in.billed_unit_cost))
        q_rec = Decimal(str(db_line.received_base_qty or 0))
        c_ord = Decimal(str(db_line.unit_cost or 0))

        line_billed_total = q_billed * c_billed
        line_rec_total = q_rec * c_ord

        total_billed += line_billed_total
        total_received_val += line_rec_total

        diff = line_billed_total - line_rec_total
        if diff > Decimal('0.0001'):
            total_debit_note += diff
            variant = db.query(ProductVariant).filter(ProductVariant.id == db_line.variant_id).first()
            sku = variant.sku if variant else f"ID {db_line.variant_id}"
            
            reasons = []
            if q_billed > q_rec:
                reasons.append(f"Faltante: Facturadas {q_billed} vs Recibidas {q_rec}")
            if c_billed > c_ord:
                reasons.append(f"Sobreprecio: Cobrado ${c_billed} vs Pactado ${c_ord}")
            
            discrepancy_details.append(f"{sku}: {', '.join(reasons)} -> Deducción ${diff:,.2f}")

    # Si se solicitó EXACT_MATCH pero existen discrepancias monetarias superiores a 5 centavos
    if action == "EXACT_MATCH" and total_debit_note > Decimal('0.05'):
        raise HTTPException(
            status_code=400,
            detail=f"No se puede aplicar '100% Match Exacto' porque existe una discrepancia no cubierta de ${total_debit_note:,.2f}. Seleccione 'Aprobar con Nota de Débito' para retener la diferencia y proteger la tesorería."
        )

    # 3. Aplicar Conciliación
    order.invoice_number = payload.invoice_number
    order.invoice_date = payload.invoice_date
    order.conciliated_at = datetime.utcnow()
    order.conciliated_by_id = current_user.id
    order.status = 'conciliated'

    debit_note_num = None
    if action == "APPROVE_WITH_DEBIT_NOTE" and total_debit_note > 0:
        order.reconciliation_status = "MATCH_WITH_DEBIT_NOTE"
        debit_note_num = f"ND-{order.reference}"
        order.debit_note_number = debit_note_num
        order.debit_note_amount = total_debit_note
        
        detail_str = "; ".join(discrepancy_details)
        user_reason = f" Motivo usuario: {payload.debit_note_reason}" if payload.debit_note_reason else ""
        order.reconciliation_notes = f"[NOTA DE DÉBITO {debit_note_num}]: Deducción de ${total_debit_note:,.2f} emitida por {current_user.full_name}. Desglose: {detail_str}.{user_reason}"
    else:
        order.reconciliation_status = "MATCH_EXACT"
        order.debit_note_number = None
        order.debit_note_amount = Decimal(0)
        order.reconciliation_notes = f"[3-WAY MATCH EXACTO]: Conciliado sin discrepancias por {current_user.full_name} el {datetime.utcnow().strftime('%d/%m/%Y')}."

    # 4. Actualizar Líneas, Costos de Inventario y Precios
    for l_in in payload.lines:
        db_line = line_map.get(l_in.id)
        if not db_line:
            continue

        q_billed = Decimal(str(l_in.billed_qty))
        c_billed = Decimal(str(l_in.billed_unit_cost))

        db_line.billed_qty = q_billed
        db_line.billed_unit_cost = c_billed

        # Actualizar Producto y Variante
        variant = db.query(ProductVariant).filter(ProductVariant.id == db_line.variant_id).first()
        if variant:
            # Costo de reposición y último costo real pagado
            variant.replacement_cost = c_billed
            variant.last_cost = c_billed
            
            # Recálculo ponderado del costo promedio (WAVG)
            snap = db.query(InventorySnapshot).filter(
                InventorySnapshot.variant_id == db_line.variant_id,
                InventorySnapshot.facility_id == order.dest_facility_id
            ).first() if order.dest_facility_id else None
            
            current_stock = Decimal(str(snap.stock_qty or 0)) if snap else Decimal(0)
            rec_qty = Decimal(str(db_line.received_base_qty or 0))
            if current_stock + rec_qty > 0 and variant.average_cost and variant.average_cost > 0:
                new_avg = ((Decimal(str(variant.average_cost)) * current_stock) + (c_billed * rec_qty)) / (current_stock + rec_qty)
                variant.average_cost = round(new_avg, 4)
            else:
                variant.average_cost = c_billed

            # Protección de Margen (Nuevo PVP si fue provisto)
            if l_in.new_sales_price and l_in.new_sales_price > 0:
                variant.sales_price = Decimal(str(l_in.new_sales_price))
                variant.last_price_updated_at = datetime.utcnow()
                variant.last_price_updated_by_id = current_user.id

    db.commit()
    db.refresh(order)

    net_payable = total_billed - (order.debit_note_amount or Decimal(0))

    msg = f"Conciliación 3-Way Match completada exitosamente para la orden {order.reference}."
    if debit_note_num:
        msg += f" Se generó automáticamente la Nota de Débito {debit_note_num} por ${total_debit_note:,.2f} a favor de la empresa."

    return ReconciliationProcessResponse(
        status="conciliated",
        order_id=order.id,
        order_reference=order.reference,
        invoice_number=order.invoice_number,
        reconciliation_status=order.reconciliation_status,
        debit_note_number=order.debit_note_number,
        debit_note_amount=round(order.debit_note_amount or Decimal(0), 2),
        total_invoiced=round(total_billed, 2),
        total_net_payable=round(net_payable, 2),
        message=msg
    )

@router.get("/{order_id}/debit-note-data")
def get_debit_note_document_data(
    *,
    db: Session = Depends(deps.get_db),
    order_id: int,
    current_user: User = Depends(deps.get_current_active_user)
) -> Any:
    order = db.query(PurchaseOrder).options(
        selectinload(PurchaseOrder.lines),
        selectinload(PurchaseOrder.supplier),
        selectinload(PurchaseOrder.dest_facility)
    ).filter(PurchaseOrder.id == order_id).first()

    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")

    if not order.debit_note_number or not order.debit_note_amount:
        raise HTTPException(status_code=400, detail="Esta orden no posee una Nota de Débito emitida.")

    supp = order.supplier
    company = db.query(Company).first()
    cur = db.query(Currency).filter(Currency.id == order.currency_id).first() if order.currency_id else None
    cur_code = cur.code if cur else "USD"
    cur_symbol = cur.symbol if cur else "$"
    exchange_rate = Decimal(str(order.exchange_rate or 1.0))

    line_items = []
    for l in order.lines:
        q_rec = Decimal(str(l.received_base_qty or 0))
        q_bill = Decimal(str(l.billed_qty or 0))
        c_ord = Decimal(str(l.unit_cost or 0))
        c_bill = Decimal(str(l.billed_unit_cost or 0))

        diff = (q_bill * c_bill) - (q_rec * c_ord)
        if diff > Decimal('0.0001'):
            variant = db.query(ProductVariant).filter(ProductVariant.id == l.variant_id).first()
            prod = db.query(Product).filter(Product.id == variant.product_id).first() if variant else None
            
            diff_reasons = []
            if q_bill > q_rec:
                diff_reasons.append(f"Faltante en muelle: {q_bill - q_rec} unds")
            if c_bill > c_ord:
                diff_reasons.append(f"Exceso de costo: +${c_bill - c_ord} por und")

            line_items.append({
                "sku": variant.sku if variant else "N/A",
                "description": prod.name if prod else "N/A",
                "qty_ordered": float(l.expected_base_qty or 0),
                "qty_received": float(q_rec),
                "qty_billed": float(q_bill),
                "unit_cost_ordered": float(c_ord),
                "unit_cost_billed": float(c_bill),
                "deduction_amount": float(diff),
                "deduction_amount_ves": float(diff * exchange_rate),
                "reason": ", ".join(diff_reasons)
            })

    total_usd = Decimal(str(order.debit_note_amount))
    total_ves = total_usd * exchange_rate

    return {
        "document_type": "NOTA DE DÉBITO POR DISCREPANCIA EN RECEPCIÓN (3-WAY MATCH)",
        "debit_note_number": order.debit_note_number,
        "date": order.conciliated_at.strftime("%d/%m/%Y") if order.conciliated_at else datetime.utcnow().strftime("%d/%m/%Y"),
        "purchase_order_reference": order.reference,
        "supplier_invoice_number": order.invoice_number,
        "supplier_invoice_date": order.invoice_date.strftime("%d/%m/%Y") if order.invoice_date else "N/A",
        "company": {
            "name": company.name if company else "MORPHEUS SOFT, C.A.",
            "rif": company.tax_id if company else "J-50000000-0",
            "address": "Venezuela"
        },
        "supplier": {
            "name": supp.name if supp else "N/A",
            "tax_id": supp.tax_id if supp else "N/A",
            "phone": supp.commercial_contact_phone if supp and supp.commercial_contact_phone else "N/A",
            "email": supp.commercial_email if supp and supp.commercial_email else "N/A"
        },
        "currency": {
            "code": cur_code,
            "symbol": cur_symbol,
            "exchange_rate": float(exchange_rate)
        },
        "items": line_items,
        "totals": {
            "total_debit_usd": float(total_usd),
            "total_debit_ves": float(total_ves)
        },
        "audit": {
            "conciliated_by": current_user.full_name,
            "notes": order.reconciliation_notes
        }
    }


# ==============================================================================
# CONCILIACIÓN DE DEVOLUCIONES A PROVEEDORES (NOTAS DE CRÉDITO 3-WAY INVERSA)
# ==============================================================================

class CloseReturnPayload(BaseModel):
    credit_note_number: str
    credit_note_amount: float
    credit_note_date: date
    notes: Optional[str] = None


@router.get("/returns")
def list_returns_for_reconciliation(
    db: Session = Depends(deps.get_db),
    status: Optional[str] = "DISPATCHED",
    supplier_id: Optional[int] = None,
    facility_id: Optional[int] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(deps.get_current_active_user)
) -> Any:
    """Lista devoluciones a proveedores para conciliación administrativa (3-Way Inversa)."""
    q = db.query(SupplierReturn).options(
        selectinload(SupplierReturn.facility),
        selectinload(SupplierReturn.supplier),
        selectinload(SupplierReturn.purchase_order),
        selectinload(SupplierReturn.dispatched_by),
        selectinload(SupplierReturn.conciliated_by),
        selectinload(SupplierReturn.lines).selectinload(SupplierReturnLine.variant).selectinload(ProductVariant.product)
    )

    if status and status.upper() != "ALL":
        q = q.filter(SupplierReturn.status == status.upper())
    else:
        # Excluir borradores o cancelados de la vista de conciliación por defecto
        q = q.filter(SupplierReturn.status.in_(["DISPATCHED", "CONCILIATED"]))

    if supplier_id:
        q = q.filter(SupplierReturn.supplier_id == supplier_id)
    if facility_id:
        q = q.filter(SupplierReturn.facility_id == facility_id)
    if search:
        pattern = f"%{search}%"
        q = q.join(Supplier, SupplierReturn.supplier_id == Supplier.id).filter(
            or_(
                SupplierReturn.return_number.ilike(pattern),
                Supplier.name.ilike(pattern),
                SupplierReturn.credit_note_number.ilike(pattern)
            )
        )

    total = q.count()
    items = q.order_by(desc(SupplierReturn.id)).offset(skip).limit(limit).all()

    results = []
    for r in items:
        results.append({
            "id": r.id,
            "return_number": r.return_number,
            "facility_id": r.facility_id,
            "facility_name": r.facility.name if r.facility else "N/A",
            "supplier_id": r.supplier_id,
            "supplier_name": r.supplier.name if r.supplier else "N/A",
            "supplier_tax_id": r.supplier.tax_id if r.supplier else "N/A",
            "purchase_order_id": r.purchase_order_id,
            "purchase_order_reference": r.purchase_order.po_number if r.purchase_order else (r.purchase_order.reference if r.purchase_order else None),
            "status": r.status,
            "total_estimated_amount": float(r.total_estimated_amount or 0),
            "dispatched_at": r.dispatched_at.strftime("%d/%m/%Y %H:%M") if r.dispatched_at else None,
            "dispatched_by": r.dispatched_by.full_name if r.dispatched_by else None,
            "carrier_name": r.carrier_name,
            "carrier_plate": r.carrier_plate,
            "credit_note_number": r.credit_note_number,
            "credit_note_amount": float(r.credit_note_amount) if r.credit_note_amount else None,
            "credit_note_date": r.credit_note_date.strftime("%d/%m/%Y") if r.credit_note_date else None,
            "conciliated_at": r.conciliated_at.strftime("%d/%m/%Y %H:%M") if r.conciliated_at else None,
            "conciliated_by": r.conciliated_by.full_name if r.conciliated_by else None,
            "notes": r.notes,
            "lines": [
                {
                    "id": l.id,
                    "variant_id": l.variant_id,
                    "sku": l.variant.sku if l.variant else "N/A",
                    "product_name": l.variant.product.name if (l.variant and l.variant.product) else f"SKU {l.variant_id}",
                    "quantity": float(l.quantity or 0),
                    "unit_cost": float(l.unit_cost or 0),
                    "subtotal": float(l.subtotal or 0),
                    "reason": l.reason
                }
                for l in r.lines
            ]
        })

    return {"total": total, "items": results}


@router.post("/returns/{return_id}/close")
def close_return_reconciliation(
    return_id: int,
    payload: CloseReturnPayload,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user)
) -> Any:
    """Concilia y cierra la orden de devolución registrando la Nota de Crédito del proveedor."""
    ret = db.query(SupplierReturn).filter(SupplierReturn.id == return_id).first()
    if not ret:
        raise HTTPException(status_code=404, detail="Orden de devolución no encontrada.")

    if ret.status != "DISPATCHED":
        raise HTTPException(status_code=400, detail=f"Solo se pueden conciliar devoluciones en estado 'DISPATCHED'. Estado actual: '{ret.status}'.")

    if payload.credit_note_amount <= 0:
        raise HTTPException(status_code=400, detail="El monto de la Nota de Crédito debe ser mayor a 0.")

    ret.credit_note_number = payload.credit_note_number.strip().upper()
    ret.credit_note_amount = Decimal(str(payload.credit_note_amount))
    ret.credit_note_date = payload.credit_note_date
    ret.status = "CONCILIATED"
    ret.conciliated_by_id = current_user.id
    ret.conciliated_at = datetime.utcnow()

    if payload.notes:
        ret.notes = f"{ret.notes or ''}\n[Conciliación]: {payload.notes}".strip()

    db.commit()
    db.refresh(ret)

    return {
        "status": "success",
        "message": f"Devolución {ret.return_number} conciliada exitosamente con N/C {ret.credit_note_number}.",
        "return_number": ret.return_number,
        "credit_note_number": ret.credit_note_number,
        "credit_note_amount": float(ret.credit_note_amount),
        "conciliated_at": ret.conciliated_at.strftime("%d/%m/%Y %H:%M")
    }

