import sys
sys.path.insert(0, '/home/lzambrano/Desarrollo/Morpheus/backend')

import pytest
from decimal import Decimal
import json
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.main import app
from app.api.deps import SessionLocal
from app.models.core import User, Facility, Company, Tribute, Supplier, Currency
from app.models.inventory import Category, Product, ProductVariant, ProductPackaging, InventorySnapshot
from app.models.purchasing import SupplierProduct, PurchaseOrder, PurchaseOrderLine, MRPBotLog
from app.core import security

client = TestClient(app)

@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    try:
        # Auto-initialize database tables for bot log
        from app.main import init_bot_log_db
        init_bot_log_db()
        yield db
    finally:
        db.close()

@pytest.fixture(scope="module")
def admin_token(db_session: Session):
    admin_user = db_session.query(User).filter(User.email == "admin@morpheus.com").first()
    if not admin_user:
        admin_user = User(
            email="admin@morpheus.com",
            full_name="Administrador Master",
            hashed_password=security.get_password_hash("admin123"),
            is_superuser=True,
            is_active=True
        )
        db_session.add(admin_user)
    else:
        admin_user.hashed_password = security.get_password_hash("admin123")
        admin_user.is_active = True
        admin_user.is_superuser = True
        db_session.add(admin_user)
    db_session.commit()

    response = client.post("/api/v1/login/access-token", data={"username": "admin@morpheus.com", "password": "admin123"})
    assert response.status_code == 200
    token_data = response.json()
    return token_data["access_token"]

