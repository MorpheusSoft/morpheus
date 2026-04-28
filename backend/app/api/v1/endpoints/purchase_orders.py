from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.api import deps
from app.models.purchasing import PurchaseOrder, PurchaseOrderLine
from app.schemas.purchase_order import PurchaseOrderResponse

router = APIRouter()

@router.get("/", response_model=List[PurchaseOrderResponse])
def read_purchase_orders(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    # Most recent first
    orders = db.query(PurchaseOrder).order_by(desc(PurchaseOrder.created_at)).offset(skip).limit(limit).all()
    return orders

@router.get("/{id}", response_model=PurchaseOrderResponse)
def read_purchase_order(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
) -> Any:
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Purchase Order not found")
    return order

from app.schemas.purchase_order import PurchaseOrderCreate
from datetime import datetime

@router.post("/", response_model=PurchaseOrderResponse)
def create_purchase_order(
    *,
    db: Session = Depends(deps.get_db),
    payload: PurchaseOrderCreate
) -> Any:
    year = datetime.now().year
    
    order = PurchaseOrder(
        supplier_id=payload.supplier_id,
        dest_facility_id=payload.dest_facility_id,
        status='draft',
        total_amount=Decimal(0),
        reference=f"ODC-{year}-TEMP"
    )
    db.add(order)
    db.flush()
    
    order.reference = f"ODC-{year}-{order.id:05d}"
    
    total_amount = Decimal(0)
    for l_create in payload.lines:
        qty = Decimal(str(l_create.qty_ordered))
        base_qty = Decimal(str(l_create.expected_base_qty))
        cost = Decimal(str(l_create.unit_cost))
        
        line = PurchaseOrderLine(
            order_id=order.id,
            variant_id=l_create.variant_id,
            pack_id=l_create.pack_id,
            qty_ordered=qty,
            expected_base_qty=base_qty,
            unit_cost=cost
        )
        total_amount += base_qty * cost
        db.add(line)
        
    order.total_amount = total_amount
    db.commit()
    db.refresh(order)
    
    return order
    
@router.get("/{id}/details")
def read_purchase_order_details(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
) -> Any:
    from app.models.inventory import ProductVariant, Product, ProductPackaging
    from app.models.core import Supplier, Currency
    
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Purchase Order not found")
    
    supp = db.query(Supplier).filter(Supplier.id == order.supplier_id).first()
    currency = db.query(Currency).filter(Currency.id == supp.currency_id).first() if supp and supp.currency_id else None
    currency_decimals = currency.decimal_places if currency else 2
    
    lines_rich = []
    for line in order.lines:
        variant = db.query(ProductVariant).filter(ProductVariant.id == line.variant_id).first()
        prod = db.query(Product).filter(Product.id == variant.product_id).first() if variant else None
        pack = db.query(ProductPackaging).filter(ProductPackaging.id == line.pack_id).first() if line.pack_id else None
        
        lines_rich.append({
            "id": line.id,
            "variant_id": line.variant_id,
            "sku": variant.sku if variant else "N/A",
            "product_name": prod.name if prod else "N/A",
            "uom_base": prod.uom_base if prod else "PZA",
            "pack_name": pack.name if pack else "Und. Base",
            "qty_per_pack": pack.qty_per_unit if pack else 1,
            "qty_ordered": line.qty_ordered,
            "expected_base_qty": line.expected_base_qty,
            "unit_cost": line.unit_cost,
            "line_discount_str": line.line_discount_str,
            "received_base_qty": line.received_base_qty,
            "sales_price": variant.sales_price if variant else 0,
            "subtotal": line.expected_base_qty * line.unit_cost
        })
        
    return {
        "id": order.id,
        "reference": order.reference,
        "status": order.status,
        "created_at": order.created_at,
        "total_amount": order.total_amount,
        "invoice_discount_str": order.invoice_discount_str,
        "condition_discount_str": order.condition_discount_str,
        "notes": order.notes,
        "expiration_date": order.expiration_date,
        "allow_partial_deliveries": order.allow_partial_deliveries,
        "currency_decimals": currency_decimals,
        "supplier": {
            "id": supp.id if supp else 0,
            "name": supp.name if supp else "N/A",
            "tax_id": supp.tax_id if supp else "N/A"
        },
        "lines": lines_rich
    }

from app.schemas.purchase_order import PurchaseOrderUpdateStatus

@router.put("/{id}/status", response_model=PurchaseOrderResponse)
def update_purchase_order_status(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    payload: PurchaseOrderUpdateStatus,
) -> Any:
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Purchase Order not found")
        
    if payload.status == 'approved':
        from app.models.core import Buyer
        from decimal import Decimal
        
        # 1. Authorizations Check (Hardcoded buyer ID 1 for now, or fallback limit 1000)
        buyer = db.query(Buyer).filter(Buyer.id == 1).first()
        limit = buyer.approval_limit if buyer and buyer.approval_limit else Decimal('1000.00')
        
        if order.status != 'pending_approval' and order.total_amount > limit:
            order.status = 'pending_approval'
            db.commit()
            raise HTTPException(status_code=403, detail=f"El monto (${order.total_amount}) excede su límite de autorización (${limit}). La orden pasó a estatus 'Pendiente por Gerencia'.")
            
        # 2. Auto-Catálogo Bidireccional
        from app.models.purchasing import SupplierProduct
        from app.models.core import Supplier
        
        supp = db.query(Supplier).filter(Supplier.id == order.supplier_id).first()
        for line in order.lines:
            sp = db.query(SupplierProduct).filter(
                SupplierProduct.supplier_id == order.supplier_id,
                SupplierProduct.variant_id == line.variant_id
            ).first()
            
            if not sp: # Si es un producto del maestro global traído virgen a este proveedor
                new_sp = SupplierProduct(
                    supplier_id=order.supplier_id,
                    variant_id=line.variant_id,
                    pack_id=line.pack_id,
                    currency_id=supp.currency_id if supp else 1,
                    replacement_cost=line.unit_cost,
                    min_order_qty=1,
                    is_active=True
                )
                db.add(new_sp)
                
    order.status = payload.status
    db.commit()
    db.refresh(order)
    return order

from app.schemas.purchase_order import PurchaseOrderUpdate
from decimal import Decimal

def calculate_discount_cascade(base_amount: Decimal, discount_str: str) -> Decimal:
    if not discount_str:
        return base_amount
    net = base_amount
    parts = discount_str.replace(' ', '').split('+')
    for p in parts:
        try:
            pct = Decimal(p)
            net = net * (1 - pct / Decimal('100'))
        except Exception:
            pass
    return net

@router.put("/{id}")
def update_purchase_order(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    payload: PurchaseOrderUpdate,
) -> Any:
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Purchase Order not found")
    if order.status != 'draft':
        raise HTTPException(status_code=400, detail="Solo las órdenes en borrador son modificables.")
        
    order.invoice_discount_str = payload.invoice_discount_str
    order.condition_discount_str = payload.condition_discount_str
    order.notes = payload.notes
    order.expiration_date = payload.expiration_date
    if payload.allow_partial_deliveries is not None:
        order.allow_partial_deliveries = payload.allow_partial_deliveries
        
    total_gross = Decimal(0)
    line_map = {line.id: line for line in order.lines}
    
    for l_up in payload.lines:
        qty = Decimal(str(l_up.qty_ordered))
        base_qty = Decimal(str(l_up.expected_base_qty))
        cost = Decimal(str(l_up.unit_cost))
        
        if l_up.id and l_up.id in line_map:
            db_line = line_map[l_up.id]
            db_line.qty_ordered = qty
            db_line.expected_base_qty = base_qty
            db_line.unit_cost = cost
            db_line.line_discount_str = l_up.line_discount_str
            
            line_gross = base_qty * cost
            line_net = calculate_discount_cascade(line_gross, db_line.line_discount_str)
            total_gross += line_net
        else:
            # Regalía o Nueva Línea
            new_line = PurchaseOrderLine(
                order_id=order.id,
                variant_id=l_up.variant_id,
                pack_id=l_up.pack_id,
                qty_ordered=qty,
                expected_base_qty=base_qty,
                unit_cost=cost,
                line_discount_str=l_up.line_discount_str
            )
            db.add(new_line)
            line_gross = base_qty * cost
            line_net = calculate_discount_cascade(line_gross, l_up.line_discount_str)
            total_gross += line_net
            
    net_after_invoice = calculate_discount_cascade(total_gross, order.invoice_discount_str)
    final_net = calculate_discount_cascade(net_after_invoice, order.condition_discount_str)
            
    order.total_amount = final_net
    db.commit()
    
    return {"status": "updated", "total_amount": final_net}

from fastapi.responses import Response
from app.services.pdf_service import generate_purchase_order_pdf
from datetime import datetime

@router.get("/{id}/pdf")
def get_purchase_order_pdf(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
):
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Purchase Order not found")
        
    pdf_bytes = generate_purchase_order_pdf(id, db)
    return Response(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": f"inline; filename=ODC_{order.reference}.pdf"})

@router.get("/portal/{secure_token}/download")
def download_purchase_order_public(
    *,
    db: Session = Depends(deps.get_db),
    secure_token: str
):
    order = db.query(PurchaseOrder).filter(PurchaseOrder.secure_token == secure_token).first()
    if not order:
        raise HTTPException(status_code=404, detail="Enlace inválido o expirado.")
        
    # Telemetría: Marcar como Leído (Doble Check)
    if not order.supplier_viewed_at:
        order.supplier_viewed_at = datetime.utcnow()
        if order.status == 'sent':
            order.status = 'viewed'
        db.commit()
        
    pdf_bytes = generate_purchase_order_pdf(order.id, db)
    return Response(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": f"inline; filename=ODC_{order.reference}.pdf"})

@router.post("/{id}/send")
def trigger_send_purchase_order(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
):
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Purchase Order not found")
        
    if order.status not in ['approved', 'sent', 'viewed']:
        raise HTTPException(status_code=400, detail="La orden debe estar aprobada para ser enviada.")
        
    # Extraer contacto del proveedor (Resguardado contra Lazy Loading de SQLAlchemy)
    try:
        sup_email = order.supplier.commercial_email if order.supplier else "proveedor@ejemplo.com"
        sup_phone = order.supplier.commercial_contact_phone if order.supplier else "+1234567890"
    except AttributeError:
        sup_email = "proveedor@ejemplo.com"
        sup_phone = "+1234567890"

    target_email = sup_email if sup_email else "proveedor@ejemplo.com"
    target_phone = sup_phone if sup_phone else "+1234567890"
    
    # Enrutador Strategy (Python Mocks)
    from app.services.notification_service import dispatch_purchase_order
    success = dispatch_purchase_order(order, method="email", target=target_email)
    dispatch_purchase_order(order, method="whatsapp", target=target_phone)
    
    if success and order.status == 'approved':
        order.status = 'sent'
        db.commit()
        
    return {"status": "enviado", "channel": "multi-channel"}

from app.schemas.purchase_order import PurchaseOrderConciliation

@router.post("/{id}/conciliate")
def conciliate_purchase_order(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    payload: PurchaseOrderConciliation
):
    from app.models.inventory import ProductVariant, Product
    from app.models.core import User
    from datetime import datetime
    
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
        
    if order.status != 'received':
        raise HTTPException(status_code=400, detail="Solo las órdenes en estado 'Recibido' por WMS pueden ser conciliadas fiscalmente.")
        
    admin = db.query(User).first()
    admin_id = admin.id if admin else None

    order.invoice_number = payload.invoice_number
    order.invoice_date = payload.invoice_date
    order.conciliated_at = datetime.utcnow()
    order.conciliated_by_id = admin_id
    
    line_map = {line.id: line for line in order.lines}
    
    for l_payload in payload.lines:
        db_line = line_map.get(l_payload.id)
        if not db_line:
            continue
            
        # 1. Validación Estricta WMS vs Factura (No pagar de más)
        if l_payload.billed_qty > db_line.received_base_qty:
            db.rollback()
            raise HTTPException(status_code=400, detail=f"Fraude Detectado: Intenta facturar {l_payload.billed_qty} unds pero el WMS solo recibió {db_line.received_base_qty} unds físicas.")
            
        db_line.billed_qty = l_payload.billed_qty
        db_line.billed_unit_cost = l_payload.billed_unit_cost
        
        # 2. Actualización de Costos y Precios de Venta (Protección de Margen)
        variant = db.query(ProductVariant).filter(ProductVariant.id == db_line.variant_id).first()
        if variant:
            # Actualiza Costo de Reposición (Último Costo Real)
            variant.replacement_cost = l_payload.billed_unit_cost
            
            # Recálculo WAVG Básico (Promedio)
            # Para un ERP real, esto requiere leer el stock físico actual. Simplificado para MVP Fase 8.
            if variant.average_cost == 0:
                variant.average_cost = l_payload.billed_unit_cost
            else:
                variant.average_cost = (variant.average_cost + l_payload.billed_unit_cost) / 2
                
            # Refleja también en el Producto Maestro si es necesario
            prod = db.query(Product).filter(Product.id == variant.product_id).first()
            if prod:
                # Simulamos que actualiza algún campo master si hiciera falta.
                pass
                
            # 3. Protección de Margen
            if l_payload.new_sales_price is not None and l_payload.new_sales_price > 0:
                variant.sales_price = l_payload.new_sales_price
                variant.last_price_updated_at = datetime.utcnow()
                variant.last_price_updated_by_id = admin_id
                
    order.status = 'conciliated'
    db.commit()
    return {"status": "conciliated", "invoice": payload.invoice_number}

@router.delete("/{id}")
def delete_purchase_order(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
) -> Any:
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden de compra no encontrada")
    if order.status != 'draft':
        raise HTTPException(status_code=400, detail="Solo las órdenes en borrador pueden ser eliminadas.")
    
    db.query(PurchaseOrderLine).filter(PurchaseOrderLine.order_id == id).delete()
    db.delete(order)
    db.commit()
    return {"status": "deleted"}
