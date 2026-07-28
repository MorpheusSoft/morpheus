from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session
from uuid import UUID
from datetime import datetime
from app.api.deps import get_db
from app.models.purchasing import PurchaseOrder
from app.models.inventory import ProductVariant, ProductPackaging
from app.schemas.purchase_order import PublicPurchaseOrderResponse, PublicPurchaseOrderLine
from app.services.pdf_service import generate_purchase_order_pdf
from typing import Any

router = APIRouter()

@router.get("/{token}", response_model=PublicPurchaseOrderResponse)
def get_public_order(token: UUID, db: Session = Depends(get_db)) -> Any:
    order = db.query(PurchaseOrder).filter(PurchaseOrder.public_token == token).first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden de compra no encontrada")
        
    # Mark as viewed by supplier if not set
    if not order.seen_by_supplier_at:
        order.seen_by_supplier_at = datetime.now()
        db.commit()
        db.refresh(order)
        
    # Build lines with product names and SKUs
    public_lines = []
    for line in order.lines:
        variant = db.query(ProductVariant).filter(ProductVariant.id == line.variant_id).first()
        variant_sku = variant.sku if variant else "N/A"
        variant_name = variant.product.name if (variant and variant.product) else "Producto Desconocido"
        
        pack_name = "Unidad Base"
        if line.pack_id:
            pack = db.query(ProductPackaging).filter(ProductPackaging.id == line.pack_id).first()
            if pack:
                pack_name = pack.name
                
        public_lines.append(
            PublicPurchaseOrderLine(
                variant_sku=variant_sku,
                variant_name=variant_name,
                qty_ordered=line.qty_ordered,
                expected_base_qty=line.expected_base_qty,
                unit_cost=line.unit_cost,
                packaging_name=pack_name
            )
        )
        
    response = PublicPurchaseOrderResponse(
        id=order.id,
        reference=order.reference,
        status=order.status,
        total_amount=order.total_amount,
        created_at=order.created_at,
        seen_by_supplier_at=order.seen_by_supplier_at,
        accepted_by_supplier_at=order.accepted_by_supplier_at,
        supplier_name=order.supplier.name if order.supplier else "N/A",
        dest_facility_name=order.dest_facility.name if order.dest_facility else "General",
        lines=public_lines
    )
    return response

@router.post("/{token}/accept")
def accept_public_order(token: UUID, request: Request, db: Session = Depends(get_db)) -> Any:
    order = db.query(PurchaseOrder).filter(PurchaseOrder.public_token == token).first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden de compra no encontrada")
        
    order.accepted_by_supplier_at = datetime.now()
    order.supplier_ip_accepted = request.client.host if request.client else "unknown"
    order.status = "confirmed" # Update to confirmed
    
    db.commit()
    db.refresh(order)
    return {"ok": True, "accepted_at": order.accepted_by_supplier_at}

@router.get("/{token}/pdf")
def download_public_order_pdf(token: UUID, db: Session = Depends(get_db)) -> Any:
    order = db.query(PurchaseOrder).filter(PurchaseOrder.public_token == token).first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden de compra no encontrada")
        
    pdf_bytes = generate_purchase_order_pdf(order.id, db, code_type="sku")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=ODC_{order.reference}.pdf"}
    )
