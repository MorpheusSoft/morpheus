import pytest
from decimal import Decimal
from datetime import datetime, date
from sqlalchemy.orm import Session

from app.api.deps import SessionLocal
from app.models.purchasing import PurchaseOrder, PurchaseOrderLine
from app.models.inventory import Product, ProductVariant
from app.models.core import Supplier, Facility
from app.services.invoice_ocr_service import InvoiceOCRService

def test_3way_match_exact_and_debit_note_and_unplanned():
    db = SessionLocal()
    try:
        facility = db.query(Facility).first()
        supplier = db.query(Supplier).first()
        if not facility or not supplier:
            pytest.skip("Facility or Supplier not found in DB")

        # 1. Crear producto y variantes de prueba
        prod = Product(name="TEST PRODUCT 3WAY OCR", uom_base="UND")
        db.add(prod)
        db.flush()

        v1 = ProductVariant(product_id=prod.id, sku=f"TEST-3W-V1-{prod.id}", sales_price=Decimal("15.00"), replacement_cost=Decimal("10.00"), is_active=True)
        v2 = ProductVariant(product_id=prod.id, sku=f"TEST-3W-V2-{prod.id}", sales_price=Decimal("25.00"), replacement_cost=Decimal("20.00"), is_active=True)
        db.add_all([v1, v2])
        db.flush()

        # 2. Crear Orden de Compra de prueba (v1: 10 unds @ $10 = $100; v2: 5 unds @ $20 = $100 -> Total: $200)
        po = PurchaseOrder(
            supplier_id=supplier.id,
            dest_facility_id=facility.id,
            status='received',
            total_amount=Decimal('200.00'),
            reference=f"ODC-TEST-3WAY-{prod.id}"
        )
        db.add(po)
        db.flush()

        # Líneas: Supongamos que en WMS se recibieron físicamente:
        # v1: 10 esperadas, 10 recibidas.
        # v2: 5 esperadas, 4 recibidas (1 faltante en muelle).
        line1 = PurchaseOrderLine(order_id=po.id, variant_id=v1.id, qty_ordered=Decimal("10"), expected_base_qty=Decimal("10"), received_base_qty=Decimal("10"), unit_cost=Decimal("10.00"))
        line2 = PurchaseOrderLine(order_id=po.id, variant_id=v2.id, qty_ordered=Decimal("5"), expected_base_qty=Decimal("5"), received_base_qty=Decimal("4"), unit_cost=Decimal("20.00"))
        db.add_all([line1, line2])
        db.commit()

        # =========================================================================
        # ESCENARIO 1: Factura con Discrepancia (Proveedor factura completo 5 unds de v2 y sube costo a $22)
        # =========================================================================
        extracted_discrepancy = {
            "invoice_number": "FACT-DISC-001",
            "invoice_date": "2026-09-11",
            "items": [
                {
                    "matched_variant_id": v1.id,
                    "matched_sku": v1.sku,
                    "invoiced_qty": 10.0,
                    "invoiced_unit_cost": 10.00,
                    "is_unplanned": False
                },
                {
                    "matched_variant_id": v2.id,
                    "matched_sku": v2.sku,
                    "invoiced_qty": 5.0,        # 5 facturadas vs 4 recibidas en muelle (Faltante: 1 und @ $22)
                    "invoiced_unit_cost": 22.00, # $22 facturado vs $20 pedido (Sobrecosto: $2/und)
                    "is_unplanned": False
                }
            ]
        }

        res_disc = InvoiceOCRService.process_3way_match(po, extracted_discrepancy, db)
        assert res_disc["reconciliation_status"] == "MATCH_WITH_DEBIT_NOTE"
        assert res_disc["debit_note_amount"] > 0
        assert res_disc["debit_note_number"] is not None
        # Físico recibido valorizado a costo pedido: (10*10) + (4*20) = $180.
        # Total facturado: (10*10) + (5*22) = 100 + 110 = $210.
        # Discrepancia neta / Nota de débito: 210 - 180 = $30.00.
        assert abs(res_disc["debit_note_amount"] - 30.00) < 0.01

        # =========================================================================
        # ESCENARIO 2: Ítem no pedido en la factura (Pausa para Decisión Humana)
        # =========================================================================
        extracted_unplanned = {
            "invoice_number": "FACT-UNP-002",
            "invoice_date": "2026-09-11",
            "items": [
                {
                    "matched_variant_id": v1.id,
                    "matched_sku": v1.sku,
                    "invoiced_qty": 10.0,
                    "invoiced_unit_cost": 10.00,
                    "is_unplanned": False
                },
                {
                    "matched_variant_id": None,
                    "matched_sku": None,
                    "extracted_description": "PRODUCTO NO PEDIDO",
                    "invoiced_qty": 2.0,
                    "invoiced_unit_cost": 50.00,
                    "is_unplanned": True
                }
            ]
        }

        res_unp = InvoiceOCRService.process_3way_match(po, extracted_unplanned, db)
        assert res_unp["reconciliation_status"] == "PENDING_DECISION"
        assert res_unp["action_required"] == "HUMAN_DECISION_REQUIRED"
        assert res_unp["unplanned_items_count"] == 1

        # =========================================================================
        # ESCENARIO 3: Coincidencia Exacta (Tolerancia de centavos <= $0.50)
        # =========================================================================
        # Actualizamos línea 2 para que lo recibido coincida con lo pedido
        line2.received_base_qty = Decimal("5")
        db.commit()

        extracted_exact = {
            "invoice_number": "FACT-EXACT-003",
            "invoice_date": "2026-09-11",
            "items": [
                {
                    "matched_variant_id": v1.id,
                    "matched_sku": v1.sku,
                    "invoiced_qty": 10.0,
                    "invoiced_unit_cost": 10.02, # $0.20 de diferencia total por redondeo
                    "is_unplanned": False
                },
                {
                    "matched_variant_id": v2.id,
                    "matched_sku": v2.sku,
                    "invoiced_qty": 5.0,
                    "invoiced_unit_cost": 20.00,
                    "is_unplanned": False
                }
            ]
        }

        res_exact = InvoiceOCRService.process_3way_match(po, extracted_exact, db)
        # Diferencia: 10 * 0.02 = $0.20 <= $0.50 de tolerancia
        assert res_exact["is_within_tolerance"] is True
        print("TEST PASSED: Escenarios de 3-Way Match con tolerancia y pausa humana funcionando a la perfección!")
    finally:
        db.rollback()
        try:
            db.query(PurchaseOrderLine).filter(PurchaseOrderLine.order_id == po.id).delete(synchronize_session=False)
            db.query(PurchaseOrder).filter(PurchaseOrder.id == po.id).delete(synchronize_session=False)
            db.query(ProductVariant).filter(ProductVariant.id.in_([v1.id, v2.id])).delete(synchronize_session=False)
            db.query(Product).filter(Product.id == prod.id).delete(synchronize_session=False)
            db.commit()
        except Exception:
            db.rollback()
        db.close()

if __name__ == "__main__":
    test_3way_match_exact_and_debit_note_and_unplanned()
