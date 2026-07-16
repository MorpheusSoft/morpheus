import math
from datetime import datetime
from decimal import Decimal
import json
from typing import List, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.purchasing import PurchaseOrder, PurchaseOrderLine, SupplierProduct, MRPBotLog
from app.models.inventory import InventorySnapshot, ProductVariant, Product, ProductPackaging
from app.models.core import Supplier, Facility, Buyer
from app.models.sales import Document, DocumentLine

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

async def run_mrp_bot(db: Session) -> MRPBotLog:
    """
    Runs the nightly Automated Purchase Order AI Bot execution.
    For all active products:
      - Computes physical stock.
      - Computes active transit from open ODCs.
      - Estimates critical threshold using the AI predictor.
      - Checks if available stock is below critical threshold.
      - Calculates order quantity, rounding to MOQ and master packaging boxes.
      - Groups orders by Supplier and Facility and generates Draft Purchase Orders.
      - Logs the result to pur.mrp_bot_logs.
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

    items_evaluated = 0
    orders_generated_count = 0
    run_details = []
    
    # Dictionary to group lines to create: (supplier_id, dest_facility_id) -> list of line dicts
    orders_to_create: Dict[Tuple[int, int], List[Dict[str, Any]]] = {}
    
    try:
        # 1. Fetch active supplier products with primary fallback
        all_active_sp = db.query(SupplierProduct).filter(
            SupplierProduct.is_active == True
        ).all()
        
        # Group active supplier products by variant_id
        sp_by_variant: Dict[int, List[SupplierProduct]] = {}
        for sp in all_active_sp:
            sp_by_variant.setdefault(sp.variant_id, []).append(sp)
            
        supplier_products = []
        for var_id, sp_list in sp_by_variant.items():
            if len(sp_list) == 1:
                # If there is exactly one active supplier for this product, use it
                supplier_products.append(sp_list[0])
            else:
                # If there are multiple active suppliers, look for the primary one
                primary_sps = [sp for sp in sp_list if sp.is_primary]
                if primary_sps:
                    supplier_products.append(primary_sps[0])
        
        # 2. Fetch active facilities
        facilities = db.query(Facility).filter(Facility.is_active == True).all()
        facility_map = {f.id: f for f in facilities}
        
        # 3. Process each supplier product across active facilities
        for sp in supplier_products:
            variant = db.query(ProductVariant).filter(
                ProductVariant.id == sp.variant_id,
                ProductVariant.is_active == True
            ).first()
            if not variant:
                continue
                
            product = db.query(Product).filter(Product.id == variant.product_id).first()
            if not product:
                continue
                
            supplier = db.query(Supplier).filter(Supplier.id == sp.supplier_id).first()
            if not supplier:
                continue
                
            for facility_id, facility in facility_map.items():
                items_evaluated += 1
                
                # Fetch current snapshot if any
                snapshot = db.query(InventorySnapshot).filter(
                    InventorySnapshot.variant_id == variant.id,
                    InventorySnapshot.facility_id == facility_id
                ).first()
                
                stock_qty = Decimal(str(snapshot.stock_qty)) if snapshot else Decimal('0')
                safety_stock_conf = Decimal(str(snapshot.safety_stock)) if snapshot else Decimal('0')
                
                # Dynamic 90-day daily sales average (run_rate)
                from datetime import timedelta
                limit_date_90 = datetime.now() - timedelta(days=90)
                total_qty_90 = db.query(func.sum(DocumentLine.quantity))\
                    .join(Document, Document.id == DocumentLine.document_id)\
                    .filter(
                        Document.facility_id == facility_id,
                        DocumentLine.variant_id == variant.id,
                        Document.type == 'INVOICE',
                        Document.state == 'PAID',
                        Document.created_at >= limit_date_90
                    ).scalar() or Decimal('0')
                
                run_rate = total_qty_90 / Decimal('90.0')
                snapshot_run_rate = Decimal(str(snapshot.run_rate)) if snapshot and snapshot.run_rate else Decimal('0')
                
                # Fallback to static snapshot run_rate if no dynamic sales registered
                if run_rate <= 0:
                    run_rate = snapshot_run_rate

                # Dynamic interannual seasonal index
                mid_date_last_year = datetime.now() - timedelta(days=365)
                start_date_month = mid_date_last_year - timedelta(days=15)
                end_date_month = mid_date_last_year + timedelta(days=15)
                
                total_qty_month_ly = db.query(func.sum(DocumentLine.quantity))\
                    .join(Document, Document.id == DocumentLine.document_id)\
                    .filter(
                        Document.facility_id == facility_id,
                        DocumentLine.variant_id == variant.id,
                        Document.type == 'INVOICE',
                        Document.state == 'PAID',
                        Document.created_at >= start_date_month,
                        Document.created_at <= end_date_month
                    ).scalar() or Decimal('0')
                
                start_date_year_ly = mid_date_last_year - timedelta(days=180)
                end_date_year_ly = mid_date_last_year + timedelta(days=185)
                total_qty_year_ly = db.query(func.sum(DocumentLine.quantity))\
                    .join(Document, Document.id == DocumentLine.document_id)\
                    .filter(
                        Document.facility_id == facility_id,
                        DocumentLine.variant_id == variant.id,
                        Document.type == 'INVOICE',
                        Document.state == 'PAID',
                        Document.created_at >= start_date_year_ly,
                        Document.created_at <= end_date_year_ly
                    ).scalar() or Decimal('0')
                
                if total_qty_year_ly > 0:
                    avg_monthly_ly = total_qty_year_ly / Decimal('12.0')
                    seasonal_index = float(total_qty_month_ly / avg_monthly_ly)
                else:
                    # Fallback for new stores / new products: seasonal index is 1.0 (omit interannual)
                    seasonal_index = 1.0
                
                # 4. Calculate transit stock (open ODCs)
                transit_qty = db.query(func.sum(PurchaseOrderLine.expected_base_qty))\
                    .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderLine.order_id)\
                    .filter(
                        PurchaseOrderLine.variant_id == variant.id,
                        PurchaseOrder.dest_facility_id == facility_id,
                        PurchaseOrder.status.in_(['draft', 'approved', 'sent', 'viewed', 'confirmed', 'pending_approval'])
                    ).scalar() or Decimal('0')
                
                # 5. Inventario Disponible = Stock Físico + Tránsito
                inventario_disponible = stock_qty + transit_qty
                
                # 6. AI predictions for Demand and Safety Stock
                predicted_demand, statistical_safety = predict_demand_and_safety_stock(
                    variant_id=variant.id,
                    lead_time_days=supplier.lead_time_days or 5,
                    run_rate=float(run_rate),
                    safety_stock_configured=float(safety_stock_conf),
                    seasonal_index=seasonal_index
                )
                
                # 7. Umbral Crítico
                umbral_critico = predicted_demand + statistical_safety
                
                # 8. Decision Logic
                if inventario_disponible <= umbral_critico:
                    qty_needed = umbral_critico - inventario_disponible
                    if qty_needed <= 0:
                        # Skip if rounding/math results in no need
                        run_details.append({
                            "sku": variant.sku,
                            "product_name": product.name,
                            "facility_name": facility.name,
                            "stock_qty": float(stock_qty),
                            "transit_qty": float(transit_qty),
                            "available_qty": float(inventario_disponible),
                            "predicted_demand": float(predicted_demand),
                            "safety_stock": float(statistical_safety),
                            "critical_threshold": float(umbral_critico),
                            "purchase_qty": 0.0,
                            "boxes_count": 0,
                            "supplier_name": supplier.name,
                            "status": "skipped",
                            "reason": f"Inventario disponible ({inventario_disponible:.2f}) suficiente tras redondeos."
                        })
                        continue
                        
                    # Calculate pack details
                    qty_per_pack = Decimal('1')
                    pack_id = None
                    if sp.pack_id:
                        pack = db.query(ProductPackaging).filter(ProductPackaging.id == sp.pack_id).first()
                        if pack:
                            qty_per_pack = Decimal(str(pack.qty_per_unit))
                            pack_id = pack.id
                            
                    # Apply pack rounding (Master Box Multiplier)
                    if qty_per_pack > 1:
                        boxes_needed = math.ceil(qty_needed / qty_per_pack)
                        qty_ordered = Decimal(str(boxes_needed))
                        expected_base_qty = qty_ordered * qty_per_pack
                    else:
                        qty_ordered = Decimal(str(math.ceil(qty_needed)))
                        expected_base_qty = qty_ordered
                        
                    # Respect Minimum Order Quantity (MOQ)
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
                            
                    unit_cost = sp.replacement_cost or variant.replacement_cost or variant.standard_cost or Decimal('1.00')
                    
                    # Group ODC details by (supplier, facility)
                    key = (sp.supplier_id, facility_id)
                    if key not in orders_to_create:
                        orders_to_create[key] = []
                        
                    orders_to_create[key].append({
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
                        "available_qty": float(inventario_disponible),
                        "predicted_demand": float(predicted_demand),
                        "safety_stock": float(statistical_safety),
                        "critical_threshold": float(umbral_critico),
                        "supplier_name": supplier.name,
                        "boxes_count": int(qty_ordered) if pack_id else 0
                    })
                else:
                    # Stock is sufficient or ODC is in transit avoiding duplicate ODC
                    reason = "Stock disponible es suficiente."
                    if transit_qty > 0:
                        reason = f"Stock disponible suficiente. Tránsito de {transit_qty:.2f} evita duplicidad."
                        
                    run_details.append({
                        "sku": variant.sku,
                        "product_name": product.name,
                        "facility_name": facility.name,
                        "stock_qty": float(stock_qty),
                        "transit_qty": float(transit_qty),
                        "available_qty": float(inventario_disponible),
                        "predicted_demand": float(predicted_demand),
                        "safety_stock": float(statistical_safety),
                        "critical_threshold": float(umbral_critico),
                        "purchase_qty": 0.0,
                        "boxes_count": 0,
                        "supplier_name": supplier.name,
                        "status": "skipped",
                        "reason": reason
                    })

        # 9. Create Purchase Orders
        year = datetime.now().year
        # Query default buyer ID 1 or first buyer
        buyer = db.query(Buyer).filter(Buyer.id == 1).first()
        if not buyer:
            buyer = db.query(Buyer).first()
        buyer_id = buyer.id if buyer else None
        
        for (supplier_id, dest_facility_id), lines_info in orders_to_create.items():
            # Create the draft purchase order
            po = PurchaseOrder(
                supplier_id=supplier_id,
                buyer_id=buyer_id,
                dest_facility_id=dest_facility_id,
                status='draft',
                total_amount=Decimal('0.00'),
                reference=f"ODC-{year}-TEMP"
            )
            db.add(po)
            db.flush()
            
            po.reference = f"ODC-{year}-{po.id:05d}"
            
            total_amount = Decimal('0.00')
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
                total_amount += line_data["expected_base_qty"] * line_data["unit_cost"]
                
                # Append to log details
                run_details.append({
                    "sku": line_data["sku"],
                    "product_name": line_data["product_name"],
                    "facility_name": line_data["facility_name"],
                    "stock_qty": line_data["stock_qty"],
                    "transit_qty": line_data["transit_qty"],
                    "available_qty": line_data["available_qty"],
                    "predicted_demand": line_data["predicted_demand"],
                    "safety_stock": line_data["safety_stock"],
                    "critical_threshold": line_data["critical_threshold"],
                    "purchase_qty": float(line_data["expected_base_qty"]),
                    "boxes_count": line_data["boxes_count"],
                    "supplier_name": line_data["supplier_name"],
                    "status": "purchased",
                    "reason": f"Stock ({line_data['stock_qty']:.2f}) + Tránsito ({line_data['transit_qty']:.2f}) <= Umbral ({line_data['critical_threshold']:.2f}). Se generó ODC {po.reference}.",
                    "odc_reference": po.reference
                })
                
            po.total_amount = total_amount
            orders_generated_count += 1
            
        db.commit()
        
        # Update logs
        log_record.status = "success"
        log_record.orders_generated = orders_generated_count
        log_record.items_evaluated = items_evaluated
        log_record.details = json.dumps(run_details, ensure_ascii=False)
        db.commit()
        
    except Exception as e:
        db.rollback()
        # Save error logs
        log_record.status = "failed"
        log_record.details = json.dumps({
            "error": str(e),
            "partial_details": run_details
        }, ensure_ascii=False)
        db.commit()
        raise e
        
    return log_record
