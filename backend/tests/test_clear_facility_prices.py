import sys
sys.path.insert(0, '/home/lzambrano/Desarrollo/Morpheus/backend')

import pytest
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.api.deps import SessionLocal
from app.models.core import User, Facility, Company
from app.models.inventory import (
    Category, Product, ProductVariant, PricingSession, PricingSessionLine, ProductFacilityPrice
)
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
    # Setup structures
    comp = db_session.query(Company).first()
    if not comp:
        comp = Company(name="Morpheus C.A.", tax_id="J-12345678-9", currency_code="USD")
        db_session.add(comp)
        db_session.commit()

    facility = db_session.query(Facility).filter(Facility.code == "TEST-CLEAR-FAC").first()
    if not facility:
        facility = Facility(company_id=comp.id, name="Test Clear Fac", code="TEST-CLEAR-FAC", address="Test Address", is_active=True)
        db_session.add(facility)
        db_session.commit()

    category = db_session.query(Category).filter(Category.slug == "test-clear-cat").first()
    if not category:
        category = Category(name="Test Clear Cat", slug="test-clear-cat", is_active=True)
        db_session.add(category)
        db_session.commit()

    product = Product(
        category_id=category.id, name="Test Product Clear Prices", brand="Test Brand",
        sell_on_web=True, is_active=True, product_type="STOCKED", uom_base="PZA"
    )
    db_session.add(product)
    db_session.commit()

    variant = ProductVariant(
        product_id=product.id, sku="SKU-CLEAR-TEST", average_cost=Decimal("10.0"),
        last_cost=Decimal("12.0"), sales_price=Decimal("15.0"), is_active=True
    )
    db_session.add(variant)
    db_session.commit()

    yield {
        "facility": facility,
        "product": product,
        "variant": variant
    }

    # Cleanup
    db_session.query(ProductFacilityPrice).filter(ProductFacilityPrice.variant_id == variant.id).delete()
    db_session.query(PricingSessionLine).filter(PricingSessionLine.variant_id == variant.id).delete()
    db_session.commit()
    db_session.delete(variant)
    db_session.commit()
    db_session.delete(product)
    db_session.commit()

def test_clear_facility_prices_apply_flow(db_session: Session, setup_data, auth_headers):
    variant = setup_data["variant"]
    facility = setup_data["facility"]

    # 1. Create a ProductFacilityPrice override
    db_session.query(ProductFacilityPrice).filter(
        ProductFacilityPrice.variant_id == variant.id,
        ProductFacilityPrice.facility_id == facility.id
    ).delete()
    db_session.commit()

    fprice = ProductFacilityPrice(
        variant_id=variant.id,
        facility_id=facility.id,
        sales_price=Decimal("18.5"),
        target_utility_pct=Decimal("30.0")
    )
    db_session.add(fprice)
    db_session.commit()

    # Verify fprice exists
    fp_check = db_session.query(ProductFacilityPrice).filter(
        ProductFacilityPrice.variant_id == variant.id,
        ProductFacilityPrice.facility_id == facility.id
    ).first()
    assert fp_check is not None
    assert float(fp_check.sales_price) == 18.5

    # 2. Create Pricing Session
    session_res = client.post(
        "/api/v1/pricing-sessions/",
        json={
            "name": "Session Clear Prices Test",
            "source_type": "CSV_UPLOAD",
            "target_cost_type": "REPLACEMENT",
            "update_type": "PRICE",
            "lines": [
                {
                    "variant_id": variant.id,
                    "proposed_price": 16.0,
                    "action": "UPDATE_COST",
                    "clear_facility_prices": False
                }
            ]
        },
        headers=auth_headers
    )
    assert session_res.status_code == 200
    session_data = session_res.json()
    session_id = session_data["id"]
    line_id = session_data["lines"][0]["id"]

    # 3. Update pricing line clear_facility_prices flag to True
    update_res = client.put(
        f"/api/v1/pricing-sessions/{session_id}/lines/{line_id}",
        json={"clear_facility_prices": True},
        headers=auth_headers
    )
    assert update_res.status_code == 200

    # 4. Verify it was saved in draft session
    line_check = db_session.query(PricingSessionLine).filter(PricingSessionLine.id == line_id).first()
    assert line_check is not None
    assert line_check.clear_facility_prices is True

    # 5. ProductFacilityPrice should STILL exist in the DB (since it's deferred!)
    fp_still_there = db_session.query(ProductFacilityPrice).filter(
        ProductFacilityPrice.variant_id == variant.id,
        ProductFacilityPrice.facility_id == facility.id
    ).first()
    assert fp_still_there is not None

    # 6. Apply Pricing Session
    apply_res = client.post(f"/api/v1/pricing-sessions/{session_id}/apply", headers=auth_headers)
    assert apply_res.status_code == 200

    # 7. Now ProductFacilityPrice should be DELETED
    fp_deleted = db_session.query(ProductFacilityPrice).filter(
        ProductFacilityPrice.variant_id == variant.id,
        ProductFacilityPrice.facility_id == facility.id
    ).first()
    assert fp_deleted is None

    # 8. Check that the variant general price got updated
    db_session.refresh(variant)
    assert float(variant.sales_price) == 16.0
