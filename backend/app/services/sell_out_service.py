from datetime import datetime, timezone, date
from decimal import Decimal
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.purchasing import SellOutAgreement, SellOutAgreementLine
from app.models.core import Supplier
from app.models.inventory import ProductVariant, Product
from app.models.sales import Document, DocumentLine, DocumentState, DocumentType
from app.models.digital_workers import DigitalWorker, DigitalWorkerActionLog
from app.schemas.sell_out import SellOutAgreementCreate, ConciliateCreditNoteRequest

def generate_sell_out_code(db: Session) -> str:
    year = datetime.now().year
    count = db.query(SellOutAgreement).filter(
        func.extract('year', SellOutAgreement.created_at) == year
    ).count() + 1
    return f"SO-{year}-{count:04d}"

def create_sell_out_agreement(db: Session, payload: SellOutAgreementCreate) -> SellOutAgreement:
    code = payload.code or generate_sell_out_code(db)
    
    agreement = SellOutAgreement(
        code=code,
        title=payload.title,
        supplier_id=payload.supplier_id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        status="ACTIVE"
    )
    db.add(agreement)
    db.flush()

    for line_in in payload.lines:
        discount = line_in.discount_per_unit
        if discount == Decimal('0.0') and line_in.regular_price > line_in.promo_price:
            discount = line_in.regular_price - line_in.promo_price

        line = SellOutAgreementLine(
            agreement_id=agreement.id,
            variant_id=line_in.variant_id,
            regular_price=line_in.regular_price,
            promo_price=line_in.promo_price,
            discount_per_unit=discount,
            provider_share_pct=line_in.provider_share_pct,
            provider_share_fixed=line_in.provider_share_fixed
        )
        db.add(line)

    db.commit()
    db.refresh(agreement)
    return agreement

def settle_sell_out_agreement(
    db: Session,
    agreement_id: int,
    worker_code: str = "CLARA_COMPRAS"
) -> Dict[str, Any]:
    """
    Auditoría y Liquidación del Convenio Sell-Out por Clara:
    - Escanea las ventas en POS/Facturación registradas entre start_date y end_date.
    - Cuantifica las unidades vendidas por SKU asignado al convenio.
    - Calcula el monto del reclamo a cobrar al proveedor:
      Reclamo = sum(Unidades Vendidas * Aporte Proveedor por Unidad).
    - Pasa el convenio al estado 'SETTLED' y genera el acta de liquidación en el log de Clara.
    """
    agreement = db.query(SellOutAgreement).filter(SellOutAgreement.id == agreement_id).first()
    if not agreement:
        raise ValueError(f"Convenio Sell-Out {agreement_id} no existe.")

    start_dt = datetime.combine(agreement.start_date, datetime.min.time()).replace(tzinfo=timezone.utc)
    end_dt = datetime.combine(agreement.end_date, datetime.max.time()).replace(tzinfo=timezone.utc)

    total_units_sold = Decimal('0.0')
    total_claim = Decimal('0.0')

    for line in agreement.lines:
        sales_qty_raw = db.query(func.sum(DocumentLine.quantity))\
            .join(Document, DocumentLine.document_id == Document.id)\
            .filter(
                DocumentLine.variant_id == line.variant_id,
                Document.created_at >= start_dt,
                Document.created_at <= end_dt,
                Document.type.in_([DocumentType.INVOICE, DocumentType.DELIVERY_NOTE, DocumentType.ORDER]),
                Document.state.in_([DocumentState.PAID, DocumentState.CONFIRMED])
            ).scalar()

        units_sold = Decimal(str(sales_qty_raw)) if sales_qty_raw else Decimal('0.0')
        line.units_sold_qty = units_sold

        # Aporte pactado por unidad
        if line.provider_share_fixed > Decimal('0.0'):
            claim_per_unit = line.provider_share_fixed
        else:
            claim_per_unit = line.discount_per_unit * (line.provider_share_pct / Decimal('100.0'))

        line_claim = units_sold * claim_per_unit
        line.claim_amount = round(line_claim, 4)

        total_units_sold += units_sold
        total_claim += line.claim_amount

    now = datetime.now(timezone.utc)
    agreement.total_claim_amount = round(total_claim, 2)
    agreement.settled_at = now
    agreement.status = "SETTLED"

    worker = db.query(DigitalWorker).filter(DigitalWorker.agent_code == worker_code).first()
    if worker:
        agreement.settled_by_worker_id = worker.id

    supplier_name = agreement.supplier.name if agreement.supplier else f"Proveedor #{agreement.supplier_id}"
    summary_msg = (
        f"Liquidación de Convenio Sell-Out '{agreement.title}' ({agreement.code}) finalizada por Clara: "
        f"{total_units_sold:,.0f} unidades vendidas auditadas. Reclamo total de ${total_claim:,.2f} a exigir a {supplier_name}."
    )

    action_log = DigitalWorkerActionLog(
        worker_id=worker.id if worker else None,
        action_type="SELL_OUT_AGREEMENT_SETTLED",
        target_entity_type="sell_out_agreement",
        target_entity_id=str(agreement.id),
        severity="INFO",
        summary=summary_msg,
        details={
            "agreement_id": agreement.id,
            "code": agreement.code,
            "supplier_id": agreement.supplier_id,
            "supplier_name": supplier_name,
            "total_units_sold": float(total_units_sold),
            "total_claim_amount": float(total_claim),
            "lines_count": len(agreement.lines)
        },
        recipient_target="COMPRAS_FINANZAS",
        status="COMPLETED"
    )
    db.add(action_log)
    db.commit()
    db.refresh(agreement)

    return {
        "ok": True,
        "agreement_id": agreement.id,
        "agreement_code": agreement.code,
        "total_units_sold": total_units_sold,
        "total_claim_amount": agreement.total_claim_amount,
        "lines_settled": len(agreement.lines),
        "settled_at": now,
        "message": summary_msg
    }

