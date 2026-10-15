"""
Script de siembra e inicialización de tareas programadas (system_jobs)
y habilidades de los usuarios digitales (Clara, Arturo, Valeria) en Neo ERP.
Idempotente y seguro para producción / QA.
"""

import sys
import os
from datetime import time

# Asegurar path de backend
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.abspath(os.path.join(current_dir, ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from sqlalchemy.orm import Session
from app.api.deps import SessionLocal
from app.models.core import SystemJob
from app.models.digital_workers import DigitalWorker, DigitalSkill, DigitalWorkerSkill


SYSTEM_JOBS_DEF = [
    {
        "job_code": "arturo_proactive_wms_dispatch",
        "name": "Control Matutino de Almacén y Existencias (Arturo)",
        "execution_time": time(7, 30, 0),
        "is_enabled": True
    },
    {
        "job_code": "clara_proactive_purchases_dispatch",
        "name": "Diagnóstico Matutino y Sugeridos de Compras (Clara)",
        "execution_time": time(8, 0, 0),
        "is_enabled": True
    },
    {
        "job_code": "valeria_proactive_pricing_dispatch",
        "name": "Escudo Matutino de Margen y Costos (Valeria)",
        "execution_time": time(8, 30, 0),
        "is_enabled": True
    }
]

DIGITAL_SKILLS_DEF = [
    # Arturo WMS
    {
        "agent_code": "ARTURO_WMS",
        "skill_code": "arturo_proactive_wms_dispatch",
        "module": "WMS",
        "name": "Control Matutino de Almacén y Existencias",
        "description": "Escaneo proactivo de existencias negativas, devoluciones en muelle y recepciones pendientes de conciliar."
    },
    {
        "agent_code": "ARTURO_WMS",
        "skill_code": "negative_stock_auditor",
        "module": "WMS",
        "name": "Auditor de Existencias Negativas",
        "description": "Inspecciona inventario negativo y propone borradores de regularización bajo 4 ojos."
    },
    {
        "agent_code": "ARTURO_WMS",
        "skill_code": "dock_returns_and_scrap_monitor",
        "module": "WMS",
        "name": "Monitor de Devoluciones en Muelle",
        "description": "Supervisa rechazos de mercancía y gestiona alertas de notas de crédito."
    },
    {
        "agent_code": "ARTURO_WMS",
        "skill_code": "3way_unreconciled_watchdog",
        "module": "WMS",
        "name": "Vigilante de Cruce 3-Way Match",
        "description": "Supervisa órdenes de compra recibidas físicamente pendientes de factura fiscal."
    },

    # Clara Compras
    {
        "agent_code": "CLARA_COMPRAS",
        "skill_code": "clara_proactive_purchases_dispatch",
        "module": "PURCHASES",
        "name": "Diagnóstico Matutino y Sugeridos de Compras",
        "description": "Escaneo diario de quiebres MRP, proveedores del cronograma y despacho de sugeridos ejecutivos."
    },

    # Valeria Pricing
    {
        "agent_code": "VALERIA_PRICING",
        "skill_code": "valeria_proactive_pricing_dispatch",
        "module": "PRICING",
        "name": "Escudo Matutino de Margen y Costos",
        "description": "Escaneo de márgenes críticos (< 15%), ventas a pérdida, alzas de costos y sesiones pendientes."
    },
    {
        "agent_code": "VALERIA_PRICING",
        "skill_code": "pricing_margin_shield",
        "module": "PRICING",
        "name": "Escudo de Margen Crítico y Pérdida",
        "description": "Audita productos vendiéndose a pérdida o con rentabilidad por debajo del umbral mínimo."
    },
    {
        "agent_code": "VALERIA_PRICING",
        "skill_code": "pricing_cost_spike_watchdog",
        "module": "PRICING",
        "name": "Vigilante de Alzas de Costos",
        "description": "Supervisa incrementos de costos reportados por proveedores en sesiones de precios."
    },
    {
        "agent_code": "VALERIA_PRICING",
        "skill_code": "pricing_pending_sessions_guard",
        "module": "PRICING",
        "name": "Supervisión de Sesiones en Borrador",
        "description": "Alerta sobre sesiones de cambio de precios creadas en borrador pendientes por publicar."
    },
    {
        "agent_code": "VALERIA_PRICING",
        "skill_code": "pricing_cross_store_consistency",
        "module": "PRICING",
        "name": "Consistencia de Precios Multitienda",
        "description": "Verifica alineación de PVP entre diferentes sedes y sucursales físicas."
    }
]


def seed_proactive_system_jobs(db: Session):
    print("==================================================================")
    print("🌱 [SEED] Configurando Trabajos en Segundo Plano (core.system_jobs)")
    print("==================================================================")

    for job_def in SYSTEM_JOBS_DEF:
        code = job_def["job_code"]
        existing = db.query(SystemJob).filter(SystemJob.job_code == code).first()
        if existing:
            print(f"  • Job '{code}' ya existe. Asegurando nombre y estado...")
            existing.name = job_def["name"]
            # Si execution_time no está seteado, setear por defecto
            if not existing.execution_time:
                existing.execution_time = job_def["execution_time"]
            db.commit()
            print(f"    ✅ '{code}' actualizado: {existing.execution_time} (Habilitado: {existing.is_enabled})")
        else:
            new_job = SystemJob(
                job_code=code,
                name=job_def["name"],
                execution_time=job_def["execution_time"],
                is_enabled=job_def["is_enabled"]
            )
            db.add(new_job)
            db.commit()
            print(f"    ✨ Creado '{code}' a las {job_def['execution_time']} (Habilitado: True)")


def seed_digital_skills_and_links(db: Session):
    print("\n==================================================================")
    print("🧠 [SEED] Registrando Habilidades y Asignaciones a Usuarios Digitales")
    print("==================================================================")

    for s_def in DIGITAL_SKILLS_DEF:
        code = s_def["skill_code"]
        agent_code = s_def["agent_code"]

        # 1. Asegurar habilidad en catálogo core.digital_skills
        skill = db.query(DigitalSkill).filter(DigitalSkill.skill_code == code).first()
        if not skill:
            skill = DigitalSkill(
                skill_code=code,
                operational_module=s_def["module"],
                name=s_def["name"],
                description=s_def["description"],
                execution_type="NATIVE_CODE"
            )
            db.add(skill)
            db.flush()
            print(f"  ✨ Habilidad registrada en catálogo: {code} ({s_def['name']})")
        else:
            skill.name = s_def["name"]
            skill.description = s_def["description"]
            db.flush()

        # 2. Buscar trabajador digital
        worker = db.query(DigitalWorker).filter(DigitalWorker.agent_code == agent_code).first()
        if not worker:
            print(f"  ⚠️ Trabajador digital {agent_code} no encontrado. Se omite vinculación de {code}.")
            continue

        # 3. Vincular en core.digital_worker_skills si no existe
        ws = db.query(DigitalWorkerSkill).filter(
            DigitalWorkerSkill.worker_id == worker.id,
            DigitalWorkerSkill.skill_id == skill.id
        ).first()

        if not ws:
            ws = DigitalWorkerSkill(
                worker_id=worker.id,
                skill_id=skill.id,
                is_enabled=True,
                parameters={}
            )
            db.add(ws)
            print(f"  🔗 Vinculada '{code}' a {worker.display_title} ({agent_code})")
        else:
            ws.is_enabled = True

    db.commit()
    print("\n✅ [SEED] Todas las tareas y habilidades quedaron sincronizadas con éxito.")


def main():
    db = SessionLocal()
    try:
        seed_proactive_system_jobs(db)
        seed_digital_skills_and_links(db)
    except Exception as e:
        db.rollback()
        print(f"\n❌ Error durante el seed: {e}")
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    main()
