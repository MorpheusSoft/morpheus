import sys
sys.path.insert(0, '/home/lzambrano/Desarrollo/Morpheus/backend')

import pytest
from decimal import Decimal
from datetime import datetime
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from unittest.mock import patch, MagicMock

from app.main import app
from app.api.deps import SessionLocal
from app.models.core import User, Facility, Company, Tribute, Supplier, Currency, Role
from app.models.inventory import Category, Product, ProductVariant
from app.models.purchasing import SupplierProduct
from app.models.sales import Document, DocumentLine, Customer
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
def setup_data(db_session: Session):
    # Pre-cleanup to prevent unique constraints failing on rerun
    db_session.query(DocumentLine).filter(DocumentLine.unit_price == Decimal("150.00"), DocumentLine.quantity == Decimal("5.00")).delete()
    db_session.query(Document).filter(Document.document_number == "INV-REP-TEST").delete()
    db_session.query(SupplierProduct).filter(SupplierProduct.supplier_sku == "SUP-SKU-REP").delete()
    db_session.commit()
    existing_var = db_session.query(ProductVariant).filter(ProductVariant.sku == "SKU-REP-TEST").first()
    if existing_var:
        db_session.delete(existing_var)
        db_session.commit()
    existing_prod = db_session.query(Product).filter(Product.name == "Product Report Test").first()
    if existing_prod:
        db_session.delete(existing_prod)
        db_session.commit()

    # Setup company, facility, categories, tax, supplier, products, documents
    comp = db_session.query(Company).first()
    if not comp:
        comp = Company(name="Morpheus C.A.", tax_id="J-12345678-9", currency_code="USD")
        db_session.add(comp)
        db_session.commit()

    facility = db_session.query(Facility).first()
    if not facility:
        facility = Facility(company_id=comp.id, name="Test Fac", code="TEST-FAC", address="Test Address", is_active=True)
        db_session.add(facility)
        db_session.commit()

    tax = db_session.query(Tribute).filter(Tribute.name == "IVA 16%").first()
    if not tax:
        tax = Tribute(name="IVA 16%", rate=Decimal("16.00"), is_active=True)
        db_session.add(tax)
        db_session.commit()
    supplier = db_session.query(Supplier).filter(Supplier.name == "Supplier Report Test").first()
    if not supplier:
        supplier = Supplier(name="Supplier Report Test", tax_id="J-99999999-9", is_active=True)
        db_session.add(supplier)
        db_session.commit()

    category = db_session.query(Category).filter(Category.slug == "rep-cat").first()
    if not category:
        category = Category(name="Cat Report Test", slug="rep-cat", is_active=True, path="rep-cat")
        db_session.add(category)
        db_session.commit()

    product = Product(
        category_id=category.id, name="Product Report Test", brand="BrandTest", model="ModelTest",
        sell_on_web=True, is_active=True, product_type="STOCKED", uom_base="PZA", tax_id=tax.id
    )
    db_session.add(product)
    db_session.commit()

    variant = ProductVariant(
        product_id=product.id, sku="SKU-REP-TEST", average_cost=Decimal("90.0"),
        last_cost=Decimal("80.0"), standard_cost=Decimal("100.0"), replacement_cost=Decimal("85.0"), sales_price=Decimal("150.0"),
        attributes={"talla": "XL", "color": "Rojo"}, is_active=True
    )
    db_session.add(variant)
    db_session.commit()

    sup_prod = SupplierProduct(
        supplier_id=supplier.id, variant_id=variant.id, supplier_sku="SUP-SKU-REP",
        min_order_qty=Decimal("1.00"), is_active=True
    )
    db_session.add(sup_prod)
    db_session.commit()

    # Setup Customer
    customer = db_session.query(Customer).filter(Customer.rif == "J-11111111-1").first()
    if not customer:
        customer = Customer(rif="J-11111111-1", name="Customer Test", is_active=True)
        db_session.add(customer)
        db_session.commit()

    # Setup Currency
    currency = db_session.query(Currency).filter(Currency.code == "USD").first()
    if not currency:
        currency = Currency(name="Dolar", code="USD", symbol="$", exchange_rate=Decimal("1.0"), is_active=True)
        db_session.add(currency)
        db_session.commit()

    # Create a sales invoice document to count sold units
    doc = Document(
        document_number="INV-REP-TEST",
        type="INVOICE",
        state="PAID",
        customer_id=customer.id,
        facility_id=facility.id,
        currency_id=currency.id,
        exchange_rate=Decimal("1.0"),
        created_at=datetime.utcnow()
    )
    db_session.add(doc)
    db_session.commit()

    doc_line = DocumentLine(
        document_id=doc.id, variant_id=variant.id, quantity=Decimal("5.00"),
        unit_price=Decimal("150.00"), line_total=Decimal("750.00")
    )
    db_session.add(doc_line)
    db_session.commit()

    yield {
        "facility": facility,
        "product": product,
        "variant": variant,
        "category": category,
        "supplier": supplier,
        "tax": tax
    }

    # Cleanup
    db_session.query(DocumentLine).filter(DocumentLine.variant_id == variant.id).delete()
    db_session.query(Document).filter(Document.document_number == "INV-REP-TEST").delete()
    db_session.query(SupplierProduct).filter(SupplierProduct.variant_id == variant.id).delete()
    db_session.commit()
    db_session.delete(variant)
    db_session.commit()
    db_session.delete(product)
    db_session.commit()

