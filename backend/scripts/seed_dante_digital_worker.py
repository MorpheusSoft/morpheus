import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy import text
from app.api.deps import SessionLocal

def seed_dante():
    db = SessionLocal()
    print("Iniciando siembra de Dante (Guardián de TI y Sincronización)...")
    try:
        # 1. Crear usuario digital para Dante en core.users
        print("1. Registrando usuario para Dante en core.users...")
        dante_user_id = db.execute(text("SELECT id FROM core.users WHERE email = 'dante.it@neo.erp'")).scalar()
        if not dante_user_id:
            db.execute(text("""
                INSERT INTO core.users (
                    email, hashed_password, full_name, is_active, is_superuser, user_type
                ) VALUES (
                    'dante.it@neo.erp',
                    '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQmG6W65WVRWuW.W1GzC.', -- dummy hash
                    'Dante (Agente Digital de TI y Sincronización)',
                    TRUE,
                    FALSE,
                    'DIGITAL_WORKER'
                )
            """))
            db.commit()
            dante_user_id = db.execute(text("SELECT id FROM core.users WHERE email = 'dante.it@neo.erp'")).scalar()
            print(f"  ✓ Usuario Dante creado con ID: {dante_user_id}")
        else:
            print(f"  ✓ Usuario Dante ya existe con ID: {dante_user_id}")

        # Asociar facility por defecto
        first_fac_id = db.execute(text("SELECT id FROM core.facilities ORDER BY id LIMIT 1")).scalar() or 1
        db.execute(text("""
            INSERT INTO core.user_facilities (user_id, facility_id)
            VALUES (:uid, :fac_id)
            ON CONFLICT DO NOTHING;
        """), {"uid": dante_user_id, "fac_id": first_fac_id})
        db.commit()

        # 2. Registrar en core.digital_workers
        print("2. Registrando trabajador en core.digital_workers...")
        dante_prompt = (
            "Eres Dante, el Guardián Autónomo de Infraestructura y Sincronización de Datos de Neo ERP. "
            "Tu responsabilidad es vigilar la salud de los agentes de sincronización en tiendas físicas (Stellar POS), "
            "monitorear los latidos de conectividad, detectar brechas en la secuencia de tickets, supervisar la "
            "auto-resolución de códigos huérfanos y ejecutar la cuadratura matemática diaria de ventas. "
            "Notificas proactivamente ante desconexiones o discrepancias para asegurar la integridad total de los datos."
        )

        db.execute(text("""
            INSERT INTO core.digital_workers (
                user_id, agent_code, display_title, operational_module, system_prompt, scan_interval_minutes, is_autonomous_active
            ) VALUES (
                :uid, 'DANTE_IT', 'Dante - Guardián Autónomo de Sincronización e Infraestructura',
                'IT', :prompt, 15, TRUE
            )
            ON CONFLICT (agent_code) DO UPDATE SET
                display_title = EXCLUDED.display_title,
                system_prompt = EXCLUDED.system_prompt,
                operational_module = EXCLUDED.operational_module,
                scan_interval_minutes = EXCLUDED.scan_interval_minutes;
        """), {"uid": dante_user_id, "prompt": dante_prompt})
        db.commit()

        dante_worker_id = db.execute(text("SELECT id FROM core.digital_workers WHERE agent_code = 'DANTE_IT'")).scalar()
        print(f"  ✓ Dante registrado con worker_id: {dante_worker_id}")

        # 3. Registrar habilidades en core.digital_skills
        print("3. Registrando habilidades en core.digital_skills...")
        dante_skills = [
            (
                'it_sync_heartbeat_monitor',
                'IT',
                'Vigilancia de Latidos y Conectividad de Tiendas',
                'Monitorea cada 15 min que las tiendas físicas estén transmitiendo latidos activos. Alerta de inmediato si una tienda supera 15 minutos desconectada.',
                'audit_store_sync_heartbeats'
            ),
            (
                'it_sales_gap_detector',
                'IT',
                'Auditoría de Secuencias y Consecutivos de Tickets',
                'Verifica la correlatividad de los números de ticket por caja, detectando saltos o brechas en la facturación fiscal.',
                'detect_sales_consecutive_gaps'
            ),
            (
                'it_daily_sales_reconciliation',
                'IT',
                'Cuadratura Matemática Diaria (Stellar vs Neo ERP)',
                'Compara al final del día la cantidad total de tickets y montos facturados en Stellar contra los documentos registrados en Neo ERP.',
                'reconcile_daily_sales_totals'
            )
        ]

        for code, module, name, desc, handler in dante_skills:
            db.execute(text("""
                INSERT INTO core.digital_skills (
                    skill_code, operational_module, name, description, execution_type, handler_function
                ) VALUES (
                    :code, :module, :name, :desc, 'NATIVE_CODE', :handler
                )
                ON CONFLICT (skill_code) DO UPDATE SET
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    handler_function = EXCLUDED.handler_function;
            """), {"code": code, "module": module, "name": name, "desc": desc, "handler": handler})
            db.commit()

            skill_id = db.execute(text("SELECT id FROM core.digital_skills WHERE skill_code = :c"), {"c": code}).scalar()

            # 4. Asignar habilidad a Dante
            db.execute(text("""
                INSERT INTO core.digital_worker_skills (worker_id, skill_id, is_enabled)
                VALUES (:wid, :sid, TRUE)
                ON CONFLICT (worker_id, skill_id) DO NOTHING;
            """), {"wid": dante_worker_id, "sid": skill_id})
            db.commit()
            print(f"  ✓ Habilidad '{name}' ({code}) asignada a Dante.")

        print("✅ Siembra de Dante completada exitosamente.")
    except Exception as e:
        db.rollback()
        print(f"❌ Error durante la siembra de Dante: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed_dante()
