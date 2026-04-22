import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db.base_class import Base
# Import Core models to ensure they are registered in metadata
import app.models.core 
from app.models.inventory import StockPickingType, Location, Category, ProductVariant
from app.services.product_service import ProductService
from app.services.stock_service import StockService
from app.schemas.product import ProductCreate
from app.schemas.stock import StockPickingCreate, StockMoveCreate
from fastapi import HTTPException

# Setup DB
SQLALCHEMY_DATABASE_URL = "postgresql://postgres:Pegaso26@localhost:5433/morpheus"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

def verify_stock_logic():
    print("--- STARTING ADVANCED STOCK VERIFICATION ---")

    # 1. Setup Product
    sku = "STOCK-TEST-001"
    variant = db.query(ProductVariant).filter(ProductVariant.sku == sku).first()
    if not variant:
        print("Creating Test Product...")
        cat = db.query(Category).first() or Category(name="Gen", slug="gen")
        if not cat.id: db.add(cat); db.commit(); db.refresh(cat)
        
        p_in = ProductCreate(name="Stock Test Item", category_id=cat.id, sku=sku, price=100)
        product = ProductService.create_product(db, p_in)
        variant = product.variants[0]
    else:
        print(f"Using existing product: {variant.sku}")

    pid = variant.product_id
    vid = variant.id

    # 2. Setup Locations
    loc_supplier = db.query(Location).filter(Location.usage == 'EXTERNAL', Location.location_type == 'SUPPLIER').first()
    # Assuming standard internal location
    loc_stock = db.query(Location).filter(Location.usage == 'INTERNAL').first()
    
    if not loc_supplier or not loc_stock:
        print("CRITICAL: Missing locations.")
        return

    print(f"Product ID: {pid} (Variant ID: {vid})")
    print(f"Locations: Supplier({loc_supplier.id}) -> Stock({loc_stock.id})")

    # 3. Initial Stock Check
    initial_stock = StockService.get_stock_quantity(db, vid, loc_stock.id)
    print(f"Initial Stock: {initial_stock}")

    # 4. Scenario A: RECEIVE 10 Units
    print("\n--- SCENARIO A: Receiving 10 Units ---")
    pt_in = db.query(StockPickingType).filter(StockPickingType.code == 'IN').first()
    
    # Create Picking
    pick_in = StockService.create_picking(
        db, 
        StockPickingCreate(picking_type_id=pt_in.id, facility_id=1),
        [StockMoveCreate(product_id=vid, location_src_id=loc_supplier.id, location_dest_id=loc_stock.id, quantity_demand=10)]
    )
    # Validate
    StockService.validate_picking(db, pick_in.id)
    
    new_stock = StockService.get_stock_quantity(db, vid, loc_stock.id)
    print(f"Stock after IN: {new_stock} (Expected: {initial_stock + 10})")
    assert new_stock == initial_stock + 10

    print("Step 4 Passed. Moving to Scenario B.")
    
    # 5. Scenario B: FAIL TO SEND 1000 Units (Not enough stock)
    print("\n--- SCENARIO B: Overselling (Expect Failure) ---")
    pt_out = db.query(StockPickingType).filter(StockPickingType.code == 'OUT').first()
    if not pt_out:
        print("CRITICAL: Picking Type 'OUT' not found!")
        return

    # External Customer loc
    loc_customer = db.query(Location).filter(Location.usage == 'EXTERNAL', Location.location_type == 'CUSTOMER').first()
    if not loc_customer:
        print("CRITICAL: Location 'CUSTOMER' not found!")
        # Attempt fallback or create?
        # Creating temp customer location for test
        loc_customer = Location(name="Customer Test", code="CUST-TEST", usage="EXTERNAL", location_type="CUSTOMER", warehouse_id=1) # Minimal
        db.add(loc_customer)
        db.commit()
        db.refresh(loc_customer)
        print("Created temporary Customer location.")

    pick_fail = StockService.create_picking(
        db, 
        StockPickingCreate(picking_type_id=pt_out.id, facility_id=1),
        [StockMoveCreate(product_id=vid, location_src_id=loc_stock.id, location_dest_id=loc_customer.id, quantity_demand=1000)]
    )
    
    try:
        StockService.validate_picking(db, pick_fail.id)
        print("ERROR: Should have failed due to lack of stock!")
    except Exception as e:
        print(f"SUCCESS: Caught expected error (or unexpected): {e}")

    # 6. Scenario C: SEND 2 Units (Valid)
    print("\n--- SCENARIO C: Sending 2 Units ---")
    pick_out = StockService.create_picking(
        db, 
        StockPickingCreate(picking_type_id=pt_out.id, facility_id=1),
        [StockMoveCreate(product_id=vid, location_src_id=loc_stock.id, location_dest_id=loc_customer.id, quantity_demand=2)]
    )
    StockService.validate_picking(db, pick_out.id)
    
    final_stock = StockService.get_stock_quantity(db, vid, loc_stock.id)
    print(f"Final Stock: {final_stock} (Expected: {initial_stock + 10 - 2})")
    assert final_stock == initial_stock + 10 - 2
    
    # 7 Verify Total Stock Service
    print("\n--- SCENARIO D: Checking Total Stock Service ---")
    total_stock = StockService.get_total_stock(db, vid)
    print(f"Total Stock via Service: {total_stock}")
    assert total_stock == final_stock

    print("\n--- ALL TESTS PASSED ---")

if __name__ == "__main__":
    verify_stock_logic()
