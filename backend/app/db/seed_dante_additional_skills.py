"""
Seed Script: Registrar y Asignar Habilidades Adicionales de Dante TI en Neo ERP.
1. it_invoice_sync_history_audit: Auditoría Histórica de Sincronización y Facturación
2. it_auto_remediate_sales_lag: Auto-Remediación y Despacho de Comandos de Sincronización
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlalchemy import text
from app.api.deps import SessionLocal

DANTE_NEW_SKILLS = [
    (
        'it_invoice_sync_history_audit',
        'IT',
        'Auditoría Histórica de Sincronización y Facturación',
        'Rastrea la fecha inicial de sincronización, la primera factura emitida por tienda/caja, el volumen histórico acumulado de documentos y la cantidad de estaciones registradas.',
        'audit_store_invoice_history'
    ),
    (
        'it_auto_remediate_sales_lag',
        'IT',
        'Auto-Remediación y Despacho de Comandos de Sincronización',
        'Detecta desfases horarios o retrasos en la transmisión de ventas locales de tiendas y despacha órdenes correctivas inmediatas a los agentes de sincronización.',
        'auto_remediate_sales_lag'
    )
]

def seed_dante_skills():
    db = SessionLocal()
    try:
        # Obtener el ID de Dante TI
        res_worker = db.execute(text("SELECT id FROM core.digital_workers WHERE agent_code = 'DANTE_IT';")).fetchone()
        if not res_worker:
            print("❌ No se encontró el trabajador digital DANTE_IT en la base de datos.")
            return
        worker_id = res_worker[0]
        print(f"ℹ️ DANTE_IT encontrado con ID: {worker_id}")

        for code, module, name, desc, handler in DANTE_NEW_SKILLS:
            # 1. Verificar o insertar en core.digital_skills
            existing_skill = db.execute(
                text("SELECT id FROM core.digital_skills WHERE skill_code = :code;"),
                {"code": code}
            ).fetchone()

            if existing_skill:
                skill_id = existing_skill[0]
                db.execute(
                    text("""
                        UPDATE core.digital_skills
                        SET name = :name, description = :desc, handler_function = :handler, operational_module = :module
                        WHERE id = :id;
                    """),
                    {"id": skill_id, "name": name, "desc": desc, "handler": handler, "module": module}
                )
                print(f"🔄 Habilidad '{code}' actualizada (ID: {skill_id}).")
            else:
                inserted = db.execute(
                    text("""
                        INSERT INTO core.digital_skills (skill_code, operational_module, name, description, execution_type, handler_function)
                        VALUES (:code, :module, :name, :desc, 'NATIVE_CODE', :handler)
                        RETURNING id;
                    """),
                    {"code": code, "module": module, "name": name, "desc": desc, "handler": handler}
                ).fetchone()
                skill_id = inserted[0]
                print(f"✅ Habilidad '{code}' creada (ID: {skill_id}).")

            # 2. Asignar en core.digital_worker_skills si no está asignada
            assoc = db.execute(
                text("SELECT id FROM core.digital_worker_skills WHERE worker_id = :wid AND skill_id = :sid;"),
                {"wid": worker_id, "sid": skill_id}
            ).fetchone()

            if not assoc:
                db.execute(
                    text("""
                        INSERT INTO core.digital_worker_skills (worker_id, skill_id, is_enabled, parameters)
                        VALUES (:wid, :sid, True, '{}'::jsonb);
                    """),
                    {"wid": worker_id, "sid": skill_id}
                )
                print(f"🔗 Habilidad ID {skill_id} asignada a DANTE_IT (habilitada por defecto).")
            else:
                print(f"ℹ️ Habilidad ID {skill_id} ya estaba asignada a DANTE_IT.")

        db.commit()
        print("🎉 ¡Habilidades de Dante TI registradas y asignadas con éxito!")
    except Exception as e:
        db.rollback()
        print(f"❌ Error durante el seed: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed_dante_skills()
