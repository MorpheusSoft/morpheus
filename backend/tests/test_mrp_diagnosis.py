import sys
sys.path.insert(0, '/home/lzambrano/Desarrollo/Morpheus/backend')

import pytest
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.api.deps import SessionLocal
from app.models.core import User, Facility, Supplier
from app.models.purchasing import PurchaseOrder, PurchaseOrderLine, SupplierProduct
from app.models.inventory import Product, ProductVariant, InventorySnapshot
from app.services.mrp_bot_service import diagnose_stockouts, generate_supplier_po_draft
from app.core import security

client = TestClient(app)

@pytest.fixture(scope="module")
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()

@pytest.fixture(scope="module")
def auth_headers(db: Session):
    admin_user = db.query(User).filter(User.email == "admin@morpheus.com").first()
    if not admin_user:
        admin_user = User(
            email="admin@morpheus.com",
            full_name="Administrador Master",
            hashed_password=security.get_password_hash("admin123"),
            is_superuser=True,
            is_active=True
        )
        db.add(admin_user)
        db.commit()

    response = client.post("/api/v1/login/access-token", data={"username": "admin@morpheus.com", "password": "admin123"})
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

def test_diagnose_stockouts_does_not_create_orders(db: Session):
    # Count POs before diagnosis
    po_count_before = db.query(PurchaseOrder).count()

    diagnosis = diagnose_stockouts(db)

    po_count_after = db.query(PurchaseOrder).count()
    assert po_count_before == po_count_after, "El diagnóstico en memoria NUNCA debe crear órdenes en base de datos"
    assert "suppliers" in diagnosis
    assert "total_capital_required" in diagnosis
    assert "critical_suppliers_count" in diagnosis

def test_api_mrp_diagnosis_endpoint(auth_headers):
    response = client.get("/api/v1/mrp/diagnosis", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "total_suppliers_evaluated" in data
    assert "suppliers" in data
    assert isinstance(data["suppliers"], list)

def test_api_bot_run_does_not_create_mass_pos(auth_headers, db: Session):
    po_count_before = db.query(PurchaseOrder).count()

    response = client.post("/api/v1/mrp/bot/run", headers=auth_headers)
    assert response.status_code == 200
    log_data = response.json()
    assert log_data["orders_generated"] == 0, "run_bot ahora no genera órdenes ciegas masivas"

    po_count_after = db.query(PurchaseOrder).count()
    assert po_count_before == po_count_after, "run_bot no debe incrementar pur.purchase_orders"
