from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from app.api import deps
from app.models.inventory import InventorySession, InventoryLine, ProductVariant, StockMove, StockPicking, StockPickingType, Location
from app.schemas import inventory_session as schemas
from datetime import datetime

router = APIRouter()

# =================
# SESSIONS
# =================
@router.post("/sessions/", response_model=schemas.InventorySession)
def create_session(
    *,
    db: Session = Depends(deps.get_db),
    session_in: schemas.InventorySessionCreate,
) -> Any:
    """
    Start a new Inventory Session.
    """
    db_obj = InventorySession(
        name=session_in.name,
        facility_id=session_in.facility_id,
        warehouse_id=session_in.warehouse_id,
        state="IN_PROGRESS"
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

@router.get("/sessions/", response_model=List[schemas.InventorySession])
def read_sessions(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100
):
    return db.query(InventorySession).offset(skip).limit(limit).all()

@router.get("/sessions/{id}", response_model=schemas.InventorySession)
def read_session(
    id: int,
    db: Session = Depends(deps.get_db)
):
    sess = db.query(InventorySession).filter(InventorySession.id == id).first()
    if not sess:
         raise HTTPException(status_code=404, detail="Session not found")
    return sess

# =================
# LINES (COUNTING)
# =================
@router.post("/sessions/{id}/lines", response_model=schemas.InventoryLine)
def add_line(
    id: int,
    line_in: schemas.InventoryLineCreate,
    db: Session = Depends(deps.get_db),
) -> Any:
    """
    Register a count for a product at a location.
    Calculates theoretical quantity (Snapshot at update time) to determine difference.
    """
    sess = db.query(InventorySession).filter(InventorySession.id == id).first()
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    if sess.state == "DONE":
         raise HTTPException(status_code=400, detail="Session is closed")

    # 1. Calculate Theoretical Qty (Current Stock)
    # Logic: Sum(Moves In) - Sum(Moves Out) for this product/location
    # Note: This is a heavy query. In production, we optimize this via materialized views or updated stock fields.
    # For MVP, we calculate on fly.
    
    qty_in = db.query(func.sum(StockMove.quantity_done)).filter(
        StockMove.product_id == line_in.product_variant_id,
        StockMove.location_dest_id == line_in.location_id,
        StockMove.state == 'DONE'
    ).scalar() or 0
    
    qty_out = db.query(func.sum(StockMove.quantity_done)).filter(
        StockMove.product_id == line_in.product_variant_id,
        StockMove.location_src_id == line_in.location_id,
        StockMove.state == 'DONE'
    ).scalar() or 0
    
    theoretical = qty_in - qty_out

    db_line = InventoryLine(
        session_id=id,
        product_variant_id=line_in.product_variant_id,
        location_id=line_in.location_id,
        counted_qty=line_in.counted_qty,
        theoretical_qty=theoretical,
        notes=line_in.notes
    )
    db.add(db_line)
    db.commit()
    db.refresh(db_line)
    return db_line

# =================
# VALIDATE (ADJUST)
# =================
@router.post("/sessions/{id}/validate")
def validate_session(
    id: int,
    method: str = 'SELECTIVE', # SELECTIVE or TOTAL
    db: Session = Depends(deps.get_db),
):
    """
    Close session and generate necessary Stock Moves.
    method='TOTAL' will auto-fill missing products with 0 counted.
    """
    sess = db.query(InventorySession).filter(InventorySession.id == id).first()
    if not sess or sess.state == "DONE":
         raise HTTPException(status_code=400, detail="Invalid Session")

    # 1. Find Virtual Loss Location
    loc_loss = db.query(Location).filter(Location.usage == 'EXTERNAL', Location.location_type == 'LOSS').first()
    if not loc_loss:
         # Fallback or Error? Error.
         raise HTTPException(status_code=500, detail="Inventory Loss Location not found")

    # 2. Create Adjustment Picking
    # We need a Picking Type for adjustments. Usually 'INT' or specific 'ADJ'. 
    # For MVP let's reuse/find one or create a generic one.
    # Let's assume we use the first available INTERNAL type or create one on fly?
    # Better: Use 'INT' type but source/dest depends on gain/loss.
    
    picking_type = db.query(StockPickingType).filter(StockPickingType.code == 'INT').first() # Fallback
    
    adj_picking = StockPicking(
        picking_type_id=picking_type.id,
        name=f"ADJ/{sess.name}",
        origin_document=f"INV-SESS-{sess.id}",
        facility_id=sess.facility_id,
        status="DRAFT"
    )
    db.add(adj_picking)
    db.flush()
    
    moves_created = 0
    
    # ... (Existing Picking Creation) ...
    
    # Map existing lines
    counted_product_ids = {line.product_variant_id for line in sess.lines}
    
    # If TOTAL, find what we missed
    lines_to_process = list(sess.lines) # Work on copy/list
    
    if method == 'TOTAL' and sess.warehouse_id:
        # Find all products with stock in this warehouse
        # This is complex because we need to sum moves for the warehouse locations
        # Simplified: Get all locations in warehouse
        loc_ids = db.query(Location.id).filter(Location.warehouse_id == sess.warehouse_id).all()
        loc_ids = [l[0] for l in loc_ids]
        
        if loc_ids:
             # Get Products with Stock > 0
             # Query: Sum(Dest=Loc) - Sum(Src=Loc) > 0
             # This is heavy. Let's iterate all variants for MVP or use a smart query.
             # Smart Query:
             q_stock = db.query(
                 StockMove.product_id,
                 func.sum(case((StockMove.location_dest_id.in_(loc_ids), StockMove.quantity_done), else_=0)) -
                 func.sum(case((StockMove.location_src_id.in_(loc_ids), StockMove.quantity_done), else_=0))
             ).filter(StockMove.state == 'DONE').group_by(StockMove.product_id)
             
             for pid, stock_qty in q_stock.all():
                 if stock_qty > 0 and pid not in counted_product_ids:
                     # Create a Virtual Line for processing (Counted = 0)
                     # We don't save it to DB to avoid "Polluting" the count record? 
                     # Or we should? Usually better to record "Implicit 0".
                     # Let's simple create a dict/object that behaves like a line
                     lines_to_process.append(type('obj', (object,), {
                         'product_variant_id': pid,
                         'location_id': loc_ids[0], # Default to first loc in WH? Or we need to know WHERE it is.
                         # Realistically if it's in multiple locs we have an issue.
                         # For MVP, assume WH has 1 stock location usually.
                         'counted_qty': 0,
                         'theoretical_qty': stock_qty
                     }))

    moves_created = 0
    
    # 3. Iterate All Lines (Real + Virtual)
    for line in lines_to_process:
        diff = line.counted_qty - line.theoretical_qty
        
        if diff == 0:
            continue
            
        move = StockMove(
            picking_id=adj_picking.id,
            product_id=line.product_variant_id,
            state="DONE", # Auto-Done
            quantity_demand=abs(diff),
            quantity_done=abs(diff)
        )
        
        if diff > 0:
            # Found Extra (Gain): Loss -> Stock
            move.location_src_id = loc_loss.id
            move.location_dest_id = line.location_id
        else:
            # Missing (Loss): Stock -> Loss
            move.location_src_id = line.location_id
            move.location_dest_id = loc_loss.id
            
        db.add(move)
        moves_created += 1
        
    # 4. Close Session
    if moves_created > 0:
        adj_picking.status = "DONE"
        adj_picking.date_done = datetime.utcnow()
    else:
        # If no moves, maybe delete picking?
        db.delete(adj_picking)
        
    sess.state = "DONE"
    sess.date_end = datetime.utcnow()
    
    db.commit()
    return {"message": "Inventory Adjusted", "moves_created": moves_created, "picking_id": adj_picking.id if moves_created else None}
