from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Dict, Any, Optional, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.inventory import (
    ProductVariant, Product, InventoryAdjustment, InventoryAdjustmentLine,
    AdjustmentReason, Category
)
from app.models.sales import Document, DocumentLine, DocumentType, DocumentState
from app.models.core import SystemSettings, User
from app.models.digital_workers import DigitalWorker, DigitalWorkerActionLog

# Códigos o patrones de ajuste que representan merma/pérdida
SHRINKAGE_REASON_CODES = ["MERMA", "MERMA_01", "DANNO", "SCRAP", "VENCIMIENTO", "AVERIA"]

def get_shrinkage_reasons(db: Session) -> List[int]:
    reasons = db.query(AdjustmentReason).filter(
        (AdjustmentReason.code.in_(SHRINKAGE_REASON_CODES)) |
        (AdjustmentReason.name.ilike("%merma%")) |
        (AdjustmentReason.name.ilike("%avería%")) |
        (AdjustmentReason.name.ilike("%daño%")) |
        (AdjustmentReason.name.ilike("%scrap%"))
    ).all()
    return [r.id for r in reasons]

def evaluate_variant_shrinkage_and_margin(
    db: Session,
    variant_id: int,
    lookback_days: int = 90,
    auto_block: bool = True,
    worker_code: str = "CLARA_COMPRAS"
) -> Dict[str, Any]:
    """
    Evalúa el Factor de Merma Real y su impacto en el Margen Real Neto de un SKU:
    - Suma unidades mermadas en WMS dentro del lookback_days.
    - Suma unidades vendidas en POS/Ventas en el mismo periodo.
    - Factor de Merma % = (Unidades Mermadas / (Unidades Vendidas + Unidades Mermadas)) * 100.
    - Margen Bruto % = ((Precio Venta - Costo Reposición) / Precio Venta) * 100.
    - Margen Real Neto % = Margen Bruto % - Factor de Merma %.
    - Si Margen Real Neto <= 0: Bloquea automáticamente para compras y genera alerta por Clara.
    """
    variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
    if not variant:
        raise ValueError(f"SKU/Variante con ID {variant_id} no encontrado.")

    cutoff_date = datetime.now(timezone.utc) - timedelta(days=lookback_days)

    # 1. Unidades mermadas en ajustes aprobados o pendientes
    reason_ids = get_shrinkage_reasons(db)
    shrinkage_qty = Decimal('0.0')
    if reason_ids:
        adj_query = db.query(func.sum(InventoryAdjustmentLine.quantity))\
            .join(InventoryAdjustment, InventoryAdjustmentLine.adjustment_id == InventoryAdjustment.id)\
            .filter(
                InventoryAdjustmentLine.product_variant_id == variant_id,
                InventoryAdjustment.reason_id.in_(reason_ids),
                InventoryAdjustment.movement_type == 'OUT',
                InventoryAdjustment.created_at >= cutoff_date
            )
        raw_shrinkage = adj_query.scalar()
        if raw_shrinkage:
            shrinkage_qty = abs(Decimal(str(raw_shrinkage)))

    # 2. Unidades vendidas en Documentos de Ventas (Facturas/Entregas confirmadas o pagadas)
    sales_query = db.query(func.sum(DocumentLine.quantity))\
        .join(Document, DocumentLine.document_id == Document.id)\
        .filter(
            DocumentLine.variant_id == variant_id,
            Document.type.in_([DocumentType.INVOICE, DocumentType.DELIVERY_NOTE, DocumentType.ORDER]),
            Document.state.in_([DocumentState.PAID, DocumentState.CONFIRMED]),
            Document.created_at >= cutoff_date
        )
    raw_sales = sales_query.scalar()
    units_sold = Decimal(str(raw_sales)) if raw_sales else Decimal('0.0')

    # 3. Costo y Precio
    cost = Decimal(str(variant.replacement_cost or variant.average_cost or variant.standard_cost or 0.0))
    price = Decimal(str(variant.sales_price or 0.0))

    if price > Decimal('0.0'):
        gross_margin_pct = ((price - cost) / price) * Decimal('100.0')
    else:
        gross_margin_pct = Decimal('0.0')

    total_flow = units_sold + shrinkage_qty
    if total_flow > Decimal('0.0'):
        shrinkage_pct = (shrinkage_qty / total_flow) * Decimal('100.0')
    else:
        shrinkage_pct = Decimal('0.0')

    net_real_margin = gross_margin_pct - shrinkage_pct
    shrinkage_loss_usd = shrinkage_qty * cost

    # 4. Estado de Rentabilidad y Veredicto de Clara
    product_name = variant.product.name if variant.product else f"SKU {variant.sku}"
    old_blocked = variant.is_blocked_for_purchasing

    if net_real_margin <= Decimal('0.0') and shrinkage_qty > Decimal('0.0'):
        profitability_status = "NEGATIVE_MARGIN"
        verdict = (
            f"⚠️ Destrucción de Margen: La merma del {shrinkage_pct:.1f}% supera el margen comercial ({gross_margin_pct:.1f}%). "
            f"Margen real neto en pérdida ({net_real_margin:.1f}%). Recompra bloqueada en MRP por Clara."
        )
        if auto_block:
            variant.is_blocked_for_purchasing = True
            variant.purchasing_blocked_reason = f"Margen real negativo ({net_real_margin:.1f}%) debido a mermas ({shrinkage_pct:.1f}%)"
    elif net_real_margin < Decimal('15.0') and shrinkage_qty > Decimal('0.0'):
        profitability_status = "AT_RISK"
        verdict = (
            f"⚡ Margen en Riesgo: Margen neto real comprimido al {net_real_margin:.1f}% "
            f"(Margen bruto {gross_margin_pct:.1f}% - Merma {shrinkage_pct:.1f}%). Vigilar compras."
        )
    else:
        profitability_status = "HEALTHY"
        verdict = (
            f"✅ Rentabilidad Saludable: Margen neto real del {net_real_margin:.1f}% "
            f"(Merma controlada en {shrinkage_pct:.1f}%)."
        )

    # Si se bloqueó recién, registrar en DigitalWorkerActionLog
    if auto_block and not old_blocked and variant.is_blocked_for_purchasing:
        worker = db.query(DigitalWorker).filter(DigitalWorker.agent_code == worker_code).first()
        worker_id = worker.id if worker else None
        action_log = DigitalWorkerActionLog(
            worker_id=worker_id,
            action_type="PRODUCT_PURCHASING_BLOCKED",
            target_entity_type="product_variant",
            target_entity_id=str(variant.id),
            severity="WARNING",
            summary=f"Clara bloqueó la recompra de '{product_name}' (SKU: {variant.sku}) por margen real negativo ({net_real_margin:.1f}%).",
            details={
                "variant_id": variant.id,
                "sku": variant.sku,
                "gross_margin_pct": float(gross_margin_pct),
                "shrinkage_pct": float(shrinkage_pct),
                "net_real_margin": float(net_real_margin),
                "units_shrinkage": float(shrinkage_qty),
                "units_sold": float(units_sold),
                "loss_usd": float(shrinkage_loss_usd)
            },
            status="COMPLETED"
        )
        db.add(action_log)

    variant.shrinkage_pct = round(shrinkage_pct, 2)
    variant.net_real_margin = round(net_real_margin, 2)
    db.commit()

    return {
        "variant_id": variant.id,
        "sku": variant.sku,
        "product_name": product_name,
        "sales_price": price,
        "replacement_cost": cost,
        "gross_margin_pct": round(gross_margin_pct, 2),
        "units_sold": units_sold,
        "units_shrinkage": shrinkage_qty,
        "shrinkage_cost_usd": round(shrinkage_loss_usd, 2),
        "shrinkage_pct": round(shrinkage_pct, 2),
        "net_real_margin_pct": round(net_real_margin, 2),
        "profitability_status": profitability_status,
        "is_blocked_for_purchasing": bool(variant.is_blocked_for_purchasing),
        "purchasing_blocked_reason": variant.purchasing_blocked_reason,
        "clara_verdict": verdict
    }

