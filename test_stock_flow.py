from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.db.base_class import Base
from app.models.inventory import StockPickingType, Location, Category
from app.services.product_service import ProductService
from app.services.stock_service import StockService
from app.schemas.product import ProductCreate
from app.schemas.stock import StockPickingCreate, StockMoveCreate

# Setup DB
SQLALCHEMY_DATABASE_URL = "postgresql://postgres:Pegaso26@localhost:5433/morpheus"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

def verify_flow():
    print("--- STARTING VERIFICATION ---")
    
    # 1. Ensure a Category exists
    cat = db.query(Category).first()
    if not cat:
        # Create dummy category if none (though schema doesn't seed them, we might need one)
        print("Creating dummy category...")
        cat = Category(name="General", slug="general")
        db.add(cat)
        db.commit()
        db.refresh(cat)
    print(f"Using Category: {cat.name} (ID: {cat.id})")

    # 2. Create Product
    print("Creating Product...")
    p_in = ProductCreate(
        name="Test Widget",
        category_id=cat.id,
        sku="WIDGET-001",
        price=10.0,
        standard_cost=5.0
    )
    try:
        product = ProductService.create_product(db, p_in)
        print(f"Product Created: {product.name} (ID: {product.id})")
        variant = product.variants[0]
        print(f"Variant Created: {variant.sku} (ID: {variant.id})")
    except Exception as e:
        print(f"Product creation failed (likely exists): {e}")
        # Fetch existing
        from app.models.inventory import ProductVariant
        variant = db.query(ProductVariant).filter(ProductVariant.sku=="WIDGET-001").first()
        print(f"Using existing variant: {variant.sku} (ID: {variant.id})")

    # 3. Get Locations and Types
    picking_type_in = db.query(StockPickingType).filter(StockPickingType.code == 'IN').first()
    loc_supplier = db.query(Location).filter(Location.usage == 'EXTERNAL', Location.location_type == 'SUPPLIER').first()
    loc_stock = db.query(Location).filter(Location.usage == 'INTERNAL').first()
    
    if not picking_type_in or not loc_supplier or not loc_stock:
        print("ERROR: Missing Seed Data (Locations or Types)")
        return
        
    print(f"Picking Type: {picking_type_in.name}")
    print(f"Src: {loc_supplier.name} -> Dest: {loc_stock.name}")

    # 4. Create Picking (Receipt)
    print("Creating Picking (Receipt)...")
    picking_in = StockPickingCreate(
        picking_type_id=picking_type_in.id,
        facility_id=1 # Assuming ID 1 from seed
    )
    
    # Create Move
    moves_in = [
        StockMoveCreate(
            product_id=variant.id,
            location_src_id=loc_supplier.id,
            location_dest_id=loc_stock.id,
            quantity_demand=100
        )
    ]
    
    picking = StockService.create_picking(db, picking_in, moves_in)
    print(f"Picking Created: {picking.name} (Status: {picking.status})")

    # 5. Validate Picking
    print("Validating Picking...")
    picking = StockService.validate_picking(db, picking.id)
    print(f"Picking Validated: {picking.name} (Status: {picking.status})")
    print(f"Move Status: {picking.moves[0].state}")
    
    print("--- VERIFICATION SUCCESS ---")

if __name__ == "__main__":
    verify_flow()
