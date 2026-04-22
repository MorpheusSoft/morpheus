from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app.models.inventory import StockPicking, StockPickingType, StockMove
from app.schemas import stock as schemas
from app.services.stock_service import StockService

router = APIRouter()

# =================
# PICKING TYPES
# =================
@router.get("/picking-types/", response_model=List[schemas.StockPickingType])
def read_picking_types(db: Session = Depends(deps.get_db)):
    return db.query(StockPickingType).all()

# =================
# STOCK QUERIES
# =================
@router.get("/stock/{product_id}", response_model=float)
def get_total_stock(
    product_id: int,
    db: Session = Depends(deps.get_db)
):
    """
    Get total available stock for a product across all INTERNAL locations.
    """
    return StockService.get_total_stock(db, product_id)

@router.get("/stock/{product_id}/{location_id}", response_model=float)
def get_stock_by_location(
    product_id: int,
    location_id: int,
    db: Session = Depends(deps.get_db)
):
    """
    Get stock for a product in a specific location.
    """
    return StockService.get_stock_quantity(db, product_id, location_id)

# =================
# PICKINGS
# =================
@router.post("/pickings/", response_model=schemas.StockPicking)
def create_picking(
    *,
    db: Session = Depends(deps.get_db),
    picking_in: schemas.StockPickingCreate,
) -> Any:
    """
    Create a new Stock Picking (Draft).
    Auto-generates name sequence based on Type.
    """
    return StockService.create_picking(db, picking_in, moves_in=[])

@router.get("/pickings/", response_model=List[schemas.StockPicking])
def read_pickings(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100
):
    return db.query(StockPicking).offset(skip).limit(limit).all()

@router.get("/pickings/{id}", response_model=schemas.StockPicking)
def read_picking(
    id: int,
    db: Session = Depends(deps.get_db),
):
    picking = db.query(StockPicking).filter(StockPicking.id == id).first()
    if not picking:
        raise HTTPException(status_code=404, detail="Picking not found")
    return picking

# =================
# MOVES
# =================
@router.post("/pickings/{id}/moves", response_model=schemas.StockMove)
def add_move(
    id: int,
    move_in: schemas.StockMoveCreate,
    db: Session = Depends(deps.get_db),
) -> Any:
    """
    Add a line (Move) to a Picking.
    """
    return StockService.add_move(db, id, move_in)

# =================
# ACTIONS
# =================
@router.post("/pickings/{id}/validate", response_model=schemas.StockPicking)
def validate_picking(
    id: int,
    db: Session = Depends(deps.get_db)
) -> Any:
    """
    Validate the picking. 
    1. Mark Status = DONE
    2. Mark Moves = DONE (Effective inventory transfer)
    """
    return StockService.validate_picking(db, id)
