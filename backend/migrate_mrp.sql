-- Phase 5 DB Migration
ALTER TABLE inv.inventory_snapshots ADD COLUMN IF NOT EXISTS safety_stock NUMERIC(19, 4) DEFAULT 0.0;
ALTER TABLE inv.inventory_snapshots ADD COLUMN IF NOT EXISTS run_rate NUMERIC(19, 4) DEFAULT 0.0;

-- Crear Modelo Analistas (Buyers)
CREATE TABLE IF NOT EXISTS core.buyers (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES core.users(id),
    assigned_categories JSONB,
    assigned_facilities JSONB,
    is_active BOOLEAN DEFAULT TRUE
);