def conciliate_sell_out_credit_note(
    db: Session,
    agreement_id: int,
    req: ConciliateCreditNoteRequest,
    worker_code: str = "CLARA_COMPRAS"
) -> Dict[str, Any]:
    """
    Conciliación 3-Way de Nota de Crédito recibida contra el Reclamo Liquidado del Convenio Sell-Out:
    - Valida que el monto emitido por el proveedor en la N/C concuerde con el monto auditado de ventas.
    - Emite estatus de conciliación ('MATCH_EXACT' o 'DISCREPANCY').
    - Registra el crédito como compensación a favor en el sistema.
    """
    agreement = db.query(SellOutAgreement).filter(SellOutAgreement.id == agreement_id).first()
    if not agreement:
        raise ValueError(f"Convenio Sell-Out {agreement_id} no existe.")

    nc_amount = Decimal(str(req.credit_note_amount))
    claim_amount = Decimal(str(agreement.total_claim_amount or 0.0))
    diff = abs(nc_amount - claim_amount)

    # Tolerancia de centavos
    if diff <= Decimal('0.05'):
        conciliation_status = "MATCH_EXACT"
        message = (
            f"✅ Conciliación Exacta: La Nota de Crédito {req.credit_note_number} por ${nc_amount:,.2f} "
            f"coincide plenamente con el reclamo liquidado de ${claim_amount:,.2f}."
        )
    elif nc_amount < claim_amount:
        conciliation_status = "DISCREPANCY"
        message = (
            f"⚠️ Discrepancia por Déficit: La Nota de Crédito {req.credit_note_number} (${nc_amount:,.2f}) "
            f"es menor al monto liquidado (${claim_amount:,.2f}) por una diferencia de ${diff:,.2f}."
        )
    else:
        conciliation_status = "MATCH_EXACT" # El proveedor acreditó más o igual
        message = (
            f"✅ Conciliación Aprobada con Excedente: N/C {req.credit_note_number} (${nc_amount:,.2f}) "
            f"cubre la totalidad del reclamo de ${claim_amount:,.2f}."
        )

    agreement.credit_note_number = req.credit_note_number.strip().upper()
    agreement.credit_note_amount = nc_amount
    agreement.credit_note_date = req.credit_note_date
    agreement.conciliation_status = conciliation_status
    agreement.conciliation_notes = req.notes or message
    agreement.status = "CONCILIATED"
    agreement.updated_at = datetime.now(timezone.utc)

    worker = db.query(DigitalWorker).filter(DigitalWorker.agent_code == worker_code).first()
    action_log = DigitalWorkerActionLog(
        worker_id=worker.id if worker else None,
        action_type="SELL_OUT_NC_CONCILIATED",
        target_entity_type="sell_out_agreement",
        target_entity_id=str(agreement.id),
        severity="INFO" if conciliation_status == "MATCH_EXACT" else "WARNING",
        summary=f"Clara concilió N/C {req.credit_note_number} para Convenio {agreement.code}: {conciliation_status}.",
        details={
            "agreement_id": agreement.id,
            "credit_note_number": req.credit_note_number,
            "credit_note_amount": float(nc_amount),
            "claim_amount": float(claim_amount),
            "difference": float(diff),
            "status": conciliation_status
        },
        recipient_target="COMPRAS_FINANZAS",
        status="COMPLETED"
    )
    db.add(action_log)
    db.commit()
    db.refresh(agreement)

    return {
        "ok": True,
        "agreement_id": agreement.id,
        "conciliation_status": conciliation_status,
        "discrepancy_amount": diff,
        "message": message
    }

def get_sell_out_agreements(
    db: Session,
    status: Optional[str] = None,
    supplier_id: Optional[int] = None
) -> List[Dict[str, Any]]:
    query = db.query(SellOutAgreement)
    if status:
        query = query.filter(SellOutAgreement.status == status)
    if supplier_id:
        query = query.filter(SellOutAgreement.supplier_id == supplier_id)

    agreements = query.order_by(SellOutAgreement.created_at.desc()).all()
    results = []
    for a in agreements:
        results.append({
            "id": a.id,
            "code": a.code,
            "title": a.title,
            "supplier_id": a.supplier_id,
            "supplier_name": a.supplier.name if a.supplier else "N/A",
            "start_date": a.start_date,
            "end_date": a.end_date,
            "status": a.status,
            "total_claim_amount": a.total_claim_amount,
            "settled_at": a.settled_at,
            "settled_by_worker_id": a.settled_by_worker_id,
            "credit_note_number": a.credit_note_number,
            "credit_note_date": a.credit_note_date,
            "credit_note_amount": a.credit_note_amount,
            "conciliation_status": a.conciliation_status,
            "conciliation_notes": a.conciliation_notes,
            "created_at": a.created_at,
            "updated_at": a.updated_at,
            "lines": [
                {
                    "id": l.id,
                    "agreement_id": l.agreement_id,
                    "variant_id": l.variant_id,
                    "regular_price": l.regular_price,
                    "promo_price": l.promo_price,
                    "discount_per_unit": l.discount_per_unit,
                    "provider_share_pct": l.provider_share_pct,
                    "provider_share_fixed": l.provider_share_fixed,
                    "units_sold_qty": l.units_sold_qty,
                    "claim_amount": l.claim_amount,
                    "created_at": l.created_at,
                    "sku": l.variant.sku if l.variant else "N/A",
                    "product_name": l.variant.product.name if (l.variant and l.variant.product) else "N/A",
                    "barcode": l.variant.barcode if l.variant else None
                }
                for l in a.lines
            ]
        })
    return results
