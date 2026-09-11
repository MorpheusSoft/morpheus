import sys
sys.path.insert(0, '/home/lzambrano/Desarrollo/Morpheus/backend')

from sqlalchemy import text
from app.api.deps import SessionLocal

def run_migration():
    db = SessionLocal()
    print("Iniciando migración DDL para Fase 4 de Clara...")

    sql = """
    -- 1. Extender inv.product_variants para Bloqueo de Compras, Merma y Dead Stock
    ALTER TABLE inv.product_variants 
    ADD COLUMN IF NOT EXISTS is_blocked_for_purchasing BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS purchasing_blocked_reason VARCHAR(255),
    ADD COLUMN IF NOT EXISTS shrinkage_pct NUMERIC(5, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS net_real_margin NUMERIC(5, 2) DEFAULT 0.0,
    ADD COLUMN IF NOT EXISTS days_without_sales INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS dead_stock_status VARCHAR(30) DEFAULT 'HEALTHY';

    CREATE INDEX IF NOT EXISTS idx_product_variants_dead_stock ON inv.product_variants (dead_stock_status);
    CREATE INDEX IF NOT EXISTS idx_product_variants_blocked_pur ON inv.product_variants (is_blocked_for_purchasing);

    -- 2. Extender core.system_settings para Umbrales
    ALTER TABLE core.system_settings
    ADD COLUMN IF NOT EXISTS dead_stock_days_threshold INTEGER DEFAULT 60,
    ADD COLUMN IF NOT EXISTS shrinkage_analysis_days INTEGER DEFAULT 90;

    -- 3. Crear tabla pur.sell_out_agreements
    CREATE TABLE IF NOT EXISTS pur.sell_out_agreements (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        title VARCHAR(200) NOT NULL,
        supplier_id INTEGER REFERENCES core.suppliers(id) ON DELETE RESTRICT,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status VARCHAR(30) DEFAULT 'DRAFT',
        total_claim_amount NUMERIC(19, 4) DEFAULT 0.0,
        settled_at TIMESTAMPTZ,
        settled_by_worker_id INTEGER REFERENCES core.digital_workers(id),
        credit_note_number VARCHAR(80),
        credit_note_date DATE,
        credit_note_amount NUMERIC(19, 4) DEFAULT 0.0,
        conciliation_status VARCHAR(30) DEFAULT 'PENDING',
        conciliation_notes TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_sell_out_supplier ON pur.sell_out_agreements (supplier_id);
    CREATE INDEX IF NOT EXISTS idx_sell_out_status ON pur.sell_out_agreements (status);

    -- 4. Crear tabla pur.sell_out_agreement_lines
    CREATE TABLE IF NOT EXISTS pur.sell_out_agreement_lines (
        id BIGSERIAL PRIMARY KEY,
        agreement_id INTEGER REFERENCES pur.sell_out_agreements(id) ON DELETE CASCADE,
        variant_id INTEGER REFERENCES inv.product_variants(id) ON DELETE RESTRICT,
        regular_price NUMERIC(19, 4) NOT NULL DEFAULT 0.0,
        promo_price NUMERIC(19, 4) NOT NULL DEFAULT 0.0,
        discount_per_unit NUMERIC(19, 4) NOT NULL DEFAULT 0.0,
        provider_share_pct NUMERIC(5, 2) DEFAULT 100.0,
        provider_share_fixed NUMERIC(19, 4) DEFAULT 0.0,
        units_sold_qty NUMERIC(19, 4) DEFAULT 0.0,
        claim_amount NUMERIC(19, 4) DEFAULT 0.0,
        created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_sell_out_lines_agreement ON pur.sell_out_agreement_lines (agreement_id);
    CREATE INDEX IF NOT EXISTS idx_sell_out_lines_variant ON pur.sell_out_agreement_lines (variant_id);

    -- 5. Crear tabla core.scheduled_reports
    CREATE TABLE IF NOT EXISTS core.scheduled_reports (
        id SERIAL PRIMARY KEY,
        report_type VARCHAR(60) NOT NULL,
        name VARCHAR(200) NOT NULL,
        frequency VARCHAR(30) DEFAULT 'MONTHLY',
        format VARCHAR(10) DEFAULT 'XLSX',
        recipient_emails JSONB DEFAULT '[]'::jsonb,
        filters JSONB DEFAULT '{}'::jsonb,
        last_generated_at TIMESTAMPTZ,
        last_file_path VARCHAR(500),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT now()
    );

    -- Inyectar reporte mensual estándar si no existe
    INSERT INTO core.scheduled_reports (report_type, name, frequency, format, recipient_emails, filters, is_active)
    SELECT 'MONTHLY_PURCHASES_AUDIT', 'Auditoría Mensual Integral de Compras y Rentabilidad', 'MONTHLY', 'XLSX', '[]'::jsonb, '{}'::jsonb, TRUE
    WHERE NOT EXISTS (
        SELECT 1 FROM core.scheduled_reports WHERE report_type = 'MONTHLY_PURCHASES_AUDIT'
    );
    """

    try:
        db.execute(text(sql))
        db.commit()
        print("✅ Migración DDL para Fase 4 completada con éxito.")
    except Exception as e:
        db.rollback()
        print(f"❌ Error ejecutando migración DDL: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()
