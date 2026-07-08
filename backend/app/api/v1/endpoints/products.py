from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.api import deps
from app.models.inventory import Product, ProductVariant, Category
from app.models.purchasing import SupplierProduct
from app.schemas import product as schemas
from app.schemas.supplier import SupplierProductResponse, SupplierProductCreate
from app.services.product_service import ProductService

router = APIRouter()

@router.post("/", response_model=schemas.Product)
def create_product(
    *,
    db: Session = Depends(deps.get_db),
    product_in: schemas.ProductCreate,
) -> Any:
    """
    Create new product.
    Automatically creates a default Variant if has_variants is False (Simple Product).
    """
    return ProductService.create_product(db, product_in)

@router.post("/{id}/variants", response_model=schemas.ProductVariant)
def create_variant(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    variant_in: schemas.ProductVariantCreate,
) -> Any:
    """
    Add a new variant (SKU) to an existing product.
    """
    if id != variant_in.product_id:
         raise HTTPException(status_code=400, detail="Product ID in URL must match body")
         
    return ProductService.create_variant(db, variant_in)

@router.post("/{id}/variants/batch", response_model=List[schemas.ProductVariant])
def create_variants_batch(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    variants_in: List[schemas.ProductVariantCreate],
) -> Any:
    """
    Override all variants for a product with a new cartesian batch.
    """
    return ProductService.create_variants_batch(db, id, variants_in)

@router.get("/{id}/variants", response_model=List[schemas.ProductVariant])
def read_variants(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
) -> Any:
    """
    Get all variants for a specific product.
    """
    return ProductService.get_variants_by_product(db, id)

@router.get("/variants/{variant_id}", response_model=schemas.ProductVariant)
def read_variant(
    *,
    db: Session = Depends(deps.get_db),
    variant_id: int,
) -> Any:
    """
    Get a single product variant by ID.
    """
    db_variant = db.query(ProductVariant).get(variant_id)
    if not db_variant:
        raise HTTPException(status_code=404, detail="Variant not found")
    return db_variant

@router.put("/variants/{variant_id}", response_model=schemas.ProductVariant)
def update_variant(
    *,
    db: Session = Depends(deps.get_db),
    variant_id: int,
    variant_in: schemas.ProductVariantUpdate,
) -> Any:
    """
    Update a product variant (e.g. JSONB attributes, prices).
    """
    return ProductService.update_variant(db, variant_id, variant_in)

@router.delete("/variants/{variant_id}", response_model=Any)
def delete_variant(
    *,
    db: Session = Depends(deps.get_db),
    variant_id: int,
) -> Any:
    """
    Delete a product variant.
    """
    return ProductService.delete_variant(db, variant_id)

@router.get("/", response_model=schemas.ProductPaginated)
def read_products(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    q: str = None,
    category_ids: Optional[List[int]] = Query(None),
    supplier_ids: Optional[List[int]] = Query(None)
) -> Any:
    """
    Retrieve products.
    """
    try:
        from sqlalchemy.orm import selectinload
        from sqlalchemy import or_
        
        query = db.query(Product)
        
        # Supplier filtering
        if supplier_ids:
            query = query.join(ProductVariant, ProductVariant.product_id == Product.id) \
                         .join(SupplierProduct, SupplierProduct.variant_id == ProductVariant.id) \
                         .filter(SupplierProduct.supplier_id.in_(supplier_ids))
            
        # Category filtering
        if category_ids:
            query = query.join(Category, Category.id == Product.category_id)
            cats = db.query(Category).filter(Category.id.in_(category_ids)).all()
            cat_conditions = []
            for c in cats:
                cat_conditions.append(Category.id == c.id)
                if c.path:
                    cat_conditions.append(Category.path.like(f"{c.path}/%"))
            if cat_conditions:
                query = query.filter(or_(*cat_conditions))

        if q:
            if not supplier_ids:
                query = query.outerjoin(ProductVariant)
            query = query.filter(
                or_(
                    Product.name.ilike(f"%{q}%"),
                    ProductVariant.sku.ilike(f"%{q}%")
                )
            )

        if supplier_ids or q:
            query = query.distinct()
            
        total = query.count()
        
        products = query.options(
            selectinload(Product.variants).selectinload(ProductVariant.barcodes),
            selectinload(Product.variants).selectinload(ProductVariant.facility_prices),
            selectinload(Product.packagings)
        ).offset(skip).limit(limit).all()
        
        # --- INJECT STOCK MAGNITUDE ---
        from app.models.inventory import InventorySnapshot
        variant_ids = [v.id for p in products for v in p.variants]
        stock_map = {}
        if variant_ids:
            from sqlalchemy.sql import func
            stock_results = db.query(
                InventorySnapshot.variant_id, 
                func.sum(InventorySnapshot.stock_qty).label("total")
            ).filter(InventorySnapshot.variant_id.in_(variant_ids)).group_by(InventorySnapshot.variant_id).all()
            for row in stock_results:
                stock_map[row.variant_id] = row.total
                
        for p in products:
            p_stock = 0
            for v in p.variants:
                v.total_stock = stock_map.get(v.id, 0)
                p_stock += v.total_stock
            p.total_stock = p_stock
        # --- END STOCK ---
        
        return {"data": products, "total": total}
    except Exception as e:
        print(f"Error reading products: {e}")
        raise HTTPException(status_code=500, detail=f"Error reading products: {str(e)}")

