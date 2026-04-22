from sqlalchemy.orm import Session
from app.api.deps import SessionLocal
from app.models.inventory import Product, ProductVariant
from app.models.core import Currency

def fix_missing_variants():
    db: Session = SessionLocal()
    try:
        # Find products with no variants
        products = db.query(Product).all()
        fixed_count = 0
        
        for p in products:
            if not p.variants:
                print(f"Fixing Product ID {p.id}: {p.name}")
                
                # Generate a SKU if missing using the new ProductService generator
                from app.services.product_service import ProductService
                sku = ProductService.generate_next_sku(db)
                
                variant = ProductVariant(
                    product_id=p.id,
                    sku=sku,
                    costing_method='AVERAGE',
                    standard_cost=0,
                    replacement_cost=0,
                    sales_price=0,
                    is_published=True,
                    is_active=True
                )
                db.add(variant)
                
                # Update has_variants flag
                p.has_variants = False # It is a simple product now effectively
                # Wait, if has_variants is False, frontend treats it as Simple Product (good)
                # But it NEEDS a variant record to attach barcodes.
                
                fixed_count += 1
        
        db.commit()
        print(f"Successfully fixed {fixed_count} products.")
        
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    fix_missing_variants()
