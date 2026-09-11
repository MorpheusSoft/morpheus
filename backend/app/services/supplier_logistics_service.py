from datetime import datetime, timezone
from decimal import Decimal
import statistics
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session

from app.models.core import Supplier, Facility
from app.models.purchasing import PurchaseOrder
from app.models.inventory import StockPicking
from app.models.digital_workers import DigitalWorker, DigitalWorkerActionLog


def audit_supplier_logistics(db: Session, supplier_id: int, limit: int = 10) -> Dict[str, Any]:
    """
    Auditoría Logística Adaptativa por Clara (Compras):
    - Mide el Lead Time Real (mediana de días de despacho entre emisión de ODC y recepción física en WMS).
    - Mide la Cadencia Real (mediana de días entre colocaciones consecutivas de órdenes de compra).
    - Evalúa índice de puntualidad OTIF (% de órdenes recibidas <= lead time teórico).
    - Detecta desvíos >= +-2 días (con umbral mínimo de 3 entregas) y propone calibración de la ficha.
    - Evalúa concentración de despachos en CENDI vs Tiendas individuales.
    """
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise ValueError(f"Proveedor con ID {supplier_id} no encontrado.")

    # 1. Obtener órdenes del proveedor ordenadas cronológicamente descendente
    orders = db.query(PurchaseOrder).filter(
        PurchaseOrder.supplier_id == supplier_id
    ).order_by(PurchaseOrder.created_at.desc()).limit(max(limit * 2, 20)).all()

    deliveries: List[Dict[str, Any]] = []
    order_references = [o.reference for o in orders if o.reference]

    # Pre-cargar pickings de recepción completados para estas órdenes
    pickings = []
    if order_references:
        pickings = db.query(StockPicking).filter(
            StockPicking.origin_document.in_(order_references)
        ).all()
    pickings_by_ref = {p.origin_document: p for p in pickings if p.origin_document}

    # 2. Medición individual de Lead Time por entrega
    for order in orders:
        if len(deliveries) >= limit:
            break

        receipt_date = None
        picking = pickings_by_ref.get(order.reference)
        if picking and picking.date_done:
            receipt_date = picking.date_done
        elif order.conciliated_at:
            receipt_date = order.conciliated_at
        elif order.status in ('received', 'confirmed'):
            receipt_date = order.expiration_date or order.created_at

        if receipt_date and order.created_at:
            # Normalizar timezone para cálculo de diferencia de días
            r_date = receipt_date.date() if hasattr(receipt_date, 'date') else receipt_date
            o_date = order.created_at.date() if hasattr(order.created_at, 'date') else order.created_at
            
            diff_days = (r_date - o_date).days
            lead_time_days = max(1, diff_days)
            on_time = lead_time_days <= (supplier.lead_time_days or 0)

            deliveries.append({
                "order_id": order.id,
                "order_reference": order.reference or f"ODC-{order.id}",
                "order_date": order.created_at,
                "receipt_date": receipt_date,
                "lead_time_days": lead_time_days,
                "on_time": on_time
            })

    # 3. Medición de Cadencia (intervalos entre órdenes consecutivas en días)
    # Tomar órdenes ordenadas ascendentemente por fecha de emisión
    asc_orders = sorted(
        [o for o in orders if o.created_at is not None and o.status != 'draft'],
        key=lambda x: x.created_at
    )
    intervals: List[int] = []
    for i in range(1, len(asc_orders)):
        prev_date = asc_orders[i - 1].created_at.date()
        curr_date = asc_orders[i].created_at.date()
        delta = (curr_date - prev_date).days
        if delta > 0:
            intervals.append(delta)

    # 4. Cálculo Estadístico Robusto (Mediana inmune a anomalías)
    real_lead_time: Optional[int] = None
    on_time_score = Decimal('100.0')
    if deliveries:
        lead_times = [d["lead_time_days"] for d in deliveries]
        real_lead_time = int(round(statistics.median(lead_times)))
        on_time_count = sum(1 for d in deliveries if d["on_time"])
        on_time_score = Decimal(str(round((on_time_count / len(deliveries)) * 100, 2)))

    real_restock_days: Optional[int] = None
    if intervals:
        real_restock_days = int(round(statistics.median(intervals)))

    configured_lead = supplier.lead_time_days or 0
    configured_restock = supplier.restock_coverage_days or 0

    lead_deviation = (real_lead_time - configured_lead) if real_lead_time is not None else 0
    restock_deviation = (real_restock_days - configured_restock) if real_restock_days is not None else 0

    # 5. Análisis de Concentración de Despacho (CENDI vs Tiendas)
    suggested_facility_id = None
    suggested_facility_name = None
    if orders:
        cendi_facilities = db.query(Facility).filter(
            Facility.is_distribution_center == True,
            Facility.is_active == True
        ).all()
        cendi_ids = {f.id for f in cendi_facilities}
        
        cendi_order_count = sum(
            1 for o in orders
            if (o.consolidation_mode == 'CONSOLIDATED_CD' or o.dest_facility_id in cendi_ids or o.target_cd_facility_id in cendi_ids)
        )
        cendi_ratio = cendi_order_count / len(orders)
        if len(orders) >= 3 and cendi_ratio >= 0.8 and cendi_facilities:
            primary_cendi = cendi_facilities[0]
            if supplier.default_facility_id != primary_cendi.id:
                suggested_facility_id = primary_cendi.id
                suggested_facility_name = primary_cendi.name

    # 6. Diagnóstico y Recomendación de Clara
    deliveries_count = len(deliveries)
    if deliveries_count < 3:
        requires_attention = False
        is_calibrated = True
        recommendation = (
            f"Histórico inicial ({deliveries_count}/3 entregas registradas). "
            f"Clara mantendrá la observación pasiva hasta acumular 3 recepciones para calibrar con certeza matemática."
        )
    else:
        lead_time_drift = abs(lead_deviation) >= 2
        restock_drift = abs(restock_deviation) >= 2
        requires_attention = lead_time_drift or restock_drift
        is_calibrated = not requires_attention

        recommendation_parts = []
        if lead_deviation > 1:
            recommendation_parts.append(
                f"El proveedor demora en promedio {real_lead_time} días en despachar "
                f"(+{lead_deviation} días sobre los {configured_lead} configurados en ficha). "
                f"Ajustar a {real_lead_time} días blindará el cálculo de stock de seguridad y evitará quiebres."
            )
        elif lead_deviation < -1:
            recommendation_parts.append(
                f"El proveedor entrega con mayor celeridad ({real_lead_time} días vs {configured_lead} configurados). "
                f"Reducir a {real_lead_time} días evitará sobrestock e inmovilización innecesaria de capital."
            )

        if restock_drift:
            if restock_deviation > 0:
                recommendation_parts.append(
                    f"La cadencia real de pedidos es de {real_restock_days} días "
                    f"(+{restock_deviation} días respecto a la cobertura de reposición teórica de {configured_restock} días)."
                )
            else:
                recommendation_parts.append(
                    f"Se están emitiendo órdenes cada {real_restock_days} días "
                    f"(frecuencia mayor a la cobertura teórica de {configured_restock} días)."
                )

        if suggested_facility_id:
            recommendation_parts.append(
                f"El {int(cendi_ratio * 100)}% de los despachos han ido a {suggested_facility_name}. "
                f"Se recomienda fijarlo como Centro de Distribución predeterminado."
            )

        if not recommendation_parts:
            recommendation = (
                f"Reglas logísticas calibradas. Cumplimiento OTIF del {on_time_score}% en {deliveries_count} entregas. "
                f"Los tiempos reales coinciden con la parametrización teórica."
            )
        else:
            prefix = "⚠️ Desvío Logístico Detectado: " if requires_attention else "💡 Sugerencia Logística: "
            recommendation = prefix + " ".join(recommendation_parts)

    now = datetime.now(timezone.utc)

    # 7. Sincronizar campos de auditoría en el modelo Supplier
    supplier.clara_suggested_lead_time = real_lead_time
    supplier.clara_suggested_restock_days = real_restock_days
    supplier.clara_lead_time_deviation = lead_deviation
    supplier.clara_restock_deviation = restock_deviation
    supplier.clara_deliveries_analyzed = deliveries_count
    supplier.clara_logistics_score = on_time_score
    supplier.clara_last_evaluated_at = now
    db.commit()

    return {
        "supplier_id": supplier.id,
        "supplier_name": supplier.name,
        "configured_lead_time": configured_lead,
        "configured_restock_days": configured_restock,
        "configured_default_facility_id": supplier.default_facility_id,
        "real_lead_time": real_lead_time,
        "real_restock_days": real_restock_days,
        "suggested_facility_id": suggested_facility_id,
        "suggested_facility_name": suggested_facility_name,
        "lead_time_deviation": lead_deviation,
        "restock_deviation": restock_deviation,
        "deliveries_analyzed": deliveries_count,
        "on_time_score": on_time_score,
        "is_calibrated": is_calibrated,
        "requires_attention": requires_attention,
        "auto_tune_logistics": bool(supplier.auto_tune_logistics),
        "clara_recommendation": recommendation,
        "history": deliveries,
        "evaluated_at": now
    }


