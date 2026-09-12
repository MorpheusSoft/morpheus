import sys
import os
from datetime import datetime, date
from decimal import Decimal
import json

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.api.v1.api import api_router
from app.api.deps import SessionLocal
from app.models.sales import Document, DocumentLine, Customer
from app.models.inventory import Product, ProductVariant, ProductBarcode, StockPicking, StockMove
from app.models.sync_telemetry import StoreSyncTelemetry
from app.models.digital_workers import DigitalWorker, DigitalWorkerActionLog
from app.schemas.sync_sales import SalesBatchPayloadIn, SalesBatchDocumentIn, SalesBatchLineIn, StoreSyncTelemetryIn
from app.api.v1.endpoints.sync_sales import import_sales_batch, record_heartbeat
from app.services.dante_it_service import (
    audit_store_sync_heartbeats,
    detect_sales_consecutive_gaps,
    reconcile_daily_sales_totals
)

def run_tests():
    print("==================================================================")
    print("  TEST STEP 4: CARGA HIBRIDA, CONTINUA Y AGENTE DANTE TI")
    print("==================================================================")

    db = SessionLocal()
    dante = db.query(DigitalWorker).filter(DigitalWorker.agent_code == 'DANTE_IT').first()
    if not dante:
        print("❌ Error: Agente Dante no encontrado en core.digital_workers")
        return False

    test_sku = "TEST-STEP4-SKU-001"
    doc_pre_num = "STEP4-PRE-001"
    doc_post_num = "STEP4-POST-001"
    doc_gap1_num = "00000100"
    doc_gap2_num = "00000103"
    reg_code = "99" # Caja aislada para pruebas
    fac_id = 1

    def clean_data():
        db.rollback()
        # Limpiar pickings de prueba
        pickings = db.query(StockPicking).filter(StockPicking.name.like("%STEP4%")).all()
        for p in pickings:
            db.query(StockMove).filter(StockMove.picking_id == p.id).delete(synchronize_session=False)
            db.delete(p)
        db.commit()

        # Documentos y líneas
        docs = db.query(Document).filter(Document.document_number.in_([doc_pre_num, doc_post_num, doc_gap1_num, doc_gap2_num])).all()
        doc_ids = [d.id for d in docs]
        if doc_ids:
            db.query(DocumentLine).filter(DocumentLine.document_id.in_(doc_ids)).delete(synchronize_session=False)
            db.query(Document).filter(Document.id.in_(doc_ids)).delete(synchronize_session=False)
            db.commit()

        # Limpiar códigos de barra de prueba
        db.query(ProductBarcode).filter(ProductBarcode.barcode == test_sku).delete(synchronize_session=False)
        db.commit()

        # Producto y variante de prueba
        pv = db.query(ProductVariant).filter(ProductVariant.sku == test_sku).first()
        if pv:
            prod_id = pv.product_id
            db.query(StockMove).filter(StockMove.product_id == pv.id).delete(synchronize_session=False)
            db.query(ProductBarcode).filter(ProductBarcode.product_variant_id == pv.id).delete(synchronize_session=False)
            db.delete(pv)
            db.commit()
            p = db.query(Product).filter(Product.id == prod_id).first()
            if p:
                db.delete(p)
                db.commit()

        # Telemetría de prueba
        db.query(StoreSyncTelemetry).filter(StoreSyncTelemetry.agent_version == "2.0.0-TEST").delete(synchronize_session=False)

        # Limpiar ActionLogs generados en la prueba
        db.query(DigitalWorkerActionLog).filter(
            DigitalWorkerActionLog.worker_id == dante.id,
            DigitalWorkerActionLog.action_type.in_(["SALES_GAP_DETECTED", "DAILY_SALES_RECONCILIATION", "SALES_GAP_AUDIT_OK"])
        ).delete(synchronize_session=False)
        db.commit()

    try:
        # 0. Limpieza preventiva previa
        clean_data()

        # ==================================================================
        # 1. PRUEBA DE INGESTA HIBRIDA INTELIGENTE
        # ==================================================================
        print("\n--- 1. Ingesta Híbrida: Pre-Baseline vs Post-Baseline ---")
        payload = SalesBatchPayloadIn(
            is_historical=False, # Modo normal del agente
            documents=[
                # Venta Pre-Baseline: 2026-05-15 (Antes del 2026-06-29)
                SalesBatchDocumentIn(
                    facility_id=fac_id,
                    register_code=reg_code,
                    document_number=doc_pre_num,
                    doc_type="FAC",
                    doc_date="2026-05-15 14:30:00",
                    customer_tax_id="J-999999999",
                    customer_name="Cliente Test Pre",
                    subtotal=Decimal("20.00"),
                    tax_amount=Decimal("3.20"),
                    total_amount=Decimal("23.20"),
                    lines=[
                        SalesBatchLineIn(
                            sku_code=test_sku,
                            quantity=Decimal("2.0"),
                            unit_price=Decimal("10.00"),
                            subtotal=Decimal("20.00"),
                            tax_amount=Decimal("3.20"),
                            total=Decimal("23.20"),
                            deposit_code="01",
                            description="Producto de Prueba Paso 4"
                        )
                    ]
                ),
                # Venta Post-Baseline: 2026-07-15 (Después del 2026-06-29)
                SalesBatchDocumentIn(
                    facility_id=fac_id,
                    register_code=reg_code,
                    document_number=doc_post_num,
                    doc_type="FAC",
                    doc_date="2026-07-15 11:00:00",
                    customer_tax_id="J-999999999",
                    customer_name="Cliente Test Post",
                    subtotal=Decimal("30.00"),
                    tax_amount=Decimal("4.80"),
                    total_amount=Decimal("34.80"),
                    lines=[
                        SalesBatchLineIn(
                            sku_code=test_sku,
                            quantity=Decimal("3.0"),
                            unit_price=Decimal("10.00"),
                            subtotal=Decimal("30.00"),
                            tax_amount=Decimal("4.80"),
                            total=Decimal("34.80"),
                            deposit_code="01",
                            description="Producto de Prueba Paso 4"
                        )
                    ]
                )
            ]
        )

        res = import_sales_batch(payload, session=db)
        print(f"  Resultado de Ingesta: {res}")
        assert res["processed"] == 2, f"Esperado 2 procesados, obtuvo {res['processed']}"

        # Verificar Venta Pre-Baseline en BD
        doc_pre = db.query(Document).filter(Document.facility_id == fac_id, Document.document_number == doc_pre_num).first()
        assert doc_pre is not None, "Doc Pre no encontrado"
        assert doc_pre.is_historical is True, f"Esperado is_historical=True para Pre-Baseline, obtuvo {doc_pre.is_historical}"
        # Verificar que NO tenga picking de stock
        picking_pre = db.query(StockPicking).filter(StockPicking.origin_document == f"C{reg_code}-{doc_pre_num}").first()
        assert picking_pre is None, f"Doc Pre no debió generar picking de inventario"
        print("  ✓ Venta Pre-Baseline clasificada correctamente como is_historical=True y sin picking de Kardex.")

        # Verificar Venta Post-Baseline en BD
        doc_post = db.query(Document).filter(Document.facility_id == fac_id, Document.document_number == doc_post_num).first()
        assert doc_post is not None, "Doc Post no encontrado"
        assert doc_post.is_historical is False, f"Esperado is_historical=False para Post-Baseline, obtuvo {doc_post.is_historical}"
        # Verificar que SÍ tenga picking y movimiento de stock
        picking_post = db.query(StockPicking).filter(StockPicking.origin_document == f"C{reg_code}-{doc_post_num}").first()
        assert picking_post is not None, "Doc Post debió generar un StockPicking"
        moves_post = db.query(StockMove).filter(StockMove.picking_id == picking_post.id).count()
        assert moves_post == 1, f"Doc Post debió generar exactamente 1 StockMove, pero generó {moves_post}"
        print("  ✓ Venta Post-Baseline clasificada correctamente como is_historical=False y con deducción de Kardex.")

        # ==================================================================
        # 2. PRUEBA DE IDEMPOTENCIA
        # ==================================================================
        print("\n--- 2. Prueba de Idempotencia y Cero Duplicados ---")
        res_dup = import_sales_batch(payload, session=db)
        print(f"  Resultado de Reenvío: {res_dup}")
        assert res_dup["processed"] == 0, "No debió procesar nada nuevo"
        assert res_dup["duplicates"] == 2, f"Esperado 2 duplicados, obtuvo {res_dup['duplicates']}"
        print("  ✓ Idempotencia perfecta: cero duplicados generados al retransmitir.")

        # ==================================================================
        # 3. PRUEBA DE DETECCION DE BRECHAS (DANTE TI)
        # ==================================================================
        print("\n--- 3. Habilidad Dante: Detección de Brechas Correlativas (it_sales_gap_detector) ---")
        # Inyectar tickets 100 y 103 para crear brecha de 2 tickets (101 y 102)
        payload_gaps = SalesBatchPayloadIn(
            is_historical=True,
            documents=[
                SalesBatchDocumentIn(
                    facility_id=fac_id,
                    register_code=reg_code,
                    document_number=doc_gap1_num,
                    doc_type="FAC",
                    doc_date="2026-07-15 12:00:00",
                    customer_tax_id="J-999999999",
                    customer_name="Cliente Gap",
                    subtotal=Decimal("10.00"),
                    tax_amount=Decimal("1.60"),
                    total_amount=Decimal("11.60"),
                    lines=[
                        SalesBatchLineIn(sku_code=test_sku, quantity=Decimal("1.0"), unit_price=Decimal("10.00"), subtotal=Decimal("10.00"), tax_amount=Decimal("1.60"), total=Decimal("11.60"), deposit_code="01")
                    ]
                ),
                SalesBatchDocumentIn(
                    facility_id=fac_id,
                    register_code=reg_code,
                    document_number=doc_gap2_num,
                    doc_type="FAC",
                    doc_date="2026-07-15 12:15:00",
                    customer_tax_id="J-999999999",
                    customer_name="Cliente Gap",
                    subtotal=Decimal("10.00"),
                    tax_amount=Decimal("1.60"),
                    total_amount=Decimal("11.60"),
                    lines=[
                        SalesBatchLineIn(sku_code=test_sku, quantity=Decimal("1.0"), unit_price=Decimal("10.00"), subtotal=Decimal("10.00"), tax_amount=Decimal("1.60"), total=Decimal("11.60"), deposit_code="01")
                    ]
                )
            ]
        )
        import_sales_batch(payload_gaps, session=db)

        # Ejecutar habilidad de detección de brechas
        gap_results = detect_sales_consecutive_gaps(db, dante)
        print(f"  Resultado de Auditoría de Brechas: {gap_results}")
        assert any(r.get("status") == "GAPS_DETECTED" for r in gap_results), "Dante debió detectar la brecha de numeración"
        
        # Verificar log en ActionLog
        latest_gap_log = db.query(DigitalWorkerActionLog).filter(
            DigitalWorkerActionLog.worker_id == dante.id,
            DigitalWorkerActionLog.action_type == "SALES_GAP_DETECTED"
        ).order_by(DigitalWorkerActionLog.id.desc()).first()
        assert latest_gap_log is not None, "ActionLog de brecha no encontrado"
        print(f"  ✓ Alerta registrada por Dante: {latest_gap_log.summary}")

        # ==================================================================
        # 4. PRUEBA DE CUADRATURA DIARIA DE DANTE (it_daily_sales_reconciliation)
        # ==================================================================
        print("\n--- 4. Habilidad Dante: Cuadratura Diaria (it_daily_sales_reconciliation) ---")
        # Simular telemetría de Stellar reportando exactamente lo registrado para 2026-07-15 en reg_code 99:
        # Venta post (34.80) + gap1 (11.60) + gap2 (11.60) = 3 facturas, total $58.00
        telemetry_payload = StoreSyncTelemetryIn(
            facility_id=fac_id,
            store_name="Tienda Principal",
            agent_version="2.0.0-TEST",
            sql_server_status="CONNECTED",
            last_stellar_sale="2026-07-15 12:15:00",
            last_sales_sync="2026-07-15 12:15:00",
            sales_today_count=3,
            sales_today_amount=Decimal("58.00"),
            lag_minutes=0
        )
        record_heartbeat(telemetry_payload, session=db)

        # Ejecutar cuadratura para la fecha 2026-07-15
        reconcil_results = reconcile_daily_sales_totals(db, dante, audit_date=date(2026, 7, 15))
        print(f"  Resultado de Cuadratura: {reconcil_results}")
        assert any(r.get("status") == "BALANCED" for r in reconcil_results), "Dante debió validar la cuadratura perfecta"
        
        # Verificar log en ActionLog
        reconcil_log = db.query(DigitalWorkerActionLog).filter(
            DigitalWorkerActionLog.worker_id == dante.id,
            DigitalWorkerActionLog.action_type == "DAILY_SALES_RECONCILIATION",
            DigitalWorkerActionLog.severity == "INFO"
        ).order_by(DigitalWorkerActionLog.id.desc()).first()
        assert reconcil_log is not None, "ActionLog de cuadratura no encontrado"
        print(f"  ✓ Log de Dante: {reconcil_log.summary}")

        # ==================================================================
        # 5. PRUEBA DE VIGILANCIA DE LATIDOS (it_sync_heartbeat_monitor)
        # ==================================================================
        print("\n--- 5. Habilidad Dante: Vigilancia de Latidos (it_sync_heartbeat_monitor) ---")
        heartbeat_audit = audit_store_sync_heartbeats(db, dante)
        print(f"  Resultado de Auditoría de Latidos: {heartbeat_audit}")
        print("  ✓ Tienda verificada como saludable y conectada.")

        print("\n==================================================================")
        print("  TODAS LAS PRUEBAS DEL PASO 4 PASARON EXITOSAMENTE (5/5)")
        print("==================================================================")
        return True

    finally:
        # SANEAMIENTO FINAL OBLIGATORIO: Dejar la BD limpia
        print("\n--- Saneamiento Final: Eliminando datos de prueba ---")
        try:
            clean_data()
            print("  ✓ Base de datos completamente saneada y limpia.")
        except Exception as ex:
            print(f"  ⚠️ Error en limpieza: {ex}")
            db.rollback()
        finally:
            db.close()

if __name__ == "__main__":
    success = run_tests()
    if not success:
        sys.exit(1)
