import sys
sys.path.insert(0, '/home/lzambrano/Desarrollo/Morpheus/backend')

import pytest
from datetime import datetime, timedelta, date
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.api.deps import SessionLocal
from app.models.core import User, Facility, Currency, ExchangeRate, SystemSettings, Company
from app.models.inventory import (
    Warehouse, Location, Category, Product, ProductVariant,
    InventorySnapshot, StockPicking, StockMove
)
from app.models.sales import Customer, Document, DocumentType, DocumentState
from app.core import security

client = TestClient(app)

@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture(scope="module")
def admin_token(db_session: Session):
    # Ensure there is an active admin user with password 'admin123'
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

    # Login to get token
    response = client.post("/api/v1/login/access-token", data={"username": "admin@morpheus.com", "password": "admin123"})
    assert response.status_code == 200
    token_data = response.json()
    return token_data["access_token"]

@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}

@pytest.fixture(scope="module")
def setup_test_data(db_session: Session):
    # Initial cleanup to avoid unique constraint violations
    try:
        db_session.query(StockMove).filter(StockMove.reference == "ODC-001").delete()
        db_session.commit()
        db_session.query(StockPicking).filter(StockPicking.name == "REC-TEST-PICKING-1").delete()
        db_session.commit()
        db_session.query(InventorySnapshot).filter(
            InventorySnapshot.variant_id.in_(
                db_session.query(ProductVariant.id).filter(ProductVariant.sku == "TEST-SKU-9999")
            )
        ).delete()
        db_session.commit()
        db_session.query(ProductVariant).filter(ProductVariant.sku == "TEST-SKU-9999").delete()
        db_session.commit()
        db_session.query(Product).filter(Product.name == "Test Product name").delete()
        db_session.commit()
        db_session.query(Category).filter(Category.slug == "test-category-1").delete()
        db_session.commit()
        db_session.query(Location).filter(Location.code == "TEST-LOC-1").delete()
        db_session.commit()
        db_session.query(Location).filter(Location.code == "TEST-SUPPLIER-LOC").delete()
        db_session.commit()
        db_session.query(Warehouse).filter(Warehouse.code == "TEST-WH-1").delete()
        db_session.commit()
        db_session.query(Facility).filter(Facility.code == "TEST-FAC-1").delete()
        db_session.commit()
    except Exception:
        db_session.rollback()

    # 1. Ensure VES currency exists with rate 40.0
    ves_curr = db_session.query(Currency).filter(Currency.code == "VES").first()
    if not ves_curr:
        ves_curr = Currency(code="VES", name="Bolívar", symbol="Bs", exchange_rate=Decimal("40.0"), is_active=True)
        db_session.add(ves_curr)
        db_session.commit()
    else:
        ves_curr.exchange_rate = Decimal("40.0")
        db_session.commit()

    # Create ExchangeRate
    rate_rec = ExchangeRate(currency_id=ves_curr.id, rate=Decimal("40.0"), effective_date=datetime.now() - timedelta(days=2))
    db_session.add(rate_rec)
    db_session.commit()

    # Ensure USD currency exists with rate 1.0
    usd_curr = db_session.query(Currency).filter(Currency.code == "USD").first()
    if not usd_curr:
        usd_curr = Currency(code="USD", name="US Dollar", symbol="$", exchange_rate=Decimal("1.0"), is_active=True)
        db_session.add(usd_curr)
        db_session.commit()

    # 2. Company
    comp = db_session.query(Company).first()
    if not comp:
        comp = Company(name="Morpheus C.A.", tax_id="J-12345678-9", currency_code="USD")
        db_session.add(comp)
        db_session.commit()

    # 3. Facility
    facility = Facility(company_id=comp.id, name="Test Facility", code="TEST-FAC-1", address="Test Address", is_active=True)
    db_session.add(facility)
    db_session.commit()

    # 4. Warehouse
    warehouse = Warehouse(facility_id=facility.id, name="Test Warehouse", code="TEST-WH-1", is_scrap=False, is_transit=False)
    db_session.add(warehouse)
    db_session.commit()

    # 5. Location
    location = Location(warehouse_id=warehouse.id, name="Test Shelf 1", code="TEST-LOC-1", barcode="TLOC1", usage="INTERNAL")
    db_session.add(location)
    db_session.commit()

    supplier_location = Location(warehouse_id=warehouse.id, name="Supplier Location", code="TEST-SUPPLIER-LOC", barcode="TSUPLOC", usage="EXTERNAL")
    db_session.add(supplier_location)
    db_session.commit()

    # 6. Category
    category = Category(name="Test Category", slug="test-category-1", is_active=True)
    db_session.add(category)
    db_session.commit()

    # 7. Product & Variant
    product = Product(
        category_id=category.id, name="Test Product name", brand="Test Brand",
        sell_on_web=True, is_active=True, product_type="STOCKED", uom_base="PZA"
    )
    db_session.add(product)
    db_session.commit()

    variant = ProductVariant(
        product_id=product.id, sku="TEST-SKU-9999", average_cost=Decimal("10.0"),
        last_cost=Decimal("12.0"), sales_price=Decimal("15.0"), is_active=True
    )
    db_session.add(variant)
    db_session.commit()

    # 8. InventorySnapshot
    snap = InventorySnapshot(
        variant_id=variant.id, facility_id=facility.id, stock_qty=Decimal("50.0"),
        avg_cost=Decimal("10.0"), current_cost=Decimal("12.0"), replacement_cost=Decimal("11.0")
    )
    db_session.add(snap)
    db_session.commit()

    # 9. StockMoves & Pickings for Book Report
    picking = StockPicking(
        name="REC-TEST-PICKING-1", origin_document="ODC-001", facility_id=facility.id, status='DONE', picking_type_id=1
    )
    db_session.add(picking)
    db_session.commit()

    # Inflow move: Purchase (REC)
    move_in = StockMove(
        picking_id=picking.id, product_id=variant.id,
        location_src_id=supplier_location.id, location_dest_id=location.id,
        quantity_demand=Decimal("10.0"), quantity_done=Decimal("10.0"),
        unit_cost=Decimal("10.0"), state="DONE", reference="ODC-001",
        date=datetime.now() - timedelta(days=1)
    )
    db_session.add(move_in)
    db_session.commit()

    yield {
        "facility": facility,
        "warehouse": warehouse,
        "location": location,
        "category": category,
        "product": product,
        "variant": variant,
        "snap": snap,
        "picking": picking,
        "move_in": move_in
    }

    # CLEANUP in reverse order
    db_session.delete(move_in)
    db_session.commit()
    db_session.delete(picking)
    db_session.commit()
    db_session.delete(snap)
    db_session.commit()
    db_session.delete(variant)
    db_session.commit()
    db_session.delete(product)
    db_session.commit()
    db_session.delete(category)
    db_session.commit()
    db_session.delete(location)
    db_session.commit()
    db_session.delete(supplier_location)
    db_session.commit()
    db_session.delete(warehouse)
    db_session.commit()
    db_session.delete(facility)
    db_session.commit()
    db_session.delete(rate_rec)
    db_session.commit()


