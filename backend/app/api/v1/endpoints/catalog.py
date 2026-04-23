from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app.models.inventory import Category, Warehouse, Location
from app.models.core import Tribute, Facility, Company, Currency
from app.schemas import catalog as schemas

router = APIRouter()

# =================
# CATEGORIES
# =================
@router.post("/categories", response_model=schemas.Category)
def create_category(
    *,
    db: Session = Depends(deps.get_db),
    category_in: schemas.CategoryCreate,
) -> Any:
    """
    Create new product category.
    """
    # Auto-generate slug if not provided
    if not category_in.slug:
        import re
        category_in.slug = re.sub(r'[^a-zA-Z0-9]', '-', category_in.name.lower())
        
    db_obj = Category(
        name=category_in.name,
        slug=category_in.slug,
        parent_id=category_in.parent_id,
        is_active=category_in.is_active,
        is_liquor=category_in.is_liquor
    )
    db.add(db_obj)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error creating category: {e}") # Log to server console
        raise HTTPException(status_code=400, detail=f"Error creating category: {str(e)}")
        
    db.refresh(db_obj)
    return db_obj

@router.get("/categories", response_model=List[schemas.Category])
def read_categories(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """
    Retrieve categories.
    """
    return db.query(Category).offset(skip).limit(limit).all()

@router.get("/categories/tree", response_model=List[schemas.CategoryTree])
def read_categories_tree(
    db: Session = Depends(deps.get_db),
) -> Any:
    """
    Retrieve categories as a nested tree hierarchy.
    """
    categories_db = db.query(Category).all()
    categories_dict = {cat.id: schemas.CategoryTree.model_validate(cat) for cat in categories_db}
    
    tree = []
    for cat in categories_dict.values():
        if cat.parent_id is None:
            tree.append(cat)
        else:
            parent = categories_dict.get(cat.parent_id)
            if parent:
                parent.children.append(cat)
                
    return tree

@router.get("/categories/{category_id}", response_model=schemas.Category)
def read_category(
    *,
    db: Session = Depends(deps.get_db),
    category_id: int,
) -> Any:
    """
    Get category by ID.
    """
    category = db.query(Category).get(category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category

@router.put("/categories/{category_id}", response_model=schemas.Category)
def update_category(
    *,
    db: Session = Depends(deps.get_db),
    category_id: int,
    category_in: schemas.CategoryCreate,
) -> Any:
    """
    Update a category.
    """
    category = db.query(Category).get(category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
        
    # Validation: Prevent setting parent to itself
    if category_in.parent_id and category_in.parent_id == category_id:
        raise HTTPException(status_code=400, detail="A category cannot be its own parent")

    category.name = category_in.name
    category.parent_id = category_in.parent_id
    category.is_active = category_in.is_active
    category.is_liquor = category_in.is_liquor
    
    # Only update slug if provided explicitly, otherwise keep existing
    if category_in.slug:
        category.slug = category_in.slug
        
    db.commit()
    db.refresh(category)
    return category

@router.delete("/categories/{category_id}", response_model=schemas.Category)
def delete_category(
    *,
    db: Session = Depends(deps.get_db),
    category_id: int,
) -> Any:
    """
    Delete a category. 
    Strict validation: Must not have sub-categories or products.
    """
    category = db.query(Category).get(category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
        
    # 1. Check for Subcategories
    has_children = db.query(Category).filter(Category.parent_id == category_id).count() > 0
    if has_children:
        raise HTTPException(status_code=400, detail="Cannot delete: This category has sub-categories. Delete them first.")
        
    # 2. Check for Products
    # Need to import Product model locally to avoid circular imports if any, 
    # though usually top-level import is fine. Using local is safer here.
    from app.models.inventory import Product
    has_products = db.query(Product).filter(Product.category_id == category_id).count() > 0
    if has_products:
        raise HTTPException(status_code=400, detail="Cannot delete: This category contains products. Reassign or delete them first.")

    db.delete(category)
    db.commit()
    return category

# =================
# LOCATIONS
# =================
@router.get("/warehouses/", response_model=List[schemas.Warehouse])
def read_warehouses(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    return db.query(Warehouse).offset(skip).limit(limit).all()

@router.get("/locations/", response_model=List[schemas.Location])
def read_locations(
    db: Session = Depends(deps.get_db),
    warehouse_id: int = None,
    usage: str = None,
    type: str = None,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """
    List locations with filters.
    """
    query = db.query(Location)
    if warehouse_id:
        query = query.filter(Location.warehouse_id == warehouse_id)
    if usage:
        query = query.filter(Location.usage == usage)
    if type:
        query = query.filter(Location.location_type == type)
        
    return query.offset(skip).limit(limit).all()

# =================
# CURRENCIES
# =================
@router.get("/currencies/", response_model=List[schemas.Currency])
def read_currencies(db: Session = Depends(deps.get_db), skip: int = 0, limit: int = 100) -> Any:
    return db.query(Currency).offset(skip).limit(limit).all()

@router.post("/currencies/", response_model=schemas.Currency)
def create_currency(*, db: Session = Depends(deps.get_db), currency_in: schemas.CurrencyCreate) -> Any:
    db_obj = Currency(
        name=currency_in.name,
        code=currency_in.code,
        symbol=currency_in.symbol,
        exchange_rate=currency_in.exchange_rate,
        is_active=currency_in.is_active
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

# =================
# COMPANIES
# =================
@router.get("/companies/", response_model=List[schemas.Company])
def read_companies(db: Session = Depends(deps.get_db), skip: int = 0, limit: int = 100) -> Any:
    return db.query(Company).offset(skip).limit(limit).all()

@router.post("/companies/", response_model=schemas.Company)
def create_company(*, db: Session = Depends(deps.get_db), company_in: schemas.CompanyCreate) -> Any:
    db_obj = Company(
        name=company_in.name,
        tax_id=company_in.tax_id,
        currency_code=company_in.currency_code
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

# =================
# FACILITIES
# =================
@router.get("/facilities/", response_model=List[schemas.Facility])
def read_facilities(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """
    Retrieve all valid Facilities (Stores/Cost Centers).
    """
    return db.query(Facility).offset(skip).limit(limit).all()

@router.post("/facilities/", response_model=schemas.Facility)
def create_facility(
    *,
    db: Session = Depends(deps.get_db),
    facility_in: schemas.FacilityCreate,
) -> Any:
    """
    Create a new Facility.
    """
    db_obj = Facility(
        company_id=facility_in.company_id,
        name=facility_in.name,
        code=facility_in.code,
        address=facility_in.address,
        is_active=facility_in.is_active
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

@router.put("/facilities/{facility_id}", response_model=schemas.Facility)
def update_facility(
    *,
    db: Session = Depends(deps.get_db),
    facility_id: int,
    facility_in: schemas.FacilityCreate,
) -> Any:
    """
    Update a Facility.
    """
    facility = db.query(Facility).get(facility_id)
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
        
    facility.company_id = facility_in.company_id
    facility.name = facility_in.name
    facility.code = facility_in.code
    facility.address = facility_in.address
    facility.is_active = facility_in.is_active
    
    db.commit()
    db.refresh(facility)
    return facility

# =================
# TRIBUTES (TAXES)
# =================
@router.get("/tributes", response_model=List[schemas.Tribute])
def read_tributes(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """
    Retrieve all valid taxes/tributes (IVA).
    """
    return db.query(Tribute).filter(Tribute.is_active == True).offset(skip).limit(limit).all()
