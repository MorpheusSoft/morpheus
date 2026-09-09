import math
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

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
    Estimador predictivo para cálculo de MRP:
      1. Demanda Proyectada = Ventas Diarias * Lead Time * Factor Estacional
      2. Stock de Seguridad Estadístico (95% nivel de servicio, Z=1.65)
    """
    daily_sales = float(run_rate) if run_rate and run_rate > 0 else 3.5
    lt_days = lead_time_days if lead_time_days and lead_time_days > 0 else 5
    predicted_demand = daily_sales * lt_days * seasonal_index

    z_score = 1.65
    demand_std_dev = daily_sales * 0.25
    lt_variance = lt_days * 0.10
    stat_safety = z_score * math.sqrt(lt_days * (demand_std_dev ** 2) + (daily_sales ** 2) * lt_variance)
    final_safety = max(stat_safety, float(safety_stock_configured or 0.0))

    return Decimal(str(round(predicted_demand, 2))), Decimal(str(round(final_safety, 2)))

def run_mrp_draft_generation(db: Session, worker: DigitalWorker) -> List[Dict[str, Any]]:
    """
    Habilidad de Compras: Ejecuta el análisis predictivo de rotación e inventario disponible.
    Si se detecta quiebre de stock proyectado, genera las Órdenes de Compra en estado 'draft'
    (Borrador) agrupadas por proveedor y sede, respetando empaques maestros y MOQ.
    Registra cada orden creada en la bitácora de acciones del trabajador digital.
    """
    allowed_facility_ids = [f.id for f in worker.user.facilities] if worker.user and worker.user.facilities else [1]
    orders_to_create: Dict[Tuple[int, int], List[Dict[str, Any]]] = {}
    results = []

    # 1. Obtener productos activos de proveedores
    all_active_sp = db.query(SupplierProduct).filter(SupplierProduct.is_active == True).all()
    sp_by_variant: Dict[int, List[SupplierProduct]] = {}
    for sp in all_active_sp:
        sp_by_variant.setdefault(sp.variant_id, []).append(sp)

    supplier_products = []
    for var_id, sp_list in sp_by_variant.items():
        if len(sp_list) == 1:
            supplier_products.append(sp_list[0])
        else:
            primary = next((x for x in sp_list if getattr(x, 'is_primary', False)), sp_list[0])
            supplier_products.append(primary)

    # 2. Analizar inventario y demanda por cada producto y sede
    for sp in supplier_products:
        variant = db.query(ProductVariant).filter(ProductVariant.id == sp.variant_id).first()
        if not variant:
            continue
        product = db.query(Product).filter(Product.id == variant.product_id).first()
        if not product:
            continue
        supplier = db.query(Supplier).filter(Supplier.id == sp.supplier_id).first()
        if not supplier:
            continue

        for facility_id in allowed_facility_ids:
            facility = db.query(Facility).filter(Facility.id == facility_id).first()
            if not facility:
                continue

            # Stock físico
            snapshot = db.query(InventorySnapshot).filter(
                InventorySnapshot.variant_id == variant.id,
                InventorySnapshot.facility_id == facility_id
            ).first()
            stock_qty = snapshot.stock_qty if snapshot else Decimal('0.00')

            # Tránsito abierto
            transit_rows = db.query(PurchaseOrderLine.qty_ordered).join(PurchaseOrder).filter(
                PurchaseOrder.dest_facility_id == facility_id,
                PurchaseOrderLine.variant_id == variant.id,
                PurchaseOrder.status.in_(['confirmed', 'in_transit', 'approved'])
            ).all()
            transit_qty = sum([row[0] for row in transit_rows], Decimal('0.00'))

            inventario_disponible = stock_qty + transit_qty

            # Proyección y ritmo de ventas
            run_rate = float(snapshot.run_rate) if snapshot and snapshot.run_rate else 3.5
            safety_stock_conf = float(snapshot.safety_stock) if snapshot and snapshot.safety_stock else 0.0
            lead_time = supplier.lead_time_days or 5
            predicted_demand, statistical_safety = predict_demand_and_safety_stock(
                variant_id=variant.id,
                lead_time_days=lead_time,
                run_rate=run_rate,
                safety_stock_configured=safety_stock_conf
            )
            umbral_critico = predicted_demand + statistical_safety

            # ¿Requiere compra?
            if inventario_disponible < umbral_critico:
                qty_needed = umbral_critico - inventario_disponible
                if qty_needed <= 0:
                    continue

                # Empaque maestro (Cajas/Bultos)
                qty_per_pack = Decimal('1')
                pack_id = None
                if sp.pack_id:
                    pack = db.query(ProductPackaging).filter(ProductPackaging.id == sp.pack_id).first()
                    if pack:
                        qty_per_pack = Decimal(str(pack.qty_per_unit))
                        pack_id = pack.id

                if qty_per_pack > 1:
                    boxes_needed = math.ceil(qty_needed / qty_per_pack)
                    qty_ordered = Decimal(str(boxes_needed))
                    expected_base_qty = qty_ordered * qty_per_pack
                else:
                    qty_ordered = Decimal(str(math.ceil(qty_needed)))
                    expected_base_qty = qty_ordered

                # Respetar Pedido Mínimo (MOQ)
                min_qty = Decimal(str(sp.min_order_qty or 1))
                if supplier.minimum_order_qty and Decimal(str(supplier.minimum_order_qty)) > min_qty:
                    min_qty = Decimal(str(supplier.minimum_order_qty))

                if expected_base_qty < min_qty:
                    if qty_per_pack > 1:
                        boxes_needed = math.ceil(min_qty / qty_per_pack)
                        qty_ordered = Decimal(str(boxes_needed))
                        expected_base_qty = qty_ordered * qty_per_pack
                    else:
                        qty_ordered = Decimal(str(math.ceil(min_qty)))
                        expected_base_qty = qty_ordered

                unit_cost = sp.replacement_cost or variant.replacement_cost or variant.average_cost or variant.standard_cost or Decimal('1.00')

                key = (sp.supplier_id, facility_id)
                orders_to_create.setdefault(key, []).append({
                    "variant_id": variant.id,
                    "pack_id": pack_id,
                    "qty_ordered": qty_ordered,
                    "expected_base_qty": expected_base_qty,
                    "unit_cost": unit_cost,
                    "sku": variant.sku,
                    "product_name": product.name,
                    "facility_name": facility.name,
                    "stock_qty": float(stock_qty),
                    "transit_qty": float(transit_qty),
                    "supplier_name": supplier.name
                })

    # 3. Crear las Órdenes de Compra en estado DRAFT
    year = datetime.now().year
    buyer = db.query(Buyer).filter(Buyer.id == 1).first() or db.query(Buyer).first()
    buyer_id = buyer.id if buyer else None

    for (supplier_id, dest_facility_id), lines_info in orders_to_create.items():
        supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
        facility = db.query(Facility).filter(Facility.id == dest_facility_id).first()

        # Verificar si ya existe una orden DRAFT hoy para el mismo proveedor y sede creada por este agente
        existing_draft = db.query(PurchaseOrder).filter(
            PurchaseOrder.supplier_id == supplier_id,
            PurchaseOrder.dest_facility_id == dest_facility_id,
            PurchaseOrder.status == 'draft',
            PurchaseOrder.notes.ilike(f"%{worker.display_title}%")
        ).first()

        if existing_draft:
            logger.info(f"[{worker.agent_code}] Ya existe una ODC en borrador ({existing_draft.reference}) para {supplier.name}.")
            continue

        po = PurchaseOrder(
            supplier_id=supplier_id,
            buyer_id=buyer_id,
            dest_facility_id=dest_facility_id,
            status='draft',
            total_amount=Decimal('0.00'),
            reference=f"ODC-{year}-TEMP",
            notes=f"Orden sugerida automáticamente por {worker.display_title}. Generada para evitar quiebre de inventario proyectado. Requiere revisión y confirmación del comprador humano."
        )
        db.add(po)
        db.flush()

        po.reference = f"ODC-{year}-{po.id:05d}"
        total_order_amount = Decimal('0.00')

        for line_data in lines_info:
            po_line = PurchaseOrderLine(
                order_id=po.id,
                variant_id=line_data["variant_id"],
                pack_id=line_data["pack_id"],
                qty_ordered=line_data["qty_ordered"],
                expected_base_qty=line_data["expected_base_qty"],
                unit_cost=line_data["unit_cost"]
            )
            db.add(po_line)
            total_order_amount += line_data["expected_base_qty"] * line_data["unit_cost"]

        po.total_amount = total_order_amount

        # Registrar en la bitácora de acciones del trabajador
        summary_msg = f"ODC sugerida en borrador generada: {po.reference} ({supplier.name} por ${total_order_amount:.2f} USD en {facility.name}). {len(lines_info)} renglones listos para firma."
        action_log = DigitalWorkerActionLog(
            worker_id=worker.id,
            facility_id=dest_facility_id,
            action_type='DRAFT_PO_CREATED',
            target_entity_type='purchase_order',
            target_entity_id=str(po.id),
            severity='INFO',
            summary=summary_msg,
            details={
                "order_reference": po.reference,
                "supplier_name": supplier.name,
                "total_amount": float(total_order_amount),
                "items_count": len(lines_info),
                "items": [{"sku": l["sku"], "qty": float(l["qty_ordered"])} for l in lines_info[:10]]
            },
            recipient_target="Analista de Compras",
            status='COMPLETED'
        )
        db.add(action_log)
        db.commit()

        results.append({
            "order_reference": po.reference,
            "supplier": supplier.name,
            "facility": facility.name,
            "total_amount": float(total_order_amount),
            "lines_count": len(lines_info)
        })

    return results
