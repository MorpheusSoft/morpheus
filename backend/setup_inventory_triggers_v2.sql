-- 1. Actualizar Sesiones de Inventario Legacy a DONE
UPDATE inv.inventory_sessions SET state = 'DONE' WHERE name LIKE 'Baseline Legacy%';

-- 2. Limpiar la tabla de fotos de inventario
TRUNCATE inv.inventory_snapshots;

-- 3. Insertar el Baseline en inventory_snapshots
INSERT INTO inv.inventory_snapshots (variant_id, facility_id, stock_qty)
SELECT l.product_variant_id, s.facility_id, SUM(l.difference_qty)
FROM inv.inventory_lines l
JOIN inv.inventory_sessions s ON l.session_id = s.id
WHERE s.state = 'DONE'
GROUP BY l.product_variant_id, s.facility_id;

-- 4. Sumar los Movimientos (StockMoves)
-- Entradas (Destino)
INSERT INTO inv.inventory_snapshots (variant_id, facility_id, stock_qty)
SELECT m.product_id, w.facility_id, SUM(m.quantity_done)
FROM inv.stock_moves m
JOIN inv.locations l ON m.location_dest_id = l.id
JOIN inv.warehouses w ON l.warehouse_id = w.id
WHERE m.state = 'DONE'
GROUP BY m.product_id, w.facility_id
ON CONFLICT (variant_id, facility_id) DO UPDATE 
SET stock_qty = inv.inventory_snapshots.stock_qty + EXCLUDED.stock_qty;

-- Salidas (Origen)
INSERT INTO inv.inventory_snapshots (variant_id, facility_id, stock_qty)
SELECT m.product_id, w.facility_id, -SUM(m.quantity_done)
FROM inv.stock_moves m
JOIN inv.locations l ON m.location_src_id = l.id
JOIN inv.warehouses w ON l.warehouse_id = w.id
WHERE m.state = 'DONE'
GROUP BY m.product_id, w.facility_id
ON CONFLICT (variant_id, facility_id) DO UPDATE 
SET stock_qty = inv.inventory_snapshots.stock_qty + EXCLUDED.stock_qty;

-- 5. Restar las Ventas (DocumentLines)
INSERT INTO inv.inventory_snapshots (variant_id, facility_id, stock_qty)
SELECT l.variant_id, d.facility_id, -SUM(l.quantity)
FROM sales.document_lines l
JOIN sales.documents d ON l.document_id = d.id
WHERE d.type = 'INVOICE' AND d.state = 'CONFIRMED'
GROUP BY l.variant_id, d.facility_id
ON CONFLICT (variant_id, facility_id) DO UPDATE 
SET stock_qty = inv.inventory_snapshots.stock_qty + EXCLUDED.stock_qty;


-- 6. Crear Función para Ventas (DocumentLines)
CREATE OR REPLACE FUNCTION inv.trigger_sales_update_snapshot()
RETURNS TRIGGER AS $$
DECLARE
    v_facility_id INTEGER;
    v_state VARCHAR;
    v_type VARCHAR;
BEGIN
    SELECT facility_id, state, type INTO v_facility_id, v_state, v_type
    FROM sales.documents WHERE id = NEW.document_id;
    
    IF v_type = 'INVOICE' AND v_state = 'CONFIRMED' THEN
        INSERT INTO inv.inventory_snapshots (variant_id, facility_id, stock_qty)
        VALUES (NEW.variant_id, v_facility_id, -NEW.quantity)
        ON CONFLICT (variant_id, facility_id) DO UPDATE 
        SET stock_qty = inv.inventory_snapshots.stock_qty - NEW.quantity;
    END IF;
    
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
    v_src_facility INTEGER;
    v_dest_facility INTEGER;
BEGIN
    IF NEW.state = 'DONE' THEN
        SELECT w.facility_id INTO v_src_facility
        FROM inv.locations l JOIN inv.warehouses w ON l.warehouse_id = w.id
        WHERE l.id = NEW.location_src_id;
        
        SELECT w.facility_id INTO v_dest_facility
        FROM inv.locations l JOIN inv.warehouses w ON l.warehouse_id = w.id
        WHERE l.id = NEW.location_dest_id;
        
        IF v_src_facility IS NOT NULL THEN
            INSERT INTO inv.inventory_snapshots (variant_id, facility_id, stock_qty)
            VALUES (NEW.product_id, v_src_facility, -NEW.quantity_done)
            ON CONFLICT (variant_id, facility_id) DO UPDATE 
            SET stock_qty = inv.inventory_snapshots.stock_qty - NEW.quantity_done;
        END IF;
        
        IF v_dest_facility IS NOT NULL THEN
            INSERT INTO inv.inventory_snapshots (variant_id, facility_id, stock_qty)
            VALUES (NEW.product_id, v_dest_facility, NEW.quantity_done)
            ON CONFLICT (variant_id, facility_id) DO UPDATE 
            SET stock_qty = inv.inventory_snapshots.stock_qty + NEW.quantity_done;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_moves_update_snapshot ON inv.stock_moves;
CREATE TRIGGER trg_moves_update_snapshot
AFTER INSERT OR UPDATE ON inv.stock_moves
FOR EACH ROW EXECUTE FUNCTION inv.trigger_moves_update_snapshot();


-- 8. Crear Función para Baseline (InventoryLines)
CREATE OR REPLACE FUNCTION inv.trigger_baseline_update_snapshot()
RETURNS TRIGGER AS $$
DECLARE
    v_facility_id INTEGER;
    v_state VARCHAR;
BEGIN
    SELECT facility_id, state INTO v_facility_id, v_state
    FROM inv.inventory_sessions WHERE id = NEW.session_id;
    
    IF v_state = 'DONE' THEN
        INSERT INTO inv.inventory_snapshots (variant_id, facility_id, stock_qty)
        VALUES (NEW.product_variant_id, v_facility_id, NEW.difference_qty)
        ON CONFLICT (variant_id, facility_id) DO UPDATE 
        SET stock_qty = inv.inventory_snapshots.stock_qty + NEW.difference_qty;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_baseline_update_snapshot ON inv.inventory_lines;
CREATE TRIGGER trg_baseline_update_snapshot
AFTER INSERT OR UPDATE ON inv.inventory_lines
FOR EACH ROW EXECUTE FUNCTION inv.trigger_baseline_update_snapshot();

