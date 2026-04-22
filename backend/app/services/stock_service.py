from typing import List
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy.sql import func
from fastapi import HTTPException
from datetime import datetime

from app.models.inventory import StockPicking, StockMove, StockPickingType, Location, InventorySnapshot
from app.schemas.stock import StockPickingCreate, StockMoveCreate

class StockService:
    
    @staticmethod
    def get_picking_type(db: Session, type_id: int) -> StockPickingType:
        return db.query(StockPickingType).get(type_id)

    @staticmethod
    def create_picking(db: Session, picking_in: StockPickingCreate, moves_in: List[StockMoveCreate]) -> StockPicking:
        # 1. Validate Picking Type
        picking_type = db.query(StockPickingType).get(picking_in.picking_type_id)
        if not picking_type:
            raise HTTPException(status_code=404, detail="Picking Type not found")
            
        # 2. Generate Sequence Name (Simplified for now)
        # In a real app, this should be an atomic sequence generator based on sequence_prefix
        # e.g. WH/IN/00001
        seq_prefix = picking_type.sequence_prefix
        # Quick hack for unique name: prefix + timestamp. TODO: Real Sequence
        name = f"{seq_prefix}/{datetime.now().strftime('%Y%m%d%H%M%S%f')}"
        
        # 3. Create Header
        db_picking = StockPicking(
            picking_type_id=picking_in.picking_type_id,
            name=name,
            origin_document=picking_in.origin_document,
            facility_id=picking_in.facility_id,
            status="DRAFT"
        )
        db.add(db_picking)
        db.flush() # Get ID
        
        # 4. Create Moves
        for move_data in moves_in:
            # Validate locations (Optional but recommended)
            # src = db.query(Location).get(move_data.location_src_id)
            # dest = db.query(Location).get(move_data.location_dest_id)
            
            db_move = StockMove(
                picking_id=db_picking.id,
                product_id=move_data.product_id,
                location_src_id=move_data.location_src_id,
                location_dest_id=move_data.location_dest_id,
                quantity_demand=move_data.quantity_demand,
                quantity_done=0, # Initially 0 until validated
                uom_id=move_data.uom_id,
                state="DRAFT"
            )
            db.add(db_move)
            
        try:
            db.commit()
            db.refresh(db_picking)
            return db_picking
        except IntegrityError as e:
            db.rollback()
            raise HTTPException(status_code=400, detail=f"Error creating picking: {str(e)}")

    @staticmethod
    def add_move(db: Session, picking_id: int, move_in: StockMoveCreate) -> StockMove:
        picking = db.query(StockPicking).get(picking_id)
        if not picking:
            raise HTTPException(status_code=404, detail="Picking not found")
        
        if picking.status == 'DONE':
            raise HTTPException(status_code=400, detail="Cannot add moves to a DONE picking")

        db_move = StockMove(
            picking_id=picking_id,
            product_id=move_in.product_id,
            location_src_id=move_in.location_src_id,
            location_dest_id=move_in.location_dest_id,
            quantity_demand=move_in.quantity_demand,
            quantity_done=0, 
            uom_id=move_in.uom_id,
            state="DRAFT"
        )
        db.add(db_move)
        try:
            db.commit()
            db.refresh(db_move)
            return db_move
        except IntegrityError as e:
            db.rollback()
            raise HTTPException(status_code=400, detail=f"Error adding move: {str(e)}")

    @staticmethod
    def get_stock_quantity(db: Session, product_id: int, location_id: int) -> float:
        """
        Calculates the current stock of a product in a specific location
        using the Double Entry rule: Sum(Incoming) - Sum(Outgoing)
        Where state = 'DONE'.
        """
        # Sum Incoming
        incoming = db.query(func.sum(StockMove.quantity_done)).filter(
            StockMove.product_id == product_id,
            StockMove.location_dest_id == location_id,
            StockMove.state == 'DONE'
        ).scalar()
        incoming = float(incoming) if incoming else 0.0

        # Sum Outgoing
        outgoing = db.query(func.sum(StockMove.quantity_done)).filter(
            StockMove.product_id == product_id,
            StockMove.location_src_id == location_id,
            StockMove.state == 'DONE'
        ).scalar()
        outgoing = float(outgoing) if outgoing else 0.0

        return incoming - outgoing

    @staticmethod
    def get_total_stock(db: Session, product_id: int) -> float:
        """
        Calculates total stock across all INTERNAL locations.
        """
        incoming = db.query(func.sum(StockMove.quantity_done))\
            .join(Location, StockMove.location_dest_id == Location.id)\
            .filter(
                StockMove.product_id == product_id,
                StockMove.state == 'DONE',
                Location.usage == 'INTERNAL'
            ).scalar()
        incoming = float(incoming) if incoming else 0.0

        outgoing = db.query(func.sum(StockMove.quantity_done))\
            .join(Location, StockMove.location_src_id == Location.id)\
            .filter(
                StockMove.product_id == product_id,
                StockMove.state == 'DONE',
                Location.usage == 'INTERNAL'
            ).scalar()
        outgoing = float(outgoing) if outgoing else 0.0
            
        return incoming - outgoing

    @staticmethod
    def validate_picking(db: Session, picking_id: int) -> StockPicking:
        """
        Transition from DRAFT -> DONE.
        Updates stock levels (logically).
        Validates availability if source is INTERNAL.
        """
        picking = db.query(StockPicking).get(picking_id)
        if not picking:
            raise HTTPException(status_code=404, detail="Picking not found")
        
        if picking.status == 'DONE':
            raise HTTPException(status_code=400, detail="Picking already done")

        # 1. Check Availability for all moves
        # We process everything in a transaction.
        for move in picking.moves:
            # Get Source Location to check if it's INTERNAL
            location_src = db.query(Location).get(move.location_src_id)
            if not location_src:
                 raise HTTPException(status_code=400, detail=f"Source Location {move.location_src_id} not found")

            if location_src.usage == 'INTERNAL':
                current_stock = StockService.get_stock_quantity(db, move.product_id, move.location_src_id)
                # Check if we have enough. 
                if current_stock < move.quantity_demand:
                    # Fetch Product details for better error message
                    # move.product_id is a ProductVariant ID
                    from app.models.inventory import ProductVariant
                    variant = db.query(ProductVariant).get(move.product_id)
                    product_label = variant.sku if variant else f"Variant ID {move.product_id}"

                    raise HTTPException(
                        status_code=400, 
                        detail=f"Not enough stock for '{product_label}' at '{location_src.name}'. Available: {current_stock}, Requested: {move.quantity_demand}"
                    )

        # 2. Process Moves
        for move in picking.moves:
            # Update move state
            move.state = 'DONE'
            move.quantity_done = move.quantity_demand # Assume full processing for MVP
            move.date = datetime.now()
            
            # 3. Update InventorySnapshot and Moving Average Cost
            dest_loc = db.query(Location).get(move.location_dest_id)
            src_loc = db.query(Location).get(move.location_src_id)
            
            # Manejo preventivo de nulos en lote
            batch_filter = InventorySnapshot.batch_id == move.batch_id if move.batch_id else InventorySnapshot.batch_id.is_(None)
            
            if dest_loc and dest_loc.usage == 'INTERNAL':
                # Compra / Entrada Pura a almacén -> Recosteo Promedio Ponderado
                snapshot = db.query(InventorySnapshot).filter(
                    InventorySnapshot.variant_id == move.product_id,
                    InventorySnapshot.facility_id == picking.facility_id,
                    batch_filter
                ).first()
                
                if not snapshot:
                    snapshot = InventorySnapshot(
                        variant_id=move.product_id,
                        facility_id=picking.facility_id,
                        batch_id=move.batch_id,
                        stock_qty=0,
                        avg_cost=0,
                        current_cost=0,
                        prev_cost=0,
                        replacement_cost=0
                    )
                    db.add(snapshot)
                
                old_stock = float(snapshot.stock_qty)
                old_avg = float(snapshot.avg_cost)
                incoming_qty = float(move.quantity_done)
                incoming_cost = float(move.unit_cost)
                
                new_stock = old_stock + incoming_qty
                
                if new_stock > 0 and incoming_qty > 0 and incoming_cost > 0:
                    new_avg = ((old_stock * old_avg) + (incoming_qty * incoming_cost)) / new_stock
                else:
                    new_avg = old_avg if old_stock > 0 else incoming_cost
                
                # Rotar Costo Vivo
                snapshot.prev_cost = snapshot.current_cost
                snapshot.current_cost = incoming_cost if incoming_cost > 0 else snapshot.current_cost
                snapshot.avg_cost = new_avg
                snapshot.stock_qty = new_stock
                
                move.historic_avg_cost = new_avg
                
            elif src_loc and src_loc.usage == 'INTERNAL':
                # Salida Pura (Venta, Consumo o Transferencia desde nosotros) -> No cambia promedio
                snapshot = db.query(InventorySnapshot).filter(
                    InventorySnapshot.variant_id == move.product_id,
                    InventorySnapshot.facility_id == picking.facility_id,
                    batch_filter
                ).first()
                
                if snapshot:
                    snapshot.stock_qty = float(snapshot.stock_qty) - float(move.quantity_done)
                    move.historic_avg_cost = snapshot.avg_cost
            
        picking.status = 'DONE'
        picking.date_done = datetime.now()
        
        try:
            db.commit()
            db.refresh(picking)
            return picking
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Error validating picking: {str(e)}")
