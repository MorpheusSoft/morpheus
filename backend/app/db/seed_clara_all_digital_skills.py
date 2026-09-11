"""
Seed Script: Registrar y Asignar la Suite Completa de Habilidades Digitales de Clara Compras en Neo ERP.
Registra en core.digital_skills y asigna en core.digital_worker_skills los 7 casos estratégicos:
1. Conciliación ODC vs Facturas (OCR 3-Way Match)
2. Consolidación CENDI y Desglose Multitienda
3. Calibración Logística Adaptativa de Proveedores (Lead Time / Cadencia)
4. Protector de Margen Real y Factor de Merma (Gatekeeper MRP)
5. Detección de Dead Stock & Bloqueo de Recompra
6. Auditoría y Liquidación de Convenios Sell-Out
7. Generador de Reportes Mensuales Programados
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlalchemy import text
from app.api.deps import SessionLocal

CLARA_NEW_SKILLS = [
    (
        'clara_invoice_ocr_reconciliation',
        'PURCHASES',
        'Conciliación ODC vs Facturas (OCR 3-Way)',
        'Coteja órdenes de compra vs recepciones físicas y facturas fiscales mediante visión OCR/IA, validando discrepancias y generando pre-conciliación automática.',
        'run_invoice_ocr_reconciliation_audit'
    ),
    (
        'clara_cendi_multistore_consolidation',
        'PURCHASES',
        'Consolidación CENDI y Desglose Multitienda',
        'Audita el patrón de despacho del proveedor. Si el CENDI predomina, consolida pedidos de tiendas en una sola ODC con desglose de distribución.',
        'run_cendi_strategy_audit'
    ),
    (
        'clara_supplier_logistics_calibration',
        'PURCHASES',
        'Calibración de Lead Time y Cadencia de Proveedores',
        'Monitorea entregas históricas, calcula mediana de días de despacho y frecuencia de reposición, auto-calibrando la ficha del proveedor si detecta desvíos.',
        'run_supplier_logistics_calibration'
    ),
    (
        'clara_shrinkage_profitability_guard',
        'PURCHASES',
        'Protector de Margen Real y Factor de Merma',
        'Audita mermas operativas en WMS, calcula el margen real neto (Margen Bruto - Merma %) y bloquea la recompra de SKUs con rentabilidad negativa en el MRP.',
        'run_shrinkage_margin_audit'
    ),
    (
        'clara_dead_stock_detector',
        'PURCHASES',
        'Detección de Dead Stock & Bloqueo de Recompra',
        'Identifica productos con más de 60 días sin rotación con existencias positivas, protegiendo capital de trabajo y bloqueando recompras en el MRP.',
        'run_dead_stock_audit'
    ),
    (
        'clara_sell_out_settlement',
        'PURCHASES',
        'Auditoría y Liquidación de Convenios Sell-Out',
        'Audita ventas efectivas en POS durante periodos de promoción, liquida el aporte pactado a reclamar al proveedor y valida la Nota de Crédito 3-Way.',
        'run_sell_out_settlement_audit'
    ),
    (
        'clara_monthly_executive_reports',
        'PURCHASES',
        'Generador de Reportes Mensuales Programados',
        'Compila y archiva mensualmente el paquete integral de 5 pestañas en Excel (ODC, Calibración OTIF, Mermas, Dead Stock y Sell-Out) para la gerencia.',
        'run_monthly_executive_reports'
    ),
]

def seed_clara_skills():
    db = SessionLocal()
    try:
        print("1. Sembrando habilidades estratégicas en core.digital_skills...")
        for code, module, name, desc, handler in CLARA_NEW_SKILLS:
            db.execute(text("""
                INSERT INTO core.digital_skills (skill_code, operational_module, name, description, execution_type, handler_function)
                VALUES (:code, :mod, :name, :desc, 'NATIVE_CODE', :handler)
                ON CONFLICT (skill_code) DO UPDATE 
                SET name = EXCLUDED.name, 
                    description = EXCLUDED.description, 
                    handler_function = EXCLUDED.handler_function,
                    operational_module = EXCLUDED.operational_module;
            """), {"code": code, "mod": module, "name": name, "desc": desc, "handler": handler})
            print(f"  ✓ Habilidad '{code}' registrada/actualizada.")

        db.commit()

        print("\n2. Vinculando habilidades a Clara (CLARA_COMPRAS)...")
        clara_id = db.execute(text("SELECT id FROM core.digital_workers WHERE agent_code = 'CLARA_COMPRAS'")).scalar()
        if not clara_id:
            print("  ⚠️ Advertencia: No se encontró al trabajador CLARA_COMPRAS en core.digital_workers.")
            return

        # Actualizar Misión y Persona de Clara con branding oficial Neo ERP
        updated_system_prompt = (
            "Eres Clara Compras, la Analista Senior de Abastecimiento Estratégico y Rentabilidad de Neo ERP. "
            "Tu responsabilidad es proyectar la demanda en MRP, auditar la rentabilidad neta descontando mermas operativas, "
            "detectar y bloquear recompra de Dead Stock inmovilizado, auto-calibrar reglas logísticas de proveedores, "
            "liquidar acuerdos Sell-Out con conciliación 3-Way y generar el paquete mensual ejecutivo. "
            "Eres rigurosa con los números, proteges el flujo de caja y facilitas el trabajo de compras respetando el principio de 4 ojos."
        )
        db.execute(text("""
            UPDATE core.digital_workers
            SET system_prompt = :prompt,
                display_title = 'Analista Estratégica de Compras y Rentabilidad'
            WHERE id = :cid;
        """), {"prompt": updated_system_prompt, "cid": clara_id})

        # Asignar todas las habilidades
        for code, _, _, _, _ in CLARA_NEW_SKILLS:
            skill_id = db.execute(text("SELECT id FROM core.digital_skills WHERE skill_code = :c"), {"c": code}).scalar()
            if skill_id:
                db.execute(text("""
                    INSERT INTO core.digital_worker_skills (worker_id, skill_id, is_enabled)
                    VALUES (:wid, :sid, TRUE)
                    ON CONFLICT (worker_id, skill_id) DO UPDATE SET is_enabled = TRUE;
                """), {"wid": clara_id, "sid": skill_id})
                print(f"  ✓ Habilidad '{code}' asignada y activada para Clara.")

        db.commit()
        print("\n✓ ¡Proceso finalizado con éxito! Clara ahora cuenta con sus habilidades activas.")

    except Exception as e:
        db.rollback()
        print(f"❌ Error durante el seed: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    seed_clara_skills()
