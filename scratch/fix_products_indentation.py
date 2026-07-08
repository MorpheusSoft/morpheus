import os

path = "/home/lzambrano/Desarrollo/Morpheus/backend/app/api/v1/endpoints/products.py"

with open(path, "r", encoding="utf-8") as file:
    content = file.read()

target = """@router.get("/{id}/stock/locations", response_model=List[Any])
def get_product_stock_breakdown(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
) -> Any:
    \"\"\"
    Get stock breakdown by facility for a specific product.
    \"\"\"
    from app.models.inventory import InventorySnapshot, ProductVariant
    from app.models.core import Facility
    
    variants = db.query(ProductVariant).filter(ProductVariant.product_id == id).all()
    variant_ids = [v.id for v in variants]
        
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
        raise HTTPException(status_code=500, detail=f"Error reading products: {str(e)}")"""

replacement = """@router.get("/{id}/stock/locations", response_model=List[Any])
def get_product_stock_breakdown(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
) -> Any:
    \"\"\"
    Get stock breakdown by facility for a specific product.
    \"\"\"
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
            
    return results"""

content_norm = content.replace("\r\n", "\n")
target_norm = target.replace("\r\n", "\n")
replacement_norm = replacement.replace("\r\n", "\n")

if target_norm in content_norm:
    new_content = content_norm.replace(target_norm, replacement_norm)
    with open(path, "w", encoding="utf-8") as file:
        file.write(new_content)
    print("SUCCESS: Replaced successfully")
else:
    print("FAILED: Target not found")
