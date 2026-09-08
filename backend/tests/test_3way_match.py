import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    import pytest
except ImportError:
    class _MockPytest:
        def fixture(self, *args, **kwargs):
            def decorator(f):
                return f
            return decorator
    pytest = _MockPytest()
from decimal import Decimal
from datetime import datetime, date
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.api.deps import SessionLocal
from app.models.core import User, Facility, Supplier, Currency
from app.models.inventory import Product, ProductVariant
from app.models.purchasing import PurchaseOrder, PurchaseOrderLine
from app.core import security

client = TestClient(app)

@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    yield db
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
        db_session.commit()
    
    response = client.post("/api/v1/login/access-token", data={"username": "admin@morpheus.com", "password": "admin123"})
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["access_token"]

@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}

@pytest.fixture(scope="module")
def test_setup(db_session: Session):
    # Setup test supplier, facility, variant
    supp = db_session.query(Supplier).first()
    if not supp:
        supp = Supplier(name="Distribuidora Alimentos Polar C.A.", tax_id="J-00041372-1", is_active=True)
        db_session.add(supp)
        db_session.flush()

    fac = db_session.query(Facility).first()
    if not fac:
        fac = Facility(name="Sucursal Principal", code="SUC-01", is_active=True)
        db_session.add(fac)
        db_session.flush()

    prod = db_session.query(Product).first()
    if not prod:
        prod = Product(name="Harina PAN 1kg", code="PROD-PAN", uom_base="PZA", is_active=True)
        db_session.add(prod)
        db_session.flush()

    variant = db_session.query(ProductVariant).filter(ProductVariant.product_id == prod.id).first()
    if not variant:
        variant = ProductVariant(product_id=prod.id, sku="PAN-001", barcode="75910001001", sales_price=1.20, replacement_cost=0.90, average_cost=0.90)
        db_session.add(variant)
        db_session.flush()

    db_session.commit()
    return {"supplier_id": supp.id, "facility_id": fac.id, "variant_id": variant.id}

