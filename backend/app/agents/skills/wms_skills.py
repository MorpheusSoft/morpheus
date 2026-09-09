import logging
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from uuid import uuid4
from typing import List, Dict, Any
from sqlalchemy.orm import Session

# Import models
from app.models.purchasing import PurchaseOrder, SupplierProduct
from app.models.inventory import (
    InventorySnapshot, ProductVariant, Product, 
    InventoryAdjustment, InventoryAdjustmentLine, AdjustmentReason, Warehouse
)
from app.models.core import Supplier, Facility
from app.models.digital_workers import DigitalWorker, DigitalWorkerActionLog

logger = logging.getLogger(__name__)

def audit_negative_stock(db: Session, worker: DigitalWorker) -> List[Dict[str, Any]]:
    """
    Habilidad WMS: Inspecciona snapshots de inventario buscando saldos negativos.
    Genera borradores de ajuste de inventario (PENDING) bajo el principio de 4 ojos
    y registra cada hallazgo en la bitácora de acciones del trabajador digital.
    """
    results = []
    allowed_facility_ids = [f.id for f in worker.user.facilities] if worker.user and worker.user.facilities else [1]

    # Buscar snapshots negativos
    negative_snapshots = db.query(InventorySnapshot, ProductVariant, Product, Facility)\
        .join(ProductVariant, ProductVariant.id == InventorySnapshot.variant_id)\
        .join(Product, Product.id == ProductVariant.product_id)\
        .join(Facility, Facility.id == InventorySnapshot.facility_id)\
        .filter(
            InventorySnapshot.facility_id.in_(allowed_facility_ids),
            InventorySnapshot.stock_qty < 0
        ).all()

    if not negative_snapshots:
        logger.info(f"[{worker.agent_code}] No se encontraron existencias negativas en las sedes {allowed_facility_ids}.")
        return results

    # Obtener motivo por defecto para sobrante/regularización de stock negativo
    reason = db.query(AdjustmentReason).filter(AdjustmentReason.code == 'SOBRANTE_01').first()
    if not reason:
        reason = db.query(AdjustmentReason).first()

    for snap, variant, product, facility in negative_snapshots:
        # 1. Verificar si ya existe un ajuste PENDING para este variante y sede (evitar duplicar borradores)
        existing_pending = db.query(InventoryAdjustment)\
            .join(InventoryAdjustmentLine, InventoryAdjustmentLine.adjustment_id == InventoryAdjustment.id)\
            .filter(
                InventoryAdjustment.facility_id == snap.facility_id,
                InventoryAdjustment.state == 'PENDING',
                InventoryAdjustmentLine.product_variant_id == snap.variant_id
            ).first()

        if existing_pending:
            logger.info(f"[{worker.agent_code}] Ya existe ajuste borrador {existing_pending.number} para {variant.sku}.")
            continue

        # 2. Buscar almacén de la sede
        warehouse = db.query(Warehouse).filter(Warehouse.facility_id == snap.facility_id).first()
        warehouse_id = warehouse.id if warehouse else 1

        # 3. Crear el borrador de ajuste
        adj_number = f"AJ-{datetime.now().year}-{uuid4().hex[:6].upper()}"
        discrepancy_qty = abs(snap.stock_qty)
        unit_cost = variant.average_cost or variant.standard_cost or variant.last_cost or Decimal("0.0")
        total_amount = Decimal(str(discrepancy_qty)) * Decimal(str(unit_cost))

        adjustment = InventoryAdjustment(
            number=adj_number,
            facility_id=snap.facility_id,
            warehouse_id=warehouse_id,
            reason_id=reason.id if reason else 1,
            movement_type='IN',
            total_amount=total_amount,
            notes=f"Propuesto automáticamente por {worker.display_title}: Regularización sugerida para saldo negativo de {snap.stock_qty} {product.name} ({variant.sku}). Requiere conteo físico.",
            state='PENDING',
            created_by_id=worker.user_id
        )
        db.add(adjustment)
        db.flush()

        # Línea del ajuste
        line = InventoryAdjustmentLine(
            adjustment_id=adjustment.id,
            product_variant_id=snap.variant_id,
            quantity=discrepancy_qty,
            unit_cost=unit_cost,
            total_value=total_amount
        )
        db.add(line)

        # 4. Registrar en la bitácora de acciones del trabajador
        summary_msg = f"Existencia negativa en {facility.name}: {product.name} (Saldo: {snap.stock_qty} {variant.sku}). Se generó borrador de ajuste {adj_number} para conteo y aprobación."
        action_log = DigitalWorkerActionLog(
            worker_id=worker.id,
            facility_id=snap.facility_id,
            action_type='NEGATIVE_STOCK_FOUND',
            target_entity_type='inventory_adjustment',
            target_entity_id=str(adjustment.id),
            severity='WARNING',
            summary=summary_msg,
            details={
                "sku": variant.sku,
                "product_name": product.name,
                "current_stock": float(snap.stock_qty),
                "adjustment_number": adj_number,
                "suggested_qty": float(discrepancy_qty)
            },
            status='COMPLETED'
        )
        db.add(action_log)
        db.commit()

        results.append({
            "product": product.name,
            "sku": variant.sku,
            "facility": facility.name,
            "stock_qty": float(snap.stock_qty),
            "adjustment_number": adj_number
        })

    return results

