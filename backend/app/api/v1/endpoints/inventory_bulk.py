from typing import Any
import csv
import io
import codecs
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from datetime import datetime

from app.api import deps
from app.models.inventory import Product, ProductVariant, Category, Location, StockPickingType
from app.schemas.stock import StockPickingCreate, StockMoveCreate
from app.services.stock_service import StockService

router = APIRouter()

@router.post("/bulk-upload")
def upload_inventory_bulk(
    *,
    db: Session = Depends(deps.get_db),
    file: UploadFile = File(...),
) -> Any:
    """
    Upload a CSV file to bulk create/update products and set their inventory counts.
    Expected CSV columns: sku, name, price, quantity, category
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are allowed.")

    # We read the file contents
    try:
        content = file.file.read()
        decoded_content = content.decode('utf-8')
        # Handle BOM if present
        if decoded_content.startswith(codecs.BOM_UTF8.decode('utf-8')):
            decoded_content = decoded_content[1:]
    except UnicodeDecodeError:
         raise HTTPException(status_code=400, detail="Invalid file encoding. Must be UTF-8.")
         
    csv_reader = csv.DictReader(io.StringIO(decoded_content), delimiter=',')
    
    # Standardize headers to lowercase to be safe
    raw_headers = csv_reader.fieldnames
    if not raw_headers:
        raise HTTPException(status_code=400, detail="Empty CSV file.")
    csv_reader.fieldnames = [str(h).strip().lower() for h in raw_headers]
    
    required_cols = {"sku", "name"}
    if not required_cols.issubset(set(csv_reader.fieldnames)):
        raise HTTPException(status_code=400, detail=f"CSV must contain at least 'sku' and 'name' columns.")

    # 1. Fetch default category or create it
    default_cat = db.query(Category).filter(Category.name == "Importados").first()
    if not default_cat:
        default_cat = Category(name="Importados", description="Productos importados masivamente")
        db.add(default_cat)
        db.flush()

    # 2. Prepare adjustment mechanics for quantity if needed
    adj_type = db.query(StockPickingType).filter(StockPickingType.code == 'ADJ').first()
    if not adj_type:
        loc_loss = db.query(Location).filter(Location.usage == 'EXTERNAL', Location.location_type == 'LOSS').first()
        if not loc_loss:
            loc_loss = Location(
                name="Inventory Adjustment",
                code="VIRTUAL-LOSS",
                usage="EXTERNAL",
                location_type="LOSS",
                warehouse_id=1 # Assuming default WH=1
            )
            db.add(loc_loss)
            db.flush()
        
        adj_type = StockPickingType(
            name="Inventory Adjustments",
            code="ADJ",
            sequence_prefix="INV/ADJ",
            default_location_src_id=loc_loss.id,
            default_location_dest_id=loc_loss.id
        )
        db.add(adj_type)
        db.flush()

    default_internal_loc = db.query(Location).filter(Location.usage == 'INTERNAL').first()
    if not default_internal_loc:
        default_internal_loc = Location(name="Almacén Principal", code="WH-MAIN", usage="INTERNAL", warehouse_id=1)
        db.add(default_internal_loc)
        db.flush()

    stats = {
        "created": 0,
        "updated": 0,
        "errors": []
    }
    moves_to_create = []

    for row_num, row in enumerate(csv_reader, start=2): # 1-based + 1 for header
        sku = row.get("sku", "").strip()
        name = row.get("name", "").strip()
        price_str = row.get("price", "0").strip()
        qty_str = row.get("quantity", "0").strip()
        
        if not sku or not name:
            stats["errors"].append(f"Row {row_num}: Missing SKU or Name.")
            continue
            
        try:
            price = float(price_str) if price_str else 0.0
        except ValueError:
            price = 0.0
            
        try:
            target_qty = float(qty_str) if qty_str else 0.0
        except ValueError:
            target_qty = 0.0

        # Create or Update Product
        variant = db.query(ProductVariant).filter(ProductVariant.sku == sku).first()
        if variant:
            parent_product = db.query(Product).get(variant.product_id)
            if parent_product:
                parent_product.name = name
            variant.sales_price = price
            stats["updated"] += 1
        else:
            # New Product
            parent_product = Product(
                name=name,
                category_id=default_cat.id,
                product_type="STOCKED",
                uom_base="PZA",
                has_variants=False,
                is_active=True
            )
            db.add(parent_product)
            db.flush() # Get ID
            
            variant = ProductVariant(
                product_id=parent_product.id,
                sku=sku,
                sales_price=price,
                standard_cost=0,
                replacement_cost=0,
                is_published=True,
                is_active=True
            )
            db.add(variant)
            db.flush()
            stats["created"] += 1
            
        # Handle Stock Adjustment
        if "quantity" in csv_reader.fieldnames:
             current_stock = StockService.get_stock_quantity(db, variant.id, default_internal_loc.id)
             diff = target_qty - current_stock
             
             if diff != 0:
                 if diff > 0:
                     # Add stock
                     src = adj_type.default_location_src_id
                     dest = default_internal_loc.id
                     qty = diff
                 else:
                     # Remove stock
                     src = default_internal_loc.id
                     dest = adj_type.default_location_dest_id
                     qty = abs(diff)
                     
                 moves_to_create.append(StockMoveCreate(
                     product_id=variant.id,
                     location_src_id=src,
                     location_dest_id=dest,
                     quantity_demand=qty,
                     uom_id="PZA"
                 ))

    # Commit Products
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error saving products: {str(e)}")

    # Process Moves in bulk picking if any
    if moves_to_create:
        picking_in = StockPickingCreate(
            picking_type_id=adj_type.id,
            facility_id=1, # Default facility
            origin_document=f"CSV-IMPORT-{datetime.now().strftime('%Y%m%d%H%M')}"
        )
        
        try:
            picking = StockService.create_picking(db, picking_in, moves_to_create)
            StockService.validate_picking(db, picking.id)
            db.commit()
            stats["stock_moves_created"] = len(moves_to_create)
        except Exception as e:
            db.rollback()
            stats["errors"].append(f"Failed to process stock: {str(e)}")
            
    return stats
