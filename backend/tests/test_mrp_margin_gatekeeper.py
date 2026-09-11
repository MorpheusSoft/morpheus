import pytest
from decimal import Decimal
from datetime import datetime
from sqlalchemy.orm import Session

from app.api.deps import SessionLocal
from app.models.purchasing import PurchaseOrder, PurchaseOrderLine, SupplierProduct
from app.models.inventory import Product, ProductVariant, InventorySnapshot, ProductFacilityPrice
from app.models.core import Supplier, Facility
from app.services.mrp_bot_service import diagnose_stockouts

def test_margin_gatekeeper_and_reorder_blocking():
    db = SessionLocal()
    try:
        # 1. Setup test facility & supplier
        facility = db.query(Facility).first()
        if not facility:
            pytest.skip("No facility in DB")
        
        supplier = db.query(Supplier).first()
        if not supplier:
            pytest.skip("No supplier in DB")

        # 2. Setup Test Product
        test_product = Product(
            name="TEST PRODUCT MARGIN GATEKEEPER",
            uom_base="UND"
        )
        db.add(test_product)
        db.flush()

        # Variant 1: Healthy Margin (PVP: $10.00, Cost: $6.00 -> Margin: 40%)
        v_healthy = ProductVariant(
            product_id=test_product.id,
            sku=f"TEST-HEALTHY-{test_product.id}",
            sales_price=Decimal("10.00"),
            replacement_cost=Decimal("6.00"),
            is_active=True
        )
        # Variant 2: Zero Margin (PVP: $5.00, Cost: $5.00 -> Margin: 0%)
        v_zero = ProductVariant(
            product_id=test_product.id,
            sku=f"TEST-ZERO-{test_product.id}",
            sales_price=Decimal("5.00"),
            replacement_cost=Decimal("5.00"),
            is_active=True
        )
        # Variant 3: Negative Margin (PVP: $4.00, Cost: $8.00 -> Margin: -100%)
        v_negative = ProductVariant(
            product_id=test_product.id,
            sku=f"TEST-NEG-{test_product.id}",
            sales_price=Decimal("4.00"),
            replacement_cost=Decimal("8.00"),
            is_active=True
        )
        # Variant 4: Blocked Reorder (PVP: $20.00, Cost: $10.00, but is_reorder_blocked = True)
        v_blocked = ProductVariant(
            product_id=test_product.id,
            sku=f"TEST-BLOCK-{test_product.id}",
            sales_price=Decimal("20.00"),
            replacement_cost=Decimal("10.00"),
            is_active=True
        )
        db.add_all([v_healthy, v_zero, v_negative, v_blocked])
        db.flush()

        # Supplier Products
        sp_healthy = SupplierProduct(
            supplier_id=supplier.id,
            variant_id=v_healthy.id,
            replacement_cost=Decimal("6.00"),
            min_order_qty=Decimal("1"),
            is_active=True,
            is_reorder_blocked=False
        )
        sp_zero = SupplierProduct(
            supplier_id=supplier.id,
            variant_id=v_zero.id,
            replacement_cost=Decimal("5.00"),
            min_order_qty=Decimal("1"),
            is_active=True,
            is_reorder_blocked=False
        )
        sp_negative = SupplierProduct(
            supplier_id=supplier.id,
            variant_id=v_negative.id,
            replacement_cost=Decimal("8.00"),
            min_order_qty=Decimal("1"),
            is_active=True,
            is_reorder_blocked=False
        )
        sp_blocked = SupplierProduct(
            supplier_id=supplier.id,
            variant_id=v_blocked.id,
            replacement_cost=Decimal("10.00"),
            min_order_qty=Decimal("1"),
            is_active=True,
            is_reorder_blocked=True,
            block_reason="Descartado por obsolescencia"
        )
        db.add_all([sp_healthy, sp_zero, sp_negative, sp_blocked])

        # Inventory Snapshots in critical stockout state (Stock = 0, Run Rate = 10)
        snap_h = InventorySnapshot(variant_id=v_healthy.id, facility_id=facility.id, stock_qty=Decimal("0"), run_rate=Decimal("10"), safety_stock=Decimal("5"))
        snap_z = InventorySnapshot(variant_id=v_zero.id, facility_id=facility.id, stock_qty=Decimal("0"), run_rate=Decimal("10"), safety_stock=Decimal("5"))
        snap_n = InventorySnapshot(variant_id=v_negative.id, facility_id=facility.id, stock_qty=Decimal("0"), run_rate=Decimal("10"), safety_stock=Decimal("5"))
        snap_b = InventorySnapshot(variant_id=v_blocked.id, facility_id=facility.id, stock_qty=Decimal("0"), run_rate=Decimal("10"), safety_stock=Decimal("5"))
        db.add_all([snap_h, snap_z, snap_n, snap_b])
        db.commit()

        # 3. Run Diagnose Stockouts for this supplier
        diagnosis = diagnose_stockouts(db, facility_id=facility.id, supplier_id=supplier.id)
        supplier_diag = next((s for s in diagnosis["suppliers"] if s["supplier_id"] == supplier.id), None)
        assert supplier_diag is not None

        # 4. Verify Assertions:
        suggested_skus = [it["sku"] for it in supplier_diag["items"]]
        margin_critical_skus = [it["sku"] for it in supplier_diag["margin_critical_items"]]
        blocked_skus = [it["sku"] for it in supplier_diag["blocked_items"]]

        # Healthy item MUST be in suggested items
        assert v_healthy.sku in suggested_skus, f"{v_healthy.sku} should be suggested"

        # Zero and Negative margin items MUST be EXCLUDED from suggestions and present in margin_critical_items
        assert v_zero.sku not in suggested_skus, f"{v_zero.sku} should NOT be in suggested order"
        assert v_zero.sku in margin_critical_skus, f"{v_zero.sku} should be in margin_critical_items"

        assert v_negative.sku not in suggested_skus, f"{v_negative.sku} should NOT be in suggested order"
        assert v_negative.sku in margin_critical_skus, f"{v_negative.sku} should be in margin_critical_items"

        # Blocked item MUST be EXCLUDED from suggestions and present in blocked_items
        assert v_blocked.sku not in suggested_skus, f"{v_blocked.sku} should NOT be in suggested order"
        assert v_blocked.sku in blocked_skus, f"{v_blocked.sku} should be in blocked_items"

        print("TEST PASSED: Guardián de margen y bloqueo funcionando a la perfección!")
    finally:
        db.rollback()
        # Cleanup test records
        try:
            db.query(InventorySnapshot).filter(InventorySnapshot.variant_id.in_([v_healthy.id, v_zero.id, v_negative.id, v_blocked.id])).delete(synchronize_session=False)
            db.query(SupplierProduct).filter(SupplierProduct.variant_id.in_([v_healthy.id, v_zero.id, v_negative.id, v_blocked.id])).delete(synchronize_session=False)
            db.query(ProductVariant).filter(ProductVariant.id.in_([v_healthy.id, v_zero.id, v_negative.id, v_blocked.id])).delete(synchronize_session=False)
            db.query(Product).filter(Product.id == test_product.id).delete(synchronize_session=False)
            db.commit()
        except Exception:
            db.rollback()
        db.close()

if __name__ == "__main__":
    test_margin_gatekeeper_and_reorder_blocking()