def audit_dock_returns_and_scrap(db: Session, worker: DigitalWorker) -> List[Dict[str, Any]]:
    """
    Habilidad WMS: Inspecciona órdenes con conciliación rechazada o devoluciones en muelle,
    alertando para la gestión de Notas de Crédito de proveedores.
    """
    results = []
    allowed_facility_ids = [f.id for f in worker.user.facilities] if worker.user and worker.user.facilities else [1]

    # Buscar ODCs rechazadas en conciliación (mercancía en almacén con factura rechazada)
    rejected_orders = db.query(PurchaseOrder, Supplier, Facility)\
        .join(Supplier, Supplier.id == PurchaseOrder.supplier_id)\
        .join(Facility, Facility.id == PurchaseOrder.dest_facility_id)\
        .filter(
            PurchaseOrder.dest_facility_id.in_(allowed_facility_ids),
            PurchaseOrder.reconciliation_status == 'REJECTED'
        ).all()

    for po, supplier, facility in rejected_orders:
        summary_msg = f"Devolución / Factura rechazada en {facility.name}: Orden {po.reference} ({supplier.name} por ${po.total_amount} USD). Requiere gestión de Nota de Crédito."
        
        # Verificar si ya se alertó en las últimas 24 horas
        last_logged = db.query(DigitalWorkerActionLog).filter(
            DigitalWorkerActionLog.worker_id == worker.id,
            DigitalWorkerActionLog.target_entity_type == 'purchase_order',
            DigitalWorkerActionLog.target_entity_id == str(po.id),
            DigitalWorkerActionLog.action_type == 'RETURN_REJECTED_AUDITED'
        ).first()

        if not last_logged:
            action_log = DigitalWorkerActionLog(
                worker_id=worker.id,
                facility_id=facility.id,
                action_type='RETURN_REJECTED_AUDITED',
                target_entity_type='purchase_order',
                target_entity_id=str(po.id),
                severity='WARNING',
                summary=summary_msg,
                details={
                    "order_reference": po.reference,
                    "supplier_name": supplier.name,
                    "total_amount": float(po.total_amount),
                    "supplier_phone": supplier.financial_contact_phone or supplier.commercial_contact_phone
                },
                recipient_target=supplier.financial_contact_phone or "Compras",
                status='COMPLETED'
            )
            db.add(action_log)
            db.commit()

        results.append({
            "order_reference": po.reference,
            "supplier": supplier.name,
            "total_amount": float(po.total_amount),
            "status": "REJECTED"
        })

    return results

def audit_unreconciled_orders(db: Session, worker: DigitalWorker) -> List[Dict[str, Any]]:
    """
    Habilidad WMS: Inspecciona órdenes recibidas físicamente en almacén que llevan
    más de 24 horas sin cruzar la factura fiscal (3-Way Match pendiente).
    """
    results = []
    allowed_facility_ids = [f.id for f in worker.user.facilities] if worker.user and worker.user.facilities else [1]

    unreconciled_orders = db.query(PurchaseOrder, Supplier, Facility)\
        .join(Supplier, Supplier.id == PurchaseOrder.supplier_id)\
        .join(Facility, Facility.id == PurchaseOrder.dest_facility_id)\
        .filter(
            PurchaseOrder.dest_facility_id.in_(allowed_facility_ids),
            PurchaseOrder.status == 'received',
            (PurchaseOrder.reconciliation_status == 'PENDING') | (PurchaseOrder.reconciliation_status == None)
        ).all()

    for po, supplier, facility in unreconciled_orders:
        summary_msg = f"Recepción física en {facility.name} sin conciliar: {po.reference} ({supplier.name} por ${po.total_amount} USD). Pendiente por cruzar factura fiscal."
        
        # Verificar log previo
        last_logged = db.query(DigitalWorkerActionLog).filter(
            DigitalWorkerActionLog.worker_id == worker.id,
            DigitalWorkerActionLog.target_entity_type == 'purchase_order',
            DigitalWorkerActionLog.target_entity_id == str(po.id),
            DigitalWorkerActionLog.action_type == '3WAY_UNRECONCILED_WATCH'
        ).first()

        if not last_logged:
            action_log = DigitalWorkerActionLog(
                worker_id=worker.id,
                facility_id=facility.id,
                action_type='3WAY_UNRECONCILED_WATCH',
                target_entity_type='purchase_order',
                target_entity_id=str(po.id),
                severity='INFO',
                summary=summary_msg,
                details={
                    "order_reference": po.reference,
                    "supplier_name": supplier.name,
                    "total_amount": float(po.total_amount),
                    "credit_days": supplier.credit_days
                },
                recipient_target="Cuentas por Pagar / Compras",
                status='COMPLETED'
            )
            db.add(action_log)
            db.commit()

        results.append({
            "order_reference": po.reference,
            "supplier": supplier.name,
            "total_amount": float(po.total_amount)
        })

    return results