def test_generate_location_label(setup_test_data, auth_headers):
    loc_id = setup_test_data["location"].id
    response = client.get(f"/api/v1/labels/location/{loc_id}", headers=auth_headers)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert len(response.content) > 0


def test_generate_product_label(setup_test_data, auth_headers):
    var_id = setup_test_data["variant"].id
    response = client.get(f"/api/v1/labels/product/{var_id}", headers=auth_headers)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert len(response.content) > 0


def test_inventory_valuation(setup_test_data, auth_headers):
    response = client.get("/api/v1/inventory-valuation/valuation", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "rate" in data
    assert "items" in data
    assert len(data["items"]) > 0
    # Search for our test SKU
    item = next((i for i in data["items"] if i["sku"] == "TEST-SKU-9999"), None)
    assert item is not None
    assert item["qty"] == 50.0
    assert item["cost_avg_usd"] == 10.0
    assert item["cost_avg_ves"] == 400.0
    assert item["cost_actual_usd"] == 12.0
    assert item["cost_actual_ves"] == 480.0


def test_inventory_book_report(setup_test_data, auth_headers):
    start = (date.today() - timedelta(days=2)).isoformat()
    end = (date.today() + timedelta(days=2)).isoformat()
    
    response = client.get(
        f"/api/v1/inventory-valuation/book?start_date={start}&end_date={end}",
        headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    # Search for our test SKU
    item = next((i for i in data["items"] if i["sku"] == "TEST-SKU-9999"), None)
    assert item is not None
    # Verify in_receptions since Tipo_Operacion = REC is classed as reception
    assert item["in_receptions_qty"] == 10.0
    assert item["in_receptions_val_usd"] == 100.0
    assert item["in_receptions_val_ves"] == 4000.0


def test_b2b_register_and_approval_flow(db_session: Session, auth_headers):
    # Ensure any previous matching customer or user is cleaned up
    test_email = "mayoristatest@morpheus.com"
    existing_cust = db_session.query(Customer).filter(Customer.email == test_email).first()
    if existing_cust:
        db_session.delete(existing_cust)
        db_session.commit()
    existing_user = db_session.query(User).filter(User.email == test_email).first()
    if existing_user:
        db_session.delete(existing_user)
        db_session.commit()

    # 1. Register B2B customer
    reg_payload = {
        "rif": "J-99999999",
        "name": "Mayorista Test",
        "email": test_email,
        "phone": "+584120000000",
        "shipping_address": "Av Principal Caracas"
    }
    response = client.post("/api/v1/b2b/register", json=reg_payload)
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == test_email
    assert data["approval_status"] == "PENDING_APPROVAL"
    cust_id = data["id"]

    try:
        # Verify it appears in pending-customers list
        pending_res = client.get("/api/v1/b2b/pending-customers", headers=auth_headers)
        assert pending_res.status_code == 200
        pending_list = pending_res.json()
        assert any(c["id"] == cust_id for c in pending_list)

        # 2. Approve B2B customer
        app_payload = {"wholesaler_tier_id": 1}
        approve_res = client.post(f"/api/v1/b2b/customers/{cust_id}/approve", json=app_payload, headers=auth_headers)
        assert approve_res.status_code == 200
        approved_data = approve_res.json()
        assert approved_data["approval_status"] == "APPROVED"
        assert approved_data["wholesaler_tier_id"] == 1

        # Check that user credentials got created
        created_user = db_session.query(User).filter(User.email == test_email).first()
        assert created_user is not None
        assert created_user.is_active is True

    finally:
        # Cleanup
        db_cust = db_session.query(Customer).filter(Customer.id == cust_id).first()
        if db_cust:
            db_session.delete(db_cust)
        db_user = db_session.query(User).filter(User.email == test_email).first()
        if db_user:
            # First remove UserRole mappings if any
            from app.models.core import UserRole
            db_session.query(UserRole).filter(UserRole.user_id == db_user.id).delete()
            db_session.delete(db_user)
        db_session.commit()
