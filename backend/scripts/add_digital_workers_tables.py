import sys
import os

# Add backend directory to python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.api.deps import engine
from app.core.security import get_password_hash
from sqlalchemy import text

def run_migration():
    print("[MIGRATION] Creando/extendiendo tablas para Usuarios Digitales (AI Workers)...")
    with engine.connect() as conn:
        with conn.begin():
            # 1. Extender core.users
            conn.execute(text("""
                ALTER TABLE core.users 
                ADD COLUMN IF NOT EXISTS user_type VARCHAR(30) DEFAULT 'HUMAN',
                ADD COLUMN IF NOT EXISTS phone_number VARCHAR(30),
                ADD COLUMN IF NOT EXISTS is_phone_verified BOOLEAN DEFAULT FALSE,
                ADD COLUMN IF NOT EXISTS pairing_pin VARCHAR(10),
                ADD COLUMN IF NOT EXISTS avatar_url TEXT;
            """))
            print("  ✓ Columnas añadidas a core.users")

            # 2. Crear core.digital_workers
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS core.digital_workers (
                    id SERIAL PRIMARY KEY,
                    user_id INT NOT NULL UNIQUE REFERENCES core.users(id) ON DELETE CASCADE,
                    agent_code VARCHAR(50) NOT NULL UNIQUE,
                    display_title VARCHAR(100) NOT NULL,
                    operational_module VARCHAR(50) NOT NULL,
                    system_prompt TEXT NOT NULL,
                    model_name VARCHAR(50) DEFAULT 'gemini-2.5-flash',
                    is_autonomous_active BOOLEAN DEFAULT TRUE,
                    scan_interval_minutes INT DEFAULT 60,
                    channel_config JSONB DEFAULT '{"whatsapp_enabled": true}'::jsonb,
                    guardrails_config JSONB DEFAULT '{
                        "force_draft_state": true,
                        "max_draft_amount_usd": 50000.00,
                        "require_human_confirmation": true
                    }'::jsonb,
                    last_scan_at TIMESTAMP WITH TIME ZONE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );
            """))
            print("  ✓ Tabla core.digital_workers creada")

            # 3. Crear core.digital_skills (Catálogo Maestro)
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS core.digital_skills (
                    id SERIAL PRIMARY KEY,
                    skill_code VARCHAR(60) NOT NULL UNIQUE,
                    operational_module VARCHAR(50) NOT NULL,
                    name VARCHAR(100) NOT NULL,
                    description TEXT NOT NULL,
                    execution_type VARCHAR(20) DEFAULT 'NATIVE_CODE',
                    handler_function VARCHAR(100),
                    declarative_prompt TEXT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );
            """))
            print("  ✓ Tabla core.digital_skills creada")

            # 4. Crear core.digital_worker_skills (Asignación M:N)
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS core.digital_worker_skills (
                    id SERIAL PRIMARY KEY,
                    worker_id INT NOT NULL REFERENCES core.digital_workers(id) ON DELETE CASCADE,
                    skill_id INT NOT NULL REFERENCES core.digital_skills(id) ON DELETE CASCADE,
                    is_enabled BOOLEAN DEFAULT TRUE,
                    parameters JSONB DEFAULT '{}'::jsonb,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    UNIQUE(worker_id, skill_id)
                );
            """))
            print("  ✓ Tabla core.digital_worker_skills creada")

            # 5. Crear core.digital_worker_actions_log (Auditoría y Bitácora)
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS core.digital_worker_actions_log (
                    id BIGSERIAL PRIMARY KEY,
                    worker_id INT NOT NULL REFERENCES core.digital_workers(id) ON DELETE CASCADE,
                    facility_id INT REFERENCES core.facilities(id),
                    action_type VARCHAR(60) NOT NULL,
                    target_entity_type VARCHAR(50),
                    target_entity_id VARCHAR(50),
                    severity VARCHAR(20) DEFAULT 'INFO',
                    summary TEXT NOT NULL,
                    details JSONB,
                    recipient_target VARCHAR(100),
                    status VARCHAR(30) DEFAULT 'COMPLETED',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );
            """))
            print("  ✓ Tabla core.digital_worker_actions_log creada")

            # 6. Crear core.digital_worker_conversations y messages (Memoria WhatsApp)
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS core.digital_worker_conversations (
                    id BIGSERIAL PRIMARY KEY,
                    worker_id INT NOT NULL REFERENCES core.digital_workers(id) ON DELETE CASCADE,
                    channel VARCHAR(30) NOT NULL DEFAULT 'WHATSAPP',
                    external_sender_id VARCHAR(50) NOT NULL,
                    sender_user_id INT REFERENCES core.users(id),
                    sender_supplier_id INT REFERENCES core.suppliers(id),
                    is_authenticated BOOLEAN DEFAULT FALSE,
                    context_data JSONB DEFAULT '{}'::jsonb,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS core.digital_worker_messages (
                    id BIGSERIAL PRIMARY KEY,
                    conversation_id BIGINT NOT NULL REFERENCES core.digital_worker_conversations(id) ON DELETE CASCADE,
                    sender_type VARCHAR(20) NOT NULL,
                    content TEXT NOT NULL,
                    tool_calls JSONB,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );
            """))
            print("  ✓ Tablas de chat de WhatsApp creadas")

            # 7. Sembrar Habilidades Base en el Catálogo
            skills_seed = [
                ('negative_stock_auditor', 'WMS', 'Auditoría de Existencias Negativas', 'Detecta saldos menores a 0 y genera borradores de ajuste de inventario para conteo físico.', 'audit_negative_stock'),
                ('dock_returns_and_scrap_monitor', 'WMS', 'Control de Devoluciones y Averías', 'Monitorea rechazos en muelle y traslados a SCRAP para reclamar notas de crédito al proveedor.', 'audit_dock_returns_and_scrap'),
                ('3way_unreconciled_watchdog', 'WMS', 'Vigilante de Recepciones por Conciliar', 'Alerta recepciones en almacén con más de 48h sin cruce de factura fiscal para no perder pronto pago.', 'audit_unreconciled_orders'),
                ('mrp_purchase_suggester', 'PURCHASES', 'Sugerencias de Compra Inteligente (MRP)', 'Calcula quiebres de stock proyectados y genera ODCs sugeridas en borrador agrupadas por proveedor.', 'run_mrp_draft_generation'),
                ('wms_whatsapp_assistant', 'WMS', 'Asistente WMS por WhatsApp', 'Responde consultas operativas de stock y recepciones en lenguaje natural.', 'chat_wms_assistant'),
                ('purchase_whatsapp_assistant', 'PURCHASES', 'Asistente de Compras por WhatsApp', 'Responde consultas de justificación de compras sugeridas y estatus de órdenes.', 'chat_purchase_assistant')
            ]

            for code, mod, name, desc, handler in skills_seed:
                conn.execute(text("""
                    INSERT INTO core.digital_skills (skill_code, operational_module, name, description, execution_type, handler_function)
                    VALUES (:code, :mod, :name, :desc, 'NATIVE_CODE', :handler)
                    ON CONFLICT (skill_code) DO UPDATE 
                    SET name = EXCLUDED.name, description = EXCLUDED.description, handler_function = EXCLUDED.handler_function;
                """), {"code": code, "mod": mod, "name": name, "desc": desc, "handler": handler})
            print(f"  ✓ {len(skills_seed)} habilidades base sembradas en core.digital_skills")

            # 8. Sembrar Roles Base
            conn.execute(text("""
                INSERT INTO core.roles (name, description, can_use_oracle, permissions, is_active)
                VALUES 
                ('Supervisor WMS Digital', 'Rol operativo para agentes autónomos de almacén y logística', TRUE, '{"inventory": ["read", "write"], "wms": ["read", "write"]}'::jsonb, TRUE),
                ('Comprador Digital MRP', 'Rol operativo para agentes autónomos de compras y abastecimiento', TRUE, '{"purchasing": ["read", "write"], "inventory": ["read"]}'::jsonb, TRUE)
                ON CONFLICT (name) DO NOTHING;
            """))
            print("  ✓ Roles base sembrados")

            # 9. Sembrar Usuarios Digitales: Arturo WMS y Clara Compras
            pwd_hash = get_password_hash("DigitalWorkerPassword2026!")

            # Usuario 1: Arturo WMS
            conn.execute(text("""
                INSERT INTO core.users (email, hashed_password, full_name, is_active, is_superuser, user_type)
                VALUES ('arturo.wms@morpheus.internal', :pwd, 'Arturo WMS (Supervisor Digital)', TRUE, FALSE, 'DIGITAL_WORKER')
                ON CONFLICT (email) DO UPDATE SET user_type = 'DIGITAL_WORKER', full_name = 'Arturo WMS (Supervisor Digital)';
            """), {"pwd": pwd_hash})

            # Usuario 2: Clara Compras
            conn.execute(text("""
                INSERT INTO core.users (email, hashed_password, full_name, is_active, is_superuser, user_type)
                VALUES ('clara.compras@morpheus.internal', :pwd, 'Clara Compras (Analista Digital MRP)', TRUE, FALSE, 'DIGITAL_WORKER')
                ON CONFLICT (email) DO UPDATE SET user_type = 'DIGITAL_WORKER', full_name = 'Clara Compras (Analista Digital MRP)';
            """), {"pwd": pwd_hash})

            # Obtener sus IDs
            arturo_user_id = conn.execute(text("SELECT id FROM core.users WHERE email = 'arturo.wms@morpheus.internal'")).scalar()
            clara_user_id = conn.execute(text("SELECT id FROM core.users WHERE email = 'clara.compras@morpheus.internal'")).scalar()

            # Asignar a la sede 1 (PATIO TRIGAL)
            for uid in [arturo_user_id, clara_user_id]:
                conn.execute(text("""
                    INSERT INTO core.user_facilities (user_id, facility_id)
                    VALUES (:uid, 1)
                    ON CONFLICT DO NOTHING;
                """), {"uid": uid})

            # Crear registros en core.digital_workers
            conn.execute(text("""
                INSERT INTO core.digital_workers (user_id, agent_code, display_title, operational_module, system_prompt, scan_interval_minutes)
                VALUES 
                (:arturo_uid, 'ARTURO_WMS', 'Supervisor Autónomo de Almacenes', 'WMS', 
                 'Eres Arturo WMS, el Supervisor Autónomo de Almacenes y Logística de Morpheus ERP. Tu responsabilidad es detectar existencias negativas, generar borradores de ajuste para conteo físico, monitorear devoluciones/averías y verificar recepciones sin conciliar. Siempre actúas con precisión técnica, tono profesional y respetando el principio de 4 ojos: generas borradores para aprobación humana.', 60),
                (:clara_uid, 'CLARA_COMPRAS', 'Analista Predictiva de Compras y MRP', 'PURCHASES',
                 'Eres Clara Compras, la Analista Predictiva de Abastecimiento de Morpheus ERP. Tu responsabilidad es proyectar la demanda, calcular stocks de seguridad, evitar quiebres de inventario y generar Órdenes de Compra sugeridas en borrador agrupadas por proveedor y respetando empaques maestros. Eres rigurosa con los números y facilitas el trabajo a los compradores humanos.', 60)
                ON CONFLICT (agent_code) DO NOTHING;
            """), {"arturo_uid": arturo_user_id, "clara_uid": clara_user_id})

            arturo_worker_id = conn.execute(text("SELECT id FROM core.digital_workers WHERE agent_code = 'ARTURO_WMS'")).scalar()
            clara_worker_id = conn.execute(text("SELECT id FROM core.digital_workers WHERE agent_code = 'CLARA_COMPRAS'")).scalar()

            # Asignar habilidades a Arturo
            arturo_skills = ['negative_stock_auditor', 'dock_returns_and_scrap_monitor', '3way_unreconciled_watchdog', 'wms_whatsapp_assistant']
            for sk_code in arturo_skills:
                sk_id = conn.execute(text("SELECT id FROM core.digital_skills WHERE skill_code = :c"), {"c": sk_code}).scalar()
                if sk_id:
                    conn.execute(text("""
                        INSERT INTO core.digital_worker_skills (worker_id, skill_id, is_enabled)
                        VALUES (:wid, :sid, TRUE)
                        ON CONFLICT (worker_id, skill_id) DO NOTHING;
                    """), {"wid": arturo_worker_id, "sid": sk_id})

            # Asignar habilidades a Clara
            clara_skills = ['mrp_purchase_suggester', 'purchase_whatsapp_assistant']
            for sk_code in clara_skills:
                sk_id = conn.execute(text("SELECT id FROM core.digital_skills WHERE skill_code = :c"), {"c": sk_code}).scalar()
                if sk_id:
                    conn.execute(text("""
                        INSERT INTO core.digital_worker_skills (worker_id, skill_id, is_enabled)
                        VALUES (:wid, :sid, TRUE)
                        ON CONFLICT (worker_id, skill_id) DO NOTHING;
                    """), {"wid": clara_worker_id, "sid": sk_id})

            print("  ✓ Usuarios Digitales Arturo WMS y Clara Compras sembrados y configurados con sus habilidades")

if __name__ == "__main__":
    run_migration()
    print("[MIGRATION] Fase 1 completada exitosamente.")