def apply_clara_calibration(
    db: Session,
    supplier_id: int,
    apply_lead_time: bool = True,
    apply_restock: bool = True,
    apply_default_facility: bool = False,
    user_id: Optional[int] = None,
    worker_code: str = "CLARA_COMPRAS"
) -> Dict[str, Any]:
    """
    Aplica la calibración adaptativa a la ficha del proveedor:
    - Actualiza lead_time_days y/o restock_coverage_days y/o default_facility_id.
    - Resetea los desvíos calculados.
    - Registra el suceso en core.digital_worker_actions_log para auditoría y trazabilidad total.
    """
    audit = audit_supplier_logistics(db, supplier_id)
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()

    old_lead = supplier.lead_time_days or 0
    old_restock = supplier.restock_coverage_days or 0
    old_facility_id = supplier.default_facility_id

    changes: Dict[str, Any] = {}

    if apply_lead_time and audit["real_lead_time"] is not None:
        supplier.lead_time_days = audit["real_lead_time"]
        supplier.clara_lead_time_deviation = 0
        changes["lead_time_days"] = {"old": old_lead, "new": audit["real_lead_time"]}

    if apply_restock and audit["real_restock_days"] is not None:
        supplier.restock_coverage_days = audit["real_restock_days"]
        supplier.clara_restock_deviation = 0
        changes["restock_coverage_days"] = {"old": old_restock, "new": audit["real_restock_days"]}

    if apply_default_facility and audit.get("suggested_facility_id"):
        supplier.default_facility_id = audit["suggested_facility_id"]
        changes["default_facility_id"] = {
            "old": old_facility_id,
            "new": audit["suggested_facility_id"],
            "name": audit.get("suggested_facility_name")
        }

    supplier.clara_last_evaluated_at = datetime.now(timezone.utc)

    # Registrar acción en el log del trabajador digital
    worker = db.query(DigitalWorker).filter(DigitalWorker.agent_code == worker_code).first()
    worker_id = worker.id if worker else None

    action_summary = (
        f"Calibración Logística Aplicada para {supplier.name}. "
        f"Días de Despacho: {old_lead}d -> {supplier.lead_time_days}d | "
        f"Cobertura Reposición: {old_restock}d -> {supplier.restock_coverage_days}d."
    )

    action_log = DigitalWorkerActionLog(
        worker_id=worker_id,
        facility_id=supplier.default_facility_id,
        action_type="SUPPLIER_LOGISTICS_CALIBRATED",
        target_entity_type="supplier",
        target_entity_id=str(supplier.id),
        severity="INFO",
        summary=action_summary,
        details={
            "supplier_id": supplier.id,
            "supplier_name": supplier.name,
            "changes": changes,
            "deliveries_analyzed": audit["deliveries_analyzed"],
            "on_time_score": float(audit["on_time_score"]),
            "applied_by_user_id": user_id,
            "is_auto_tuned": supplier.auto_tune_logistics
        },
        recipient_target="COMPRAS_OPS",
        status="COMPLETED"
    )
    db.add(action_log)
    db.commit()
    db.refresh(supplier)

    return {
        "ok": True,
        "supplier_id": supplier.id,
        "supplier_name": supplier.name,
        "updated_lead_time_days": supplier.lead_time_days,
        "updated_restock_coverage_days": supplier.restock_coverage_days,
        "updated_default_facility_id": supplier.default_facility_id,
        "changes": changes,
        "summary": action_summary
    }


