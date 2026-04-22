from typing import List
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from fastapi import HTTPException
from datetime import datetime

from app.models.inventory import InventorySession, InventoryLine, Location, StockPickingType
from app.schemas.inventory import InventorySessionCreate, InventoryLineCreate
from app.services.stock_service import StockService
from app.schemas.stock import StockPickingCreate, StockMoveCreate

class InventoryService:
    
    @staticmethod
    def create_session(db: Session, session_in: InventorySessionCreate, user_id: int = None) -> InventorySession:
        db_session = InventorySession(
            name=session_in.name,
            facility_id=session_in.facility_id,
            warehouse_id=session_in.warehouse_id,
            state='DRAFT',
            created_by=user_id
        )
        db.add(db_session)
        db.commit()
        db.refresh(db_session)
        return db_session

    @staticmethod
    def start_session(db: Session, session_id: int):
        session = db.query(InventorySession).get(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        if session.state != 'DRAFT':
            raise HTTPException(status_code=400, detail="Session must be in DRAFT to start")
            
        session.state = 'IN_PROGRESS'
        db.commit()
        return session

    @staticmethod
    def add_line(db: Session, session_id: int, line_in: InventoryLineCreate) -> InventoryLine:
        session = db.query(InventorySession).get(session_id)
        if not session or session.state in ['DONE', 'CANCELLED']:
             raise HTTPException(status_code=400, detail="Invalid Session state")

        # Calculate Theoretical Qty (Snapshot)
        theoretical = StockService.get_stock_quantity(db, line_in.product_variant_id, line_in.location_id)
        
        db_line = InventoryLine(
            session_id=session_id,
            product_variant_id=line_in.product_variant_id,
            location_id=line_in.location_id,
            theoretical_qty=theoretical,
            counted_qty=line_in.counted_qty,
            # difference_qty is GENERATED STORED in DB
            notes=line_in.notes
        )
        db.add(db_line)
        db.commit()
        db.refresh(db_line)
        return db_line

    @staticmethod
    def update_line_count(db: Session, line_id: int, counted_qty: float):
        line = db.query(InventoryLine).get(line_id)
        if not line:
            raise HTTPException(status_code=404, detail="Line not found")
            
        line.counted_qty = counted_qty
        # Recalc difference handled by DB generated column
        line.updated_at = datetime.now()
        db.commit()
        db.refresh(line)
        return line

    @staticmethod
    def validate_session(db: Session, session_id: int):
        """
        Closes the session and generates adjustments.
        """
        session = db.query(InventorySession).get(session_id)
        if not session or session.state != 'IN_PROGRESS':
             raise HTTPException(status_code=400, detail="Session must be IN_PROGRESS to validate")

        # 1. Find or Create Adjustment Picking Type
        adj_type = db.query(StockPickingType).filter(StockPickingType.code == 'ADJ').first()
        if not adj_type:
            # Create default adjustment type if missing
            # Need a LOSS location.
            loc_loss = db.query(Location).filter(Location.usage == 'EXTERNAL', Location.location_type == 'LOSS').first()
            if not loc_loss:
                # Create Virtual Loss Location
                loc_loss = Location(
                    name="Inventory Adjustment",
                    code="VIRTUAL-LOSS",
                    usage="EXTERNAL",
                    location_type="LOSS",
                    warehouse_id=session.warehouse_id # Associated with this warehouse loosely
                )
                db.add(loc_loss)
                db.flush()
            
            adj_type = StockPickingType(
                name="Inventory Adjustments",
                code="ADJ",
                sequence_prefix="INV/ADJ",
                default_location_src_id=loc_loss.id,
                default_location_dest_id=loc_loss.id
            )
            db.add(adj_type)
            db.flush()

        # 2. Prepare Moves
        # We group all adjustments into ONE Picking for this session.
        moves_to_create = []
        
        for line in session.lines:
            diff = line.difference_qty
            if diff == 0:
                continue
                
            # Logic:
            # Diff > 0 (Found Stuff): FROM Loss TO Location
            # Diff < 0 (Lost Stuff): FROM Location TO Loss
            
            if diff > 0:
                # Found
                src = adj_type.default_location_src_id
                dest = line.location_id
                qty = diff
            else:
                # Lost
                src = line.location_id
                dest = adj_type.default_location_dest_id
                qty = abs(diff)
                
            moves_to_create.append(StockMoveCreate(
                product_id=line.product_variant_id,
                location_src_id=src,
                location_dest_id=dest,
                quantity_demand=qty,
                uom_id="PZA" # Todo: fetch from product
            ))

        if moves_to_create:
            picking_in = StockPickingCreate(
                picking_type_id=adj_type.id,
                facility_id=session.facility_id,
                origin_document=f"INV-SESSION:{session.name}"
            )
            
            picking = StockService.create_picking(db, picking_in, moves_to_create)
            StockService.validate_picking(db, picking.id)
        
        session.state = 'DONE'
        session.date_end = datetime.now()
        db.commit()
        db.refresh(session)
        return session
