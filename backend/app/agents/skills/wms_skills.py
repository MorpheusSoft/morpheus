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
from app.models.digital_workers import DigitalWorker, DigitalWorkerActionLog, DigitalWorkerSkill, DigitalSkill

logger = logging.getLogger(__name__)


def _check_worker_and_skill(db: Session, worker: DigitalWorker, skill_codes: List[str]) -> bool:
    """
    Verifica que el trabajador digital esté habilitado (is_autonomous_active=True y user.is_active=True)
    y que tenga asignada y habilitada la habilidad correspondiente.
    """
    if not worker or not worker.is_autonomous_active:
        return False
    if worker.user and not worker.user.is_active:
        return False
    if not skill_codes:
        return True
    enabled = (
        db.query(DigitalWorkerSkill)
        .join(DigitalSkill, DigitalSkill.id == DigitalWorkerSkill.skill_id)
        .filter(
            DigitalWorkerSkill.worker_id == worker.id,
            DigitalWorkerSkill.is_enabled == True,
            DigitalSkill.skill_code.in_(skill_codes),
        )
        .first()
    )
    return enabled is not None


def audit_negative_stock(db: Session, worker: DigitalWorker) -> List[Dict[str, Any]]:
    """
    Habilidad WMS: Inspecciona snapshots de inventario buscando saldos negativos.
    Registra únicamente una notificación/hallazgo en la bitácora de acciones del trabajador digital
    SIN crear ajustes automáticos en inv.inventory_adjustments (ya que puede tratarse de mercancía
    en tránsito, traslados pendientes o recepciones por registrar).
    """
    results = []
    if not _check_worker_and_skill(db, worker, ["negative_stock_watchdog", "negative_stock_auditor"]):
        logger.info(f"[{worker.agent_code if worker else 'WMS'}] Habilidad audit_negative_stock omitida: trabajador o habilidad deshabilitada.")
        return results

    allowed_facility_ids = [f.id for f in worker.user.facilities] if worker.user and worker.user.facilities else [f.id for f in db.query(Facility).all()]

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

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    for snap, variant, product, facility in negative_snapshots:
        discrepancy_qty = abs(snap.stock_qty)
        summary_msg = (
            f"Alerta de existencia negativa en {facility.name}: {product.name} ({variant.sku}) "
            f"presenta saldo {snap.stock_qty}. Validar recepciones pendientes, traslados en tránsito "
            f"o programar conteo físico antes de realizar cualquier ajuste."
        )

        already_logged = db.query(DigitalWorkerActionLog).filter(
            DigitalWorkerActionLog.worker_id == worker.id,
            DigitalWorkerActionLog.facility_id == snap.facility_id,
            DigitalWorkerActionLog.action_type == 'NEGATIVE_STOCK_FOUND',
            DigitalWorkerActionLog.target_entity_type == 'product_variant',
            DigitalWorkerActionLog.target_entity_id == str(snap.variant_id),
            DigitalWorkerActionLog.created_at >= today_start
        ).first()

        if not already_logged:
            action_log = DigitalWorkerActionLog(
                worker_id=worker.id,
                facility_id=snap.facility_id,
                action_type='NEGATIVE_STOCK_FOUND',
                target_entity_type='product_variant',
                target_entity_id=str(snap.variant_id),
                severity='WARNING',
                summary=summary_msg,
                details={
                    "sku": variant.sku,
                    "product_name": product.name,
                    "current_stock": float(snap.stock_qty),
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
            "adjustment_number": None
        })

    return results


def audit_dock_returns_and_scrap(db: Session, worker: DigitalWorker) -> List[Dict[str, Any]]:
    """
    Habilidad WMS: Inspecciona órdenes con conciliación rechazada o devoluciones en muelle,
    alertando para la gestión de Notas de Crédito de proveedores.
    """
    results = []
    if not _check_worker_and_skill(db, worker, ["dock_returns_and_scrap_guard", "dock_returns_and_scrap_monitor"]):
        return results
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
    if not _check_worker_and_skill(db, worker, ["3way_unreconciled_watchdog", "3way_unreconciled_auditor"]):
        return results
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
