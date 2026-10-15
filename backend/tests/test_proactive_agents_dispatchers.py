import sys
import os
import pytest
from sqlalchemy.orm import Session

# Asegurar path de backend
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.abspath(os.path.join(current_dir, ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.api.deps import SessionLocal
from app.models.core import SystemJob
from app.models.digital_workers import DigitalWorker, DigitalSkill, DigitalWorkerSkill
from app.services.digital_worker_service import SKILL_DISPATCHER, run_worker_cycle
from app.services.jobs_service import execute_job_by_code
from app.services.arturo_proactive_service import run_arturo_proactive_wms_scan
from app.services.valeria_pricing_service import run_valeria_proactive_pricing_scan
from app.services.clara_proactive_service import run_clara_proactive_purchasing_scan
from scripts.seed_proactive_jobs import seed_proactive_system_jobs, seed_digital_skills_and_links


@pytest.fixture(scope="module")
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def test_skill_dispatcher_mapping():
    """Valida que todas las habilidades de Arturo, Clara y Valeria estén mapeadas a callables."""
    required_arturo_skills = [
        'negative_stock_watchdog',
        'negative_stock_auditor',
        'dock_returns_and_scrap_guard',
        'dock_returns_and_scrap_monitor',
        '3way_unreconciled_watchdog',
        'arturo_proactive_wms_dispatch'
    ]
    for skill in required_arturo_skills:
        assert skill in SKILL_DISPATCHER, f"Falta habilidad de Arturo en SKILL_DISPATCHER: {skill}"
        assert callable(SKILL_DISPATCHER[skill]), f"Handler para {skill} no es invocable"

    required_valeria_skills = [
        'pricing_margin_shield',
        'pricing_cost_spike_watchdog',
        'pricing_pending_sessions_guard',
        'pricing_cross_store_consistency',
        'valeria_proactive_pricing_dispatch'
    ]
    for skill in required_valeria_skills:
        assert skill in SKILL_DISPATCHER, f"Falta habilidad de Valeria en SKILL_DISPATCHER: {skill}"
        assert callable(SKILL_DISPATCHER[skill]), f"Handler para {skill} no es invocable"

    required_clara_skills = [
        'clara_proactive_purchases_dispatch',
        'mrp_purchase_suggester'
    ]
    for skill in required_clara_skills:
        assert skill in SKILL_DISPATCHER, f"Falta habilidad de Clara en SKILL_DISPATCHER: {skill}"
        assert callable(SKILL_DISPATCHER[skill]), f"Handler para {skill} no es invocable"


def test_arturo_proactive_wms_scan(db: Session):
    """Valida la ejecución del escaneo proactivo de Arturo."""
    result = run_arturo_proactive_wms_scan(db, force_notify=False)
    assert isinstance(result, dict)
    assert result.get("success") is True
    assert "negative_stock_count" in result
    assert "dock_returns_count" in result
    assert "unreconciled_orders_count" in result
    assert "message_preview" in result or "message" in result


def test_valeria_proactive_pricing_scan(db: Session):
    """Valida la ejecución del escaneo proactivo de Valeria."""
    result = run_valeria_proactive_pricing_scan(db, force_notify=False)
    assert isinstance(result, dict)
    assert result.get("success") is True
    assert "critical_margins_count" in result
    assert "cost_spikes_count" in result
    assert "pending_sessions_count" in result
    assert "discrepancies_count" in result
    assert "message_preview" in result or "message" in result


def test_clara_proactive_purchasing_scan(db: Session):
    """Valida la ejecución del escaneo proactivo de Clara."""
    result = run_clara_proactive_purchasing_scan(db, force_notify=False)
    assert isinstance(result, dict)
    assert result.get("success") is True


def test_execute_job_by_code_dispatchers(db: Session):
    """Valida que execute_job_by_code despache sin error los 3 jobs proactivos."""
    # Clara
    clara_res = execute_job_by_code('clara_proactive_purchases_dispatch', db)
    assert clara_res is not None
    assert clara_res.get("success") is True

    # Arturo
    arturo_res = execute_job_by_code('arturo_proactive_wms_dispatch', db)
    assert arturo_res is not None
    assert arturo_res.get("success") is True

    # Valeria
    valeria_res = execute_job_by_code('valeria_proactive_pricing_dispatch', db)
    assert valeria_res is not None
    assert valeria_res.get("success") is True


def test_seed_proactive_jobs_and_skills(db: Session):
    """Valida que el script de inicialización registre los 3 trabajos en system_jobs."""
    seed_proactive_system_jobs(db)
    seed_digital_skills_and_links(db)

    # Verificar que los 3 jobs existan en base de datos
    for code in ['clara_proactive_purchases_dispatch', 'arturo_proactive_wms_dispatch', 'valeria_proactive_pricing_dispatch']:
        job = db.query(SystemJob).filter(SystemJob.job_code == code).first()
        assert job is not None, f"No se encontró el job {code} en core.system_jobs"
        assert job.is_enabled is True
        assert job.execution_time is not None
        assert "Neo" in job.name or "Clara" in job.name or "Arturo" in job.name or "Valeria" in job.name
