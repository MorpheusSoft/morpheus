from typing import Any, List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, case, text
from app.api import deps
from app.models.inventory import StockMove, Product, ProductVariant, Warehouse, Location

router = APIRouter()

@router.get("/stock")
def get_stock_level(
    db: Session = Depends(deps.get_db),
    warehouse_id: Optional[int] = None,
    location_id: Optional[int] = None,
    product_id: Optional[int] = None,
):
    """
    Get current stock levels (Grouped by Product and Location).
    Logic: Sum(Incoming) - Sum(Outgoing).
    """
    # We want to group by Product and Location (Only Internal locations usually)
    
    # 1. Base Query on Stock Moves
    # We need to compute balance per location.
    # This acts like a Ledger.
    # Incoming to Loc X uses location_dest_id = X
    # Outgoing from Loc X uses location_src_id = X
    
    # Complex SQL Logic or two queries?
    # Let's use a Common Table Expression logic or a UNION approach if doing raw SQL, 
    # but with ORM, it's easier to iterate locations or use a view.
    
    # Simpler approach for MVP:
    # Get all products, and for each, calculate total stock in requested scope.
    # This is O(N) and slow.
    
    # Better approach:
    # Use SQL generic grouping.
    pass
    
    # Let's do raw SQL for performance and clarity on Double Entry sum
    # "SELECT product_id, location_id, SUM(CASE WHEN dest=loc THEN qty ELSE -qty END) ..."
    
    sql = text("""
    WITH move_lines AS (
        SELECT 
            product_id, 
            location_dest_id AS location_id, 
            quantity_done AS qty 
        FROM inv.stock_moves 
        WHERE state = 'DONE'
        
        UNION ALL
        
        SELECT 
            product_id, 
            location_src_id AS location_id, 
            -quantity_done AS qty 
        FROM inv.stock_moves 
        WHERE state = 'DONE'
    )
    SELECT 
        m.product_id,
        p.name as product_name,
        v.sku,
        m.location_id,
        l.name as location_name,
        SUM(m.qty) as stock_qty,
        v.average_cost,
        v.replacement_cost,
        (SUM(m.qty) * v.average_cost) as value_avg,
        (SUM(m.qty) * v.replacement_cost) as value_replacement
    FROM move_lines m
    JOIN inv.product_variants v ON v.id = m.product_id
    JOIN inv.products p ON p.id = v.product_id
    JOIN inv.locations l ON l.id = m.location_id
    WHERE l.usage = 'INTERNAL' -- Only show my stock
    GROUP BY m.product_id, p.name, v.sku, m.location_id, l.name, v.average_cost, v.replacement_cost
    HAVING SUM(m.qty) != 0
    ORDER BY p.name
    """)
    
    result = db.execute(sql).fetchall()
    
    # Format response
    data = []
    for row in result:
        data.append({
            "product_id": row.product_id,
            "product": row.product_name,
            "sku": row.sku,
            "location": row.location_name,
            "quantity": float(row.stock_qty),
            "cost_avg": float(row.average_cost or 0),
            "value_avg": float(row.value_avg or 0),
            "cost_replacement": float(row.replacement_cost or 0),
            "value_replacement": float(row.value_replacement or 0)
        })
        
    return data

@router.get("/kardex/{product_id}")
def get_kardex(
    product_id: int,
    db: Session = Depends(deps.get_db),
):
    """
    Get detailed history of movements for a product.
    """
    moves = db.query(StockMove).filter(
        StockMove.product_id == product_id,
        StockMove.state == 'DONE'
    ).order_by(StockMove.date.desc()).all()
    
    history = []
    balance = 0 # This needs to be calculated chronologically asc, then reversed? 
    # Or just list moves. Kardex usually implies running balance.
    # For now, just list moves.
    
    for m in moves:
        history.append({
            "date": m.date,
            "reference": m.reference or f"MOVE-{m.id}",
            "location_from": m.location_src_id, # Should fetch names
            "location_to": m.location_dest_id,
            "qty": float(m.quantity_done)
        })
        
    return history
