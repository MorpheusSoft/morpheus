import sys
import os

# Add the backend directory to the path so we can import app modules
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from sqlalchemy import create_engine, text
from app.core.config import settings

def main():
    engine = create_engine(settings.SQLALCHEMY_DATABASE_URI)
    with engine.connect() as conn:
        print("Creating Supplier Returns and Vendor Swaps tables if they do not exist...")

        # 1. Supplier Returns (Cabecera RTV)
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS inv.supplier_returns (
            id SERIAL PRIMARY KEY,
            return_number VARCHAR(50) NOT NULL UNIQUE,
            facility_id INTEGER NOT NULL REFERENCES core.facilities(id),
            supplier_id INTEGER NOT NULL REFERENCES core.suppliers(id),
            purchase_order_id INTEGER REFERENCES pur.purchase_orders(id),
            status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
            total_estimated_amount NUMERIC(19, 4) NOT NULL DEFAULT 0,
            carrier_name VARCHAR(150),
            carrier_id_doc VARCHAR(50),
            carrier_plate VARCHAR(30),
            notes TEXT,
            dispatched_at TIMESTAMP WITH TIME ZONE,
            dispatched_by_id INTEGER REFERENCES core.users(id),
            buyer_approved_by_id INTEGER REFERENCES core.users(id),
            buyer_approved_at TIMESTAMP WITH TIME ZONE,
            credit_note_number VARCHAR(80),
            credit_note_amount NUMERIC(19, 4),
            credit_note_date DATE,
            conciliated_by_id INTEGER REFERENCES core.users(id),
            conciliated_at TIMESTAMP WITH TIME ZONE,
            created_by_id INTEGER REFERENCES core.users(id),
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS ix_inv_supplier_returns_return_number ON inv.supplier_returns(return_number);
        CREATE INDEX IF NOT EXISTS ix_inv_supplier_returns_supplier ON inv.supplier_returns(supplier_id);
        CREATE INDEX IF NOT EXISTS ix_inv_supplier_returns_status ON inv.supplier_returns(status);
        """))

        # 2. Supplier Return Lines (Renglones RTV)
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS inv.supplier_return_lines (
            id BIGSERIAL PRIMARY KEY,
            return_id INTEGER NOT NULL REFERENCES inv.supplier_returns(id) ON DELETE CASCADE,
            variant_id INTEGER NOT NULL REFERENCES inv.product_variants(id),
            batch_id INTEGER REFERENCES inv.batches(id),
            quantity NUMERIC(19, 4) NOT NULL,
            unit_cost NUMERIC(19, 4) NOT NULL DEFAULT 0,
            subtotal NUMERIC(19, 4) NOT NULL DEFAULT 0,
            reason VARCHAR(80) NOT NULL DEFAULT 'DEFECTO_FABRICA'
        );
        CREATE INDEX IF NOT EXISTS ix_inv_supplier_return_lines_return_id ON inv.supplier_return_lines(return_id);
        """))

        # 3. Vendor Swaps (Bolsa de Canjes 1 a 1)
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS inv.vendor_swaps (
            id SERIAL PRIMARY KEY,
            swap_number VARCHAR(50) NOT NULL UNIQUE,
            facility_id INTEGER NOT NULL REFERENCES core.facilities(id),
            supplier_id INTEGER NOT NULL REFERENCES core.suppliers(id),
            variant_id INTEGER NOT NULL REFERENCES inv.product_variants(id),
            damaged_batch_id INTEGER REFERENCES inv.batches(id),
            qty_quarantined NUMERIC(19, 4) NOT NULL,
            qty_swapped NUMERIC(19, 4) NOT NULL DEFAULT 0,
            status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
            damage_reason VARCHAR(100),
            notes TEXT,
            quarantined_by_id INTEGER REFERENCES core.users(id),
            quarantined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS ix_inv_vendor_swaps_swap_number ON inv.vendor_swaps(swap_number);
        CREATE INDEX IF NOT EXISTS ix_inv_vendor_swaps_supplier ON inv.vendor_swaps(supplier_id);
        CREATE INDEX IF NOT EXISTS ix_inv_vendor_swaps_status ON inv.vendor_swaps(status);
        """))

        # 4. Vendor Swap Executions (Historial de sustituciones)
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS inv.vendor_swap_executions (
            id SERIAL PRIMARY KEY,
            swap_id INTEGER NOT NULL REFERENCES inv.vendor_swaps(id) ON DELETE CASCADE,
            qty NUMERIC(19, 4) NOT NULL,
            new_batch_number VARCHAR(100) NOT NULL,
            new_expiration_date DATE NOT NULL,
            carrier_name VARCHAR(150),
            carrier_plate VARCHAR(30),
            stock_move_out_id BIGINT REFERENCES inv.stock_moves(id),
            stock_move_in_id BIGINT REFERENCES inv.stock_moves(id),
            executed_by_id INTEGER REFERENCES core.users(id),
            executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS ix_inv_vendor_swap_executions_swap_id ON inv.vendor_swap_executions(swap_id);
        """))

        conn.commit()
        print("✅ Tablas inv.supplier_returns, inv.supplier_return_lines, inv.vendor_swaps e inv.vendor_swap_executions creadas exitosamente.")

if __name__ == "__main__":
    main()
