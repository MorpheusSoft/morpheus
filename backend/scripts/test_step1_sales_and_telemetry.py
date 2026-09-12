import sys
import os
from datetime import datetime
from decimal import Decimal
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.api.deps import SessionLocal
from app.schemas.sync_sales import (
    SalesBatchPayloadIn,
    SalesBatchDocumentIn,
    SalesBatchLineIn,
    StoreSyncTelemetryIn
)
from app.api.v1.endpoints.sync_sales import import_sales_batch, record_heartbeat, get_sync_status
from app.models.sales import Document, DocumentLine
from app.models.inventory import Product, ProductVariant, ProductBarcode, StockPicking, StockMove, InventorySnapshot
from app.models.sync_telemetry import StoreSyncTelemetry
from app.models.digital_workers import DigitalWorker, DigitalWorkerActionLog
from app.services.digital_worker_service import run_worker_cycle

def test_step1_suite():
    db = SessionLocal()
    print("==================================================================")
    print("  EJECUTANDO BATERÍA DE PRUEBAS DE VERIFICACIÓN - PASO 1")
    print("==================================================================")

    try:
        # -------------------------------------------------------------
        # TEST 1: Ingesta Multilínea Histórica (is_historical = True)
        # -------------------------------------------------------------
        print("\n--- TEST 1: Ingesta Multilínea Histórica (Sin mover inventario) ---")
        test_doc_num = f"T1-{int(datetime.utcnow().timestamp())}"
        payload_t1 = SalesBatchPayloadIn(
            is_historical=True,
            documents=[
                SalesBatchDocumentIn(
                    facility_id=1,
                    register_code="09",
                    document_number=test_doc_num,
                    doc_type="FAC",
                    doc_date="2026-05-15 14:30:00",
                    customer_tax_id="J-123456789",
                    customer_name="Empresa Cliente Test",
                    subtotal=30.0,
                    tax_amount=4.8,
                    total_amount=34.8,
                    fiscal_number="NF-00100",
                    fiscal_serial="IS-9999",
                    lines=[
                        SalesBatchLineIn(sku_code="TEST-SKU-A", quantity=2.0, unit_price=5.0, subtotal=10.0, tax_amount=1.6, total=11.6, description="Articulo A"),
                        SalesBatchLineIn(sku_code="TEST-SKU-B", quantity=1.0, unit_price=10.0, subtotal=10.0, tax_amount=1.6, total=11.6, description="Articulo B"),
                        SalesBatchLineIn(sku_code="TEST-SKU-C", quantity=2.0, unit_price=5.0, subtotal=10.0, tax_amount=1.6, total=11.6, description="Articulo C"),
                    ]
                )
            ]
        )

        res_t1 = import_sales_batch(payload_t1, db)
        print("  Respuesta del endpoint:", res_t1)
        assert res_t1["status"] == "SUCCESS", "Fallo al procesar lote multilínea"
        assert res_t1["processed"] == 1, "Debe procesar 1 documento"

        # Verificar en base de datos
        doc_db = db.query(Document).filter(
            Document.facility_id == 1,
            Document.register_code == "09",
            Document.document_number == test_doc_num
        ).first()

        assert doc_db is not None, "Documento no encontrado en base de datos"
        assert doc_db.is_historical == True, "Documento debe ser marcado como is_historical = True"
        assert len(doc_db.lines) == 3, f"El documento debe tener 3 líneas, tiene: {len(doc_db.lines)}"
        assert float(doc_db.total_amount) == 34.8, f"Total incorrecto: {doc_db.total_amount}"

        # Verificar que NO se crearon StockMoves para este documento histórico
        moves_count = db.query(StockMove).join(StockPicking).filter(
            StockPicking.origin_document == f"C09-{test_doc_num}"
        ).count()
        assert moves_count == 0, f"Error: Una venta histórica generó {moves_count} movimientos de stock indebidos!"
        print("  ✓ Documento multilínea insertado con 3 líneas exactas.")
        print("  ✓ Confirmado: Cero movimientos de inventario generados (is_historical = True).")

        # -------------------------------------------------------------
        # TEST 2: Idempotencia (Re-envío del mismo documento)
        # -------------------------------------------------------------
        print("\n--- TEST 2: Idempotencia (Reintento de lote) ---")
        res_t2 = import_sales_batch(payload_t1, db)
        print("  Respuesta del endpoint ante reintento:", res_t2)
        assert res_t2["processed"] == 0, "No debe reprocesar duplicados"
        assert res_t2["duplicates"] == 1, "Debe registrar 1 duplicado ignorado limpiamente"
        print("  ✓ Idempotencia confirmada: No se duplicaron documentos ni líneas.")

        # -------------------------------------------------------------
        # TEST 3: Venta del Día en Vivo (is_historical = False) y Descuento Único de Stock
        # -------------------------------------------------------------
        print("\n--- TEST 3: Venta del Día en Vivo (is_historical = False y Kardex) ---")
        test_doc_live = f"T3-{int(datetime.utcnow().timestamp())}"
        test_sku_live = f"LIVE-SKU-{int(datetime.utcnow().timestamp())}"

        payload_t3 = SalesBatchPayloadIn(
            is_historical=False,
            documents=[
                SalesBatchDocumentIn(
                    facility_id=1,
                    register_code="09",
                    document_number=test_doc_live,
                    doc_type="FAC",
                    doc_date=datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
                    customer_tax_id="J-000000000",
                    customer_name="Cliente Contado",
                    subtotal=100.0,
                    tax_amount=16.0,
                    total_amount=116.0,
                    lines=[
                        SalesBatchLineIn(sku_code=test_sku_live, quantity=5.0, unit_price=20.0, subtotal=100.0, tax_amount=16.0, total=116.0, description="Producto Prueba Live")
                    ]
                )
            ]
        )

        res_t3 = import_sales_batch(payload_t3, db)
        print("  Respuesta del endpoint:", res_t3)
        assert res_t3["status"] == "SUCCESS"
        assert res_t3["processed"] == 1

        # Verificar variante y movimiento de Kardex
        variant = db.query(ProductVariant).filter(ProductVariant.sku == test_sku_live).first()
        assert variant is not None, "El SKU debió auto-crearse"

        picking_live = db.query(StockPicking).filter(
            StockPicking.facility_id == 1,
            StockPicking.origin_document == f"C09-{test_doc_live}"
        ).first()
        assert picking_live is not None, "Debe existir un StockPicking para la venta viva"

        moves_live = db.query(StockMove).filter(StockMove.picking_id == picking_live.id).all()
        assert len(moves_live) == 1, f"Debe existir exactamente 1 movimiento de stock, hay: {len(moves_live)}"
        assert moves_live[0].location_dest_id == 2, "La ubicación destino debe ser Clientes (ID 2)"
        assert float(moves_live[0].quantity_done) == 5.0, "La cantidad del movimiento debe ser 5.0"

        # Verificar saldo en inv.inventory_snapshots: debe ser exactamente -5 (descontado una sola vez!)
        snap = db.query(InventorySnapshot).filter(
            InventorySnapshot.variant_id == variant.id,
            InventorySnapshot.facility_id == 1
        ).first()
        assert snap is not None, "Debe existir registro en inventory_snapshots"
        assert float(snap.stock_qty) == -5.0, f"Error de duplicidad: El stock descontado fue {snap.stock_qty}, se esperaba -5.0!"
        print(f"  ✓ Movimiento logístico generado correctamente hacia Clientes (ID 2).")
        print(f"  ✓ Descuento de stock en snapshots validado: Exactamente {snap.stock_qty} (Sin duplicidad).")

        # -------------------------------------------------------------
        # TEST 4: Telemetría (Heartbeat) y Métricas de Tienda
        # -------------------------------------------------------------
        print("\n--- TEST 4: Telemetría y Heartbeat de Tienda ---")
        hb_in = StoreSyncTelemetryIn(
            facility_id=1,
            register_code="SRV-TIENDA-01",
            agent_version="2.0.0-neo",
            machine_name="POS-CENTRAL-01",
            sql_server_status="CONNECTED",
            last_stellar_sale_time=datetime.utcnow(),
            last_synced_sale_time=datetime.utcnow(),
            sales_today_count=120,
            sales_today_amount=3850.75,
            pending_queue_count=0,
            lag_minutes=1,
            status="HEALTHY"
        )
        res_hb = record_heartbeat(hb_in, db)
        print("  Respuesta del Heartbeat:", res_hb)
        assert res_hb["status"] == "OK"

        # Verificar lectura de estado
        statuses = get_sync_status(db)
        print(f"  Estado de tiendas consultado: {len(statuses)} sedes reportadas.")
        fac1_status = next((s for s in statuses if s["facility_id"] == 1), None)
        assert fac1_status is not None
        assert fac1_status["is_online"] == True
        assert fac1_status["sales_today_count"] == 120
        print(f"  ✓ Sede {fac1_status['facility_name']} en línea con {fac1_status['sales_today_count']} ventas auditadas.")

        # -------------------------------------------------------------
        # TEST 5: Ciclo Autónomo de Dante (DANTE_IT)
        # -------------------------------------------------------------
        print("\n--- TEST 5: Ciclo Autónomo de Dante (DANTE_IT) ---")
        dante = db.query(DigitalWorker).filter(DigitalWorker.agent_code == "DANTE_IT").first()
        assert dante is not None, "Dante no está registrado en core.digital_workers"

        summary = run_worker_cycle("DANTE_IT", db)
        print("  Resumen de ejecución de Dante:", summary)
        assert len(summary["executed_skills"]) > 0, "Dante debe haber ejecutado sus habilidades asignadas"
        print(f"  ✓ Dante ejecutó {len(summary['executed_skills'])} habilidades nativas sin errores.")

        print("\n==================================================================")
        print("  ✅ TODAS LAS PRUEBAS DEL PASO 1 PASARON EXITOSAMENTE (5/5)")
        print("==================================================================")

    finally:
        db.close()

if __name__ == "__main__":
    test_step1_suite()
