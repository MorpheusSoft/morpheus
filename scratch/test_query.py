import sys
sys.path.insert(0, '/home/lzambrano/Desarrollo/Morpheus/backend')

from app.api.deps import SessionLocal
from app.models.core import Supplier, Company, Facility, Tribute
from app.models.inventory import ProductVariant, Product, Category
from decimal import Decimal

def test():
    db = SessionLocal()
    try:
        tax = db.query(Tribute).filter(Tribute.name == "IVA 16%").first()
        category = db.query(Category).filter(Category.slug == "rep-cat").first()

        db.query(ProductVariant).filter(ProductVariant.sku == "SKU-REP-TEST").delete()
        db.query(Product).filter(Product.name == "Product Report Test").delete()
        db.commit()

        product = Product(
            category_id=category.id, name="Product Report Test", brand="BrandTest", model="ModelTest",
            sell_on_web=True, is_active=True, product_type="STOCKED", uom_base="PZA", tax_id=tax.id
        )
        db.add(product)
        db.commit()

        variant = ProductVariant(
            product_id=product.id, sku="SKU-REP-TEST", average_cost=Decimal("100.0"),
            last_cost=Decimal("100.0"), standard_cost=Decimal("100.0"), sales_price=Decimal("150.0"),
            attributes={"talla": "XL", "color": "Rojo"}, is_active=True
        )
        db.add(variant)
        db.commit()

        # Check astext query
        res = db.query(ProductVariant).filter(
            ProductVariant.sku == "SKU-REP-TEST",
            ProductVariant.attributes['talla'].astext == 'XL'
        ).all()
        print("Query with astext count:", len(res))
        
        # Check search term filter query
        res3 = db.query(ProductVariant).join(Product).filter(
            or_(
                Product.name.ilike("%Report Test%"),
                ProductVariant.sku.ilike("%Report Test%")
            )
        ).all() if 'or_' in globals() else []
        
        from sqlalchemy import or_
        res3 = db.query(ProductVariant).join(Product).filter(
            or_(
                Product.name.ilike("%Report Test%"),
                ProductVariant.sku.ilike("%Report Test%")
            )
        ).all()
        print("Query with search term count:", len(res3))

        # Cleanup
        db.delete(variant)
        db.commit()
        db.delete(product)
        db.commit()
    finally:
        db.close()

if __name__ == "__main__":
    test()
