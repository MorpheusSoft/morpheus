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
from app.models.digital_workers import DigitalWorker, DigitalWorkerActionLog
from app.services.mrp_bot_service import (
    analyze_supplier_dispatch_pattern,
    generate_consolidated_cendi_order
)
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

@pytest.fixture(scope="module")
def test_setup(db: Session):
    # Ensure CENDI facility exists
    cendi = db.query(Facility).filter(Facility.code == "CENDI-TEST").first()
    if not cendi:
        cendi = Facility(
            code="CENDI-TEST",
            name="Centro Distribución Principal Test",
            address="Zona Industrial Valencia",
            is_distribution_center=True,
            is_active=True
        )
        db.add(cendi)
        db.commit()
        db.refresh(cendi)
    else:
        cendi.is_distribution_center = True
        db.commit()

    # Ensure Store facility exists
    store = db.query(Facility).filter(Facility.code == "TIENDA-TEST-1").first()
    if not store:
        store = Facility(
            code="TIENDA-TEST-1",
            name="Tienda Cumboto Test",
            address="Av. Bolívar Norte",
            is_distribution_center=False,
            is_active=True
        )
        db.add(store)
        db.commit()
        db.refresh(store)

    # Ensure Supplier exists
    supplier = db.query(Supplier).filter(Supplier.tax_id == "J-99988877-0").first()
    if not supplier:
        supplier = Supplier(
            name="Distribuidora CENDI Test C.A.",
            tax_id="J-99988877-0",
            is_active=True
        )
        db.add(supplier)
        db.commit()
        db.refresh(supplier)

    return {"cendi": cendi, "store": store, "supplier": supplier}

def test_analyze_supplier_dispatch_pattern_no_history(db: Session, test_setup):
    sup = test_setup["supplier"]
    # Limpiar órdenes previas para prueba limpia
    db.query(PurchaseOrderLine).filter(
        PurchaseOrderLine.order_id.in_(
            db.query(PurchaseOrder.id).filter(PurchaseOrder.supplier_id == sup.id)
        )
    ).delete(synchronize_session=False)
    db.query(PurchaseOrder).filter(PurchaseOrder.supplier_id == sup.id).delete()
    db.commit()

    analysis = analyze_supplier_dispatch_pattern(db, supplier_id=sup.id)
    assert analysis["total_orders_analyzed"] == 0
    assert analysis["pattern"] == "DISPARITY_DETECTED"
    assert analysis["requires_human_decision"] is True

def test_analyze_supplier_dispatch_pattern_predominant_cendi(db: Session, test_setup):
    sup = test_setup["supplier"]
    cendi = test_setup["cendi"]
    store = test_setup["store"]

    # Crear 8 órdenes a CENDI y 2 a tienda (80% CENDI)
    for i in range(8):
        po = PurchaseOrder(
            supplier_id=sup.id,
            dest_facility_id=cendi.id,
            total_amount=Decimal('100.00'),
            reference=f"TEST-CD-{i}-{sup.id}",
            consolidation_mode='CONSOLIDATED_CD'
        )
        db.add(po)

    for i in range(2):
        po = PurchaseOrder(
            supplier_id=sup.id,
            dest_facility_id=store.id,
            total_amount=Decimal('50.00'),
            reference=f"TEST-ST-{i}-{sup.id}",
            consolidation_mode='DIRECT_STORE'
        )
        db.add(po)
    db.commit()

    analysis = analyze_supplier_dispatch_pattern(db, supplier_id=sup.id, limit=10)
    assert analysis["total_orders_analyzed"] == 10
    assert analysis["cendi_orders_count"] == 8
    assert analysis["cendi_percentage"] == 80.0
    assert analysis["pattern"] == "PREDOMINANT_CENDI"
    assert analysis["requires_human_decision"] is False