@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def setup_mrp_data(db_session: Session):
    # Cleanup previous records
    db_session.query(MRPBotLog).delete()
    db_session.query(PurchaseOrderLine).delete()
    db_session.query(PurchaseOrder).delete()
    db_session.query(InventorySnapshot).filter(InventorySnapshot.variant_id.in_([901, 902])).delete()
    db_session.query(SupplierProduct).filter(SupplierProduct.variant_id.in_([901, 902])).delete()
    db_session.query(ProductPackaging).filter(ProductPackaging.id.in_([901, 902])).delete()
    db_session.query(ProductVariant).filter(ProductVariant.id.in_([901, 902])).delete()
    db_session.query(Product).filter(Product.id.in_([901, 902])).delete()
    db_session.query(Supplier).filter(Supplier.id.in_([901, 902])).delete()
    db_session.query(Category).filter(Category.id == 901).delete()
    db_session.commit()

    # 1. Company
    comp = db_session.query(Company).first()
    if not comp:
        comp = Company(name="Morpheus MRP C.A.", tax_id="J-901901-9", currency_code="USD")
        db_session.add(comp)
        db_session.commit()

    # 2. Currency
    curr = db_session.query(Currency).filter(Currency.code == "USD").first()
    if not curr:
        curr = Currency(name="Dolar", code="USD", symbol="$", exchange_rate=Decimal("1.00"), is_active=True)
        db_session.add(curr)
        db_session.commit()

    # 3. Facility (Tienda Principal)
    fac = db_session.query(Facility).filter(Facility.is_active == True).first()
    if not fac:
        fac = Facility(company_id=comp.id, name="Tienda Principal MRP", code="MRP-FAC-1", address="MRP St", is_active=True)
        db_session.add(fac)
        db_session.commit()

    # 4. Suppliers
    sup_a = Supplier(id=901, company_id=comp.id, tax_id="J-SUPA-901", name="Proveedor A", is_active=True, lead_time_days=5, currency_id=curr.id)
    sup_b = Supplier(id=902, company_id=comp.id, tax_id="J-SUPB-902", name="Proveedor B", is_active=True, lead_time_days=10, currency_id=curr.id)
    db_session.add(sup_a)
    db_session.add(sup_b)
    db_session.commit()

    # 5. Category
    cat = Category(id=901, name="Bebidas/Alimentos MRP", slug="mrp-cat", is_active=True)
    db_session.add(cat)
    db_session.commit()

    # 6. Products & Variants
    # Product 1: Coca-Cola 1L (ID: 901, Variant ID: 901)
    prod_coke = Product(id=901, category_id=cat.id, name="Coca-Cola 1L MRP", sell_on_web=True, is_active=True, product_type="STOCKED", uom_base="PZA")
    db_session.add(prod_coke)
    db_session.commit()

    var_coke = ProductVariant(id=901, product_id=prod_coke.id, sku="SKU-COKE-901", standard_cost=Decimal("0.80"), replacement_cost=Decimal("0.80"), sales_price=Decimal("1.50"), is_active=True)
    db_session.add(var_coke)
    db_session.commit()

    # Product 2: Harina de Trigo 1kg (ID: 902, Variant ID: 902)
    prod_flour = Product(id=902, category_id=cat.id, name="Harina de Trigo 1kg MRP", sell_on_web=True, is_active=True, product_type="STOCKED", uom_base="PZA")
    db_session.add(prod_flour)
    db_session.commit()

    var_flour = ProductVariant(id=902, product_id=prod_flour.id, sku="SKU-FLOUR-902", standard_cost=Decimal("1.20"), replacement_cost=Decimal("1.20"), sales_price=Decimal("2.00"), is_active=True)
    db_session.add(var_flour)
    db_session.commit()

    # 7. Product Packaging (Coca-Cola has 12 units/box packaging)
    pack_coke = ProductPackaging(id=901, product_id=prod_coke.id, name="Caja x12", qty_per_unit=Decimal("12.00"))
    db_session.add(pack_coke)
    db_session.commit()

    # 8. Supplier Product Links
    sp_coke = SupplierProduct(
        supplier_id=sup_a.id, variant_id=var_coke.id, supplier_sku="SUP-SKU-COKE",
        pack_id=pack_coke.id, replacement_cost=Decimal("0.80"), min_order_qty=Decimal("12.00"),
        is_active=True, is_primary=True, currency_id=curr.id
    )
    sp_flour = SupplierProduct(
        supplier_id=sup_b.id, variant_id=var_flour.id, supplier_sku="SUP-SKU-FLOUR",
        replacement_cost=Decimal("1.20"), min_order_qty=Decimal("24.00"),
        is_active=True, is_primary=True, currency_id=curr.id
    )
    db_session.add(sp_coke)
    db_session.add(sp_flour)
    db_session.commit()

    # 9. Inventory Snapshots
    # Coke: 5 physical, 10 safety stock, run_rate (sales per day) 3. Available = 5.
    snap_coke = InventorySnapshot(variant_id=var_coke.id, facility_id=fac.id, stock_qty=Decimal("5.00"), safety_stock=Decimal("10.00"), run_rate=Decimal("3.00"))
    # Flour: 2 physical, 5 safety stock, run_rate 2. Available = 2 + 30 transit = 32.
    snap_flour = InventorySnapshot(variant_id=var_flour.id, facility_id=fac.id, stock_qty=Decimal("2.00"), safety_stock=Decimal("5.00"), run_rate=Decimal("2.00"))
    db_session.add(snap_coke)
    db_session.add(snap_flour)
    db_session.commit()

    # 10. Open Purchase Order to simulate Transit for Flour (Caso B: 30 units in transit)
    po_flour = PurchaseOrder(
        supplier_id=sup_b.id, dest_facility_id=fac.id, status="approved",
        total_amount=Decimal("36.00"), reference="ODC-FLOUR-TRANSIT", currency_id=curr.id
    )
    db_session.add(po_flour)
    db_session.flush()

    po_line = PurchaseOrderLine(
        order_id=po_flour.id, variant_id=var_flour.id, qty_ordered=Decimal("30.00"),
        expected_base_qty=Decimal("30.00"), unit_cost=Decimal("1.20")
    )
    db_session.add(po_line)
    db_session.commit()

    yield {
        "facility": fac,
        "supplier_a": sup_a,
        "supplier_b": sup_b,
        "variant_coke": var_coke,
        "variant_flour": var_flour,
        "po_flour": po_flour
    }


    # Cleanup
    db_session.query(MRPBotLog).delete()
    db_session.query(PurchaseOrderLine).delete()
    db_session.query(PurchaseOrder).delete()
    db_session.query(InventorySnapshot).filter(InventorySnapshot.variant_id.in_([901, 902])).delete()
    db_session.query(SupplierProduct).filter(SupplierProduct.variant_id.in_([901, 902])).delete()
    db_session.query(ProductPackaging).filter(ProductPackaging.id.in_([901, 902])).delete()
    db_session.query(ProductVariant).filter(ProductVariant.id.in_([901, 902])).delete()
    db_session.query(Product).filter(Product.id.in_([901, 902])).delete()
    db_session.query(Supplier).filter(Supplier.id.in_([901, 902])).delete()
    db_session.query(Category).filter(Category.id == 901).delete()
    db_session.query(Facility).filter(Facility.id == 901).delete()
    db_session.query(Currency).filter(Currency.id == 901).delete()
    db_session.query(Company).filter(Company.id == 901).delete()
    db_session.commit()

