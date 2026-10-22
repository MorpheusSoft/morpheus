-- 1. Actualizar Sesiones de Inventario Legacy a DONE
UPDATE inv.inventory_sessions SET state = 'DONE' WHERE name LIKE 'Baseline Legacy%';

-- 2. Desvincular almacenes físicos de ubicaciones externas y virtuales
UPDATE inv.locations 
SET warehouse_id = NULL 
WHERE usage != 'INTERNAL' 
   OR code IN ('CUSTOMER', 'INV_ADJ', 'VIRTUAL-LOSS');

-- 3. Limpiar la tabla de fotos de inventario
TRUNCATE inv.inventory_snapshots;

-- 4. Insertar el Baseline en inventory_snapshots
INSERT INTO inv.inventory_snapshots (variant_id, facility_id, stock_qty)
SELECT l.product_variant_id, s.facility_id, SUM(l.difference_qty)
FROM inv.inventory_lines l
JOIN inv.inventory_sessions s ON l.session_id = s.id
WHERE s.state = 'DONE'
GROUP BY l.product_variant_id, s.facility_id;

-- 5. Sumar los Movimientos (StockMoves)
-- Entradas (Destino en almacén físico)
INSERT INTO inv.inventory_snapshots (variant_id, facility_id, stock_qty)
SELECT m.product_id, w.facility_id, SUM(m.quantity_done)
FROM inv.stock_moves m
JOIN inv.locations l ON m.location_dest_id = l.id
JOIN inv.warehouses w ON l.warehouse_id = w.id
WHERE m.state = 'DONE'
GROUP BY m.product_id, w.facility_id
ON CONFLICT (variant_id, facility_id) DO UPDATE 
SET stock_qty = inv.inventory_snapshots.stock_qty + EXCLUDED.stock_qty;

-- Salidas (Origen en almacén físico)
INSERT INTO inv.inventory_snapshots (variant_id, facility_id, stock_qty)
SELECT m.product_id, w.facility_id, -SUM(m.quantity_done)
FROM inv.stock_moves m
JOIN inv.locations l ON m.location_src_id = l.id
JOIN inv.warehouses w ON l.warehouse_id = w.id
WHERE m.state = 'DONE'
GROUP BY m.product_id, w.facility_id
ON CONFLICT (variant_id, facility_id) DO UPDATE 
SET stock_qty = inv.inventory_snapshots.stock_qty + EXCLUDED.stock_qty;

-- NOTA: Las ventas comerciales no se descuentan directamente desde sales.document_lines
-- porque el flujo oficial genera un StockMove confirmado para cada venta POS.

-- 6. Trigger para Ventas (DocumentLines) - Silenciado para evitar doble conteo
CREATE OR REPLACE FUNCTION inv.trigger_sales_update_snapshot()
RETURNS TRIGGER AS $$
BEGIN
    -- Silenciado: La deducción de inventario la realiza inv.stock_moves (Kardex oficial)
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sales_update_snapshot ON sales.document_lines;
CREATE TRIGGER trg_sales_update_snapshot
AFTER INSERT OR UPDATE ON sales.document_lines
FOR EACH ROW EXECUTE FUNCTION inv.trigger_sales_update_snapshot();


-- 7. Crear Función para Movimientos (StockMoves)
CREATE OR REPLACE FUNCTION inv.trigger_moves_update_snapshot()
RETURNS TRIGGER AS $$
DECLARE
    v_old_src_facility INTEGER;
    v_old_dest_facility INTEGER;
    v_new_src_facility INTEGER;
    v_new_dest_facility INTEGER;
