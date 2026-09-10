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