def test_kpis_endpoint(auth_headers):
    response = client.get("/api/v1/reconciliation/kpis", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "pending_count" in data
    assert "pending_amount_usd" in data
    assert "conciliated_count" in data
    assert "debit_notes_count" in data
    assert "debit_notes_amount_usd" in data

def test_list_pending_reconciliation_orders(auth_headers):
    response = client.get("/api/v1/reconciliation/?tab=pending", headers=auth_headers)
    assert response.status_code == 200
    items = response.json()
    assert isinstance(items, list)

def test_exact_match_conciliation(db_session: Session, auth_headers, test_setup):
    # 1. Create a PO with 10 units ordered and 10 units received in WMS
    ref = f"ODC-TEST-EXACT-{int(datetime.utcnow().timestamp())}"
    po = PurchaseOrder(
        reference=ref,
        supplier_id=test_setup["supplier_id"],
        dest_facility_id=test_setup["facility_id"],
        status='received',
        total_amount=Decimal('100.00'),
        exchange_rate=Decimal('36.50')
    )
    db_session.add(po)
    db_session.flush()

    line = PurchaseOrderLine(
        order_id=po.id,
        variant_id=test_setup["variant_id"],
        qty_ordered=Decimal('10'),
        expected_base_qty=Decimal('10'),
        unit_cost=Decimal('10.00'),
        received_base_qty=Decimal('10')
    )
    db_session.add(line)
    db_session.commit()

    # 2. Query detail endpoint
    resp_detail = client.get(f"/api/v1/reconciliation/{po.id}", headers=auth_headers)
    assert resp_detail.status_code == 200
    detail = resp_detail.json()
    assert detail["reference"] == ref
    assert len(detail["lines"]) == 1
    assert detail["lines"][0]["line_status"] == "EXACT_MATCH"

    # 3. Process exact match
    payload = {
        "invoice_number": f"FAC-TEST-{po.id}",
        "invoice_date": "2026-09-08",
        "action": "EXACT_MATCH",
        "lines": [
            {
                "id": line.id,
                "billed_qty": 10.0,
                "billed_unit_cost": 10.0
            }
        ]
    }
    resp_process = client.post(f"/api/v1/reconciliation/{po.id}/process", json=payload, headers=auth_headers)
    assert resp_process.status_code == 200, resp_process.text
    result = resp_process.json()
    assert result["status"] == "conciliated"
    assert result["reconciliation_status"] == "MATCH_EXACT"
    assert result["debit_note_number"] is None
    assert float(result["debit_note_amount"]) == 0.0

    # 4. Verify in DB
    db_session.refresh(po)
    assert po.status == 'conciliated'
    assert po.reconciliation_status == 'MATCH_EXACT'
    assert po.invoice_number == f"FAC-TEST-{po.id}"

def test_debit_note_overbilled_quantity(db_session: Session, auth_headers, test_setup):
    # Scenario: Ordered 50 units @ $10 ($500).
    # WMS physical receipt was only 48 units ($480) - 2 units were short/dock rejected.
    # Vendor invoice bills for full 50 units @ $10 ($500).
    # System must detect $20 discrepancy and issue Debit Note ND-xxxx for $20.00.
    ref = f"ODC-TEST-DEBIT-QTY-{int(datetime.utcnow().timestamp())}"
    po = PurchaseOrder(
        reference=ref,
        supplier_id=test_setup["supplier_id"],
        dest_facility_id=test_setup["facility_id"],
        status='received',
        total_amount=Decimal('500.00'),
        exchange_rate=Decimal('36.50')
    )
    db_session.add(po)
    db_session.flush()

    line = PurchaseOrderLine(
        order_id=po.id,
        variant_id=test_setup["variant_id"],
        qty_ordered=Decimal('50'),
        expected_base_qty=Decimal('50'),
        unit_cost=Decimal('10.00'),
        received_base_qty=Decimal('48') # 48 received physically
    )
    db_session.add(line)
    db_session.commit()

    # Query detail
    resp_detail = client.get(f"/api/v1/reconciliation/{po.id}", headers=auth_headers)
    assert resp_detail.status_code == 200

    # Attempting EXACT_MATCH should be rejected because vendor overbilled 2 units
    payload_bad = {
        "invoice_number": f"FAC-DISC-{po.id}",
        "invoice_date": "2026-09-08",
        "action": "EXACT_MATCH",
        "lines": [
            {
                "id": line.id,
                "billed_qty": 50.0,
                "billed_unit_cost": 10.0
            }
        ]
    }
    resp_bad = client.post(f"/api/v1/reconciliation/{po.id}/process", json=payload_bad, headers=auth_headers)
    assert resp_bad.status_code == 400
    assert "Nota de Débito" in resp_bad.json()["detail"]

    # Now approve with Debit Note
    payload_ok = {
        "invoice_number": f"FAC-DISC-{po.id}",
        "invoice_date": "2026-09-08",
        "action": "APPROVE_WITH_DEBIT_NOTE",
        "debit_note_reason": "Faltante físico en muelle de 2 unidades según Acta de Recepción WMS",
        "lines": [
            {
                "id": line.id,
                "billed_qty": 50.0,
                "billed_unit_cost": 10.0
            }
        ]
    }
    resp_ok = client.post(f"/api/v1/reconciliation/{po.id}/process", json=payload_ok, headers=auth_headers)
    assert resp_ok.status_code == 200, resp_ok.text
    res = resp_ok.json()
    assert res["status"] == "conciliated"
    assert res["reconciliation_status"] == "MATCH_WITH_DEBIT_NOTE"
    assert res["debit_note_number"] == f"ND-{po.reference}"
    assert Decimal(str(res["debit_note_amount"])) == Decimal('20.00')
    assert Decimal(str(res["total_invoiced"])) == Decimal('500.00')
    assert Decimal(str(res["total_net_payable"])) == Decimal('480.00')

    # Test Debit Note document endpoint
    resp_nd = client.get(f"/api/v1/reconciliation/{po.id}/debit-note-data", headers=auth_headers)
    assert resp_nd.status_code == 200
    nd_data = resp_nd.json()
    assert nd_data["debit_note_number"] == f"ND-{po.reference}"
    assert nd_data["totals"]["total_debit_usd"] == 20.0
    assert len(nd_data["items"]) == 1
    assert "Faltante en muelle" in nd_data["items"][0]["reason"]

def test_reject_invoice_reconciliation(db_session: Session, auth_headers, test_setup):
    ref = f"ODC-TEST-REJECT-{int(datetime.utcnow().timestamp())}"
    po = PurchaseOrder(
        reference=ref,
        supplier_id=test_setup["supplier_id"],
        dest_facility_id=test_setup["facility_id"],
        status='received',
        total_amount=Decimal('300.00')
    )
    db_session.add(po)
    db_session.flush()

    line = PurchaseOrderLine(
        order_id=po.id,
        variant_id=test_setup["variant_id"],
        qty_ordered=Decimal('30'),
        expected_base_qty=Decimal('30'),
        unit_cost=Decimal('10.00'),
        received_base_qty=Decimal('20')
    )
    db_session.add(line)
    db_session.commit()

    payload = {
        "invoice_number": f"FAC-REJ-{po.id}",
        "invoice_date": "2026-09-08",
        "action": "REJECT",
        "debit_note_reason": "Precios no corresponden con acuerdo comercial y faltan 10 bultos",
        "lines": [{"id": line.id, "billed_qty": 30.0, "billed_unit_cost": 15.0}]
    }
    resp = client.post(f"/api/v1/reconciliation/{po.id}/process", json=payload, headers=auth_headers)
    assert resp.status_code == 200
    res = resp.json()
    assert res["status"] == "rejected"
    assert res["reconciliation_status"] == "REJECTED"

    db_session.refresh(po)
    assert po.reconciliation_status == "REJECTED"
    assert "FACTURA RECHAZADA" in po.reconciliation_notes

def test_price_discrepancy_and_margin_protection(db_session: Session, auth_headers, test_setup):
    # Scenario: Ordered 10 units @ $10.00. Sales price was $15.00 (33.3% margin).
    # Received 10 units in WMS.
    # Vendor billed $12.00 (+20% cost increase).
    # If accepted with price adjustment, new sales price is set to $18.00 to preserve 33.3% margin.
    ref = f"ODC-TEST-PRICE-{int(datetime.utcnow().timestamp())}"
    po = PurchaseOrder(
        reference=ref,
        supplier_id=test_setup["supplier_id"],
        dest_facility_id=test_setup["facility_id"],
        status='received',
        total_amount=Decimal('100.00'),
        exchange_rate=Decimal('36.50')
    )
    db_session.add(po)
    db_session.flush()

    line = PurchaseOrderLine(
        order_id=po.id,
        variant_id=test_setup["variant_id"],
        qty_ordered=Decimal('10'),
        expected_base_qty=Decimal('10'),
        unit_cost=Decimal('10.00'),
        received_base_qty=Decimal('10')
    )
    db_session.add(line)
    db_session.commit()

    # Query detail
    resp_detail = client.get(f"/api/v1/reconciliation/{po.id}", headers=auth_headers)
    assert resp_detail.status_code == 200
    detail = resp_detail.json()
    assert len(detail["lines"]) == 1

    # Approve with Debit Note or Accept with new price
    # Case A: Approve with Debit Note for the $20 overprice
    payload_nd = {
        "invoice_number": f"FAC-PRICE-{po.id}",
        "invoice_date": "2026-09-08",
        "action": "APPROVE_WITH_DEBIT_NOTE",
        "debit_note_reason": "Sobreprecio no autorizado de +$2.00 por unidad",
        "lines": [
            {
                "id": line.id,
                "billed_qty": 10.0,
                "billed_unit_cost": 12.0,
                "new_sales_price": 18.0
            }
        ]
    }
    resp = client.post(f"/api/v1/reconciliation/{po.id}/process", json=payload_nd, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    res = resp.json()
    assert res["status"] == "conciliated"
    assert res["reconciliation_status"] == "MATCH_WITH_DEBIT_NOTE"
    assert Decimal(str(res["debit_note_amount"])) == Decimal('20.00')
    assert Decimal(str(res["total_invoiced"])) == Decimal('120.00')
    assert Decimal(str(res["total_net_payable"])) == Decimal('100.00')

    # Verify that variant was updated
    variant = db_session.query(ProductVariant).filter(ProductVariant.id == test_setup["variant_id"]).first()
    assert float(variant.replacement_cost) == 12.0
    assert float(variant.sales_price) == 18.0

def run_all():
    print("=== INICIANDO SUITE DE PRUEBAS 3-WAY MATCH ===")
    db = SessionLocal()
    try:
        token = admin_token(db)
        headers = {"Authorization": f"Bearer {token}"}
        setup = test_setup(db)
        
        print("\n[1/6] Probando endpoint de KPIs de Conciliación...")
        test_kpis_endpoint(headers)
        print("  ✓ KPIs calculados correctamente.")

        print("\n[2/6] Probando listado de órdenes pendientes...")
        test_list_pending_reconciliation_orders(headers)
        print("  ✓ Listado de pendientes obtenido correctamente.")

        print("\n[3/6] Probando flujo MATCH EXACTO (100% Coincidencia)...")
        test_exact_match_conciliation(db, headers, setup)
        print("  ✓ Match exacto procesado y validado en BD.")

        print("\n[4/6] Probando detección de FALTANTE y emisión de NOTA DE DÉBITO...")
        test_debit_note_overbilled_quantity(db, headers, setup)
        print("  ✓ Faltante detectado, Match Exacto bloqueado con error 400 y Nota de Débito emitida con éxito.")

        print("\n[5/6] Probando RECHAZO contable de factura...")
        test_reject_invoice_reconciliation(db, headers, setup)
        print("  ✓ Rechazo contable registrado con trazabilidad.")

        print("\n[6/6] Probando SOBREPRECIO y PROTECCIÓN DE MARGEN...")
        test_price_discrepancy_and_margin_protection(db, headers, setup)
        print("  ✓ Sobreprecio detectado, Nota de Débito emitida y PVP actualizado.")

        print("\n=======================================================")
        print("🎉 TODAS LAS PRUEBAS DE 3-WAY MATCH PASARON EXITOSAMENTE 🎉")
        print("=======================================================")
    finally:
        db.close()

if __name__ == "__main__":
    run_all()