@router.put("/{id}", response_model=schemas.Product)
def update_product(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    product_in: schemas.ProductUpdate,
) -> Any:
    """
    Update a product.
    """
    try:
        return ProductService.update_product(db, id, product_in)
    except Exception as e:
        import traceback
        traceback.print_exc()
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error: {str(e.__class__.__name__)} - {str(e)}")

@router.get("/{id}", response_model=schemas.Product)
def read_product(
    id: int,
    db: Session = Depends(deps.get_db),
) -> Any:
    """
    Get product by ID.
    """
    product = ProductService.get_by_id(db, id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product

@router.post("/variants/{id}/barcodes", response_model=schemas.ProductBarcode)
def create_barcode(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    barcode_in: schemas.ProductBarcodeCreate,
) -> Any:
    """
    Add a barcode/packaging to a variant.
    """
    return ProductService.add_barcode(db, id, barcode_in)

@router.get("/variants/{id}/barcodes", response_model=List[schemas.ProductBarcode])
def read_barcodes(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
) -> Any:
    """
    Get barcodes for a variant.
    """
    return ProductService.get_barcodes_by_variant(db, id)

@router.delete("/barcodes/{id}", response_model=Any)
def delete_barcode(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
) -> Any:
    """
    Delete a barcode.
    """
    return ProductService.delete_barcode(db, id)

@router.delete("/{id}", response_model=Any)
def delete_product(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
) -> Any:
    """
    Delete a product.
    """
    return ProductService.delete_product(db, id)

@router.put("/variants/{variant_id}/suppliers", response_model=List[SupplierProductResponse])
def sync_variant_suppliers(
    *, db: Session = Depends(deps.get_db), variant_id: int, items_in: List[SupplierProductCreate]
) -> Any:
    """
    Sync suppliers for a specific variant (Draft mode / Upsert from Product UI)
    """
    from app.models.purchasing import SupplierProduct
    from app.models.inventory import ProductVariant, ProductPackaging
    
    existing = db.query(SupplierProduct).filter(SupplierProduct.variant_id == variant_id).all()
    existing_map = {e.supplier_id: e for e in existing}

    var_obj = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
    master_product_id = var_obj.product_id if var_obj else None

    new_items = []
    seen = set()

    for inc in items_in:
        if inc.supplier_id not in seen:
            seen.add(inc.supplier_id)
            
            # Resolve Ghost IDs for new packagings created in frontend
            final_pack_id = inc.pack_id
            if final_pack_id and final_pack_id > 1000000000 and master_product_id and inc.pack_name:
                real_pack = db.query(ProductPackaging).filter(ProductPackaging.product_id == master_product_id, ProductPackaging.name == inc.pack_name).first()
                final_pack_id = real_pack.id if real_pack else None
            elif final_pack_id and final_pack_id < 1000000000:
                # Still check if it was wiped and recreated by a previous put
                if master_product_id and inc.pack_name:
                    real_pack = db.query(ProductPackaging).filter(ProductPackaging.product_id == master_product_id, ProductPackaging.name == inc.pack_name).first()
                    final_pack_id = real_pack.id if real_pack else None

            if inc.supplier_id in existing_map:
                item = existing_map[inc.supplier_id]
                item.replacement_cost = inc.replacement_cost
                item.min_order_qty = inc.min_order_qty
                item.pack_id = final_pack_id
                item.currency_id = inc.currency_id
                item.is_primary = inc.is_primary
                new_items.append(item)
                del existing_map[inc.supplier_id]
            else:
                item = SupplierProduct(
                    supplier_id=inc.supplier_id,
                    variant_id=variant_id,
                    supplier_sku=inc.supplier_sku,
                    pack_id=final_pack_id,
                    currency_id=inc.currency_id,
                    replacement_cost=inc.replacement_cost,
                    min_order_qty=inc.min_order_qty,
                    is_active=inc.is_active,
                    is_primary=inc.is_primary
                )
                db.add(item)
                new_items.append(item)

    for orphan in existing_map.values():
        db.delete(orphan)
        
    db.commit()
    for obj in new_items:
        db.refresh(obj)
    return new_items

@router.get("/variants/{id}/suppliers", response_model=List[SupplierProductResponse])
def get_variant_suppliers(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
) -> Any:
    """
    Get suppliers mapping for a specific variant (Bidirectional requirement).
    """
    from app.models.purchasing import SupplierProduct
    return db.query(SupplierProduct).filter(SupplierProduct.variant_id == id).all()

@router.get("/{id}/stock/locations", response_model=List[Any])
def get_product_stock_breakdown(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
) -> Any:
    """
    Get stock breakdown by facility for a specific product.
    """
    from app.models.inventory import InventorySnapshot, ProductVariant
    from app.models.core import Facility
    
    variants = db.query(ProductVariant).filter(ProductVariant.product_id == id).all()
    variant_ids = [v.id for v in variants]
    variant_map = {v.id: v.sku for v in variants}
    
    if not variant_ids:
        return []
        
    snapshots = db.query(InventorySnapshot, Facility).\
        join(Facility, Facility.id == InventorySnapshot.facility_id).\
        filter(InventorySnapshot.variant_id.in_(variant_ids)).all()
        
    results = []
    for snap, facility in snapshots:
        if snap.stock_qty > 0 or snap.stock_qty < 0:
            results.append({
                "facility_id": facility.id,
                "facility_name": facility.name,
                "variant_id": snap.variant_id,
                "variant_sku": variant_map.get(snap.variant_id, 'UNKNOWN'),
                "stock_qty": float(snap.stock_qty)
            })
            
    return results

@router.get("/by-code/{code}")
def get_product_by_code(
    code: str,
    facility_id: Optional[int] = Query(None),
    db: Session = Depends(deps.get_db),
) -> Any:
    """
    Look up product variant by barcode or SKU and return complete pricing, active promotion, margins, and facility stock breakdown.
    """
    from app.models.inventory import ProductBarcode, ProductVariant, ProductFacilityPrice, InventorySnapshot
    from app.models.core import Facility, Currency, SystemSettings
    from datetime import datetime, timezone
    from decimal import Decimal

    code_clean = code.strip().upper()

    # 1. Search in ProductBarcode
    barcode_record = db.query(ProductBarcode).filter(ProductBarcode.barcode == code_clean).first()

    variant = None
    uom = None
    matched_barcode = None

    if barcode_record:
        variant = db.query(ProductVariant).filter(ProductVariant.id == barcode_record.product_variant_id).first()
        uom = barcode_record.uom
        matched_barcode = barcode_record.barcode
    else:
        # 2. Search in ProductVariant (SKU or barcode directly)
        variant = db.query(ProductVariant).filter(
            (ProductVariant.sku == code_clean) | (ProductVariant.barcode == code_clean)
        ).first()
        if variant:
            uom = variant.product.uom_base if variant.product else "PZA"
            matched_barcode = variant.barcode or variant.sku

    if not variant:
        raise HTTPException(status_code=404, detail="Product variant not found")

    product = variant.product
    if not product:
        raise HTTPException(status_code=404, detail="Product maestro not found")

    # Get exchange rate
    ves_currency = db.query(Currency).filter(Currency.code == "VES").first()
    rate = ves_currency.exchange_rate if ves_currency else Decimal("40.0")

    # Resolve target facility_id (default to the first active facility, or 1 if none found)
    if not facility_id:
        facility = db.query(Facility).filter(Facility.is_active == True).first()
        facility_id = facility.id if facility else 1

    facility_price = db.query(ProductFacilityPrice).filter(
        ProductFacilityPrice.variant_id == variant.id,
        ProductFacilityPrice.facility_id == facility_id
    ).first()

    # Check active promotion
    has_promo = False
    promo_price_usd = None
    promo_price_ves = None
    promo_ends_at = None

    if facility_price and facility_price.promo_price is not None:
        promo_start = facility_price.promo_start_at
        promo_end = facility_price.promo_end_at

        current_time = datetime.now(timezone.utc)
        is_started = True
        is_ended = False

        if promo_start:
            if promo_start.tzinfo is None:
                promo_start = promo_start.replace(tzinfo=timezone.utc)
            is_started = current_time >= promo_start
        if promo_end:
            if promo_end.tzinfo is None:
                promo_end = promo_end.replace(tzinfo=timezone.utc)
            is_ended = current_time > promo_end

        if is_started and not is_ended:
            has_promo = True
            promo_price_usd = float(facility_price.promo_price)
            promo_price_ves = float(facility_price.promo_price * rate)
            promo_ends_at = promo_end.isoformat() if promo_end else None

    reg_price_usd = float(facility_price.sales_price) if (facility_price and facility_price.sales_price is not None) else float(variant.sales_price or 0)
    reg_price_ves = float(Decimal(str(reg_price_usd)) * rate)

    # Calculate margins
    settings = db.query(SystemSettings).first()
    utility_calc_method = settings.utility_calc_method if settings else 'MARGIN_ON_SALES'
    replacement_cost = float(variant.replacement_cost or 0)

    regular_margin_pct = 0.0
    promo_margin_pct = 0.0

    if reg_price_usd > 0:
        if utility_calc_method == 'MARGIN_ON_SALES':
            regular_margin_pct = ((reg_price_usd - replacement_cost) / reg_price_usd) * 100.0
        else:
            regular_margin_pct = ((reg_price_usd - replacement_cost) / replacement_cost) * 100.0 if replacement_cost > 0 else 0.0

    if has_promo and promo_price_usd and promo_price_usd > 0:
        if utility_calc_method == 'MARGIN_ON_SALES':
            promo_margin_pct = ((promo_price_usd - replacement_cost) / promo_price_usd) * 100.0
        else:
            promo_margin_pct = ((promo_price_usd - replacement_cost) / replacement_cost) * 100.0 if replacement_cost > 0 else 0.0

    # Stock breakdown
    facilities = db.query(Facility).filter(Facility.is_active == True).all()
    snapshots = db.query(InventorySnapshot).filter(InventorySnapshot.variant_id == variant.id).all()
    stock_map = {s.facility_id: float(s.stock_qty) for s in snapshots}

    by_facility = []
    total_consolidated = 0.0
    for fac in facilities:
        qty = stock_map.get(fac.id, 0.0)
        total_consolidated += qty
        by_facility.append({
            "facility_id": fac.id,
            "facility_name": fac.name,
            "quantity": qty
        })

    return {
        "variant_id": variant.id,
        "sku": variant.sku,
        "barcode": matched_barcode,
        "name": product.name,
        "brand": product.brand or "",
        "uom": uom or "PZA",
        "costs": {
            "standard_cost": float(variant.standard_cost or 0),
            "replacement_cost": replacement_cost,
            "average_cost": float(variant.average_cost or 0)
        },
        "prices": {
            "regular_price_usd": reg_price_usd,
            "regular_price_ves": reg_price_ves,
            "has_promo": has_promo,
            "promo_price_usd": promo_price_usd,
            "promo_price_ves": promo_price_ves,
            "promo_ends_at": promo_ends_at
        },
        "margins": {
            "regular_margin_pct": round(regular_margin_pct, 2),
            "promo_margin_pct": round(promo_margin_pct, 2)
        },
        "stock": {
            "total_consolidated": total_consolidated,
            "by_facility": by_facility
        }
    }