def batch_tune_all_suppliers(
    db: Session,
    supplier_ids: Optional[List[int]] = None,
    only_auto_tune: bool = False,
    worker_code: str = "CLARA_COMPRAS"
) -> Dict[str, Any]:
    """
    Escaneo periódico de Clara para auditar y autocalibrar proveedores activos:
    - Filtra eficientemente solo proveedores que poseen órdenes de compra o auto_tune activo.
    - Si el proveedor tiene `auto_tune_logistics == True` y el desvío es >= +-2 días
      con al menos 3 entregas analizadas, ejecuta la calibración automática.
    - Si tiene desvío pero auto_tune es False, solo actualiza las métricas y levanta advertencia.
    """
    query = db.query(Supplier).filter(Supplier.is_active == True)
    
    if supplier_ids:
        query = query.filter(Supplier.id.in_(supplier_ids))
    elif only_auto_tune:
        query = query.filter(Supplier.auto_tune_logistics == True)
    else:
        # Optimización de alto rendimiento: solo evaluar proveedores que tengan órdenes de compra o auto_tune activo
        suppliers_with_orders = db.query(PurchaseOrder.supplier_id).filter(PurchaseOrder.supplier_id.isnot(None)).distinct()
        query = query.filter(
            (Supplier.id.in_(suppliers_with_orders)) | (Supplier.auto_tune_logistics == True)
        )

    suppliers = query.all()
    
    total_scanned = len(suppliers)
    auto_tuned: List[Dict[str, Any]] = []
    attention_needed: List[Dict[str, Any]] = []

    for s in suppliers:
        audit = audit_supplier_logistics(db, s.id)
        if audit["requires_attention"]:
            if s.auto_tune_logistics and audit["deliveries_analyzed"] >= 3:
                res = apply_clara_calibration(
                    db,
                    s.id,
                    apply_lead_time=True,
                    apply_restock=True,
                    apply_default_facility=bool(audit.get("suggested_facility_id")),
                    worker_code=worker_code
                )
                auto_tuned.append({
                    "supplier_id": s.id,
                    "supplier_name": s.name,
                    "changes": res["changes"]
                })
            else:
                attention_needed.append({
                    "supplier_id": s.id,
                    "supplier_name": s.name,
                    "lead_time_deviation": audit["lead_time_deviation"],
                    "restock_deviation": audit["restock_deviation"],
                    "auto_tune_enabled": s.auto_tune_logistics,
                    "recommendation": audit["clara_recommendation"]
                })

    return {
        "total_scanned": total_scanned,
        "auto_tuned_count": len(auto_tuned),
        "attention_needed_count": len(attention_needed),
        "auto_tuned": auto_tuned,
        "attention_needed": attention_needed
    }

