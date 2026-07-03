import sys
from sqlalchemy import create_engine, text

# Conectar a la base de datos local
engine = create_engine("postgresql://postgres:Pegaso#26@localhost/morpheus")

print("[*] Ejecutando query de Kardex para Harina de Maiz (variant_id=127134)...")

tf_ids_str = "1"
p_ids_str = "127134"

base_cte = f"""
    WITH combined_moves AS (
        SELECT 
            sm.product_id,
            sm.date,
            COALESCE(sm.reference, 'MOVE-' || sm.id) as reference,
            CASE 
                WHEN pt.name IS NOT NULL THEN UPPER(pt.name)
                WHEN l_src.usage = 'SUPPLIER' AND l_dest.usage = 'INTERNAL' THEN 'RECEPCIÓN'
                ELSE 'TRANSFERENCIA'
            END as source_type,
            sm.quantity_done as qty_done,
            sm.unit_cost as unit_cost,
            w_src.facility_id as src_facility_id,
            w_dest.facility_id as dest_facility_id,
            COALESCE(w_src.name, 'N/A') || ' - ' || COALESCE(l_src.name, 'N/A') as src_name,
            COALESCE(w_dest.name, 'N/A') || ' - ' || COALESCE(l_dest.name, 'N/A') as dest_name
        FROM inv.stock_moves sm
        LEFT JOIN inv.stock_pickings p ON p.id = sm.picking_id
        LEFT JOIN inv.stock_picking_types pt ON pt.id = p.picking_type_id
        LEFT JOIN inv.locations l_src ON l_src.id = sm.location_src_id
        LEFT JOIN inv.warehouses w_src ON w_src.id = l_src.warehouse_id
        LEFT JOIN inv.locations l_dest ON l_dest.id = sm.location_dest_id
        LEFT JOIN inv.warehouses w_dest ON w_dest.id = l_dest.warehouse_id
        WHERE sm.state = 'DONE'
        
        UNION ALL
        
        SELECT
            il.product_variant_id as product_id,
            COALESCE(iss.date_end, iss.date_start) as date,
            iss.name as reference,
            'AJUSTE' as source_type,
            ABS(il.difference_qty) as qty_done,
            0 as unit_cost, 
            CASE WHEN il.difference_qty < 0 THEN iss.facility_id ELSE NULL END as src_facility_id,
            CASE WHEN il.difference_qty > 0 THEN iss.facility_id ELSE NULL END as dest_facility_id,
            CASE WHEN il.difference_qty < 0 THEN COALESCE(w.name || ' - ' || l.name, f.name || ' - AJUSTE') ELSE 'N/A' END as src_name,
            CASE WHEN il.difference_qty > 0 THEN COALESCE(w.name || ' - ' || l.name, f.name || ' - AJUSTE') ELSE 'N/A' END as dest_name
        FROM inv.inventory_lines il
        JOIN inv.inventory_sessions iss ON iss.id = il.session_id
        JOIN core.facilities f ON f.id = iss.facility_id
        LEFT JOIN inv.locations l ON l.id = il.location_id
        LEFT JOIN inv.warehouses w ON w.id = l.warehouse_id
        WHERE iss.state IN ('APPLIED', 'DONE') AND il.difference_qty != 0
        
        UNION ALL
        
        SELECT
            dl.variant_id as product_id,
            d.created_at as date,
            d.document_number as reference,
            'VENTA' as source_type,
            dl.quantity as qty_done,
            dl.unit_price as unit_cost,
            d.facility_id as src_facility_id,
            NULL as dest_facility_id,
            f.name || ' - VENTAS' as src_name,
            'CLIENTE - DESTINO' as dest_name
        FROM sales.document_lines dl
        JOIN sales.documents d ON d.id = dl.document_id
        JOIN core.facilities f ON f.id = d.facility_id
        WHERE d.type = 'INVOICE' AND d.state = 'CONFIRMED'
    )
"""

sql_moves = text(base_cte + f"""
    SELECT *
    FROM combined_moves
    WHERE product_id IN ({p_ids_str})
      AND (src_facility_id IN ({tf_ids_str}) OR dest_facility_id IN ({tf_ids_str}))
    ORDER BY date ASC
""")

with engine.connect() as conn:
    res = conn.execute(sql_moves).fetchall()
    print(f"Total de movimientos encontrados: {len(res)}")
    for row in res:
        print(row)
