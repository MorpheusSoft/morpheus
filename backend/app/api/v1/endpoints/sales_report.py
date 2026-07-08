from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime

from app.api import deps
from app.models.inventory import Product, ProductVariant
from app.models.core import Facility
from app.models.sales import Document, DocumentLine

router = APIRouter()

@router.get("/")
def get_sales_by_facility(
    db: Session = Depends(deps.get_db),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    code_type: str = Query("SKU", description="Code type to return (SKU or BARCODE)"),
    supplier_id: Optional[int] = Query(None, description="Filter by Supplier ID"),
    search_term: Optional[str] = Query(None, description="Filter by Product Name/SKU/Barcode"),
) -> Any:
    # 1. Fetch active facilities
    active_facilities = db.query(Facility).filter(Facility.is_active == True).order_by(Facility.id).all()
    facilities_data = [
        {"id": f.id, "name": f.name, "code": f.code}
        for f in active_facilities
    ]
    
    # 2. Query document lines and aggregate quantities
    query = db.query(
        ProductVariant.sku.label("sku"),
        ProductVariant.barcode.label("barcode"),
        Product.name.label("product_name"),
        Document.facility_id.label("facility_id"),
        func.sum(DocumentLine.quantity).label("total_qty")
    ).select_from(DocumentLine)\
     .join(Document, Document.id == DocumentLine.document_id)\
     .join(ProductVariant, ProductVariant.id == DocumentLine.variant_id)\
     .join(Product, Product.id == ProductVariant.product_id)\
     .filter(Document.type == 'INVOICE')\
     .filter(Document.state != 'CANCELLED')
     
    if start_date:
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            query = query.filter(Document.created_at >= start_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid start_date format. Use YYYY-MM-DD.")
            
    if end_date:
        try:
            end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59, microsecond=999999)
            query = query.filter(Document.created_at <= end_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid end_date format. Use YYYY-MM-DD.")

    if supplier_id:
        from app.models.purchasing import SupplierProduct
        query = query.filter(ProductVariant.id.in_(
            db.query(SupplierProduct.variant_id).filter(SupplierProduct.supplier_id == supplier_id)
        ))

    if search_term:
        term = f"%{search_term}%"
        query = query.filter(
            (Product.name.ilike(term)) |
            (ProductVariant.sku.ilike(term)) |
            (ProductVariant.barcode.ilike(term))
        )
            
    query = query.group_by(
        ProductVariant.sku,
        ProductVariant.barcode,
        Product.name,
        Document.facility_id
    )
    
    results = query.all()
    
    # 3. Organize in Python
    sales_map = {}
    for row in results:
        code = row.barcode if code_type.upper() == "BARCODE" else row.sku
        if not code:
            code = row.sku or row.barcode or "UNKNOWN"
            
        key = (code, row.product_name)
        if key not in sales_map:
            sales_map[key] = {}
            
        facility_id = row.facility_id
        qty = float(row.total_qty or 0)
        sales_map[key][facility_id] = sales_map[key].get(facility_id, 0.0) + qty
        
    rows = []
    for (code, name), facility_sales in sales_map.items():
        rows.append({
            "code": code,
            "name": name,
            "sales": facility_sales
        })
        
    # Order by product name for consistent UI display
    rows.sort(key=lambda x: x["name"])
        
    return {
        "facilities": facilities_data,
        "rows": rows
    }