def test_mrp_bot_execution(db_session: Session, setup_mrp_data, auth_headers):
    # Call the endpoint to trigger the bot run manually
    response = client.post("/api/v1/mrp/bot/run", headers=auth_headers)
    assert response.status_code == 200
    
    log_data = response.json()
    assert log_data["status"] == "success"
    assert log_data["orders_generated"] >= 1  # Only Proveedor A/Coca-Cola from our test should be ordered, but tolerate other database records
    
    # Assert logs table
    db_log = db_session.query(MRPBotLog).filter(MRPBotLog.id == log_data["id"]).first()
    assert db_log is not None
    assert db_log.status == "success"
    
    details = json.loads(db_log.details)
    print("LOG DETAILS:", details)
    
    # Find Coke details and check expectations
    coke_log = [d for d in details if d["sku"] == "SKU-COKE-901"][0]
    assert coke_log["status"] == "purchased"
    assert coke_log["stock_qty"] == 5.0
    assert coke_log["transit_qty"] == 0.0
    assert coke_log["purchase_qty"] == 24.0 # (Critical threshold target: demand 17.25 + safety 10 = 27.25. Needed = 27.25 - 5 = 22.25. Box qty is 12, so 2 boxes = 24 units.)
    assert coke_log["boxes_count"] == 2
    
    # Find Flour details and check expectations (Skipped due to transit)
    flour_log = [d for d in details if d["sku"] == "SKU-FLOUR-902"][0]
    assert flour_log["status"] == "skipped"
    assert "evita duplicidad" in flour_log["reason"].lower()
    
    # Assert generated Purchase Order
    coke_po = db_session.query(PurchaseOrder).filter(
        PurchaseOrder.supplier_id == 901,
        PurchaseOrder.status == "draft"
    ).first()
    assert coke_po is not None
    assert len(coke_po.lines) == 1
    assert coke_po.lines[0].variant_id == 901
    assert coke_po.lines[0].qty_ordered == Decimal("2.00") # 2 boxes
    assert coke_po.lines[0].expected_base_qty == Decimal("24.00") # 24 base units
    assert coke_po.lines[0].unit_cost == Decimal("0.80")
    assert coke_po.total_amount == Decimal("19.20") # 24 * 0.80
    
    # Verify GET /bot/logs endpoint works
    logs_response = client.get("/api/v1/mrp/bot/logs", headers=auth_headers)
    assert logs_response.status_code == 200
    logs_list = logs_response.json()
    assert len(logs_list) >= 1
    assert logs_list[0]["id"] == db_log.id

def test_purchase_order_details_and_pdf(db_session: Session, setup_mrp_data, auth_headers):
    # 1. Fetch generated purchase order in draft
    po = db_session.query(PurchaseOrder).filter(PurchaseOrder.supplier_id == 901).first()
    assert po is not None
    
    # Associate a buyer to the PO for testing
    from app.models.core import Buyer
    buyer = db_session.query(Buyer).filter(Buyer.id == 1).first()
    if not buyer:
        buyer = Buyer(id=1, user_id=1, approval_limit=Decimal("5000.00"))
        db_session.add(buyer)
        db_session.commit()
    po.buyer_id = buyer.id
    db_session.commit()
    
    # 2. Get details
    response = client.get(f"/api/v1/purchase-orders/{po.id}/details", headers=auth_headers)
    assert response.status_code == 200
    details = response.json()
    
    assert "buyer_name" in details
    assert details["buyer_name"] == "Administrador Master" # From default user ID 1 created in fixture
    
    lines = details["lines"]
    assert len(lines) > 0
    first_line = lines[0]
    assert "ai_analysis" in first_line
    ai = first_line["ai_analysis"]
    assert "stock_qty" in ai
    assert "daily_sales_avg" in ai
    assert "monthly_sales_avg" in ai
    assert "seasonal_factor" in ai
    assert "safety_stock" in ai
    
    # 3. Check PDF endpoints
    pdf_barcode_resp = client.get(f"/api/v1/purchase-orders/{po.id}/pdf?code_type=barcode", headers=auth_headers)
    assert pdf_barcode_resp.status_code == 200
    assert pdf_barcode_resp.headers["content-type"] == "application/pdf"
    
    pdf_sku_resp = client.get(f"/api/v1/purchase-orders/{po.id}/pdf?code_type=sku", headers=auth_headers)
    assert pdf_sku_resp.status_code == 200
    assert pdf_sku_resp.headers["content-type"] == "application/pdf"

