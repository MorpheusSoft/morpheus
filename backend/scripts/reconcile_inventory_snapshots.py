"""
Script de Reconciliación y Sincronización de Inventarios Neo ERP
- Desvincula almacenes de ubicaciones externas y virtuales (CUSTOMER, INV_ADJ, VIRTUAL-LOSS).
- Ajusta el trigger inv.trigger_moves_update_snapshot() para optimizar transferencias internas.
- Corrige fechas de stock_moves con la fecha real del picking (POS Sale).
- Corrige orientación (origen/destino) de movimientos generados por renglones negativos/anulaciones.
- Reconstruye inv.inventory_snapshots garantizando stock_qty = Baseline + Entradas - Salidas.
"""

import sys
import os
from decimal import Decimal
from sqlalchemy import text

# Agregar backend al path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.api.deps import engine

def reconcile():
    print("=== INICIANDO RECONCILIACIÓN DE INVENTARIO NEO ERP ===")
    with engine.connect() as conn:
        trans = conn.begin()
        try:
            # 1. Desvincular ubicaciones virtuales y externas
            print("\n[PASO 1] Desvinculando almacén físico de ubicaciones externas y virtuales...")
            res_locs = conn.execute(text("""
                UPDATE inv.locations 
                SET warehouse_id = NULL 
                WHERE usage != 'INTERNAL' 
                   OR code IN ('CUSTOMER', 'INV_ADJ', 'VIRTUAL-LOSS');
            """))
            print(f" -> Ubicaciones actualizadas: {res_locs.rowcount}")

            # 2. Instalar/Actualizar Trigger inv.trigger_moves_update_snapshot()
            print("\n[PASO 2] Actualizando triggers en PostgreSQL...")
            conn.execute(text("""
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

                -- Silenciar trigger de sales.document_lines para evitar duplicidad con StockMoves
                CREATE OR REPLACE FUNCTION inv.trigger_sales_update_snapshot()
                RETURNS TRIGGER AS $$
                BEGIN
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                DROP TRIGGER IF EXISTS trg_sales_update_snapshot ON sales.document_lines;
                CREATE TRIGGER trg_sales_update_snapshot
                AFTER INSERT OR UPDATE ON sales.document_lines
                FOR EACH ROW EXECUTE FUNCTION inv.trigger_sales_update_snapshot();
            """))
            print(" -> Triggers actualizados exitosamente.")

            # 3. Sincronizar fechas de stock_moves con la fecha real del picking
            print("\n[PASO 3] Sincronizando fechas reales de ventas en stock_moves...")
            res_dates = conn.execute(text("""
                UPDATE inv.stock_moves sm
                SET date = sp.date_done
                FROM inv.stock_pickings sp
                WHERE sm.picking_id = sp.id 
                  AND sm.reference LIKE 'POS Sale%' 
                  AND sp.date_done IS NOT NULL
                  AND sm.date != sp.date_done;
            """))
            print(f" -> Movimientos con fecha sincronizada: {res_dates.rowcount}")

            # 4. Corregir orientación de renglones negativos (anulaciones / devoluciones)
            print("\n[PASO 4] Corrigiendo movimientos de anulación/devolución a reingreso (src=CUSTOMER, dest=ALM)...")
            res_neg = conn.execute(text("""
                WITH ranked_lines AS (
                    SELECT dl.id as dl_id, d.id as doc_id, dl.variant_id, dl.quantity,
                           sp.id as pick_id,
                           ROW_NUMBER() OVER (PARTITION BY d.id, dl.variant_id ORDER BY dl.id) as rn
                    FROM sales.documents d
                    JOIN sales.document_lines dl ON d.id = dl.document_id
                    JOIN inv.stock_pickings sp ON sp.origin_document = 'C' || d.register_code || '-' || d.document_number
                    WHERE (d.is_historical IS FALSE OR d.is_historical IS NULL)
                ),
                ranked_moves AS (
                    SELECT sm.id as sm_id, sm.picking_id, sm.product_id, sm.quantity_done,
                           sm.location_src_id, sm.location_dest_id,
                           ROW_NUMBER() OVER (PARTITION BY sm.picking_id, sm.product_id ORDER BY sm.id) as rn
                    FROM inv.stock_moves sm
                    WHERE sm.reference LIKE 'POS Sale%'
                ),
                neg_moves AS (
                    SELECT rm.sm_id, rm.location_src_id, rm.location_dest_id
                    FROM ranked_lines rl
                    JOIN ranked_moves rm ON rl.pick_id = rm.picking_id AND rl.variant_id = rm.product_id AND rl.rn = rm.rn
                    WHERE rl.quantity < 0
                )
                UPDATE inv.stock_moves sm
                SET location_src_id = nm.location_dest_id,
                    location_dest_id = nm.location_src_id
                FROM neg_moves nm
                WHERE sm.id = nm.sm_id AND sm.location_src_id = nm.location_src_id;
            """))
            print(f" -> Movimientos negativos orientados como reingreso: {res_neg.rowcount}")

            # 5. Reconstruir snapshots de inventario
            print("\n[PASO 5] Reconstruyendo inv.inventory_snapshots...")
            conn.execute(text("TRUNCATE inv.inventory_snapshots;"))

            # 5.1 Baseline
            res_b = conn.execute(text("""
                INSERT INTO inv.inventory_snapshots (variant_id, facility_id, stock_qty)
                SELECT l.product_variant_id, s.facility_id, SUM(l.difference_qty)
                FROM inv.inventory_lines l
                JOIN inv.inventory_sessions s ON l.session_id = s.id
                WHERE s.state = 'DONE'
                GROUP BY l.product_variant_id, s.facility_id;
            """))
            print(f" -> Registros insertados desde Baseline: {res_b.rowcount}")

            # 5.2 Entradas (Destino en almacén físico)
            res_in = conn.execute(text("""
                INSERT INTO inv.inventory_snapshots (variant_id, facility_id, stock_qty)
                SELECT m.product_id, w.facility_id, SUM(m.quantity_done)
                FROM inv.stock_moves m
                JOIN inv.locations l ON m.location_dest_id = l.id
                JOIN inv.warehouses w ON l.warehouse_id = w.id
                WHERE m.state = 'DONE'
                GROUP BY m.product_id, w.facility_id
                ON CONFLICT (variant_id, facility_id) DO UPDATE 
                SET stock_qty = inv.inventory_snapshots.stock_qty + EXCLUDED.stock_qty;
            """))
            print(f" -> Movimientos de Entrada consolidados: {res_in.rowcount}")

            # 5.3 Salidas (Origen en almacén físico)
            res_out = conn.execute(text("""
                INSERT INTO inv.inventory_snapshots (variant_id, facility_id, stock_qty)
                SELECT m.product_id, w.facility_id, -SUM(m.quantity_done)
                FROM inv.stock_moves m
                JOIN inv.locations l ON m.location_src_id = l.id
                JOIN inv.warehouses w ON l.warehouse_id = w.id
                WHERE m.state = 'DONE'
                GROUP BY m.product_id, w.facility_id
                ON CONFLICT (variant_id, facility_id) DO UPDATE 
                SET stock_qty = inv.inventory_snapshots.stock_qty + EXCLUDED.stock_qty;
            """))
            print(f" -> Movimientos de Salida consolidados: {res_out.rowcount}")

            # Confirmar transacción
            trans.commit()
            print("\n✅ Transacción completada con éxito.")

        except Exception as e:
            trans.rollback()
            print(f"\n❌ ERROR durante la reconciliación: {e}")
            raise e

    # Verificación post-reconciliación
    with engine.connect() as conn:
        print("\n=== VERIFICACIÓN DE RESULTADOS ===")
        # Verificar SAL REFINADA MI LLANURA 1KG (SKU PRD-20345, variant 20345)
        sal = conn.execute(text("""
            SELECT s.facility_id, f.name, s.stock_qty
            FROM inv.inventory_snapshots s
            JOIN core.facilities f ON f.id = s.facility_id
            WHERE s.variant_id = 20345
            ORDER BY s.facility_id;
        """)).fetchall()
        print("Saldos para SAL REFINADA MI LLANURA 1KG (PRD-20345):")
        for row in sal:
            print(f"  - Sede {row[0]} ({row[1]}): {row[2]} UND")

        # Verificar ubicación CUSTOMER
        cust = conn.execute(text("""
            SELECT id, code, name, usage, warehouse_id 
            FROM inv.locations 
            WHERE code = 'CUSTOMER';
        """)).fetchall()
        print("\nUbicación CUSTOMER:")
        for c in cust:
            print(f"  - ID: {c[0]} | Code: {c[1]} | Name: {c[2]} | Usage: {c[3]} | WH: {c[4]}")

if __name__ == "__main__":
    reconcile()
