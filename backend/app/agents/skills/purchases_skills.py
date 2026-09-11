import math
import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Dict, Any, Tuple, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.purchasing import PurchaseOrder, PurchaseOrderLine, SupplierProduct, MRPBotLog
from app.models.inventory import InventorySnapshot, ProductVariant, Product, ProductPackaging
from app.models.core import Supplier, Facility, Buyer
from app.models.sales import Document, DocumentLine
from app.models.digital_workers import DigitalWorker, DigitalWorkerActionLog
from app.services.mrp_bot_service import diagnose_stockouts, generate_supplier_po_draft

logger = logging.getLogger(__name__)

def diagnose_supplier_stockouts(db: Session, worker: DigitalWorker, facility_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Habilidad de Compras: Diagnóstico Predictivo de Quiebres en Memoria.
    Evalúa proveedores y productos, clasificando urgencia en semáforos (🔴/🟡/🟢) y calculando
    inversión estimada en USD sin insertar órdenes en pur.purchase_orders.
    """
    allowed_facility_id = facility_id
    if not allowed_facility_id and worker.user and worker.user.facilities:
        allowed_facility_id = worker.user.facilities[0].id

    diagnosis = diagnose_stockouts(db, facility_id=allowed_facility_id)

    # Registrar en bitácora de acciones del trabajador
    summary_msg = (
        f"Diagnóstico MRP ejecutado por {worker.display_title}: "
        f"{diagnosis.get('critical_suppliers_count', 0)} proveedores en quiebre crítico, "
        f"{diagnosis.get('warning_suppliers_count', 0)} en riesgo. "
        f"Capital requerido: ${diagnosis.get('total_capital_required', 0):,.2f} USD."
    )

    action_log = DigitalWorkerActionLog(
        worker_id=worker.id,
        facility_id=allowed_facility_id,
        action_type='DIAGNOSIS_PERFORMED',
        target_entity_type='mrp_diagnosis',
        target_entity_id=datetime.now().strftime("%Y%m%d%H%M"),
        severity='WARNING' if diagnosis.get('critical_suppliers_count', 0) > 0 else 'INFO',
        summary=summary_msg,
        details={
            "critical_suppliers": diagnosis.get('critical_suppliers_count', 0),
            "warning_suppliers": diagnosis.get('warning_suppliers_count', 0),
            "total_capital": diagnosis.get('total_capital_required', 0),
            "top_suppliers": [
                {"name": s["supplier_name"], "urgency": s["urgency"], "cost": s["estimated_total_cost"]}
                for s in diagnosis.get("suppliers", [])[:5]
            ]
        },
        recipient_target="Comprador y Logística",
        status='COMPLETED'
    )
    db.add(action_log)
    db.commit()

    return diagnosis

def create_supplier_draft_order(
    db: Session,
    worker: DigitalWorker,
    supplier_id: int,
    facility_id: int,
    buyer_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Habilidad de Compras: Generación Quirúrgica de una ODC en borrador para un proveedor específico.
    """
    return generate_supplier_po_draft(
        db=db,
        supplier_id=supplier_id,
        facility_id=facility_id,
        buyer_id=buyer_id,
        worker_code=worker.agent_code
    )

def run_mrp_draft_generation(db: Session, worker: DigitalWorker) -> List[Dict[str, Any]]:
    """
    Mantiene compatibilidad hacia atrás con el handler registrado en core.digital_skills.
    Ejecuta el diagnóstico en memoria para auditar quiebres sin saturar la base de datos con ODCs masivas.
    """
    diagnosis = diagnose_supplier_stockouts(db, worker)
    results = []
    for s in diagnosis.get("suppliers", []):
        if s["urgency"] in ("CRITICAL", "WARNING"):
            results.append({
                "supplier": s["supplier_name"],
                "urgency": s["urgency"],
                "total_cost": s["estimated_total_cost"],
                "items_count": len(s.get("items", []))
            })
    return results

def run_shrinkage_margin_audit(db: Session, worker: DigitalWorker) -> Dict[str, Any]:
    """Habilidad: Auditoría de Mermas y Gatekeeper de Margen Real Neto."""
    from app.services.shrinkage_profitability_service import audit_all_shrinkage_profitability
    res = audit_all_shrinkage_profitability(db, lookback_days=90, auto_block=True)
    total_evaluated = res.get("total_skus_evaluated", len(res.get("items", [])))
    skus_at_risk = res.get("skus_at_risk", 0)
    total_loss = float(res.get("total_shrinkage_loss_usd", 0))
    summary_msg = (
        f"Auditoría de Mermas por {worker.display_title}: "
        f"{total_evaluated} SKUs analizados, "
        f"${total_loss:,.2f} USD en pérdidas registradas. "
        f"{skus_at_risk} SKUs en riesgo o con margen negativo bloqueados en MRP."
    )
    details = {
        "total_skus_evaluated": total_evaluated,
        "skus_at_risk": skus_at_risk,
        "total_shrinkage_loss_usd": total_loss,
        "top_shrinkage_items": [
            {
                "sku": item["sku"],
                "product_name": item["product_name"],
                "shrinkage_cost_usd": float(item.get("shrinkage_cost_usd", 0)),
                "shrinkage_pct": float(item.get("shrinkage_pct", 0)),
                "net_real_margin_pct": float(item.get("net_real_margin_pct", 0)),
                "is_blocked": item.get("is_blocked_for_purchasing", False)
            }
            for item in res.get("items", [])[:10]
        ]
    }
    action_log = DigitalWorkerActionLog(
        worker_id=worker.id,
        action_type='SHRINKAGE_MARGIN_AUDIT',
        target_entity_type='inventory_shrinkage',
        target_entity_id=datetime.now().strftime("%Y%m%d%H%M"),
        severity='WARNING' if skus_at_risk > 0 else 'INFO',
        summary=summary_msg,
        details=details,
        recipient_target="Comprador y Logística",
        status='COMPLETED'
    )
    db.add(action_log)
    db.commit()
    return res

def run_dead_stock_audit(db: Session, worker: DigitalWorker) -> Dict[str, Any]:
    """Habilidad: Detección Preventiva de Dead Stock y Bloqueo de Recompra."""
    from app.services.dead_stock_service import audit_all_dead_stock
    res = audit_all_dead_stock(db, days_threshold=60, auto_block=True)
    summary_msg = (
        f"Escaneo Dead Stock por {worker.display_title}: "
        f"{res['total_dead_stock_items']} SKUs en Dead Stock (>60 días sin ventas), "
        f"Capital inmovilizado: ${res['total_capital_immobilized_usd']:,.2f} USD. "
        f"{res['items_blocked_for_reorder']} productos protegidos con bloqueo en MRP."
    )
    details = {
        "total_dead_stock_items": res["total_dead_stock_items"],
        "total_slow_moving_items": res["total_slow_moving_items"],
        "total_capital_immobilized_usd": float(res["total_capital_immobilized_usd"]),
        "items_blocked_for_reorder": res["items_blocked_for_reorder"],
        "top_dead_stock_items": [
            {
                "sku": item["sku"],
                "product_name": item["product_name"],
                "days_without_sales": item["days_without_sales"],
                "stock_valuation_usd": float(item["stock_valuation_usd"]),
                "status": item["dead_stock_status"],
                "is_blocked": item["is_blocked_for_purchasing"]
            }
            for item in res.get("items", [])[:10]
        ]
    }
    action_log = DigitalWorkerActionLog(
        worker_id=worker.id,
        action_type='DEAD_STOCK_AUDIT',
        target_entity_type='inventory_dead_stock',
        target_entity_id=datetime.now().strftime("%Y%m%d%H%M"),
        severity='CRITICAL' if res['total_dead_stock_items'] > 0 else 'INFO',
        summary=summary_msg,
        details=details,
        recipient_target="Comprador y Finanzas",
        status='COMPLETED'
    )
    db.add(action_log)
    db.commit()
    return res

def run_supplier_logistics_calibration(db: Session, worker: DigitalWorker) -> Dict[str, Any]:
    """Habilidad: Calibración Adaptativa de Reglas Logísticas de Proveedores."""
    from app.services.supplier_logistics_service import batch_tune_all_suppliers
    res = batch_tune_all_suppliers(db, only_auto_tune=True)
    total_scanned = res.get("total_scanned", 0)
    calibrated = res.get("auto_tuned", [])
    attention = res.get("attention_needed", [])
    summary_msg = (
        f"Calibración Logística por {worker.display_title}: "
        f"{total_scanned} proveedores analizados. "
        f"{len(calibrated)} auto-calibrados automáticamente, "
        f"{len(attention)} con desvíos que requieren atención del comprador."
    )
    details = {
        "total_scanned": total_scanned,
        "auto_calibrated_count": len(calibrated),
        "attention_needed_count": len(attention),
        "auto_calibrated": [
            {"name": s.get("supplier_name"), "changes": s.get("changes")}
            for s in calibrated[:5]
        ],
        "attention_needed": [
            {"name": s.get("supplier_name"), "lead_time_deviation": s.get("lead_time_deviation")}
            for s in attention[:5]
        ]
    }
    action_log = DigitalWorkerActionLog(
        worker_id=worker.id,
        action_type='SUPPLIER_LOGISTICS_CALIBRATED',
        target_entity_type='suppliers',
        target_entity_id=datetime.now().strftime("%Y%m%d%H%M"),
        severity='WARNING' if len(attention) > 0 else 'INFO',
        summary=summary_msg,
        details=details,
        recipient_target="Comprador",
        status='COMPLETED'
    )
    db.add(action_log)
    db.commit()
    return res

def run_sell_out_settlement_audit(db: Session, worker: DigitalWorker) -> Dict[str, Any]:
    """Habilidad: Auditoría y Liquidación de Convenios Sell-Out."""
    from app.services.sell_out_service import get_sell_out_agreements, settle_sell_out_agreement
    agreements = get_sell_out_agreements(db, status="ACTIVE")
    settled_list = []
    for ag in agreements:
        try:
            settle_res = settle_sell_out_agreement(db, ag.id)
            settled_list.append(settle_res)
        except Exception as e:
            logger.warning(f"No se pudo liquidar convenio {ag.id}: {e}")

    summary_msg = (
        f"Auditoría Sell-Out por {worker.display_title}: "
        f"{len(agreements)} convenios activos evaluados en POS, "
        f"{len(settled_list)} liquidados con montos de reclamo a proveedores."
    )
    action_log = DigitalWorkerActionLog(
        worker_id=worker.id,
        action_type='SELL_OUT_AUDIT',
        target_entity_type='sell_out_agreements',
        target_entity_id=datetime.now().strftime("%Y%m%d%H%M"),
        severity='INFO',
        summary=summary_msg,
        details={"settled_count": len(settled_list), "agreements_checked": len(agreements)},
        recipient_target="Comprador y Cuentas por Cobrar",
        status='COMPLETED'
    )
    db.add(action_log)
    db.commit()
    return {"agreements_checked": len(agreements), "settled": len(settled_list)}

def run_invoice_ocr_reconciliation_audit(db: Session, worker: DigitalWorker) -> Dict[str, Any]:
    """Habilidad: Vigilante de Facturas y Pre-Conciliación OCR 3-Way."""
    unreconciled = db.query(PurchaseOrder).filter(
        PurchaseOrder.status.in_(['received', 'confirmed']),
        PurchaseOrder.reconciliation_status == 'PENDING'
    ).limit(20).all()

    with_docs = [po for po in unreconciled if po.invoice_documents and len(po.invoice_documents) > 0]

    summary_msg = (
        f"Auditoría de Conciliación OCR por {worker.display_title}: "
        f"{len(unreconciled)} órdenes recibidas pendientes de cruce fiscal, "
        f"{len(with_docs)} con comprobantes fiscales digitalizados listos para 3-Way Match."
    )
    action_log = DigitalWorkerActionLog(
        worker_id=worker.id,
        action_type='INVOICE_OCR_AUDIT',
        target_entity_type='purchase_orders',
        target_entity_id=datetime.now().strftime("%Y%m%d%H%M"),
        severity='WARNING' if len(unreconciled) > 5 else 'INFO',
        summary=summary_msg,
        details={"unreconciled_count": len(unreconciled), "ready_for_ocr": len(with_docs)},
        recipient_target="Comprador y Cuentas por Pagar",
        status='COMPLETED'
    )
    db.add(action_log)
    db.commit()
    return {"unreconciled_count": len(unreconciled), "with_docs_count": len(with_docs)}

def run_cendi_strategy_audit(db: Session, worker: DigitalWorker) -> Dict[str, Any]:
    """Habilidad: Auditoría de Estrategia CENDI y Desglose Multitienda."""
    active_suppliers = db.query(Supplier).filter(Supplier.is_active == True).limit(20).all()
    cendi_recommended = []
    for s in active_suppliers:
        cendi_count = db.query(func.count(PurchaseOrder.id)).join(
            Facility, PurchaseOrder.dest_facility_id == Facility.id
        ).filter(
            PurchaseOrder.supplier_id == s.id,
            Facility.is_distribution_center == True
        ).scalar() or 0

        total_orders = db.query(func.count(PurchaseOrder.id)).filter(
            PurchaseOrder.supplier_id == s.id
        ).scalar() or 0

        if total_orders >= 3 and (cendi_count / total_orders) >= 0.7:
            cendi_recommended.append({"supplier": s.name, "ratio": round(cendi_count / total_orders, 2)})

    summary_msg = (
        f"Auditoría CENDI por {worker.display_title}: "
        f"{len(active_suppliers)} proveedores analizados. "
        f"{len(cendi_recommended)} proveedores operan predominantemente vía Centro de Distribución."
    )
    action_log = DigitalWorkerActionLog(
        worker_id=worker.id,
        action_type='CENDI_STRATEGY_AUDIT',
        target_entity_type='suppliers',
        target_entity_id=datetime.now().strftime("%Y%m%d%H%M"),
        severity='INFO',
        summary=summary_msg,
        details={"cendi_suppliers": cendi_recommended},
        recipient_target="Logística y Compras",
        status='COMPLETED'
    )
    db.add(action_log)
    db.commit()
    return {"cendi_suppliers": cendi_recommended}

def run_monthly_executive_reports(db: Session, worker: DigitalWorker) -> Dict[str, Any]:
    """Habilidad: Generación y Archivo de Paquete Ejecutivo Mensual."""
    from app.services.monthly_reports_service import execute_scheduled_monthly_job
    res = execute_scheduled_monthly_job(db, worker_code=worker.agent_code)
    return res

def run_purchase_whatsapp_listener(db: Session, worker: DigitalWorker) -> Dict[str, Any]:
    """Habilidad: Asistente Conversacional de Compras por WhatsApp."""
    return {"status": "ACTIVE_LISTENING", "channel": "WHATSAPP"}


