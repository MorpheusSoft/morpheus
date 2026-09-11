import sys
sys.path.insert(0, '/home/lzambrano/Desarrollo/Morpheus/backend')

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.api.deps import SessionLocal
from app.models.core import User, Facility, Supplier
from app.models.purchasing import PurchaseOrder
from app.models.inventory import StockPicking, StockPickingType
from app.models.digital_workers import DigitalWorker, DigitalWorkerActionLog
from app.services.supplier_logistics_service import (
    audit_supplier_logistics,
    apply_clara_calibration,
    batch_tune_all_suppliers
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
def logistics_test_data(db: Session):
    # Ensure Clara worker exists
    clara = db.query(DigitalWorker).filter(DigitalWorker.agent_code == "CLARA_COMPRAS").first()
    if not clara:
        admin_user = db.query(User).filter(User.email == "admin@morpheus.com").first()
        clara = DigitalWorker(
            user_id=admin_user.id,
            agent_code="CLARA_COMPRAS",
            display_title="Clara - Compras Estratégicas",
            operational_module="PURCHASING",
            system_prompt="Eres Clara, analista senior de compras y abastecimiento de Neo ERP.",
            is_autonomous_active=True
        )
        db.add(clara)
        db.commit()

    # Facility
    facility = db.query(Facility).filter(Facility.code == "FAC-CALIB-TEST").first()
    if not facility:
        facility = Facility(
            code="FAC-CALIB-TEST",
            name="Almacén Central Pruebas",
            address="Zona Industrial Valencia",
            is_distribution_center=True,
            is_active=True
        )
        db.add(facility)
        db.commit()
        db.refresh(facility)

    # Supplier with theoretical 3 days lead time, 7 days restock coverage
    supplier = db.query(Supplier).filter(Supplier.tax_id == "J-99887766-3").first()
    if not supplier:
        supplier = Supplier(
            name="Proveedor Calibración Logística Neo",
            commercial_name="Distribuidores Calib S.A.",
            tax_id="J-99887766-3",
            lead_time_days=3,
            restock_coverage_days=7,
            auto_tune_logistics=False,
            is_active=True
        )
        db.add(supplier)
        db.commit()
        db.refresh(supplier)
    else:
        supplier.lead_time_days = 3
        supplier.restock_coverage_days = 7
        supplier.auto_tune_logistics = False
        supplier.default_facility_id = None
        db.commit()
        db.refresh(supplier)

    return {
        "supplier": supplier,
        "facility": facility,
        "clara": clara
    }

def test_initial_audit_under_threshold(db: Session, logistics_test_data):
    """Prueba que sin suficientes entregas (<3), Clara no levanta alerta y se mantiene pasiva"""
    supplier = logistics_test_data["supplier"]
    
    # Limpiar órdenes previas de test si existen
    db.query(StockPicking).filter(StockPicking.origin_document.like("ODC-CALIB-%")).delete(synchronize_session=False)
    db.query(PurchaseOrder).filter(PurchaseOrder.supplier_id == supplier.id).delete(synchronize_session=False)
    db.commit()

    audit = audit_supplier_logistics(db, supplier.id)
    assert audit["deliveries_analyzed"] == 0
    assert audit["requires_attention"] is False
    assert audit["is_calibrated"] is True
    assert "Histórico inicial" in audit["clara_recommendation"]

def test_audit_detects_lead_time_and_cadence_drift(db: Session, logistics_test_data):
    """
    Crea 4 órdenes con recepciones reales de 8 días (desvío +5 respecto a 3 días teóricos)
    e intervalos de 14 días (desvío +7 respecto a 7 días teóricos).
    Verifica que Clara detecta desvío crítico y calcula la mediana exacta.
    """
    supplier = logistics_test_data["supplier"]
    facility = logistics_test_data["facility"]

    now = datetime.now(timezone.utc)
    base_dates = [
        now - timedelta(days=42),
        now - timedelta(days=28),
        now - timedelta(days=14),
        now - timedelta(days=2)
    ]

    for i, order_date in enumerate(base_dates):
        ref = f"ODC-CALIB-00{i+1}"
        po = PurchaseOrder(
            reference=ref,
            supplier_id=supplier.id,
            dest_facility_id=facility.id,
            status="received",
            total_amount=Decimal("1500.00"),
            created_at=order_date
        )
        db.add(po)
        db.commit()
        db.refresh(po)

        # Recepción 8 días después
        receipt_date = order_date + timedelta(days=8)
        picking = StockPicking(
            name=f"PICK-CALIB-00{i+1}",
            origin_document=ref,
            facility_id=facility.id,
            status="DONE",
            date_done=receipt_date,
            created_at=order_date
        )
        db.add(picking)
        db.commit()

    # Ejecutar auditoría
    audit = audit_supplier_logistics(db, supplier.id)

    assert audit["deliveries_analyzed"] >= 3
    assert audit["real_lead_time"] == 8
    assert audit["lead_time_deviation"] == 5 # 8 - 3
    assert audit["configured_lead_time"] == 3
    assert audit["real_restock_days"] == 14 # Intervalo entre órdenes
    assert audit["restock_deviation"] == 7 # 14 - 7
    assert audit["requires_attention"] is True
    assert audit["is_calibrated"] is False
    assert "⚠️ Desvío Logístico Detectado" in audit["clara_recommendation"]
    assert "demora en promedio 8 días" in audit["clara_recommendation"]

    # Verificar que el modelo Supplier actualizó sus campos de auditoría
    db.refresh(supplier)
    assert supplier.clara_suggested_lead_time == 8
    assert supplier.clara_lead_time_deviation == 5
    assert supplier.clara_deliveries_analyzed == 4

def test_apply_clara_calibration(db: Session, logistics_test_data):
    """
    Prueba la aplicación manual/asistida de la recomendación de Clara:
    - Actualiza lead_time_days de 3 a 8
    - Actualiza restock_coverage_days de 7 a 14
    - Resetea desvíos
    - Genera log en DigitalWorkerActionLog
    """
    supplier = logistics_test_data["supplier"]

    res = apply_clara_calibration(
        db,
        supplier.id,
        apply_lead_time=True,
        apply_restock=True,
        apply_default_facility=True,
        user_id=1
    )

    assert res["ok"] is True
    assert res["updated_lead_time_days"] == 8
    assert res["updated_restock_coverage_days"] == 14

    db.refresh(supplier)
    assert supplier.lead_time_days == 8
    assert supplier.restock_coverage_days == 14
    assert supplier.clara_lead_time_deviation == 0

    # Verificar registro en DigitalWorkerActionLog
    log = db.query(DigitalWorkerActionLog).filter(
        DigitalWorkerActionLog.action_type == "SUPPLIER_LOGISTICS_CALIBRATED",
        DigitalWorkerActionLog.target_entity_id == str(supplier.id)
    ).order_by(DigitalWorkerActionLog.created_at.desc()).first()

    assert log is not None
    assert "Calibración Logística Aplicada" in log.summary
    assert log.details["changes"]["lead_time_days"]["new"] == 8

def test_batch_tuning_autonomous_vs_assisted(db: Session, logistics_test_data):
    """
    Prueba el escaneo periódico batch de Clara:
    1. Si auto_tune_logistics es False: solo alerta en attention_needed sin modificar la ficha.
    2. Si auto_tune_logistics es True: auto-calibra y reporta en auto_tuned.
    """
    supplier = logistics_test_data["supplier"]

    # Simular que el proveedor se descalibra (lead time configurado vuelve a 3)
    supplier.lead_time_days = 3
    supplier.auto_tune_logistics = False
    db.commit()

    # 1. Batch con auto_tune = False
    batch_res_1 = batch_tune_all_suppliers(db)
    attention_ids = [item["supplier_id"] for item in batch_res_1["attention_needed"]]
    assert supplier.id in attention_ids
    
    db.refresh(supplier)
    # No debió modificarse
    assert supplier.lead_time_days == 3

    # 2. Batch con auto_tune = True
    supplier.auto_tune_logistics = True
    db.commit()

    batch_res_2 = batch_tune_all_suppliers(db)
    auto_tuned_ids = [item["supplier_id"] for item in batch_res_2["auto_tuned"]]
    assert supplier.id in auto_tuned_ids

    db.refresh(supplier)
    # Ahora sí debió auto-ajustarse a 8
    assert supplier.lead_time_days == 8

def test_api_endpoints(db: Session, logistics_test_data, auth_headers):
    """Verifica los endpoints REST de FastAPI para la auditoría y calibración"""
    supplier = logistics_test_data["supplier"]

    # 1. GET /api/v1/suppliers/{id}/logistics-audit
    resp_audit = client.get(f"/api/v1/suppliers/{supplier.id}/logistics-audit", headers=auth_headers)
    assert resp_audit.status_code == 200
    data = resp_audit.json()
    assert data["supplier_id"] == supplier.id
    assert "clara_recommendation" in data
    assert "real_lead_time" in data
    assert "history" in data

    # 2. POST /api/v1/suppliers/{id}/apply-calibration
    payload = {
        "apply_lead_time": True,
        "apply_restock": True,
        "apply_default_facility": False
    }
    resp_apply = client.post(
        f"/api/v1/suppliers/{supplier.id}/apply-calibration",
        json=payload,
        headers=auth_headers
    )
    assert resp_apply.status_code == 200
    res_data = resp_apply.json()
    assert res_data["ok"] is True
    assert "changes" in res_data
