import sys
import os

# Add the backend path to sys.path so we can import from app
sys.path.append(os.path.join(os.path.dirname(__file__)))

from app.api.deps import SessionLocal
from app.services.product_service import ProductService
from app.schemas.product import ProductCreate
from app.models.core import Currency

def verify_sku_generation():
    db = SessionLocal()
    try:
        # Create a mock product
        new_prod_in = ProductCreate(
            name="Test Auto SKU Product",
            category_id=1,
            description="Testing SKU generator",
            product_type="STOCKED",
            uom_base="PZA",
            has_variants=False,
            is_active=True
        )
        
        # Test 1: Check generation logic directly
        print("Testing generate_next_sku()...")
        next_sku = ProductService.generate_next_sku(db)
        print(f"Generated Next SKU: {next_sku}")
        
        # Test 2: Create product and see if default variant has it
        print("\nCreating product...")
        created_prod = ProductService.create_product(db, new_prod_in)
        
        # Reload product with variants (lazy loading fix / verification)
        if hasattr(created_prod, 'variants') and hasattr(created_prod.variants, '__iter__'):
             variants = list(created_prod.variants)
        else:
             from app.models.inventory import Product
             db.refresh(created_prod)
             variants = created_prod.variants

        if variants:
            print(f"Product created successfully. Assigned SKU: {variants[0].sku}")
        else:
            print("ERROR: Product created but no variants were assigned.")
            
        # Optional: We could rollback so we don't clutter the DB with test data
        db.rollback()
        print("\nDatabase rolled back successfully. Verification complete.")
        
    except Exception as e:
        print(f"Exception occurred: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    verify_sku_generation()