BEGIN
    -- 1. Si es UPDATE y nada que afecte inventario cambió, salir inmediatamente (evita sobre-descuento)
    IF TG_OP = 'UPDATE' THEN
        IF OLD.state = NEW.state 
           AND OLD.product_id = NEW.product_id 
           AND OLD.location_src_id = NEW.location_src_id 
           AND OLD.location_dest_id = NEW.location_dest_id 
           AND OLD.quantity_done = NEW.quantity_done THEN
            RETURN NEW;
        END IF;
    END IF;

    -- 2. Revertir impacto de OLD si OLD estaba confirmado ('DONE')
    IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') AND OLD.state = 'DONE' AND OLD.quantity_done > 0 THEN
        SELECT w.facility_id INTO v_old_src_facility
        FROM inv.locations l JOIN inv.warehouses w ON l.warehouse_id = w.id
        WHERE l.id = OLD.location_src_id;

        SELECT w.facility_id INTO v_old_dest_facility
        FROM inv.locations l JOIN inv.warehouses w ON l.warehouse_id = w.id
        WHERE l.id = OLD.location_dest_id;

        -- Solo revertir si no fue una transferencia interna dentro de la misma sucursal
        IF NOT (v_old_src_facility IS NOT NULL AND v_old_dest_facility IS NOT NULL AND v_old_src_facility = v_old_dest_facility) THEN
            -- Revertir salida en origen (devolver stock al origen)
            IF v_old_src_facility IS NOT NULL THEN
                INSERT INTO inv.inventory_snapshots (variant_id, facility_id, stock_qty)
                VALUES (OLD.product_id, v_old_src_facility, OLD.quantity_done)
                ON CONFLICT (variant_id, facility_id) DO UPDATE 
                SET stock_qty = inv.inventory_snapshots.stock_qty + OLD.quantity_done;
            END IF;

            -- Revertir entrada en destino (quitar stock del destino)
            IF v_old_dest_facility IS NOT NULL THEN
                INSERT INTO inv.inventory_snapshots (variant_id, facility_id, stock_qty)
                VALUES (OLD.product_id, v_old_dest_facility, -OLD.quantity_done)
                ON CONFLICT (variant_id, facility_id) DO UPDATE 
                SET stock_qty = inv.inventory_snapshots.stock_qty - OLD.quantity_done;
            END IF;
        END IF;
    END IF;

    -- 3. Aplicar impacto de NEW si NEW está confirmado ('DONE')
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.state = 'DONE' AND NEW.quantity_done > 0 THEN
        SELECT w.facility_id INTO v_new_src_facility
        FROM inv.locations l JOIN inv.warehouses w ON l.warehouse_id = w.id
        WHERE l.id = NEW.location_src_id;

        SELECT w.facility_id INTO v_new_dest_facility
        FROM inv.locations l JOIN inv.warehouses w ON l.warehouse_id = w.id
        WHERE l.id = NEW.location_dest_id;

        -- Solo aplicar si no es una transferencia interna dentro de la misma sucursal
        IF NOT (v_new_src_facility IS NOT NULL AND v_new_dest_facility IS NOT NULL AND v_new_src_facility = v_new_dest_facility) THEN
            -- Salida de origen
            IF v_new_src_facility IS NOT NULL THEN
                INSERT INTO inv.inventory_snapshots (variant_id, facility_id, stock_qty)
                VALUES (NEW.product_id, v_new_src_facility, -NEW.quantity_done)
                ON CONFLICT (variant_id, facility_id) DO UPDATE 
                SET stock_qty = inv.inventory_snapshots.stock_qty - NEW.quantity_done;
            END IF;

            -- Entrada a destino
            IF v_new_dest_facility IS NOT NULL THEN
                INSERT INTO inv.inventory_snapshots (variant_id, facility_id, stock_qty)
                VALUES (NEW.product_id, v_new_dest_facility, NEW.quantity_done)
                ON CONFLICT (variant_id, facility_id) DO UPDATE 
                SET stock_qty = inv.inventory_snapshots.stock_qty + NEW.quantity_done;
            END IF;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_moves_update_snapshot ON inv.stock_moves;
CREATE TRIGGER trg_moves_update_snapshot
AFTER INSERT OR UPDATE OR DELETE ON inv.stock_moves
FOR EACH ROW EXECUTE FUNCTION inv.trigger_moves_update_snapshot();


-- 8. Crear Función para Baseline (InventoryLines)
CREATE OR REPLACE FUNCTION inv.trigger_baseline_update_snapshot()
RETURNS TRIGGER AS $$
DECLARE
    v_facility_id INTEGER;
    v_state VARCHAR;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD.product_variant_id = NEW.product_variant_id 
           AND OLD.session_id = NEW.session_id 
           AND OLD.difference_qty = NEW.difference_qty THEN
            RETURN NEW;
        END IF;
    END IF;

    -- Revertir OLD si la sesión estaba DONE/APPLIED
    IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
        SELECT facility_id, state INTO v_facility_id, v_state
        FROM inv.inventory_sessions WHERE id = OLD.session_id;

        IF v_state IN ('APPLIED', 'DONE') AND OLD.difference_qty IS NOT NULL AND OLD.difference_qty != 0 THEN
            INSERT INTO inv.inventory_snapshots (variant_id, facility_id, stock_qty)
            VALUES (OLD.product_variant_id, v_facility_id, -OLD.difference_qty)
            ON CONFLICT (variant_id, facility_id) DO UPDATE 
            SET stock_qty = inv.inventory_snapshots.stock_qty - OLD.difference_qty;
        END IF;
    END IF;

    -- Aplicar NEW si la sesión está DONE/APPLIED
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        SELECT facility_id, state INTO v_facility_id, v_state
        FROM inv.inventory_sessions WHERE id = NEW.session_id;

        IF v_state IN ('APPLIED', 'DONE') AND NEW.difference_qty IS NOT NULL AND NEW.difference_qty != 0 THEN
            INSERT INTO inv.inventory_snapshots (variant_id, facility_id, stock_qty)
            VALUES (NEW.product_variant_id, v_facility_id, NEW.difference_qty)
            ON CONFLICT (variant_id, facility_id) DO UPDATE 
            SET stock_qty = inv.inventory_snapshots.stock_qty + NEW.difference_qty;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_baseline_update_snapshot ON inv.inventory_lines;
CREATE TRIGGER trg_baseline_update_snapshot
AFTER INSERT OR UPDATE OR DELETE ON inv.inventory_lines
FOR EACH ROW EXECUTE FUNCTION inv.trigger_baseline_update_snapshot();
