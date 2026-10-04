import pytest
from decimal import Decimal
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from app.api.deps import SessionLocal
from app.models.core import Supplier, Facility, Company
from app.models.inventory import Product, ProductVariant, InventorySnapshot, Category
from app.models.purchasing import SupplierProduct, PurchaseOrder, PurchaseOrderLine, SupplierFacilitySchedule
from app.models.sales import Document, DocumentLine, DocumentState, DocumentType, Customer
from app.services.mrp_bot_service import predict_demand_and_safety_stock, diagnose_stockouts, generate_supplier_po_draft
from app.services.clara_proactive_service import get_weekly_procurement_calendar, run_clara_proactive_purchasing_scan


@pytest.fixture(scope="module")
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def test_predict_demand_zero_sales_produces_zero():
    """
    Regla de Oro: Venta Cero y sin stock de seguridad = Sugerido Cero.
    No debe aplicar el antiguo fallback ficticio de 3.5.
    """
    predicted_demand, safety_stock = predict_demand_and_safety_stock(
        variant_id=999,
        lead_time_days=5,
        run_rate=0.0,
        safety_stock_configured=0.0,
        coverage_days=15
    )
    assert predicted_demand == Decimal('0.00')
    assert safety_stock == Decimal('0.00')


def test_predict_demand_with_coverage_days():
    """
    Verifica que la demanda proyectada cubra el horizonte completo:
    Horizonte = Días de Reposición (15d) + Lead Time (5d) = 20 días.
    Consumo = 10 uds/día -> Demanda = 200 uds.
    """
    predicted_demand, safety_stock = predict_demand_and_safety_stock(
        variant_id=999,
        lead_time_days=5,
        run_rate=10.0,
        safety_stock_configured=20.0,
        coverage_days=15
    )
    # 10 * (15 + 5) = 200
    assert predicted_demand == Decimal('200.00')
    assert safety_stock >= Decimal('20.00')


def test_mrp_diagnose_ignores_zero_sales_items(db: Session):
    """
    Verifica que diagnose_stockouts descarte productos sin rotación y con stock 0
    (previniendo la anomalía de $157k USD de Droguería Nena en Belisa).
    """
    # 1. Crear empresa y sede de prueba
    company = db.query(Company).first()
    if not company:
        company = Company(name="Empresa Test", tax_id="J-99999999-1")
        db.add(company)
        db.flush()

    fac = Facility(
        company_id=company.id,
        name="Sucursal Belisa Test",
        code=f"BEL-TEST-{datetime.now().microsecond}",
        address="Av. Principal Belisa",
        is_active=True
    )
    db.add(fac)
    db.flush()

    # 2. Crear proveedor
    supp = Supplier(
        company_id=company.id,
        tax_id=f"J-TEST-{datetime.now().microsecond}",
        name="Droguería Test C.A.",
        lead_time_days=3,
        restock_coverage_days=7,
        order_day_of_week=1 # Martes
    )
    db.add(supp)
    db.flush()

    # 3. Crear 2 productos: uno inactivo (0 venta, 0 stock) y uno activo (10 uds/día)
    prod1 = Product(name="Medicina Sin Venta", uom_base="UNI")
    prod2 = Product(name="Medicina Alta Rotacion", uom_base="UNI")
    db.add_all([prod1, prod2])
    db.flush()

    var1 = ProductVariant(product_id=prod1.id, sku=f"MED-DEAD-{datetime.now().microsecond}", replacement_cost=Decimal('5.00'), sales_price=Decimal('10.00'))
    var2 = ProductVariant(product_id=prod2.id, sku=f"MED-ROTA-{datetime.now().microsecond}", replacement_cost=Decimal('3.00'), sales_price=Decimal('10.00'))
    db.add_all([var1, var2])
    db.flush()

    # Vincular al proveedor
    sp1 = SupplierProduct(supplier_id=supp.id, variant_id=var1.id, is_active=True, min_order_qty=1)
    sp2 = SupplierProduct(supplier_id=supp.id, variant_id=var2.id, is_active=True, min_order_qty=1)
    db.add_all([sp1, sp2])
    db.flush()

    # Snapshot 1: Stock 0, run_rate 0
    snap1 = InventorySnapshot(variant_id=var1.id, facility_id=fac.id, stock_qty=0, run_rate=0, safety_stock=0)
    # Snapshot 2: Stock 5, run_rate 10
    snap2 = InventorySnapshot(variant_id=var2.id, facility_id=fac.id, stock_qty=5, run_rate=10, safety_stock=10)
    db.add_all([snap1, snap2])
    db.flush()

    # 4. Diagnosticar
    diag = diagnose_stockouts(db, facility_id=fac.id, supplier_id=supp.id)
    supp_diag = next((s for s in diag["suppliers"] if s["supplier_id"] == supp.id), None)
    assert supp_diag is not None

    items = supp_diag["items"]
    # El producto 1 (sin venta y stock 0) NUNCA debe estar en los renglones sugeridos
    assert not any(it["variant_id"] == var1.id for it in items), "El ítem sin venta no debe ser pedido"
    # El producto 2 (con venta real) SÍ debe estar
    assert any(it["variant_id"] == var2.id for it in items), "El ítem con rotación debe ser sugerido"


def test_supplier_calendar_schedule_display(db: Session):
    """
    Verifica que el calendario semanal formatee correctamente los días y sedes.
    """
    cal_text = get_weekly_procurement_calendar(db)
    assert "Cronograma Semanal de Compras" in cal_text
    assert "Lunes" in cal_text
    assert "Martes" in cal_text
    assert "Miércoles" in cal_text
