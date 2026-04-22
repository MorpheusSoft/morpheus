import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db.base_class import Base

from app.services.stock_service import StockService
from app.services.inventory_service import InventoryService
from app.schemas.inventory import InventorySessionCreate, InventoryLineCreate
from app.models.inventory import Location, ProductVariant
import app.models.core # Register core models

# Setup DB
SQLALCHEMY_DATABASE_URL = "postgresql://postgres:Pegaso26@localhost:5433/morpheus"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

def verify_adjustment():
    print("--- STARTING INVENTORY ADJUSTMENT VERIFICATION ---")

    # 1. Setup Data
    sku = "STOCK-TEST-001"
    variant = db.query(ProductVariant).filter(ProductVariant.sku == sku).first()
    if not variant:
        print("Run prior stock verification first to create product!")
        return
    
    loc_stock = db.query(Location).filter(Location.usage == 'INTERNAL').first()
    
    initial_stock = StockService.get_stock_quantity(db, variant.id, loc_stock.id)
    print(f"Initial Stock: {initial_stock}")
    
    # 2. Create Session
    print("\n--- Creating Session ---")
    session_in = InventorySessionCreate(name="Audit Test 1", facility_id=1, warehouse_id=1)
    session = InventoryService.create_session(db, session_in)
    print(f"Session Created: {session.name} (ID: {session.id})")
    
    InventoryService.start_session(db, session.id)
    
    # 3. Add Line (Count: +5 units from current)
    target_qty = initial_stock + 5
    print(f"Counting {target_qty} (Theoretical: {initial_stock}, Diff: +5)")
    
    line_in = InventoryLineCreate(
        product_variant_id=variant.id,
        location_id=loc_stock.id,
        counted_qty=target_qty,
        notes="Found extra stuff"
    )
    line = InventoryService.add_line(db, session.id, line_in)
    print(f"Line Added. Theoretical: {line.theoretical_qty}, Counted: {line.counted_qty}")
    
    # 4. Validate
    print("\n--- Validating Session (Applying Adjustment) ---")
    InventoryService.validate_session(db, session.id)
    
    # 5. Check New Stock
    new_stock = StockService.get_stock_quantity(db, variant.id, loc_stock.id)
    print(f"Stock after Audit: {new_stock} (Expected: {target_qty})")
    assert new_stock == target_qty
    
    print("\n--- ALL TESTS PASSED ---")

if __name__ == "__main__":
    verify_adjustment()
