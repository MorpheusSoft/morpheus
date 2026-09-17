import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy import text
from app.api.deps import SessionLocal

VALERIA_SKILLS = [
    (
        'pricing_margin_shield',
        'PRICING',
        'Escudo de Margen Mínimo y Venta a Pérdida',
        'Monitorea continuamente el catálogo y ventas para detectar productos vendiéndose a pérdida o con margen inferior al umbral mínimo de rentabilidad (ej. < 15%).',
        'audit_critical_margins'
    ),
    (
        'pricing_cost_spike_watchdog',
        'PRICING',
        'Vigilante de Alzas de Costo en Recepciones',
        'Detecta incrementos de costo unitario o de reposición en facturas y recepciones de compra, calculando la erosión de margen comercial si no se ajusta el PVP.',
        'audit_recent_cost_spikes'
    ),
    (
        'pricing_pending_sessions_guard',
        'PRICING',
        'Supervisor de Sesiones de Fijación de Precios',
        'Audita sesiones de precios en borrador (DRAFT) pendientes por aprobar y aplicar en tiendas para evitar rezago en la actualización comercial.',
        'audit_pending_pricing_sessions'
    ),
    (
        'pricing_cross_store_consistency',
        'PRICING',
        'Auditoría de Precios Multitienda y Discrepancias',
        'Compara los precios activos entre todas las sucursales (Belisa, Maracay, Tucacas, etc.) para detectar precios desalineados en cajas locales respecto a Neo ERP.',
        'audit_cross_store_price_discrepancies'
    ),
    (
        'pricing_shelf_tag_auditor',
        'PRICING',
        'Auditor de Habladores y Precios en Anaquel',
        'Cruza los cambios de precios recientes con las órdenes de impresión de habladores en tiendas para asegurar que el precio de góndola coincida con el de caja.',
        'audit_shelf_tags_backlog'
    ),
    (
        'pricing_omnichannel_assistant',
        'PRICING',
        'Consultor Cognitivo de Costos y PVP en Vivo',
        'Asistente conversacional para responder en lenguaje natural por Telegram sobre fichas de costos, márgenes actuales, simulaciones y catálogos.',
        'pricing_omnichannel_assistant'
    )
]

def seed_valeria():
    db = SessionLocal()
    print("Iniciando siembra de Valeria (Estratega de Precios, Costos y Rentabilidad)...")
    try:
        # 1. Crear usuario digital para Valeria en core.users
        print("1. Registrando usuario para Valeria en core.users...")
        valeria_user_id = db.execute(text("SELECT id FROM core.users WHERE email = 'valeria.pricing@neo.erp'")).scalar()
        if not valeria_user_id:
            db.execute(text("""
                INSERT INTO core.users (
                    email, hashed_password, full_name, is_active, is_superuser, user_type
                ) VALUES (
                    'valeria.pricing@neo.erp',
                    '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQmG6W65WVRWuW.W1GzC.',
                    'Valeria (Estratega Digital de Precios y Costos)',
                    TRUE,
                    FALSE,
                    'DIGITAL_WORKER'
                )
            """))
            db.commit()
            valeria_user_id = db.execute(text("SELECT id FROM core.users WHERE email = 'valeria.pricing@neo.erp'")).scalar()
            print(f"  ✓ Usuario Valeria creado con ID: {valeria_user_id}")
        else:
            print(f"  ✓ Usuario Valeria ya existe con ID: {valeria_user_id}")

        # Asociar facility por defecto
        first_fac_id = db.execute(text("SELECT id FROM core.facilities ORDER BY id LIMIT 1")).scalar() or 1
        db.execute(text("""
            INSERT INTO core.user_facilities (user_id, facility_id)
            VALUES (:uid, :fac_id)
            ON CONFLICT DO NOTHING;
        """), {"uid": valeria_user_id, "fac_id": first_fac_id})
        db.commit()

        # 2. Registrar en core.digital_workers
        print("2. Registrando trabajadora en core.digital_workers...")
        valeria_prompt = (
            "Eres Valeria, la Estratega Autónoma de Precios, Costos y Rentabilidad Comercial de Neo ERP. "
            "Tu responsabilidad es vigilar la integridad del margen de ganancia en todas las sucursales, alertar ante "
            "aumentos de costo de proveedores en recepciones, detectar productos en venta a pérdida o con margen erosionado, "
            "supervisar las sesiones de fijación de precios pendientes y auditar la actualización oportuna de habladores de anaquel."
        )

        db.execute(text("""
            INSERT INTO core.digital_workers (
                user_id, agent_code, display_title, operational_module, system_prompt, scan_interval_minutes, is_autonomous_active
            ) VALUES (
                :uid, 'VALERIA_PRICING', 'Valeria - Estratega Autónoma de Precios, Costos y Rentabilidad',
                'PRICING', :prompt, 60, TRUE
            )
            ON CONFLICT (agent_code) DO UPDATE SET
                display_title = EXCLUDED.display_title,
                operational_module = EXCLUDED.operational_module,
                system_prompt = EXCLUDED.system_prompt;
        """), {"uid": valeria_user_id, "prompt": valeria_prompt})
        db.commit()

        worker_id = db.execute(text("SELECT id FROM core.digital_workers WHERE agent_code = 'VALERIA_PRICING'")).scalar()
        print(f"  ✓ Valeria registrada en core.digital_workers con ID: {worker_id}")

        # 3. Registrar Habilidades en core.digital_skills y asociar en core.digital_worker_skills
        print("3. Sembrando y asociando las 6 habilidades de Valeria...")
        for code, module, name, desc, handler in VALERIA_SKILLS:
            existing_skill = db.execute(
                text("SELECT id FROM core.digital_skills WHERE skill_code = :code"),
                {"code": code}
            ).scalar()

            if existing_skill:
                skill_id = existing_skill
                db.execute(
                    text("""
                        UPDATE core.digital_skills
                        SET name = :name, description = :desc, handler_function = :handler, operational_module = :module
                        WHERE id = :id
                    """),
                    {"id": skill_id, "name": name, "desc": desc, "handler": handler, "module": module}
                )
                print(f"    • Habilidad '{code}' actualizada (ID: {skill_id})")
            else:
                skill_id = db.execute(
                    text("""
                        INSERT INTO core.digital_skills (skill_code, operational_module, name, description, execution_type, handler_function)
                        VALUES (:code, :module, :name, :desc, 'NATIVE_CODE', :handler)
                        RETURNING id
                    """),
                    {"code": code, "module": module, "name": name, "desc": desc, "handler": handler}
                ).scalar()
                print(f"    • Habilidad '{code}' creada (ID: {skill_id})")

            # Asociar en core.digital_worker_skills
            assoc = db.execute(
                text("SELECT id FROM core.digital_worker_skills WHERE worker_id = :wid AND skill_id = :sid"),
                {"wid": worker_id, "sid": skill_id}
            ).scalar()

            if not assoc:
                db.execute(
                    text("""
                        INSERT INTO core.digital_worker_skills (worker_id, skill_id, is_enabled, parameters)
                        VALUES (:wid, :sid, TRUE, '{}'::jsonb)
                    """),
                    {"wid": worker_id, "sid": skill_id}
                )
                print(f"      ✓ Asignada a Valeria (Habilitada)")
            else:
                print(f"      ✓ Ya estaba asignada a Valeria")

        db.commit()
        print("🎉 ¡Valeria y sus 6 Habilidades fueron sembradas y vinculadas exitosamente en Neo ERP!")

    except Exception as e:
        db.rollback()
        print(f"❌ Error sembrando a Valeria: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed_valeria()
