from datetime import datetime, timedelta, timezone, date
from decimal import Decimal
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.inventory import ProductVariant, Product, InventorySnapshot, Category
from app.models.sales import Document, DocumentLine, DocumentState, DocumentType
from app.models.core import SystemSettings
from app.models.digital_workers import DigitalWorker, DigitalWorkerActionLog

def get_dead_stock_threshold(db: Session) -> int:
    settings = db.query(SystemSettings).first()
    if settings and hasattr(settings, 'dead_stock_days_threshold') and settings.dead_stock_days_threshold:
        return settings.dead_stock_days_threshold
    return 60

def evaluate_variant_dead_stock(
    db: Session,
    variant_id: int,
    days_threshold: Optional[int] = None,
    auto_block: bool = True,
    worker_code: str = "CLARA_COMPRAS"
) -> Dict[str, Any]:
    """
    Evalúa si un SKU específico califica como Dead Stock / Stock Estancado:
    - Cruza existencias positivas con la última fecha de venta registrada en POS.
    - Si dias_sin_ventas >= threshold y qty > 0 -> DEAD_STOCK y bloqueo de recompra.
    """
    variant = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
    if not variant:
        raise ValueError(f"SKU {variant_id} no encontrado.")

    threshold = days_threshold or get_dead_stock_threshold(db)
    now = datetime.now(timezone.utc)

    # 1. Existencias físicas actuales
    stock_raw = db.query(func.sum(InventorySnapshot.stock_qty))\
        .filter(InventorySnapshot.variant_id == variant_id).scalar()
    qty_on_hand = Decimal(str(stock_raw)) if stock_raw else Decimal('0.0')

    cost = Decimal(str(variant.replacement_cost or variant.average_cost or variant.standard_cost or 0.0))
    valuation_usd = qty_on_hand * cost

    # 2. Última fecha de venta en documentos confirmados o pagados
    last_sale_dt = db.query(func.max(Document.created_at))\
        .join(DocumentLine, Document.id == DocumentLine.document_id)\
        .filter(
            DocumentLine.variant_id == variant_id,
            Document.type.in_([DocumentType.INVOICE, DocumentType.DELIVERY_NOTE, DocumentType.ORDER]),
            Document.state.in_([DocumentState.PAID, DocumentState.CONFIRMED])
        ).scalar()

    last_sale_date: Optional[date] = None
    if last_sale_dt:
        last_sale_date = last_sale_dt.date() if hasattr(last_sale_dt, 'date') else last_sale_dt
        days_without_sales = max(0, (now.date() - last_sale_date).days)
    else:
        # Si nunca se ha vendido, medimos desde su fecha de creación o catálogo
        v_date = variant.product.created_at.date() if (variant.product and variant.product.created_at) else now.date()
        days_without_sales = max(0, (now.date() - v_date).days)

    # 3. Clasificación y Acción de Clara
    old_blocked = variant.is_blocked_for_purchasing
    product_name = variant.product.name if variant.product else f"SKU {variant.sku}"
    cat_name = variant.product.category.name if (variant.product and variant.product.category) else "Sin Categoría"
    brand = variant.product.brand if variant.product else "Genérica"

    if qty_on_hand > Decimal('0.0') and days_without_sales >= threshold:
        dead_stock_status = "DEAD_STOCK"
        action = (
            f"⛔ Inmovilizado Crítico: {days_without_sales} días sin ventas con {qty_on_hand:.1f} unidades "
            f"(${valuation_usd:,.2f} inmovilizados). Clara bloquea la recompra en MRP y sugiere convenio Sell-Out o devolución."
        )
        if auto_block:
            variant.is_blocked_for_purchasing = True
            variant.purchasing_blocked_reason = f"Dead Stock: {days_without_sales} días sin ventas ({qty_on_hand:.0f} unds estancadas)"
    elif qty_on_hand > Decimal('0.0') and days_without_sales >= (threshold // 2):
        dead_stock_status = "SLOW_MOVING"
        action = (
            f"⚠️ Rotación Lenta: {days_without_sales} días sin ventas ({qty_on_hand:.1f} unidades en stock). "
            f"Se sugiere no generar pedidos de reposición masivos."
        )
    else:
        dead_stock_status = "HEALTHY"
        action = "✅ Rotación normal dentro del rango estándar de ventas."

    # Si se bloquea por primera vez, registrar en el log del trabajador digital
    if auto_block and not old_blocked and variant.is_blocked_for_purchasing:
        worker = db.query(DigitalWorker).filter(DigitalWorker.agent_code == worker_code).first()
        worker_id = worker.id if worker else None
        action_log = DigitalWorkerActionLog(
            worker_id=worker_id,
            action_type="DEAD_STOCK_PURCHASING_BLOCKED",
            target_entity_type="product_variant",
            target_entity_id=str(variant.id),
            severity="WARNING",
            summary=f"Clara bloqueó la recompra de '{product_name}' (SKU: {variant.sku}) por inmovilización ({days_without_sales} días sin ventas).",
            details={
                "variant_id": variant.id,
                "sku": variant.sku,
                "days_without_sales": days_without_sales,
                "qty_on_hand": float(qty_on_hand),
                "valuation_usd": float(valuation_usd),
                "threshold_applied": threshold
            },
            status="COMPLETED"
        )
        db.add(action_log)

    variant.days_without_sales = days_without_sales
    variant.dead_stock_status = dead_stock_status
    db.commit()

    return {
        "variant_id": variant.id,
        "product_id": variant.product_id,
        "sku": variant.sku,
        "product_name": product_name,
        "barcode": variant.barcode,
        "category_name": cat_name,
        "brand": brand,
        "qty_on_hand": qty_on_hand,
        "stock_valuation_usd": round(valuation_usd, 2),
        "days_without_sales": days_without_sales,
        "last_sale_date": last_sale_date,
        "dead_stock_status": dead_stock_status,
        "is_blocked_for_purchasing": bool(variant.is_blocked_for_purchasing),
        "purchasing_blocked_reason": variant.purchasing_blocked_reason,
        "clara_recommended_action": action
    }

def audit_all_dead_stock(
    db: Session,
    days_threshold: Optional[int] = None,
    auto_block: bool = True,
    worker_code: str = "CLARA_COMPRAS"
) -> Dict[str, Any]:
    """
    Escaneo completo de existencias en almacenes para detectar Dead Stock y productos de rotación lenta.
    Optimizado en una sola consulta de agregación masiva para ejecutar en ~200ms sin bloquear el servidor.
    """
    from sqlalchemy import text
    threshold = days_threshold or get_dead_stock_threshold(db)
    now = datetime.now(timezone.utc)
    today = now.date()

    sql = text("""
        WITH stock_data AS (
            SELECT variant_id, SUM(stock_qty) AS qty_on_hand
            FROM inv.inventory_snapshots
            GROUP BY variant_id
            HAVING SUM(stock_qty) > 0
        ),
        latest_sales AS (
            SELECT dl.variant_id, MAX(d.created_at) AS last_sale_at
            FROM sales.document_lines dl
            JOIN sales.documents d ON d.id = dl.document_id
            WHERE d.type IN ('INVOICE', 'DELIVERY_NOTE', 'ORDER')
              AND d.state IN ('PAID', 'CONFIRMED')
            GROUP BY dl.variant_id
        )
        SELECT 
            pv.id AS variant_id,
            pv.product_id,
            pv.sku,
            pv.barcode,
            p.name AS product_name,
            COALESCE(c.name, 'Sin Categoría') AS category_name,
            COALESCE(p.brand, 'Genérica') AS brand,
            sd.qty_on_hand,
            COALESCE(pv.replacement_cost, pv.average_cost, pv.standard_cost, 0.0) AS unit_cost,
            ls.last_sale_at,
            p.created_at AS product_created_at,
            pv.is_blocked_for_purchasing,
            pv.purchasing_blocked_reason
        FROM stock_data sd
        JOIN inv.product_variants pv ON pv.id = sd.variant_id
        JOIN inv.products p ON p.id = pv.product_id
        LEFT JOIN inv.categories c ON c.id = p.category_id
        LEFT JOIN latest_sales ls ON ls.variant_id = pv.id;
    """)

    rows = db.execute(sql).fetchall()

    dead_stock_items = []
    total_capital_dead = Decimal('0.0')
    total_slow = 0
    total_dead = 0
    blocked_count = 0
    to_block_ids = []

    for r in rows:
        var_id = r.variant_id
        qty_on_hand = Decimal(str(r.qty_on_hand or 0.0))
        unit_cost = Decimal(str(r.unit_cost or 0.0))
        valuation_usd = round(qty_on_hand * unit_cost, 2)

        last_sale_dt = r.last_sale_at
        if last_sale_dt:
            last_sale_date = last_sale_dt.date() if hasattr(last_sale_dt, 'date') else last_sale_dt
            days_without_sales = max(0, (today - last_sale_date).days)
        else:
            p_created = r.product_created_at.date() if r.product_created_at else today
            days_without_sales = max(0, (today - p_created).days)
            last_sale_date = None

        is_already_blocked = bool(r.is_blocked_for_purchasing)
        blocked_reason = r.purchasing_blocked_reason

        if days_without_sales >= threshold:
            dead_stock_status = "DEAD_STOCK"
            action = (
                f"⛔ Inmovilizado Crítico: {days_without_sales} días sin ventas con {qty_on_hand:.1f} unidades "
                f"(${valuation_usd:,.2f} inmovilizados). Clara bloquea la recompra en MRP y sugiere convenio Sell-Out o devolución."
            )
            total_dead += 1
            total_capital_dead += valuation_usd
            if auto_block:
                if not is_already_blocked:
                    to_block_ids.append(var_id)
                blocked_count += 1
                is_already_blocked = True
                blocked_reason = f"Dead Stock: inmovilizado ({days_without_sales} días sin ventas)"
            elif is_already_blocked:
                blocked_count += 1
        elif days_without_sales >= (threshold // 2):
            dead_stock_status = "SLOW_MOVING"
            action = (
                f"⚠️ Rotación Lenta: {days_without_sales} días sin ventas ({qty_on_hand:.1f} unidades en stock). "
                f"Se sugiere no generar pedidos de reposición masivos."
            )
            total_slow += 1
            if is_already_blocked:
                blocked_count += 1
        else:
            dead_stock_status = "HEALTHY"
            action = "✅ Rotación normal dentro del rango estándar de ventas."
            if is_already_blocked:
                blocked_count += 1

        if dead_stock_status in ("DEAD_STOCK", "SLOW_MOVING"):
            dead_stock_items.append({
                "variant_id": var_id,
                "product_id": r.product_id,
                "sku": r.sku,
                "product_name": r.product_name,
                "barcode": r.barcode,
                "category_name": r.category_name,
                "brand": r.brand,
                "qty_on_hand": qty_on_hand,
                "stock_valuation_usd": float(valuation_usd),
                "days_without_sales": days_without_sales,
                "last_sale_date": last_sale_date,
                "dead_stock_status": dead_stock_status,
                "is_blocked_for_purchasing": is_already_blocked,
                "purchasing_blocked_reason": blocked_reason,
                "clara_recommended_action": action
            })

    # Actualizar variantes bloqueadas de forma masiva en lote
    if auto_block and to_block_ids:
        db.query(ProductVariant).filter(ProductVariant.id.in_(to_block_ids)).update(
            {
                ProductVariant.is_blocked_for_purchasing: True,
                ProductVariant.purchasing_blocked_reason: f"Dead Stock: inmovilizado (>= {threshold} días sin ventas)"
            },
            synchronize_session=False
        )

        worker = db.query(DigitalWorker).filter(DigitalWorker.agent_code == worker_code).first()
        worker_id = worker.id if worker else None
        action_log = DigitalWorkerActionLog(
            worker_id=worker_id,
            action_type="DEAD_STOCK_PURCHASING_BLOCKED_BATCH",
            target_entity_type="inventory_dead_stock",
            target_entity_id=datetime.now().strftime("%Y%m%d%H%M"),
            severity="WARNING",
            summary=f"Clara bloqueó la recompra de {len(to_block_ids)} SKUs inmovilizados por Dead Stock (>= {threshold} días sin ventas).",
            details={
                "total_newly_blocked": len(to_block_ids),
                "threshold_applied": threshold,
                "sample_variant_ids": to_block_ids[:20]
            },
            status="COMPLETED"
        )
        db.add(action_log)

    db.commit()

    return {
        "total_dead_stock_items": total_dead,
        "total_slow_moving_items": total_slow,
        "total_capital_immobilized_usd": round(total_capital_dead, 2),
        "items_blocked_for_reorder": blocked_count,
        "items": dead_stock_items
    }
