import asyncio
from sqlalchemy import text
from app.db.session import SessionLocal

def run_setup():
    db = SessionLocal()
    try:
        # 1. Crear las funciones y los triggers en PostgreSQL
        print("Creando funciones y triggers en PostgreSQL...")
        
        sql_triggers = """
        -- Función para Ventas (DocumentLines)
        CREATE OR REPLACE FUNCTION inv.trigger_sales_update_snapshot()
        RETURNS TRIGGER AS $$
        DECLARE
            v_facility_id INTEGER;
            v_state VARCHAR;
            v_type VARCHAR;
            v_product_id INTEGER;
        BEGIN
            -- Obtener info del documento padre
            SELECT facility_id, state, type INTO v_facility_id, v_state, v_type
            FROM sales.documents WHERE id = NEW.document_id;
            
            -- Obtener el variant_id a partir del item (product_variant_id de la venta)
            -- Asumimos que la tabla item_id en DocumentLine mapea al variant
            -- En nuestro schema, order_items o document_lines apuntan a product_id
            -- NEW.product_id es el variant_id
            
            IF v_type = 'INVOICE' AND v_state = 'CONFIRMED' THEN
                -- Restar del inventario
                INSERT INTO inv.inventory_snapshots (variant_id, facility_id, stock_qty)
                VALUES (NEW.product_id, v_facility_id, -NEW.quantity)
                ON CONFLICT (variant_id, facility_id, batch_id) DO UPDATE 
                SET stock_qty = inv.inventory_snapshots.stock_qty - NEW.quantity;
            END IF;
            
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        -- Aplicar trigger a DocumentLines
        DROP TRIGGER IF EXISTS trg_sales_update_snapshot ON sales.document_lines;
        CREATE TRIGGER trg_sales_update_snapshot
        AFTER INSERT OR UPDATE ON sales.document_lines
        FOR EACH ROW EXECUTE FUNCTION inv.trigger_sales_update_snapshot();

        -- Función para Movimientos (StockMoves)
        CREATE OR REPLACE FUNCTION inv.trigger_moves_update_snapshot()
        RETURNS TRIGGER AS $$
        DECLARE
            v_src_facility INTEGER;
            v_dest_facility INTEGER;
        BEGIN
            IF NEW.state = 'DONE' THEN
                -- Buscar facility origen
                SELECT w.facility_id INTO v_src_facility
                FROM inv.locations l JOIN inv.warehouses w ON l.warehouse_id = w.id
                WHERE l.id = NEW.location_src_id;
                
                -- Buscar facility destino
                SELECT w.facility_id INTO v_dest_facility
                FROM inv.locations l JOIN inv.warehouses w ON l.warehouse_id = w.id
                WHERE l.id = NEW.location_dest_id;
                
                -- Restar de origen (si el origen pertenece a un facility)
                IF v_src_facility IS NOT NULL THEN
                    INSERT INTO inv.inventory_snapshots (variant_id, facility_id, stock_qty)
                    VALUES (NEW.product_id, v_src_facility, -NEW.quantity_done)
                    ON CONFLICT (variant_id, facility_id, batch_id) DO UPDATE 
                    SET stock_qty = inv.inventory_snapshots.stock_qty - NEW.quantity_done;
                END IF;
                
                -- Sumar a destino (si el destino pertenece a un facility)
                IF v_dest_facility IS NOT NULL THEN
                    INSERT INTO inv.inventory_snapshots (variant_id, facility_id, stock_qty)
                    VALUES (NEW.product_id, v_dest_facility, NEW.quantity_done)
                    ON CONFLICT (variant_id, facility_id, batch_id) DO UPDATE 
                    SET stock_qty = inv.inventory_snapshots.stock_qty + NEW.quantity_done;
                END IF;
            END IF;
            
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        -- Aplicar trigger a StockMoves
        DROP TRIGGER IF EXISTS trg_moves_update_snapshot ON inv.stock_moves;
        CREATE TRIGGER trg_moves_update_snapshot
        AFTER INSERT OR UPDATE ON inv.stock_moves
        FOR EACH ROW EXECUTE FUNCTION inv.trigger_moves_update_snapshot();
        """
        
        # Ejecutar los triggers
        db.execute(text(sql_triggers))
        db.commit()
        print("✅ Triggers creados correctamente.")
        
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    run_setup()
