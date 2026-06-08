from sqlalchemy.orm import Session
from app.models.inventory import ProductVariant, Product, InventorySnapshot, ProductPackaging
from app.models.purchasing import SupplierProduct
from app.models.core import Supplier, Buyer
from app.models.purchasing import SupplierProduct, PurchaseOrder, PurchaseOrderLine
from decimal import Decimal
from datetime import datetime
import math

class MRPService:
    @staticmethod
    def get_simulator_data(db: Session, facility_id: int, supplier_id: int = None, buyer_id: int = None):
        query = db.query(
            SupplierProduct, ProductVariant, Product, InventorySnapshot, Supplier, ProductPackaging
        ).join(
            ProductVariant, SupplierProduct.variant_id == ProductVariant.id
        ).join(
            Product, ProductVariant.product_id == Product.id
        ).join(
            Supplier, SupplierProduct.supplier_id == Supplier.id
        ).outerjoin(
            InventorySnapshot, (InventorySnapshot.variant_id == ProductVariant.id) & (InventorySnapshot.facility_id == facility_id)
        ).outerjoin(
            ProductPackaging, SupplierProduct.pack_id == ProductPackaging.id
        )
        
        if supplier_id:
            query = query.filter(SupplierProduct.supplier_id == supplier_id)
            
        results = query.all()
        simulator_lines = []
        
        for sp, pv, p, snapshot, supp, pack in results:
            run_rate = snapshot.run_rate if snapshot and snapshot.run_rate else Decimal(0)
            safety_stock = snapshot.safety_stock if snapshot and snapshot.safety_stock else Decimal(0)
            current_stock = snapshot.stock_qty if snapshot and snapshot.stock_qty else Decimal(0)
            lead_time = supp.lead_time_days or 0
            
            # Sugerencia Base = (Consumo Diario "Run Rate" * Días de Espera "Lead Time") + Stock de Seguridad
            base_suggestion = (run_rate * Decimal(lead_time)) + safety_stock
            
            # Cantidad a Comprar = Sugerencia Base - Inventario Actual
            net_to_buy = base_suggestion - current_stock
            if net_to_buy < 0:
                net_to_buy = Decimal(0)
                
            moq = sp.min_order_qty or Decimal(1)
            
            qty_per_pack = pack.qty_per_unit if pack and pack.qty_per_unit else Decimal(1)
            pack_name = pack.name if pack else "Unidad Min"
            
            # MOQ and Logistic rounding
            # 1. Respect the Minimum Order Qty (MOQ)
            if net_to_buy > 0 and net_to_buy < moq:
                net_to_buy = moq
                
            # 2. Round to step (multiples of qty_per_pack)
            if net_to_buy > 0 and qty_per_pack > 1:
                # e.g., if net_to_buy is 43 and box has 20, we need 3 boxes = 60
                boxes_needed = math.ceil(float(net_to_buy) / float(qty_per_pack))
                net_to_buy_base = Decimal(boxes_needed) * qty_per_pack
                logistic_qty = Decimal(boxes_needed)
            else:
                net_to_buy_base = net_to_buy
                logistic_qty = net_to_buy

            line = {
                "variant_id": pv.id,
                "product_id": p.id,
                "sku": pv.sku,
                "product_name": p.name,
                "uom_base": p.uom_base,
                "supplier_id": supp.id,
                "supplier_name": supp.name,
                "supplier_default_facility_id": supp.default_facility_id,
                "run_rate": run_rate,
                "safety_stock": safety_stock,
                "current_stock": current_stock,
                "lead_time": lead_time,
                "replacement_cost": sp.replacement_cost,
                "pack_id": sp.pack_id,
                "pack_name": pack_name,
                "qty_per_pack": qty_per_pack,
                "suggested_qty": logistic_qty,
                "suggested_base_qty": net_to_buy_base,
                "moq": moq
            }
            simulator_lines.append(line)
        return simulator_lines

    @staticmethod
    def sync_mrp_variables(db: Session, facility_id: int, variant_id: int, run_rate: Decimal, safety_stock: Decimal):
        snapshot = db.query(InventorySnapshot).filter(InventorySnapshot.variant_id == variant_id, InventorySnapshot.facility_id == facility_id).first()
        if snapshot:
            snapshot.run_rate = run_rate
            snapshot.safety_stock = safety_stock
        else:
            snapshot = InventorySnapshot(
                variant_id=variant_id,
                facility_id=facility_id,
                run_rate=run_rate,
                safety_stock=safety_stock,
                stock_qty=0
            )
            db.add(snapshot)
        db.commit()
        db.refresh(snapshot)
        return snapshot

    @staticmethod
    def generate_orders(db: Session, lines_data: list, facility_id: int, buyer_id: int):
        # Group lines by supplier and destination facility
        supplier_lines = {}
        for line in lines_data:
            suggested = Decimal(str(line.get("suggested_qty", 0)))
            if suggested > 0:
                sup_id = line["supplier_id"]
                dest_fac = line.get("supplier_default_facility_id") or facility_id
                
                group_key = (sup_id, dest_fac)
                
                if group_key not in supplier_lines:
                    supplier_lines[group_key] = []
                supplier_lines[group_key].append(line)
        
        created_orders = []
        year = datetime.now().year
        
        for (sup_id, dest_fac), lines in supplier_lines.items():
            total_amount = Decimal(0)
            for l in lines:
                expected_base = Decimal(str(l.get("suggested_base_qty", l.get("suggested_qty", 0))))
                cost = Decimal(str(l["replacement_cost"]))
                total_amount += expected_base * cost
            
            po = PurchaseOrder(
                supplier_id=sup_id,
                buyer_id=buyer_id,
                dest_facility_id=dest_fac,
                status='draft',
                total_amount=total_amount,
                reference=f"ODC-{year}-TEMP"
            )
            db.add(po)
            db.flush()
            
            po.reference = f"ODC-{year}-{po.id:05d}"
            
            for l in lines:
                expected_base = Decimal(str(l.get("suggested_base_qty", l.get("suggested_qty", 0))))
                logistic_qty = Decimal(str(l.get("suggested_qty", 0)))
                cost = Decimal(str(l["replacement_cost"]))
                
                pol = PurchaseOrderLine(
                    order_id=po.id,
                    variant_id=l["variant_id"],
                    pack_id=l.get("pack_id"),
                    qty_ordered=logistic_qty,
                    expected_base_qty=expected_base,
                    unit_cost=cost
                )
                db.add(pol)
                
            db.refresh(po)
            created_orders.append({
                "id": po.id,
                "reference": po.reference,
                "supplier_id": po.supplier_id,
                "total_amount": po.total_amount
            })
            
        db.commit()
        return created_orders

    @staticmethod
    def get_ai_recommendations(db: Session, facility_id: int):
        snapshots = db.query(InventorySnapshot).filter(
            InventorySnapshot.facility_id == facility_id
        ).all()
        
        recommendations = []
        for snap in snapshots:
            run_rate = float(snap.run_rate or 0)
            safety_stock = float(snap.safety_stock or 0)
            current_stock = float(snap.stock_qty or 0)
            
            if run_rate <= 0:
                continue
                
            days_left = current_stock / run_rate
            
            # Fetch variant and suppliers
            suppliers = db.query(
                SupplierProduct, Supplier
            ).join(
                Supplier, SupplierProduct.supplier_id == Supplier.id
            ).filter(
                SupplierProduct.variant_id == snap.variant_id,
                SupplierProduct.is_active == True
            ).all()
            
            if not suppliers:
                continue
                
            supplier_options = []
            for sp, sup in suppliers:
                cost = float(sp.replacement_cost or 0)
                lead_time = int(sup.lead_time_days or 0)
                
                # past delivery performance
                past_lines = db.query(PurchaseOrderLine).join(
                    PurchaseOrder, PurchaseOrderLine.order_id == PurchaseOrder.id
                ).filter(
                    PurchaseOrder.supplier_id == sup.id,
                    PurchaseOrderLine.variant_id == snap.variant_id,
                    PurchaseOrder.status == 'received'
                ).all()
                
                if past_lines:
                    total_ordered = sum(float(l.expected_base_qty) for l in past_lines)
                    total_received = sum(float(l.received_base_qty) for l in past_lines)
                    effectiveness = (total_received / total_ordered) * 100.0 if total_ordered > 0 else 100.0
                else:
                    effectiveness = 95.0 # default fallback
                    
                cost_score = -cost
                lead_time_score = -lead_time
                eff_score = effectiveness
                
                # normalized scoring
                score = cost_score * 100 + lead_time_score * 50 + eff_score * 2
                
                supplier_options.append({
                    "supplier": sup,
                    "cost": cost,
                    "lead_time": lead_time,
                    "effectiveness": effectiveness,
                    "score": score,
                    "sp": sp
                })
                
            if not supplier_options:
                continue
                
            supplier_options.sort(key=lambda x: x["score"], reverse=True)
            chosen = supplier_options[0]
            
            trigger_days = chosen["lead_time"] + (safety_stock / run_rate if safety_stock > 0 else 5)
            if days_left <= trigger_days:
                v = db.query(ProductVariant).filter(ProductVariant.id == snap.variant_id).first()
                p_name = v.product.name if v and v.product else "Producto"
                sku = v.sku if v else ""
                
                alt_reasons = []
                if len(supplier_options) > 1:
                    other = supplier_options[1]
                    diff_pct = ((other["cost"] - chosen["cost"]) / chosen["cost"]) * 100.0 if chosen["cost"] > 0 else 0
                    if chosen["lead_time"] < other["lead_time"]:
                        alt_reasons.append(f"entrega {other['lead_time'] - chosen['lead_time']} días más rápido")
                    if chosen["effectiveness"] > other["effectiveness"]:
                        alt_reasons.append(f"tiene mejor cumplimiento de entrega ({chosen['effectiveness']:.0f}% vs {other['effectiveness']:.0f}%)")
                    if chosen["cost"] < other["cost"]:
                        alt_reasons.append(f"es {abs(diff_pct):.1f}% más económico")
                
                if not alt_reasons:
                    alt_reasons.append(f"tiene efectividad de entrega de {chosen['effectiveness']:.0f}% y tiempo de entrega de {chosen['lead_time']} días")
                    
                reason = f"Recomendación: Comprar a {chosen['supplier'].name} porque " + " y ".join(alt_reasons) + "."
                
                suggested_buy = math.ceil((safety_stock + (run_rate * 15)) - current_stock)
                if suggested_buy <= 0:
                    suggested_buy = int(chosen["supplier"].lead_time_days or 1) * run_rate
                
                moq = float(chosen["sp"].min_order_qty or 1)
                if suggested_buy < moq:
                    suggested_buy = moq
                    
                recommendations.append({
                    "variant_id": snap.variant_id,
                    "sku": sku,
                    "product_name": p_name,
                    "days_left": math.ceil(days_left),
                    "current_stock": current_stock,
                    "run_rate": run_rate,
                    "chosen_supplier_id": chosen["supplier"].id,
                    "chosen_supplier_name": chosen["supplier"].name,
                    "proposed_cost": chosen["cost"],
                    "suggested_qty": suggested_buy,
                    "reason": reason
                })
                
        return recommendations