def test_pricing_margin_report(db_session: Session, setup_data, auth_headers):
    # Test getting reports without filters
    response = client.get("/api/v1/reports/pricing-margin", headers=auth_headers)
    assert response.status_code == 200
    res_data = response.json()
    assert "data" in res_data
    assert "total" in res_data
    
    # Assert item calculations
    print("ALL ITEMS CODIGOS:", [x["codigo"] for x in res_data["data"]])
    items = [x for x in res_data["data"] if x["codigo"] == "SKU-REP-TEST"]
    assert len(items) == 1
    item = items[0]
    assert item["costo_sin_iva"] == pytest.approx(100.0)
    assert item["costo_con_iva"] == pytest.approx(116.0) # 100 * 1.16
    assert item["precio_venta"] == pytest.approx(150.0)
    assert item["margen"] == pytest.approx((150.0 - 100.0) / 150.0 * 100.0)
    assert item["unidades_vendidas"] == pytest.approx(5.0)

    # Test AVERAGE cost_type
    avg_resp = client.get("/api/v1/reports/pricing-margin", params={"cost_type": "AVERAGE"}, headers=auth_headers)
    assert avg_resp.status_code == 200
    avg_item = [x for x in avg_resp.json()["data"] if x["codigo"] == "SKU-REP-TEST"][0]
    assert avg_item["costo_sin_iva"] == pytest.approx(90.0)
    assert avg_item["costo_con_iva"] == pytest.approx(104.4) # 90 * 1.16
    assert avg_item["margen"] == pytest.approx((150.0 - 90.0) / 150.0 * 100.0)

    # Test REPLACEMENT cost_type
    rep_resp = client.get("/api/v1/reports/pricing-margin", params={"cost_type": "REPLACEMENT"}, headers=auth_headers)
    assert rep_resp.status_code == 200
    rep_item = [x for x in rep_resp.json()["data"] if x["codigo"] == "SKU-REP-TEST"][0]
    assert rep_item["costo_sin_iva"] == pytest.approx(85.0)
    assert rep_item["costo_con_iva"] == pytest.approx(98.6) # 85 * 1.16
    assert rep_item["margen"] == pytest.approx((150.0 - 85.0) / 150.0 * 100.0)

    # Test LAST cost_type
    last_resp = client.get("/api/v1/reports/pricing-margin", params={"cost_type": "LAST"}, headers=auth_headers)
    assert last_resp.status_code == 200
    last_item = [x for x in last_resp.json()["data"] if x["codigo"] == "SKU-REP-TEST"][0]
    assert last_item["costo_sin_iva"] == pytest.approx(80.0)
    assert last_item["costo_con_iva"] == pytest.approx(92.8) # 80 * 1.16
    assert last_item["margen"] == pytest.approx((150.0 - 80.0) / 150.0 * 100.0)

    # Test filtering by supplier_ids
    sup_response = client.get(
        "/api/v1/reports/pricing-margin",
        params={"supplier_ids": [setup_data['supplier'].id]},
        headers=auth_headers
    )
    assert sup_response.status_code == 200, f"Error: {sup_response.text}"
    assert len(sup_response.json()["data"]) >= 1, f"Supplier response data empty: {sup_response.json()}"

    # Test filtering by category_ids
    cat_response = client.get(
        "/api/v1/reports/pricing-margin",
        params={"category_ids": [setup_data['category'].id]},
        headers=auth_headers
    )
    assert cat_response.status_code == 200, f"Error: {cat_response.text}"
    assert len(cat_response.json()["data"]) >= 1, f"Category response data empty: {cat_response.json()}"

    # Test filtering by brands & models
    brand_response = client.get(
        "/api/v1/reports/pricing-margin",
        params={"brands": ["BrandTest"], "models": ["ModelTest"]},
        headers=auth_headers
    )
    print("BRAND RESPONSE:", brand_response.json())
    assert brand_response.status_code == 200
    assert len(brand_response.json()["data"]) >= 1

    # Test filtering by variant attribute
    attr_response = client.get(
        "/api/v1/reports/pricing-margin",
        params={"attribute_key": "talla", "attribute_value": "XL"},
        headers=auth_headers
    )
    print("ATTR RESPONSE:", attr_response.json())
    assert attr_response.status_code == 200
    assert len(attr_response.json()["data"]) >= 1

    # Test fuzzy search term
    search_response = client.get(
        "/api/v1/reports/pricing-margin",
        params={"search_term": "Report Test"},
        headers=auth_headers
    )
    print("SEARCH RESPONSE:", search_response.json())
    assert search_response.status_code == 200
    assert len(search_response.json()["data"]) >= 1