def audit_all_shrinkage_profitability(
    db: Session,
    lookback_days: int = 90,
    auto_block: bool = True
) -> Dict[str, Any]:
    """
    Auditoría masiva de mermas y rentabilidad neta:
    Examina todos los SKUs activos que hayan tenido mermas registradas o ventas en los últimos 90 días.
    """
    reason_ids = get_shrinkage_reasons(db)
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=lookback_days)

    # Identificar variantes con mermas
    variants_with_shrinkage = []
    if reason_ids:
        raw_ids = db.query(InventoryAdjustmentLine.product_variant_id).join(
            InventoryAdjustment, InventoryAdjustmentLine.adjustment_id == InventoryAdjustment.id
        ).filter(
            InventoryAdjustment.reason_id.in_(reason_ids),
            InventoryAdjustment.movement_type == 'OUT',
            InventoryAdjustment.created_at >= cutoff_date
        ).distinct().all()
        variants_with_shrinkage = [r[0] for r in raw_ids if r[0]]

    evaluated_items = []
    total_loss_usd = Decimal('0.0')
    skus_at_risk = 0

    for var_id in variants_with_shrinkage:
        res = evaluate_variant_shrinkage_and_margin(db, var_id, lookback_days=lookback_days, auto_block=auto_block)
        evaluated_items.append(res)
        total_loss_usd += res["shrinkage_cost_usd"]
        if res["profitability_status"] in ("AT_RISK", "NEGATIVE_MARGIN"):
            skus_at_risk += 1

    avg_shrinkage = (
        sum(item["shrinkage_pct"] for item in evaluated_items) / len(evaluated_items)
        if evaluated_items else Decimal('0.0')
    )

    return {
        "total_skus_evaluated": len(evaluated_items),
        "skus_at_risk": skus_at_risk,
        "total_shrinkage_loss_usd": round(total_loss_usd, 2),
        "average_shrinkage_pct": round(avg_shrinkage, 2),
        "items": evaluated_items
    }

def toggle_purchasing_block(
    db: Session,
    variant_id: int,
    is_blocked: bool,
    reason: Optional[str] = None,
    user_id: Optional[int] = None
) -> Dict[str, Any]:
    """Permite al analista de compras desbloquear o bloquear manualmente la compra de un SKU."""
    variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
    if not variant:
        raise ValueError(f"SKU {variant_id} no encontrado.")

    variant.is_blocked_for_purchasing = is_blocked
    variant.purchasing_blocked_reason = reason if is_blocked else None
    db.commit()
    db.refresh(variant)

    return {
        "ok": True,
        "variant_id": variant.id,
        "sku": variant.sku,
        "is_blocked_for_purchasing": variant.is_blocked_for_purchasing,
        "purchasing_blocked_reason": variant.purchasing_blocked_reason
    }
