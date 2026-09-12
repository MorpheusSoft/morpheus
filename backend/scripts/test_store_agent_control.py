import sys
import os
from decimal import Decimal
from datetime import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.api.deps import SessionLocal
from app.api.v1.api import api_router
from app.api.v1.endpoints.store_agent_control import (
    list_facilities_agent_status,
    get_store_config,
    update_store_config,
    create_store_command,
    list_store_commands,
    acknowledge_command
)
from app.api.v1.endpoints.sync_sales import record_heartbeat
from app.schemas.store_agent_control import (
    StoreAgentConfigUpdateSchema,
    StoreAgentCommandCreateSchema,
    CommandAckSchema
)
from app.schemas.sync_sales import StoreSyncTelemetryIn
from app.models.store_agent_control import StoreAgentConfig, StoreAgentCommand

def run_tests():
    print("==================================================================")
    print("  TEST: CONSOLA DE MANDO Y CONTROL REMOTO DE TIENDAS")
    print("==================================================================")

    db = SessionLocal()
    fac_id = 1

    try:
        # 1. Listar sedes y verificar telemetría
        print("\n--- 1. Listar estado de sedes y telemetría ---")
        statuses = list_facilities_agent_status(db=db)
        print(f"  Sedes obtenidas: {len(statuses)}")
        assert len(statuses) > 0, "Debe haber al menos 1 sede activa"
        target_fac = next((s for s in statuses if s.facility_id == fac_id), None)
        assert target_fac is not None, f"Sede ID {fac_id} no encontrada"
        print(f"  ✓ Sede '{target_fac.facility_name}' encontrada. Versión config: {target_fac.config.config_version}")

        initial_version = target_fac.config.config_version

        # 2. Actualizar configuración remota vía PUT
        print("\n--- 2. Actualizar configuración remota en caliente ---")
        update_payload = StoreAgentConfigUpdateSchema(
            sales_interval_minutes=3,
            sales_batch_size=250,
            products_enabled=True,
            sales_enabled=True
        )
        updated_cfg = update_store_config(facility_id=fac_id, payload=update_payload, db=db)
        print(f"  Configuración actualizada: Versión {updated_cfg.config_version}, Intervalo: {updated_cfg.sales_interval_minutes}m, Lote: {updated_cfg.sales_batch_size}")
        assert updated_cfg.config_version > initial_version, "La versión de configuración debió incrementarse"
        assert updated_cfg.sales_interval_minutes == 3, "El intervalo debió actualizarse a 3 min"

        # 3. Encolar comando FORCE_SYNC_SALES
        print("\n--- 3. Encolar comando remoto (FORCE_SYNC_SALES) ---")
        cmd_payload = StoreAgentCommandCreateSchema(
            command_type="FORCE_SYNC_SALES",
            parameters={"requested_by": "Test Suite Admin"}
        )
        cmd = create_store_command(facility_id=fac_id, payload=cmd_payload, db=db)
        print(f"  Comando creado: ID #{cmd.id}, Tipo: {cmd.command_type}, Estado: {cmd.status}")
        assert cmd.status == "PENDING", "El comando debe nacer en estado PENDING"

        # 4. Simular latido de tienda y entrega de órdenes en la respuesta
        print("\n--- 4. Simular Latido de Tienda (Piggyback de Comandos y Config) ---")
        hb_payload = StoreSyncTelemetryIn(
            facility_id=fac_id,
            store_name=target_fac.facility_name,
            agent_version="2.1.0-neo",
            sql_server_status="CONNECTED",
            sales_today_count=10,
            sales_today_amount=Decimal("150.00"),
            lag_minutes=1
        )
        hb_resp = record_heartbeat(hb_payload, session=db)
        print(f"  Respuesta del Heartbeat recibida por el Agente:")
        print(f"    - Status: {hb_resp['status']}")
        print(f"    - Config versión enviada: {hb_resp['config']['version']}")
        print(f"    - Comandos despachados: {len(hb_resp['commands'])}")
        
        assert hb_resp["config"]["sales_interval_minutes"] == 3, "El latido debe entregar la nueva configuración de 3 min"
        dispatched_cmd = next((c for c in hb_resp["commands"] if c["id"] == cmd.id), None)
        assert dispatched_cmd is not None, f"El comando #{cmd.id} debió ser despachado en el latido"
        print(f"  ✓ Comando #{dispatched_cmd['id']} ({dispatched_cmd['command_type']}) entregado en respuesta al latido.")

        # Verificar que en BD pasó a SENT
        db.refresh(cmd)
        assert cmd.status == "SENT", f"Estado esperado SENT, obtuvo {cmd.status}"
        assert cmd.sent_at is not None, "sent_at debe registrarse"

        # 5. Simular ACK RUNNING
        print("\n--- 5. Simular ACK de Ejecución (RUNNING) ---")
        ack_running = CommandAckSchema(status="RUNNING")
        ack_res1 = acknowledge_command(command_id=cmd.id, payload=ack_running, db=db)
        db.refresh(cmd)
        assert cmd.status == "RUNNING", f"Estado esperado RUNNING, obtuvo {cmd.status}"
        print(f"  ✓ ACK RUNNING procesado correctamente para comando #{cmd.id}")

        # 6. Simular ACK COMPLETED con métricas
        print("\n--- 6. Simular ACK de Finalización (COMPLETED) ---")
        ack_completed = CommandAckSchema(
            status="COMPLETED",
            result_details={"processed": 42, "message": "Ventas sincronizadas exitosamente: 42 facturas."}
        )
        ack_res2 = acknowledge_command(command_id=cmd.id, payload=ack_completed, db=db)
        db.refresh(cmd)
        assert cmd.status == "COMPLETED", f"Estado esperado COMPLETED, obtuvo {cmd.status}"
        assert cmd.completed_at is not None, "completed_at debe registrarse"
        assert cmd.result_details.get("processed") == 42, "result_details debe contener processed=42"
        print(f"  ✓ ACK COMPLETED procesado: {cmd.result_details.get('message')}")

        # 7. Listar historial de comandos
        print("\n--- 7. Consultar historial de comandos desde la Consola Web ---")
        cmd_history = list_store_commands(facility_id=fac_id, limit=10, db=db)
        assert any(c.id == cmd.id for c in cmd_history), "El comando ejecutado debe aparecer en el historial"
        print(f"  ✓ Historial consultado exitosamente ({len(cmd_history)} comandos encontrados).")

        print("\n==================================================================")
        print("  TODAS LAS PRUEBAS DE MANDO Y CONTROL PASARON (7/7)")
        print("==================================================================")
        return True

    finally:
        # Limpieza de datos de prueba
        print("\n--- Restaurando configuración inicial ---")
        try:
            db.query(StoreAgentCommand).filter(StoreAgentCommand.facility_id == fac_id, StoreAgentCommand.command_type == "FORCE_SYNC_SALES").delete()
            cfg = db.query(StoreAgentConfig).filter(StoreAgentConfig.facility_id == fac_id).first()
            if cfg:
                cfg.sales_interval_minutes = 5
                cfg.sales_batch_size = 500
            db.commit()
            print("  ✓ Configuración restaurada a 5 minutos y lote 500.")
        except Exception as ex:
            print(f"  ⚠️ Error en limpieza: {ex}")
            db.rollback()
        finally:
            db.close()

if __name__ == '__main__':
    success = run_tests()
    if not success:
        sys.exit(1)