def test_ai_chat_assistant(db_session: Session, setup_data, auth_headers):
    # Mocking Gemini response and GEMINI_API_KEY environment variable
    with patch.dict("os.environ", {"GEMINI_API_KEY": "mock_key"}):
        with patch("app.api.v1.endpoints.reports.urllib.request.urlopen") as mock_urlopen:
            mock_response = MagicMock()
            mock_response.read.return_value = b'{"candidates": [{"content": {"parts": [{"text": "{\\"text_response\\": \\"An\u00e1lisis de test\\", \\"data_table\\": [], \\"chart\\": null}"}]}}]}'
            mock_urlopen.return_value.__enter__.return_value = mock_response

            # Test request
            response = client.post(
                "/api/v1/reports/ai-chat",
                json={"message": "Analiza el margen de SKU-REP-TEST"},
                headers=auth_headers
            )
            assert response.status_code == 200
            res_data = response.json()
            assert "text_response" in res_data
            assert res_data["text_response"] == "Análisis de test"

def test_ai_chat_assistant_permissions(db_session: Session, setup_data):
    # 1. Create a non-superuser user
    test_user = db_session.query(User).filter(User.email == "test_analyst@morpheus.com").first()
    if test_user:
        db_session.delete(test_user)
        db_session.commit()
    
    test_user = User(
        email="test_analyst@morpheus.com",
        full_name="Analista de Prueba",
        hashed_password=security.get_password_hash("analyst123"),
        is_superuser=False,
        is_active=True
    )
    db_session.add(test_user)
    db_session.commit()

    # Get token for test user
    resp = client.post("/api/v1/login/access-token", data={"username": "test_analyst@morpheus.com", "password": "analyst123"})
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    test_headers = {"Authorization": f"Bearer {token}"}

    # 2. Test request without role -> should be 403 Forbidden
    response = client.post(
        "/api/v1/reports/ai-chat",
        json={"message": "Hola"},
        headers=test_headers
    )
    assert response.status_code == 403
    assert "No tiene privilegios" in response.json()["detail"]

    # 3. Create a Role with can_use_oracle=True and assign to user
    role = Role(
        name="Test Oracle Role",
        description="Role with oracle permission",
        can_use_oracle=True,
        is_active=True
    )
    db_session.add(role)
    db_session.commit()

    test_user.roles.append(role)
    db_session.commit()

    # 4. Test request with role -> should be 200 OK (with mocked Gemini API call)
    with patch.dict("os.environ", {"GEMINI_API_KEY": "mock_key"}):
        with patch("app.api.v1.endpoints.reports.urllib.request.urlopen") as mock_urlopen:
            mock_response = MagicMock()
            mock_response.read.return_value = b'{"candidates": [{"content": {"parts": [{"text": "{\\"text_response\\": \\"An\u00e1lisis de test\\", \\"data_table\\": [], \\"chart\\": null}"}]}}]}'
            mock_urlopen.return_value.__enter__.return_value = mock_response

            response = client.post(
                "/api/v1/reports/ai-chat",
                json={"message": "Analiza el margen de SKU-REP-TEST"},
                headers=test_headers
            )
            assert response.status_code == 200

    # Cleanup
    db_session.delete(test_user)
    db_session.delete(role)
    db_session.commit()

