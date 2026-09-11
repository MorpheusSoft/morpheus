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
from app.models.inventory import InventorySnapshot, ProductVariant, Product, ProductPackaging, ProductFacilityPrice
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
    facility_prices_map = {
        (fp.variant_id, fp.facility_id): fp 
        for fp in db.query(ProductFacilityPrice).filter(ProductFacilityPrice.facility_id.in_(fac_ids)).all()
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
                "margin_critical_skus_count": 0,
                "margin_critical_items": [],
                "blocked_skus_count": 0,
                "blocked_items": [],
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
                # 1. Filtro de Producto Bloqueado para Recompra (Dead Stock / Descarte / Merma)
                is_blocked = (
                    getattr(sp, 'is_reorder_blocked', False) or
                    getattr(variant, 'is_blocked_for_purchasing', False) or
                    (getattr(variant, 'dead_stock_status', None) == 'DEAD_STOCK')
                )
                if is_blocked:
                    block_reason = (
                        getattr(variant, 'purchasing_blocked_reason', None) or
                        getattr(sp, 'block_reason', None) or
                        ("Dead Stock inmovilizado" if getattr(variant, 'dead_stock_status', None) == 'DEAD_STOCK' else "Descartado para recompra")
                    )
                    suppliers_data[supplier.id]["blocked_skus_count"] += 1
                    suppliers_data[supplier.id]["blocked_items"].append({
                        "variant_id": variant.id,
                        "sku": variant.sku,
                        "product_name": product.name,
                        "facility_id": fac.id,
                        "facility_name": fac.name,
                        "reason": block_reason,
                        "blocked_at": sp.blocked_at.isoformat() if getattr(sp, 'blocked_at', None) else None
                    })
                    continue

                # 2. Guardián de Margen Negativo o Cero (Caso 8 y Caso 7 Merma Real)
                fp = facility_prices_map.get((variant.id, fac.id))
                sales_price = Decimal(str(fp.sales_price)) if fp and fp.sales_price and fp.sales_price > 0 else Decimal(str(variant.sales_price or 0))
                unit_cost_dec = Decimal(str(unit_cost))

                margin_pct = Decimal('0')
                if sales_price > 0:
                    margin_pct = ((sales_price - unit_cost_dec) / sales_price) * Decimal('100')

                net_margin = getattr(variant, 'net_real_margin', None)
                shrinkage = getattr(variant, 'shrinkage_pct', 0) or 0
                has_negative_real_margin = (net_margin is not None and net_margin <= Decimal('0') and shrinkage > Decimal('0'))

                if sales_price <= 0 or margin_pct <= Decimal('0') or has_negative_real_margin:
                    target_pvp_15 = (unit_cost_dec / Decimal('0.85')) if unit_cost_dec > 0 else Decimal('0')
                    suppliers_data[supplier.id]["margin_critical_skus_count"] += 1
                    suppliers_data[supplier.id]["margin_critical_items"].append({
                        "variant_id": variant.id,

                        "sku": variant.sku,
                        "product_name": product.name,
                        "facility_id": fac.id,
                        "facility_name": fac.name,
                        "unit_cost": float(unit_cost_dec),
                        "sales_price": float(sales_price),
                        "margin_pct": round(float(margin_pct), 2),
                        "suggested_pvp_15": round(float(target_pvp_15), 2),
                        "reason": "Margen nulo o negativo (PVP <= Costo)" if sales_price > 0 else "Sin precio de venta (PVP = 0)",
                        "urgency": item_urgency,
                        "potential_stockout": True
                    })
                    # Excluir automáticamente del sugerido
                    continue

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
                    "sales_price": float(sales_price),
                    "margin_pct": round(float(margin_pct), 2),
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
    total_margin_critical = sum(s.get("margin_critical_skus_count", 0) for s in suppliers_list)
    total_blocked = sum(s.get("blocked_skus_count", 0) for s in suppliers_list)

    return {
        "evaluated_at": datetime.now().isoformat(),
        "total_suppliers_evaluated": len(suppliers_list),
        "total_items_evaluated": total_items_evaluated,
        "critical_suppliers_count": critical_count,
        "warning_suppliers_count": warning_count,
        "healthy_suppliers_count": healthy_count,
        "margin_critical_skus_count": total_margin_critical,
        "blocked_skus_count": total_blocked,
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

def analyze_supplier_dispatch_pattern(
    db: Session,
    supplier_id: int,
    limit: int = 10
) -> Dict[str, Any]:
    """
    Analiza el patrón histórico de despacho de las últimas N órdenes de compra del proveedor.
    Determina si el proveedor entrega preponderantemente a CENDI (>= 80%),
    a Tiendas Directas (>= 80%), o si existe disparidad / patrón mixto que requiere confirmación.
    """
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise ValueError(f"Proveedor con ID {supplier_id} no existe.")

    cendi = db.query(Facility).filter(Facility.is_distribution_center == True, Facility.is_active == True).first()

    orders = db.query(PurchaseOrder).filter(
        PurchaseOrder.supplier_id == supplier_id
    ).order_by(desc(PurchaseOrder.created_at), desc(PurchaseOrder.id)).limit(limit).all()

    total_orders = len(orders)
    cendi_count = 0
    store_count = 0

    if total_orders > 0:
        for o in orders:
            is_cendi = False
            if o.consolidation_mode == 'CONSOLIDATED_CD':
                is_cendi = True
            elif o.dest_facility and getattr(o.dest_facility, 'is_distribution_center', False):
                is_cendi = True
            elif cendi and o.dest_facility_id == cendi.id:
                is_cendi = True

            if is_cendi:
                cendi_count += 1
            else:
                store_count += 1

    cendi_pct = round((cendi_count / total_orders * 100), 1) if total_orders > 0 else 0.0
    store_pct = round((store_count / total_orders * 100), 1) if total_orders > 0 else 0.0

    if total_orders == 0:
        pattern = "DISPARITY_DETECTED"
        rec = f"No hay historial de órdenes previas para {supplier.name}. Clara solicita indicar si desea consolidar en CENDI o emitir órdenes individuales por tienda."
        requires_decision = True
    elif cendi_pct >= 80.0:
        pattern = "PREDOMINANT_CENDI"
        rec = f"El {cendi_pct}% de las órdenes analizadas ({cendi_count}/{total_orders}) se entregan en CENDI. Se recomienda consolidar en Centro de Distribución."
        requires_decision = False
    elif store_pct >= 80.0:
        pattern = "PREDOMINANT_STORES"
        rec = f"El {store_pct}% de las órdenes analizadas ({store_count}/{total_orders}) se entregan directamente en tiendas. Se recomienda generar órdenes individuales por tienda."
        requires_decision = False
    else:
        pattern = "DISPARITY_DETECTED"
        rec = f"Patrón mixto detectado: {cendi_count} órdenes a CENDI ({cendi_pct}%) vs {store_count} órdenes a tiendas ({store_pct}%). Clara solicita confirmar el esquema de abastecimiento."
        requires_decision = True

    return {
        "supplier_id": supplier.id,
        "supplier_name": supplier.name,
        "total_orders_analyzed": total_orders,
        "cendi_orders_count": cendi_count,
        "store_orders_count": store_count,
        "cendi_percentage": cendi_pct,
        "store_percentage": store_pct,
        "pattern": pattern,
        "recommendation": rec,
        "requires_human_decision": requires_decision,
        "suggested_cendi_id": cendi.id if cendi else None,
        "suggested_cendi_name": cendi.name if cendi else None
    }

def generate_consolidated_cendi_order(
    db: Session,
    supplier_id: int,
    cendi_facility_id: Optional[int] = None,
    buyer_id: Optional[int] = None,
    notes: Optional[str] = None,
    worker_code: str = "CLARA_COMPRAS"
) -> Dict[str, Any]:
    """
    Genera una Orden de Compra Consolidada para el CENDI evaluando la demanda de todas las tiendas.
    Calcula los bultos maestros necesarios y genera el desglose de distribución (distribution_breakdown)
    por tienda para uso informativo y cross-docking en almacén.
    """
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise ValueError(f"Proveedor con ID {supplier_id} no existe.")

    if cendi_facility_id:
        cendi_facility = db.query(Facility).filter(Facility.id == cendi_facility_id).first()
    else:
        cendi_facility = db.query(Facility).filter(Facility.is_distribution_center == True, Facility.is_active == True).first()
        if not cendi_facility:
            cendi_facility = db.query(Facility).filter(Facility.is_active == True).first()

    if not cendi_facility:
        raise ValueError("No existe ninguna instalación activa configurada en el sistema.")

    # Tiendas a abastecer
    all_facilities = db.query(Facility).filter(Facility.is_active == True).all()
    store_facilities = [f for f in all_facilities if f.id != cendi_facility.id]
    if not store_facilities:
        store_facilities = all_facilities

    variant_breakdowns: Dict[int, Dict[str, Any]] = {}
    total_stores_impacted = set()

    for store in store_facilities:
        diag = diagnose_stockouts(db, facility_id=store.id, supplier_id=supplier_id)
        supplier_diag = next((s for s in diag.get("suppliers", []) if s["supplier_id"] == supplier_id), None)
        if not supplier_diag:
            continue

        for item in supplier_diag.get("items", []):
            var_id = item["variant_id"]
            needed_qty = float(item["suggested_base_qty"])
            if needed_qty <= 0:
                continue

            total_stores_impacted.add(store.id)
            if var_id not in variant_breakdowns:
                variant_breakdowns[var_id] = {
                    "variant_id": var_id,
                    "sku": item["sku"],
                    "product_name": item["product_name"],
                    "unit_cost": float(item["unit_cost"]),
                    "qty_per_pack": float(item.get("qty_per_pack") or 1.0),
                    "pack_name": item.get("pack_name"),
                    "total_base_qty": 0.0,
                    "stores": []
                }

            store_subtotal = round(needed_qty * float(item["unit_cost"]), 4)
            variant_breakdowns[var_id]["total_base_qty"] += needed_qty
            variant_breakdowns[var_id]["stores"].append({
                "facility_id": store.id,
                "facility_name": store.name,
                "facility_code": store.code,
                "qty_needed": needed_qty,
                "boxes_needed": int(item["boxes_needed"]),
                "subtotal": store_subtotal,
                "urgency": item.get("urgency", "WARNING")
            })

    if not variant_breakdowns:
        raise ValueError(f"El proveedor '{supplier.name}' no presenta requerimientos o déficit de reposición en las tiendas evaluadas.")

    breakdown_list = []
    total_order_amount = Decimal('0.00')

    for var_id, vdata in variant_breakdowns.items():
        total_qty = vdata["total_base_qty"]
        qty_per_pack = vdata["qty_per_pack"] if vdata["qty_per_pack"] > 0 else 1.0
        boxes = math.ceil(total_qty / qty_per_pack)
        final_base_qty = boxes * qty_per_pack
        unit_cost = Decimal(str(vdata["unit_cost"]))
        line_subtotal = Decimal(str(round(final_base_qty * float(unit_cost), 4)))

        vdata["total_qty"] = float(final_base_qty)
        vdata["boxes_needed"] = boxes
        vdata["total_subtotal"] = float(line_subtotal)
        breakdown_list.append(vdata)
        total_order_amount += line_subtotal

    if not buyer_id:
        buyer = db.query(Buyer).filter(Buyer.id == 1).first() or db.query(Buyer).first()
        buyer_id = buyer.id if buyer else None

    worker = db.query(DigitalWorker).filter(DigitalWorker.agent_code == worker_code).first()
    worker_title = worker.display_title if worker else "Clara Compras"

    year = datetime.now().year
    po_notes = notes or (
        f"Orden Consolidada para CENDI ({cendi_facility.name}) generada por {worker_title}. "
        f"Consolida demanda de {len(total_stores_impacted)} sucursales para posterior distribución / cross-docking. "
        f"Total de {len(breakdown_list)} renglones maestros."
    )

    po = PurchaseOrder(
        supplier_id=supplier.id,
        buyer_id=buyer_id,
        dest_facility_id=cendi_facility.id,
        target_cd_facility_id=cendi_facility.id,
        consolidation_mode='CONSOLIDATED_CD',
        distribution_breakdown=breakdown_list,
        status='draft',
        total_amount=Decimal('0.00'),
        reference=f"ODC-{year}-CENDI-{uuid.uuid4().hex[:6].upper()}",
        notes=po_notes
    )
    db.add(po)
    db.flush()

    po.reference = f"ODC-{year}-{po.id:05d}"
    po.total_amount = total_order_amount

    for item_data in breakdown_list:
        sp = db.query(SupplierProduct).filter(
            SupplierProduct.supplier_id == supplier.id,
            SupplierProduct.variant_id == item_data["variant_id"],
            SupplierProduct.is_active == True
        ).first()
        pack_id = sp.pack_id if sp else None

        po_line = PurchaseOrderLine(
            order_id=po.id,
            variant_id=item_data["variant_id"],
            pack_id=pack_id,
            qty_ordered=Decimal(str(item_data["boxes_needed"])),
            expected_base_qty=Decimal(str(item_data["total_qty"])),
            unit_cost=Decimal(str(item_data["unit_cost"]))
        )
        db.add(po_line)

    if worker:
        action_log = DigitalWorkerActionLog(
            worker_id=worker.id,
            facility_id=cendi_facility.id,
            action_type='CONSOLIDATED_CENDI_PO_CREATED',
            target_entity_type='purchase_order',
            target_entity_id=str(po.id),
            severity='INFO',
            summary=f"ODC Consolidada CENDI creada para {supplier.name}: {po.reference} (${total_order_amount:,.2f} USD, {len(breakdown_list)} renglones, {len(total_stores_impacted)} tiendas impactadas).",
            details={
                "order_reference": po.reference,
                "supplier_name": supplier.name,
                "cendi_facility_name": cendi_facility.name,
                "total_amount": float(total_order_amount),
                "items_count": len(breakdown_list),
                "stores_impacted_count": len(total_stores_impacted),
                "consolidation_mode": "CONSOLIDATED_CD"
            },
            recipient_target="Analista de Compras",
            status='COMPLETED'
        )
        db.add(action_log)

    db.commit()
    db.refresh(po)

    return {
        "success": True,
        "message": f"Orden de compra consolidada para CENDI {po.reference} generada exitosamente.",
        "order_id": po.id,
        "order_reference": po.reference,
        "supplier_name": supplier.name,
        "cendi_facility_name": cendi_facility.name,
        "total_amount": float(total_order_amount),
        "lines_count": len(breakdown_list),
        "stores_count": len(total_stores_impacted),
        "distribution_breakdown": breakdown_list
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