def test_analyze_supplier_dispatch_pattern_disparity(db: Session, test_setup):
    sup = test_setup["supplier"]
    cendi = test_setup["cendi"]
    store = test_setup["store"]

    # Limpiar y crear 5 a CENDI y 5 a tienda (50/50 disparidad)
    db.query(PurchaseOrder).filter(PurchaseOrder.supplier_id == sup.id).delete()
    db.commit()

    for i in range(5):
        db.add(PurchaseOrder(
            supplier_id=sup.id,
            dest_facility_id=cendi.id,
            total_amount=Decimal('100.00'),
            reference=f"TEST-CD-50-{i}",
            consolidation_mode='CONSOLIDATED_CD'
        ))
        db.add(PurchaseOrder(
            supplier_id=sup.id,
            dest_facility_id=store.id,
            total_amount=Decimal('50.00'),
            reference=f"TEST-ST-50-{i}",
            consolidation_mode='DIRECT_STORE'
        ))
    db.commit()

    analysis = analyze_supplier_dispatch_pattern(db, supplier_id=sup.id, limit=10)
    assert analysis["total_orders_analyzed"] == 10
    assert analysis["cendi_orders_count"] == 5
    assert analysis["store_orders_count"] == 5
    assert analysis["pattern"] == "DISPARITY_DETECTED"
    assert analysis["requires_human_decision"] is True

def test_generate_consolidated_cendi_order_flow(db: Session, test_setup):
    sup = test_setup["supplier"]
    cendi = test_setup["cendi"]
    store = test_setup["store"]

    # Crear producto y variantes con quiebre en store
    prod = db.query(Product).filter(Product.name == "Aceite Soya Test 1L").first()
    if not prod:
        prod = Product(name="Aceite Soya Test 1L", uom_base="UND")
        db.add(prod)
        db.commit()
        db.refresh(prod)

    var = db.query(ProductVariant).filter(ProductVariant.sku == "ACE-SOYA-TEST").first()
    if not var:
        var = ProductVariant(
            product_id=prod.id,
            sku="ACE-SOYA-TEST",
            sales_price=Decimal('2.50'),
            standard_cost=Decimal('1.80'),
            replacement_cost=Decimal('1.80'),
            is_active=True
        )
        db.add(var)
        db.commit()
        db.refresh(var)

    # Supplier product activo
    sp = db.query(SupplierProduct).filter(
        SupplierProduct.supplier_id == sup.id,
        SupplierProduct.variant_id == var.id
    ).first()
    if not sp:
        sp = SupplierProduct(
            supplier_id=sup.id,
            variant_id=var.id,
            replacement_cost=Decimal('1.80'),
            is_active=True,
            is_reorder_blocked=False
        )
        db.add(sp)
        db.commit()

    # Snapshot en store con stock 0 y run_rate alto para provocar quiebre
    snap = db.query(InventorySnapshot).filter(
        InventorySnapshot.variant_id == var.id,
        InventorySnapshot.facility_id == store.id
    ).first()
    if not snap:
        snap = InventorySnapshot(
            variant_id=var.id,
            facility_id=store.id,
            stock_qty=Decimal('0.0'),
            run_rate=Decimal('5.0'),
            safety_stock=Decimal('15.0')
        )
        db.add(snap)
    else:
        snap.stock_qty = Decimal('0.0')
        snap.run_rate = Decimal('5.0')
        snap.safety_stock = Decimal('15.0')
    db.commit()

    # Generar orden consolidada para CENDI
    res = generate_consolidated_cendi_order(
        db=db,
        supplier_id=sup.id,
        cendi_facility_id=cendi.id
    )

    assert res["success"] is True
    assert res["order_id"] > 0
    assert res["cendi_facility_name"] == cendi.name
    assert res["total_amount"] > 0
    assert len(res["distribution_breakdown"]) > 0

    # Validar persistencia en pur.purchase_orders
    po_db = db.query(PurchaseOrder).filter(PurchaseOrder.id == res["order_id"]).first()
    assert po_db is not None
    assert po_db.consolidation_mode == 'CONSOLIDATED_CD'
    assert po_db.target_cd_facility_id == cendi.id
    assert po_db.dest_facility_id == cendi.id
    assert len(po_db.distribution_breakdown) > 0
    assert len(po_db.lines) > 0

def test_api_supplier_strategy_endpoint(auth_headers, test_setup):
    sup = test_setup["supplier"]
    response = client.post(f"/api/v1/mrp/supplier-strategy?supplier_id={sup.id}&limit=10", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["supplier_id"] == sup.id
    assert "pattern" in data
    assert "cendi_percentage" in data
    assert "requires_human_decision" in data
