import math
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
import json
import logging
from typing import List, Dict, Any, Tuple, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.models.purchasing import PurchaseOrder, PurchaseOrderLine, SupplierProduct, MRPBotLog
from app.models.inventory import InventorySnapshot, ProductVariant, Product, ProductPackaging
from app.models.core import Supplier, Facility, Buyer
from app.models.sales import Document, DocumentLine
from app.models.digital_workers import DigitalWorker, DigitalWorkerActionLog

logger = logging.getLogger(__name__)

def predict_demand_and_safety_stock(
    variant_id: int,
    lead_time_days: int,
    run_rate: float,
    safety_stock_configured: float,
    seasonal_index: float = 1.0
) -> Tuple[Decimal, Decimal]:
    """
    Mocked predictive AI estimator.
    Calculates:
      1. Predicted Demand = daily_sales (run_rate) * Lead Time * Seasonal Index
      2. Statistical Safety Stock = Z * sqrt(LT * Demand_StdDev^2 + Daily_Sales^2 * LT_Variance)
    Uses a service level target of 95% (Z-score = 1.65).
    """
    # Daily sales average (fallback to 3.5 if no run rate)
    daily_sales = float(run_rate) if run_rate and run_rate > 0 else 3.5
    
    # Lead time in days (fallback to 5 if not configured)
    lt_days = lead_time_days if lead_time_days and lead_time_days > 0 else 5
    
    # Predict demand with dynamic seasonal factor
    predicted_demand = daily_sales * lt_days * seasonal_index
    
    # Statistical Safety Stock:
    # Z-score for 95% service level
    z_score = 1.65
    # Volatility of daily demand: assumed standard deviation is 25% of daily sales
    demand_std_dev = daily_sales * 0.25
    # Volatility of lead time (supplier punctuality): variance is 10% of lead time days
    lt_variance = lt_days * 0.10
    
    # Z * sqrt(LT * var_demand + Demand^2 * var_LT)
    stat_safety = z_score * math.sqrt(lt_days * (demand_std_dev ** 2) + (daily_sales ** 2) * lt_variance)
    
    # Compare with the manually configured safety stock and use the maximum
    final_safety = max(stat_safety, float(safety_stock_configured or 0.0))
    
    return Decimal(str(round(predicted_demand, 2))), Decimal(str(round(final_safety, 2)))

