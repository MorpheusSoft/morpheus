"""
Script de migración: inv.store_deposit_mappings
Crea la tabla de correspondencia entre depósitos de tiendas físicas (Stellar POS c_deposito)
y almacenes/ubicaciones internas de Neo ERP (inv.warehouses / inv.locations).
"""
import sys
import os
from sqlalchemy import text

# Añadir path del backend
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.api.deps import engine

def migrate_and_seed():
    print("Iniciando migración de inv.store_deposit_mappings...")

    create_table_sql = """
    CREATE TABLE IF NOT EXISTS inv.store_deposit_mappings (
        id SERIAL PRIMARY KEY,
        facility_id INTEGER NOT NULL REFERENCES core.facilities(id) ON DELETE CASCADE,
        external_deposit_code VARCHAR(50) NOT NULL,
        external_deposit_name VARCHAR(100),
        warehouse_id INTEGER NOT NULL REFERENCES inv.warehouses(id) ON DELETE RESTRICT,
        location_id INTEGER NOT NULL REFERENCES inv.locations(id) ON DELETE RESTRICT,
        affects_inventory BOOLEAN NOT NULL DEFAULT TRUE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        auto_discovered BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_facility_external_deposit UNIQUE (facility_id, external_deposit_code)
    );

    CREATE INDEX IF NOT EXISTS idx_store_deposit_mappings_facility 
    ON inv.store_deposit_mappings (facility_id, is_active);
    """

    with engine.connect() as conn:
        conn.execute(text(create_table_sql))
        conn.commit()
        print("Tabla inv.store_deposit_mappings verificada/creada exitosamente.")

        # Sembrar depósitos existentes para Tucacas (10) y Maracay (11)
        seed_sql = """
        -- 1. Tucacas (Facility 10)
        INSERT INTO inv.store_deposit_mappings 
            (facility_id, external_deposit_code, external_deposit_name, warehouse_id, location_id, affects_inventory, is_active, auto_discovered)
        SELECT 
            10, '1001', 'Almacén Principal Piso', w.id, l.id, TRUE, TRUE, FALSE
        FROM inv.warehouses w
        JOIN inv.locations l ON l.warehouse_id = w.id AND l.usage = 'INTERNAL'
        WHERE w.facility_id = 10 AND w.code = '1001'
        ON CONFLICT (facility_id, external_deposit_code) DO NOTHING;

        INSERT INTO inv.store_deposit_mappings 
            (facility_id, external_deposit_code, external_deposit_name, warehouse_id, location_id, affects_inventory, is_active, auto_discovered)
        SELECT 
            10, '1002', 'Almacén de Cambios / Devoluciones', w.id, l.id, TRUE, TRUE, FALSE
        FROM inv.warehouses w
        JOIN inv.locations l ON l.warehouse_id = w.id AND l.usage = 'INTERNAL'
        WHERE w.facility_id = 10 AND w.code = '1002'
        ON CONFLICT (facility_id, external_deposit_code) DO NOTHING;

        INSERT INTO inv.store_deposit_mappings 
            (facility_id, external_deposit_code, external_deposit_name, warehouse_id, location_id, affects_inventory, is_active, auto_discovered)
        SELECT 
            10, '1003', 'Almacén de Deterioro / Merma', w.id, l.id, TRUE, TRUE, FALSE
        FROM inv.warehouses w
        JOIN inv.locations l ON l.warehouse_id = w.id AND l.usage = 'INTERNAL'
        WHERE w.facility_id = 10 AND w.code = '1003'
        ON CONFLICT (facility_id, external_deposit_code) DO NOTHING;

        -- 2. Maracay (Facility 11)
        INSERT INTO inv.store_deposit_mappings 
            (facility_id, external_deposit_code, external_deposit_name, warehouse_id, location_id, affects_inventory, is_active, auto_discovered)
        SELECT 
            11, '01', 'Almacén Principal Piso', w.id, l.id, TRUE, TRUE, FALSE
        FROM inv.warehouses w
        JOIN inv.locations l ON l.warehouse_id = w.id AND l.usage = 'INTERNAL'
        WHERE w.facility_id = 11 AND w.code = '01'
        ON CONFLICT (facility_id, external_deposit_code) DO NOTHING;

        INSERT INTO inv.store_deposit_mappings 
            (facility_id, external_deposit_code, external_deposit_name, warehouse_id, location_id, affects_inventory, is_active, auto_discovered)
        SELECT 
            11, '02', 'Almacén de Cambios / Devoluciones', w.id, l.id, TRUE, TRUE, FALSE
        FROM inv.warehouses w
        JOIN inv.locations l ON l.warehouse_id = w.id AND l.usage = 'INTERNAL'
        WHERE w.facility_id = 11 AND w.code = '02'
        ON CONFLICT (facility_id, external_deposit_code) DO NOTHING;

        INSERT INTO inv.store_deposit_mappings 
            (facility_id, external_deposit_code, external_deposit_name, warehouse_id, location_id, affects_inventory, is_active, auto_discovered)
        SELECT 
            11, '03', 'Almacén de Deterioro / Merma', w.id, l.id, TRUE, TRUE, FALSE
        FROM inv.warehouses w
        JOIN inv.locations l ON l.warehouse_id = w.id AND l.usage = 'INTERNAL'
        WHERE w.facility_id = 11 AND w.code = '03'
        ON CONFLICT (facility_id, external_deposit_code) DO NOTHING;
        """

        conn.execute(text(seed_sql))
        conn.commit()

        # Mostrar estado actual
        check_sql = """
        SELECT 
            m.id, 
            f.name as facility_name, 
            m.external_deposit_code, 
            m.external_deposit_name,
            w.name as warehouse_name,
            l.name as location_name,
            m.affects_inventory,
            m.is_active
        FROM inv.store_deposit_mappings m
        JOIN core.facilities f ON m.facility_id = f.id
        JOIN inv.warehouses w ON m.warehouse_id = w.id
        JOIN inv.locations l ON m.location_id = l.id
        ORDER BY m.facility_id, m.external_deposit_code;
        """
        rows = conn.execute(text(check_sql)).fetchall()
        print(f"Mapeos activos sembrados: {len(rows)}")
        for r in rows:
            print(f"  [{r[1]}] Depósito Stellar '{r[2]}' ({r[3]}) ➔ Almacén '{r[4]}' / Ubic '{r[5]}' (Afecta Stock: {r[6]})")

if __name__ == "__main__":
    migrate_and_seed()
