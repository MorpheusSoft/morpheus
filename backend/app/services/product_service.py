from typing import List
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException

from app.models.inventory import Product, ProductVariant, Category, ProductBarcode, StockMove, ProductPackaging, ProductFacilityPrice
from app.schemas.product import ProductCreate, ProductUpdate, ProductVariantCreate, ProductVariantUpdate, ProductBarcodeCreate
from app.core.config import settings
from sqlalchemy import desc

class ProductService:
    
    @staticmethod
    def get_by_id(db: Session, product_id: int) -> Product:
        return db.query(Product).filter(Product.id == product_id).first()

    @staticmethod
    def generate_next_sku(db: Session) -> str:
        """
        Generates the next sequential SKU based on configuration.
        Format: {PREFIX}-{SEQUENCE} or {SEQUENCE}
        """
        prefix = settings.PRODUCT_SKU_PREFIX
        digits = settings.PRODUCT_SKU_SEQUENCE_DIGITS
        pattern = f"{prefix}-%" if prefix else "%"
        
        # Get last variant with this pattern
        last_variant = db.query(ProductVariant).filter(
            ProductVariant.sku.like(pattern)
        ).order_by(desc(ProductVariant.id)).first()

        next_sequence = 1
        if last_variant:
            # Try to extract the number part
            try:
                # If prefix exists, remove it and the dash
                current_sku = last_variant.sku
                if prefix and current_sku.startswith(f"{prefix}-"):
                     number_part = current_sku[len(prefix)+1:]
                else:
                     number_part = current_sku
                
                next_sequence = int(number_part) + 1
            except ValueError:
                # If last SKU doesn't match expected numeric format, start from 1 or handle error?
                # We'll default to 1 to be safe if parsing fails
                pass
        
        # Format
        if prefix:
            return f"{prefix}-{next_sequence:0{digits}d}"
        else:
            return f"{next_sequence:0{digits}d}"

    @staticmethod
    def create_product(db: Session, product_in: ProductCreate) -> Product:
        # 1. Validate Category
        category = db.query(Category).filter(Category.id == product_in.category_id).first()
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")

        # 2. Create Product (Header)
        db_product = Product(
            name=product_in.name,
            description=product_in.description,
            brand=product_in.brand,
            model=product_in.model,
            product_type=product_in.product_type,
            uom_base=product_in.uom_base,
            category_id=product_in.category_id,
            currency_id=product_in.currency_id,
            shrinkage_percent=product_in.shrinkage_percent,
            image_main=product_in.image_main,
            datasheet=product_in.datasheet,
            has_variants=product_in.has_variants,
            is_active=product_in.is_active
        )
        db.add(db_product)
        db.flush() # Flush to get the ID

        # 2.5 Create Physical Packagings
        for pack in product_in.packagings:
            db_pack = ProductPackaging(
                product_id=db_product.id,
                name=pack.name,
                qty_per_unit=pack.qty_per_unit,
                weight_kg=pack.weight_kg,
                volume_m3=pack.volume_m3
            )
            db.add(db_pack)

        # 3. Create Default Variant only if it's a Simple Product
        if not product_in.has_variants:
            generated_sku = ProductService.generate_next_sku(db)
            db_variant = ProductVariant(
                product_id=db_product.id,
                sku=generated_sku,
                standard_cost=product_in.standard_cost if product_in.standard_cost else 0,
                sales_price=product_in.price if product_in.price else 0,
                replacement_cost=product_in.replacement_cost if product_in.replacement_cost else 0,
                currency_id=product_in.currency_id,
                attributes=None 
            )
            db.add(db_variant)
            db.flush() # Flush para obtener variant ID
            
            # 3.5 Create Matrix Prices per Facility
            for fprice in product_in.facility_prices:
                db_fprice = ProductFacilityPrice(
                    variant_id=db_variant.id,
                    facility_id=fprice.facility_id,
                    sales_price=fprice.sales_price,
                    target_utility_pct=fprice.target_utility_pct
                )
                db.add(db_fprice)
        
        try:
            db.commit()
            db.refresh(db_product)
            return db_product
        except IntegrityError as e:
            db.rollback()
            # print(f"Integrity Error: {e}")
            raise HTTPException(status_code=400, detail=f"Error creating product: {str(e.orig)}")
        except Exception as e:
             db.rollback()
             print(f"General Error creating product: {e}")
             import traceback
             traceback.print_exc()
             raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

    @staticmethod
    def update_product(db: Session, product_id: int, product_in: ProductUpdate) -> Product:
        db_product = db.query(Product).get(product_id)
        if not db_product:
            raise HTTPException(status_code=404, detail="Product not found")

        update_data = product_in.dict(exclude_unset=True)
        
        # Filtrar campos que no pertenecen a Product directamente
        variant_fields = ['standard_cost', 'price', 'replacement_cost']
        relation_fields = ['packagings', 'facility_prices']
        
        product_update_data = {k: v for k, v in update_data.items() if k not in variant_fields and k not in relation_fields}
        
        if "category_id" in product_update_data and product_update_data["category_id"] is not None:
            category = db.query(Category).filter(Category.id == product_update_data["category_id"]).first()
            if not category:
                raise HTTPException(status_code=404, detail="Category not found")

        for field, value in product_update_data.items():
            setattr(db_product, field, value)
            
        # Update Variant and Relational Data if present
        variant = None
        if not db_product.has_variants:
            variant = db.query(ProductVariant).filter(ProductVariant.product_id == product_id).first()
            if variant:
                if 'standard_cost' in update_data and update_data['standard_cost'] is not None:
                    variant.standard_cost = update_data['standard_cost']
                if 'price' in update_data and update_data['price'] is not None:
                    variant.sales_price = update_data['price']
                if 'replacement_cost' in update_data and update_data['replacement_cost'] is not None:
                    variant.replacement_cost = update_data['replacement_cost']
                if 'currency_id' in update_data and update_data['currency_id'] is not None:
                    variant.currency_id = update_data['currency_id']
                    
            # Update Facility Prices
            if 'facility_prices' in update_data and update_data['facility_prices'] is not None and variant:
                db.query(ProductFacilityPrice).filter(ProductFacilityPrice.variant_id == variant.id).delete()
                for fprice in update_data['facility_prices']:
                    db_fprice = ProductFacilityPrice(
                        variant_id=variant.id,
                        facility_id=fprice['facility_id'],
                        sales_price=fprice.get('sales_price', 0),
                        target_utility_pct=fprice.get('target_utility_pct', 0)
                    )
                    db.add(db_fprice)
        
        # Update Barcodes
        if 'barcodes' in update_data and update_data['barcodes'] is not None and variant:
            db.query(ProductBarcode).filter(ProductBarcode.product_variant_id == variant.id).delete()
            for bc in update_data['barcodes']:
                db_bc = ProductBarcode(
                    product_variant_id=variant.id,
                    barcode=bc['barcode'],
                    code_type=bc.get('code_type', 'BARCODE'),
                    uom=bc.get('uom', 'PZA'),
                    conversion_factor=bc.get('conversion_factor', 1),
                    weight=bc.get('weight', 0)
                )
                db.add(db_bc)

        # Update Packagings safely (prevent IntegrityError with Supplier Catalog)
        if 'packagings' in update_data and update_data['packagings'] is not None:
            new_packs = update_data['packagings']
            new_pack_ids = [p['id'] for p in new_packs if p.get('id')]
            
            if new_pack_ids:
                db.query(ProductPackaging).filter(ProductPackaging.product_id == product_id, ~ProductPackaging.id.in_(new_pack_ids)).delete(synchronize_session=False)
            else:
                db.query(ProductPackaging).filter(ProductPackaging.product_id == product_id).delete(synchronize_session=False)

            for pack in new_packs:
                if pack.get('id'):
                    db_pack = db.query(ProductPackaging).get(pack['id'])
                    if db_pack:
                        db_pack.name = pack['name']
                        db_pack.qty_per_unit = pack['qty_per_unit']
                        db_pack.weight_kg = pack.get('weight_kg', 0)
                        db_pack.volume_m3 = pack.get('volume_m3', 0)
                    else:
                        db_pack = ProductPackaging(
                            product_id=product_id,
                            name=pack['name'],
                            qty_per_unit=pack['qty_per_unit'],
                            weight_kg=pack.get('weight_kg', 0),
                            volume_m3=pack.get('volume_m3', 0)
                        )
                        db.add(db_pack)
                else:
                    db_pack = ProductPackaging(
                        product_id=db_product.id,
                        name=pack['name'],
                        qty_per_unit=pack['qty_per_unit'],
                        weight_kg=pack.get('weight_kg', 0),
                        volume_m3=pack.get('volume_m3', 0)
                    )
                    db.add(db_pack)
            
        try:
            db.commit()
            db.refresh(db_product)
            return db_product
        except IntegrityError as e:
            db.rollback()
            raise HTTPException(status_code=400, detail=f"Error updating product: {str(e.orig)}")
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

    @staticmethod
    def create_variant(db: Session, variant_in: ProductVariantCreate) -> ProductVariant:
        db_variant = ProductVariant(
            product_id=variant_in.product_id,
            sku=variant_in.sku,
            part_number=variant_in.part_number,
            barcode=variant_in.barcode,
            image=variant_in.image,
            sales_price=variant_in.sales_price,
            standard_cost=variant_in.standard_cost,
            replacement_cost=variant_in.replacement_cost,
            currency_id=variant_in.currency_id,
            is_published=variant_in.is_published,
            attributes=variant_in.attributes
        )
        try:
            db.add(db_variant)
            
            # If we are adding a second variant, we should probably update has_variants=True on parent
            # Logic could be more complex here (counting variants)
            product = db.query(Product).get(variant_in.product_id)
            if product:
                product.has_variants = True
            
            db.commit()
            db.refresh(db_variant)
            return db_variant
        except IntegrityError as e:
            db.rollback()
            raise HTTPException(status_code=400, detail="SKU already exists")

    @staticmethod
    def get_variants_by_product(db: Session, product_id: int):
        return db.query(ProductVariant).filter(ProductVariant.product_id == product_id).all()

    @staticmethod
    def update_variant(db: Session, variant_id: int, variant_in: ProductVariantUpdate) -> ProductVariant:
        db_variant = db.query(ProductVariant).get(variant_id)
        if not db_variant:
            raise HTTPException(status_code=404, detail="Variant not found")
        
        update_data = variant_in.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_variant, field, value)
            
        try:
            db.commit()
            db.refresh(db_variant)
            return db_variant
        except IntegrityError as e:
            db.rollback()
            raise HTTPException(status_code=400, detail="Error updating variant (e.g. SKU already exists)")
        
    @staticmethod
    def delete_variant(db: Session, variant_id: int):
        db_variant = db.query(ProductVariant).get(variant_id)
        if not db_variant:
            raise HTTPException(status_code=404, detail="Variant not found")
            
        # Check stock moves (inventory) before deletion
        move_count = db.query(StockMove).filter(StockMove.product_id == variant_id).count()
        if move_count > 0:
            raise HTTPException(status_code=400, detail="Cannot delete a variant that has inventory movements")
            
        # Delete barcodes
        db.query(ProductBarcode).filter(ProductBarcode.product_variant_id == variant_id).delete()
        
        product_id = db_variant.product_id
        
        try:
            db.delete(db_variant)
            db.commit()
            
            # Check if product still has variants, if not, update product.has_variants = False
            remaining = db.query(ProductVariant).filter(ProductVariant.product_id == product_id).count()
            if remaining == 0:
                product = db.query(Product).get(product_id)
                if product:
                    product.has_variants = False
                    db.commit()
                    
            return {"ok": True}
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Error deleting variant: {e}")

    @staticmethod
    def create_variants_batch(db: Session, product_id: int, variants_in: List[ProductVariantCreate]) -> List[ProductVariant]:
        product = db.query(Product).get(product_id)
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")

        # Optional: Safety check if variants have inventory stock moves
        existing_variants = db.query(ProductVariant).filter(ProductVariant.product_id == product_id).all()
        existing_ids = [v.id for v in existing_variants]
        
        if existing_ids:
            # Drop Barcodes strictly attached to these old variants
            db.query(ProductBarcode).filter(ProductBarcode.product_variant_id.in_(existing_ids)).delete(synchronize_session=False)
            
            # Wipe old Variants
            db.query(ProductVariant).filter(ProductVariant.product_id == product_id).delete(synchronize_session=False)

        created = []
        for var in variants_in:
            db_var = ProductVariant(
                product_id=product_id,
                sku=var.sku,
                part_number=var.part_number,
                barcode=var.barcode,
                attributes=var.attributes,
                currency_id=var.currency_id or product.currency_id,
                standard_cost=var.standard_cost,
                sales_price=var.sales_price,
                replacement_cost=var.replacement_cost,
                costing_method=var.costing_method or 'AVERAGE'
            )
            db.add(db_var)
            created.append(db_var)

        try:
            db.commit()
            for obj in created:
                db.refresh(obj)
            return created
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=400, detail=str(e))

    @staticmethod
    def add_barcode(db: Session, variant_id: int, barcode_in: ProductBarcodeCreate) -> ProductBarcode:
        db_barcode = ProductBarcode(
            product_variant_id=variant_id,
            barcode=barcode_in.barcode,
            code_type=barcode_in.code_type,
            uom=barcode_in.uom,
            conversion_factor=barcode_in.conversion_factor,
            weight=barcode_in.weight,
            dimensions=barcode_in.dimensions
        )
        try:
            db.add(db_barcode)
            db.commit()
            db.refresh(db_barcode)
            return db_barcode
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=400, detail="Barcode already exists")

    @staticmethod
    def delete_barcode(db: Session, barcode_id: int):
        db_barcode = db.query(ProductBarcode).get(barcode_id)
        if not db_barcode:
            raise HTTPException(status_code=404, detail="Barcode not found")
        db.delete(db_barcode)
        db.commit()
        return {"ok": True}

    @staticmethod
    def get_barcodes_by_variant(db: Session, variant_id: int):
        return db.query(ProductBarcode).filter(ProductBarcode.product_variant_id == variant_id).all()

    @staticmethod
    def delete_product(db: Session, product_id: int):
        product = db.query(Product).get(product_id)
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")

        # Check for movements
        variant_ids = [v.id for v in product.variants]
        
        if variant_ids:
            move_count = db.query(StockMove).filter(StockMove.product_id.in_(variant_ids)).count()
            if move_count > 0:
                raise HTTPException(status_code=400, detail="Cannot delete product with inventory movements")
            
            # Delete barcodes manually to ensure clean cleanup
            for variant in product.variants:
                 db.query(ProductBarcode).filter(ProductBarcode.product_variant_id == variant.id).delete()
            
            # Delete variants
            db.query(ProductVariant).filter(ProductVariant.product_id == product_id).delete()

        db.delete(product)
        try:
            db.commit()
            return {"ok": True}
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Error deleting product: {e}")
