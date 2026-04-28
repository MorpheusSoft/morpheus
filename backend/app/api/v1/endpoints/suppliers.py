from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Any
from app.api.deps import get_db
from app.models.core import Supplier, SupplierBank
from app.models.purchasing import SupplierProduct
from app.schemas.supplier import SupplierCreate, SupplierUpdate, SupplierResponse, SupplierProductResponse, SupplierProductCreate, SupplierPaginated
router = APIRouter()

@router.get("/install_cost_trigger")
def install_cost_trigger(db: Session = Depends(get_db)):
    from sqlalchemy import text
    sql = """
    ALTER TABLE pur.supplier_products ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT FALSE;

    CREATE OR REPLACE FUNCTION pur.sync_replacement_cost()
    RETURNS TRIGGER AS $$
    BEGIN
        IF pg_trigger_depth() > 1 THEN
            RETURN NEW;
        END IF;

        IF NEW.is_primary = TRUE THEN
            UPDATE pur.supplier_products
            SET is_primary = FALSE
            WHERE variant_id = NEW.variant_id
              AND id != NEW.id
              AND is_primary = TRUE;

            UPDATE inv.product_variants
            SET replacement_cost = NEW.replacement_cost
            WHERE id = NEW.variant_id;
            
            UPDATE inv.products
            SET replacement_cost = NEW.replacement_cost
            WHERE id = (SELECT product_id FROM inv.product_variants WHERE id = NEW.variant_id);
        END IF;
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_sync_replacement_cost ON pur.supplier_products;
    CREATE TRIGGER trg_sync_replacement_cost
    AFTER INSERT OR UPDATE ON pur.supplier_products
    FOR EACH ROW
    WHEN (NEW.is_primary = TRUE)
    EXECUTE FUNCTION pur.sync_replacement_cost();
    """
    try:
        db.execute(text(sql))
        db.commit()
        return {"ok": True, "msg": "Trigger and columns installed."}
    except Exception as e:
        db.rollback()
        return {"error": str(e)}

@router.get("/", response_model=SupplierPaginated)
def get_suppliers(db: Session = Depends(get_db), skip: int = 0, limit: int = 100, q: str = None) -> Any:
    from sqlalchemy import or_
    query = db.query(Supplier)
    
    if q:
        query = query.filter(
            or_(
                Supplier.name.ilike(f"%{q}%"),
                Supplier.tax_id.ilike(f"%{q}%"),
                Supplier.commercial_email.ilike(f"%{q}%")
            )
        )
        
    total = query.count()
    suppliers = query.offset(skip).limit(limit).all()
    
    return {"data": suppliers, "total": total}

@router.get("/{supplier_id}", response_model=SupplierResponse)
def get_supplier(supplier_id: int, db: Session = Depends(get_db)) -> Any:
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return supplier