def diagnose_stockouts(
    db: Session,
    facility_id: Optional[int] = None,
    supplier_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Motor de Diagnóstico Predictivo MRP en Memoria.
    Evalúa stock físico, tránsito abierto, velocidad de rotación real e índices estacionales.
    Clasifica por proveedor en semáforos de urgencia:
      - CRITICAL (Quiebre Inmediato): Stock disponible <= 0 o días de stock < Lead Time.
      - WARNING (Quiebre Proyectado): Inventario disponible <= Umbral Crítico.
      - HEALTHY (Saludable): Cobertura suficiente.
    NO crea registros en pur.purchase_orders.
    """
    # 1. Obtener productos de proveedores activos
    sp_query = db.query(SupplierProduct).filter(SupplierProduct.is_active == True)
    if supplier_id:
        sp_query = sp_query.filter(SupplierProduct.supplier_id == supplier_id)
    all_active_sp = sp_query.all()

    sp_by_variant: Dict[int, List[SupplierProduct]] = {}
    for sp in all_active_sp:
        sp_by_variant.setdefault(sp.variant_id, []).append(sp)

    supplier_products = []
    for var_id, sp_list in sp_by_variant.items():
        if len(sp_list) == 1:
            supplier_products.append(sp_list[0])
        else:
            primary_sps = [sp for sp in sp_list if getattr(sp, 'is_primary', False)]
            supplier_products.append(primary_sps[0] if primary_sps else sp_list[0])

    # 2. Sedes a evaluar
    if facility_id:
        facilities = db.query(Facility).filter(Facility.id == facility_id).all()
    else:
        facilities = db.query(Facility).filter(Facility.is_active == True).all()
    facility_map = {f.id: f for f in facilities}
    fac_ids = list(facility_map.keys())

    # 3. Batch Prefetch para velocidad sub-segundo (elimina N+1 queries)
    variants_map = {v.id: v for v in db.query(ProductVariant).filter(ProductVariant.is_active == True).all()}
    products_map = {p.id: p for p in db.query(Product).all()}
    suppliers_map = {s.id: s for s in db.query(Supplier).all()}
    pack_map = {p.id: p for p in db.query(ProductPackaging).all()}
    snapshots_map = {
        (s.variant_id, s.facility_id): s 
        for s in db.query(InventorySnapshot).filter(InventorySnapshot.facility_id.in_(fac_ids)).all()
    }
    
    transit_rows = db.query(
        PurchaseOrderLine.variant_id,
        PurchaseOrder.dest_facility_id,
        func.sum(PurchaseOrderLine.expected_base_qty)
    ).join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderLine.order_id)\
    .filter(
        PurchaseOrder.status.in_(['draft', 'approved', 'sent', 'viewed', 'confirmed', 'pending_approval']),
        PurchaseOrder.dest_facility_id.in_(fac_ids)
    ).group_by(PurchaseOrderLine.variant_id, PurchaseOrder.dest_facility_id).all()
    transit_map = {(row[0], row[1]): (row[2] or Decimal('0')) for row in transit_rows}

    # 4. Mapeo de proveedores y cálculo de líneas
    suppliers_data: Dict[int, Dict[str, Any]] = {}
    total_items_evaluated = 0

    for sp in supplier_products:
        variant = variants_map.get(sp.variant_id)
        if not variant:
            continue

        product = products_map.get(variant.product_id)
        if not product:
            continue

        supplier = suppliers_map.get(sp.supplier_id)
        if not supplier:
            continue

        if supplier.id not in suppliers_data:
            lead_time = supplier.lead_time_days or 5
            suppliers_data[supplier.id] = {
                "supplier_id": supplier.id,
                "supplier_name": supplier.name,
                "lead_time_days": lead_time,
                "urgency": "HEALTHY",
                "total_skus": 0,
                "skus_in_breach": 0,
                "critical_skus_count": 0,
                "warning_skus_count": 0,
                "estimated_total_cost": 0.0,
                "existing_draft_po_id": None,
                "existing_draft_po_reference": None,
                "items": []
            }

        lead_time = suppliers_data[supplier.id]["lead_time_days"]

        for fac_id, fac in facility_map.items():
            total_items_evaluated += 1
            suppliers_data[supplier.id]["total_skus"] += 1

            snapshot = snapshots_map.get((variant.id, fac_id))
            stock_qty = Decimal(str(snapshot.stock_qty)) if snapshot and snapshot.stock_qty is not None else Decimal('0')
            safety_stock_conf = Decimal(str(snapshot.safety_stock)) if snapshot and snapshot.safety_stock is not None else Decimal('0')
            run_rate = Decimal(str(snapshot.run_rate)) if snapshot and snapshot.run_rate and snapshot.run_rate > 0 else Decimal('3.5')

            transit_qty = transit_map.get((variant.id, fac_id), Decimal('0'))
            inventario_disponible = stock_qty + transit_qty

            predicted_demand, statistical_safety = predict_demand_and_safety_stock(
                variant_id=variant.id,
                lead_time_days=lead_time,
                run_rate=float(run_rate),
                safety_stock_configured=float(safety_stock_conf),
                seasonal_index=1.0
            )

            umbral_critico = predicted_demand + statistical_safety

            # Días de inventario restante
            days_of_stock = float(inventario_disponible / run_rate) if run_rate > 0 else (999.0 if inventario_disponible > 0 else 0.0)

            # Determinación de Urgencia
            item_urgency = "HEALTHY"
            if inventario_disponible <= 0 or days_of_stock < lead_time:
                item_urgency = "CRITICAL"
            elif inventario_disponible <= umbral_critico:
                item_urgency = "WARNING"

            # Si requiere reposición, calcular pedido y empaques
            boxes_needed = 0
            suggested_base_qty = Decimal('0')
            unit_cost = sp.replacement_cost or variant.replacement_cost or variant.standard_cost or Decimal('1.00')
            qty_per_pack = Decimal('1')
            pack_name = "Unidad"

            if item_urgency in ("CRITICAL", "WARNING"):
                qty_needed = max(umbral_critico - inventario_disponible, Decimal('1'))

                if sp.pack_id:
                    pack = pack_map.get(sp.pack_id)
                    if pack and pack.qty_per_unit and pack.qty_per_unit > 0:
                        qty_per_pack = Decimal(str(pack.qty_per_unit))
                        pack_name = pack.name or "Caja Máster"

                if qty_per_pack > 1:
                    boxes_needed = math.ceil(qty_needed / qty_per_pack)
                    suggested_base_qty = Decimal(str(boxes_needed)) * qty_per_pack
                else:
                    boxes_needed = int(math.ceil(qty_needed))
                    suggested_base_qty = Decimal(str(boxes_needed))

                # MOQ
                min_qty = Decimal(str(sp.min_order_qty or 1))
                if supplier.minimum_order_qty and Decimal(str(supplier.minimum_order_qty)) > min_qty:
                    min_qty = Decimal(str(supplier.minimum_order_qty))

                if suggested_base_qty < min_qty:
                    if qty_per_pack > 1:
                        boxes_needed = math.ceil(min_qty / qty_per_pack)
                        suggested_base_qty = Decimal(str(boxes_needed)) * qty_per_pack
                    else:
                        boxes_needed = int(math.ceil(min_qty))
                        suggested_base_qty = Decimal(str(boxes_needed))

                subtotal = float(suggested_base_qty * unit_cost)
                suppliers_data[supplier.id]["estimated_total_cost"] += subtotal
                suppliers_data[supplier.id]["skus_in_breach"] += 1
                if item_urgency == "CRITICAL":
                    suppliers_data[supplier.id]["critical_skus_count"] += 1
                else:
                    suppliers_data[supplier.id]["warning_skus_count"] += 1

                suppliers_data[supplier.id]["items"].append({
                    "variant_id": variant.id,
                    "sku": variant.sku,
                    "product_name": product.name,
                    "facility_id": fac.id,
                    "facility_name": fac.name,
                    "stock_qty": float(stock_qty),
                    "transit_qty": float(transit_qty),
                    "available_qty": float(inventario_disponible),
                    "run_rate": float(run_rate),
                    "days_of_stock": round(days_of_stock, 1),
                    "critical_threshold": float(umbral_critico),
                    "urgency": item_urgency,
                    "boxes_needed": boxes_needed,
                    "suggested_base_qty": float(suggested_base_qty),
                    "pack_name": pack_name,
                    "qty_per_pack": float(qty_per_pack),
                    "moq": float(min_qty),
                    "unit_cost": float(unit_cost),
                    "estimated_subtotal": round(subtotal, 2)
                })

    # 4. Clasificar urgencia global de cada proveedor y verificar ODC borrador existente
    suppliers_list = []
    for s_id, s_data in suppliers_data.items():
        if s_data["critical_skus_count"] > 0:
            s_data["urgency"] = "CRITICAL"
        elif s_data["warning_skus_count"] > 0:
            s_data["urgency"] = "WARNING"
        else:
            s_data["urgency"] = "HEALTHY"

        s_data["estimated_total_cost"] = round(s_data["estimated_total_cost"], 2)

        # Buscar borrador activo existente
        existing_draft = db.query(PurchaseOrder).filter(
            PurchaseOrder.supplier_id == s_id,
            PurchaseOrder.status == 'draft'
        ).order_by(desc(PurchaseOrder.id)).first()

        if existing_draft:
            s_data["existing_draft_po_id"] = existing_draft.id
            s_data["existing_draft_po_reference"] = existing_draft.reference

        suppliers_list.append(s_data)

    # Ordenar proveedores: CRITICAL primero, luego WARNING, luego HEALTHY. Dentro de cada nivel, por mayor costo estimado
    urgency_order = {"CRITICAL": 0, "WARNING": 1, "HEALTHY": 2}
    suppliers_list.sort(key=lambda s: (urgency_order[s["urgency"]], -s["estimated_total_cost"]))

    # Resumen general
    critical_count = sum(1 for s in suppliers_list if s["urgency"] == "CRITICAL")
    warning_count = sum(1 for s in suppliers_list if s["urgency"] == "WARNING")
    healthy_count = sum(1 for s in suppliers_list if s["urgency"] == "HEALTHY")
    total_capital = sum(s["estimated_total_cost"] for s in suppliers_list)

    return {
        "evaluated_at": datetime.now().isoformat(),
        "total_suppliers_evaluated": len(suppliers_list),
        "total_items_evaluated": total_items_evaluated,
        "critical_suppliers_count": critical_count,
        "warning_suppliers_count": warning_count,
        "healthy_suppliers_count": healthy_count,
        "total_capital_required": round(total_capital, 2),
        "suppliers": suppliers_list
    }

def generate_supplier_po_draft(
    db: Session,
    supplier_id: int,
    facility_id: int,
    buyer_id: Optional[int] = None,
    notes: Optional[str] = None,
    worker_code: str = "CLARA_COMPRAS"
) -> Dict[str, Any]:
    """
    Generación Quirúrgica de una sola Orden de Compra en borrador para un proveedor y sede específicos.
    Respeta empaques maestros y pedidos mínimos calculados por el motor de diagnóstico.
    Registra la acción en core.digital_worker_actions_log.
    """
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise ValueError(f"Proveedor con ID {supplier_id} no existe.")

    facility = db.query(Facility).filter(Facility.id == facility_id).first()
    if not facility:
        raise ValueError(f"Sede/Almacén con ID {facility_id} no existe.")

    # Diagnosticar en memoria exclusivamente para este proveedor y sede
    diagnosis = diagnose_stockouts(db, facility_id=facility_id, supplier_id=supplier_id)
    supplier_diag = next((s for s in diagnosis["suppliers"] if s["supplier_id"] == supplier_id), None)

    if not supplier_diag or not supplier_diag["items"]:
        raise ValueError(f"El proveedor '{supplier.name}' no tiene productos en quiebre o déficit en '{facility.name}'.")

    # Obtener comprador
    if not buyer_id:
        buyer = db.query(Buyer).filter(Buyer.id == 1).first() or db.query(Buyer).first()
        buyer_id = buyer.id if buyer else None

    # Obtener trabajador digital para trazabilidad
    worker = db.query(DigitalWorker).filter(DigitalWorker.agent_code == worker_code).first()
    worker_title = worker.display_title if worker else "Clara Compras"

    year = datetime.now().year
    po_notes = notes or (
        f"Borrador generado quirúrgicamente por {worker_title}. "
        f"Contiene {len(supplier_diag['items'])} renglones con quiebre o riesgo de stockout. "
        f"Requiere revisión y confirmación del analista de compras."
    )

    po = PurchaseOrder(
        supplier_id=supplier.id,
        buyer_id=buyer_id,
        dest_facility_id=facility.id,
        status='draft',
        total_amount=Decimal('0.00'),
        reference=f"ODC-{year}-TEMP-{uuid.uuid4().hex[:8]}",
        notes=po_notes
    )
    db.add(po)
    db.flush()

    po.reference = f"ODC-{year}-{po.id:05d}"
    total_order_amount = Decimal('0.00')

    for item in supplier_diag["items"]:
        # Buscar pack_id si corresponde
        sp = db.query(SupplierProduct).filter(
            SupplierProduct.supplier_id == supplier.id,
            SupplierProduct.variant_id == item["variant_id"],
            SupplierProduct.is_active == True
        ).first()
        pack_id = sp.pack_id if sp else None

        po_line = PurchaseOrderLine(
            order_id=po.id,
            variant_id=item["variant_id"],
            pack_id=pack_id,
            qty_ordered=Decimal(str(item["boxes_needed"])),
            expected_base_qty=Decimal(str(item["suggested_base_qty"])),
            unit_cost=Decimal(str(item["unit_cost"]))
        )
        db.add(po_line)
        total_order_amount += Decimal(str(item["suggested_base_qty"])) * Decimal(str(item["unit_cost"]))

    po.total_amount = total_order_amount

    # Registrar en bitácora de acciones del trabajador digital
    if worker:
        action_log = DigitalWorkerActionLog(
            worker_id=worker.id,
            facility_id=facility.id,
            action_type='SURGICAL_PO_CREATED',
            target_entity_type='purchase_order',
            target_entity_id=str(po.id),
            severity='INFO',
            summary=f"ODC Borrador creada para {supplier.name}: {po.reference} (${total_order_amount:,.2f} USD, {len(supplier_diag['items'])} renglones).",
            details={
                "order_reference": po.reference,
                "supplier_name": supplier.name,
                "facility_name": facility.name,
                "total_amount": float(total_order_amount),
                "items_count": len(supplier_diag["items"]),
                "skus": [i["sku"] for i in supplier_diag["items"][:10]]
            },
            recipient_target="Analista de Compras",
            status='COMPLETED'
        )
        db.add(action_log)

    db.commit()
    db.refresh(po)

    return {
        "success": True,
        "message": f"Orden de compra en borrador {po.reference} generada exitosamente.",
        "order_id": po.id,
        "order_reference": po.reference,
        "supplier_name": supplier.name,
        "facility_name": facility.name,
        "total_amount": float(total_order_amount),
        "lines_count": len(supplier_diag["items"])
    }

async def run_mrp_bot(db: Session) -> MRPBotLog:
    """
    Ejecución del escaneo diagnóstico nocturno o periódico del autómata MRP.
    A diferencia de la versión previa, ESTA FUNCIÓN NO INSERTA ÓRDENES MASIVAS CIEGAS.
    Calcula el diagnóstico en memoria y lo archiva en pur.mrp_bot_logs para auditoría y consulta inmediata.
    """
    start_time = datetime.now()
    log_record = MRPBotLog(
        executed_at=start_time,
        status="running",
        orders_generated=0,
        items_evaluated=0,
        details=""
    )
    db.add(log_record)
    db.commit()
    db.refresh(log_record)

    try:
        diagnosis = diagnose_stockouts(db)

        log_record.status = "success"
        log_record.orders_generated = 0  # 0 órdenes ciegas creadas
        log_record.items_evaluated = diagnosis.get("total_items_evaluated", 0)
        log_record.details = json.dumps(diagnosis, ensure_ascii=False, default=str)
        db.commit()
        db.refresh(log_record)
        return log_record
    except Exception as e:
        db.rollback()
        log_record.status = "failed"
        log_record.details = json.dumps({"error": str(e)}, ensure_ascii=False)
        db.commit()
        logger.error(f"Error en run_mrp_bot: {e}")
        raise e