@router.post("/", response_model=SupplierResponse)
def create_supplier(*, db: Session = Depends(get_db), supplier_in: SupplierCreate) -> Any:
    existing = db.query(Supplier).filter(Supplier.tax_id == supplier_in.tax_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Supplier with this tax_id already exists")
    
    supplier_data = supplier_in.model_dump(exclude={"banks"})
    supplier = Supplier(**supplier_data)
    
    if supplier_in.banks:
        for bank_in in supplier_in.banks:
            bank = SupplierBank(**bank_in.model_dump())
            supplier.banks.append(bank)
            
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier

@router.put("/{supplier_id}", response_model=SupplierResponse)
def update_supplier(*, db: Session = Depends(get_db), supplier_id: int, supplier_in: SupplierUpdate) -> Any:
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
        
    update_data = supplier_in.model_dump(exclude={"banks"}, exclude_unset=True)
    for field, value in update_data.items():
        setattr(supplier, field, value)
        
    if supplier_in.banks is not None:
        # Simple replace strategy: delete old banks, create new ones
        db.query(SupplierBank).filter(SupplierBank.supplier_id == supplier_id).delete()
        for bank_in in supplier_in.banks:
            bank_data = bank_in.model_dump(exclude={"id"}, exclude_unset=True)
            bank = SupplierBank(supplier_id=supplier_id, **bank_data)
            db.add(bank)
            
    db.commit()
    db.refresh(supplier)
    db.refresh(supplier)
    return supplier


@router.get("/{supplier_id}/catalog")
def get_supplier_catalog(supplier_id: int, category_id: int = None, db: Session = Depends(get_db)) -> Any:
    from app.models.inventory import ProductVariant, Product, Category, ProductPackaging
    
    query = db.query(SupplierProduct, ProductVariant, Product, ProductPackaging)\
        .join(ProductVariant, SupplierProduct.variant_id == ProductVariant.id)\
        .join(Product, ProductVariant.product_id == Product.id)\
        .outerjoin(ProductPackaging, SupplierProduct.pack_id == ProductPackaging.id)\
        .filter(SupplierProduct.supplier_id == supplier_id)
        
    if category_id:
        query = query.join(Category, Product.category_id == Category.id).filter(
            (Category.id == category_id) | (Category.path.like(f"%/{category_id}/%"))
        )
        
    results = query.all()
    
    catalog = []
    for sp, pv, p, pack in results:
        catalog.append({
            "id": sp.id,
            "supplier_id": sp.supplier_id,
            "variant_id": sp.variant_id,
            "supplier_sku": sp.supplier_sku,
            "pack_id": sp.pack_id,
            "currency_id": sp.currency_id,
            "replacement_cost": sp.replacement_cost,
            "min_order_qty": sp.min_order_qty,
            "is_active": sp.is_active,
            "is_primary": sp.is_primary,
            "product_name": p.name,
            "variant_sku": pv.sku,
            "pack_name": pack.name if pack else "Und.",
            "qty_per_unit": pack.qty_per_unit if pack else 1
        })
        
    return catalog

@router.put("/{supplier_id}/catalog", response_model=List[SupplierProductResponse])
def sync_supplier_catalog(*, db: Session = Depends(get_db), supplier_id: int, items_in: List[SupplierProductCreate]) -> Any:
    # Patrón Upsert para preservar variables de auditoría nativas (como updated_at) 
    existing = db.query(SupplierProduct).filter(SupplierProduct.supplier_id == supplier_id).all()
    existing_map = {e.variant_id: e for e in existing}
    
    seen = set()
    new_items = []
    
    for inc in items_in:
        if inc.variant_id not in seen:
            seen.add(inc.variant_id)
            if inc.variant_id in existing_map:
                # Update existente (SQLAlchemy alterará el 'updated_at' SÓLO si hay una diferencia en los valores)
                item = existing_map[inc.variant_id]
                item.replacement_cost = inc.replacement_cost
                item.min_order_qty = inc.min_order_qty
                item.pack_id = inc.pack_id
                item.currency_id = inc.currency_id
                new_items.append(item)
                del existing_map[inc.variant_id]  # Quitar del mapa para no borrarlo
            else:
                # Insert nuevo
                item = SupplierProduct(
                    supplier_id=supplier_id,
                    variant_id=inc.variant_id,
                    supplier_sku=inc.supplier_sku,
                    pack_id=inc.pack_id,
                    currency_id=inc.currency_id,
                    replacement_cost=inc.replacement_cost,
                    min_order_qty=inc.min_order_qty,
                    is_active=inc.is_active
                )
                db.add(item)
                new_items.append(item)
            
    # Purge orphans
    for orphan in existing_map.values():
        db.delete(orphan)
        
    db.commit()
    for obj in new_items:
        db.refresh(obj)
    return new_items

@router.post("/{supplier_id}/catalog", response_model=SupplierProductResponse)
def add_product_to_catalog(*, db: Session = Depends(get_db), supplier_id: int, item_in: SupplierProductCreate) -> Any:
    if item_in.supplier_id != supplier_id:
        raise HTTPException(status_code=400, detail="Supplier ID mismatch")
    try:
        item = SupplierProduct(**item_in.model_dump())
        db.add(item)
        db.commit()
        db.refresh(item)
        return item
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e.__class__.__name__) + ': ' + str(e.__cause__ if hasattr(e, '__cause__') else e))

@router.delete("/{supplier_id}/catalog/{catalog_id}")
def delete_from_catalog(supplier_id: int, catalog_id: int, db: Session = Depends(get_db)) -> Any:
    item = db.query(SupplierProduct).filter(SupplierProduct.id == catalog_id, SupplierProduct.supplier_id == supplier_id).first()
    if not item:
         raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return {"ok": True}
