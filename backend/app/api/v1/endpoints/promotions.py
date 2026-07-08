from typing import Any, List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app.models.inventory import ProductFacilityPrice, ProductVariant, Product, Category
from app.models.purchasing import SupplierProduct
from app.models.core import Facility, SystemSettings
from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime

router = APIRouter()

class PromotionUpdate(BaseModel):
    variant_id: int
    facility_id: int
    promo_price: Optional[Decimal] = None
    promo_target_utility_pct: Optional[Decimal] = None
    promo_start_at: Optional[datetime] = None
    promo_end_at: Optional[datetime] = None

class PromotionResponse(BaseModel):
    variant_id: int
    facility_id: int
    sales_price: Decimal
    target_utility_pct: Optional[Decimal] = None
    promo_price: Optional[Decimal] = None
    promo_target_utility_pct: Optional[Decimal] = None
    promo_start_at: Optional[datetime] = None
    promo_end_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class VariantPromoInput(BaseModel):
    variant_id: int
    promo_price: float

class BulkPromotionApply(BaseModel):
    name: str
    supplier_ids: List[int]
    category_ids: List[int]
    facility_ids: List[int]
    variant_ids: Optional[List[int]] = None
    discount_pct: Optional[float] = None
    fixed_price: Optional[float] = None
    start_at: datetime
    end_at: datetime
    custom_prices: Optional[List[VariantPromoInput]] = None

class CampaignResponse(BaseModel):
    id: int
    name: str
    discount_pct: Optional[Decimal] = None
    fixed_price: Optional[Decimal] = None
    start_at: datetime
    end_at: datetime
    status: str
    created_at: datetime
    scope: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True

@router.put("/", response_model=PromotionResponse)
def update_promotional_price(
    *,
    db: Session = Depends(deps.get_db),
    promotion_in: PromotionUpdate,
) -> Any:
    """
    Update promotional price settings for a product variant at a specific facility.
    """
    variant = db.query(ProductVariant).filter(ProductVariant.id == promotion_in.variant_id).first()
    if not variant:
        raise HTTPException(status_code=404, detail="Product variant not found")

    db_price = db.query(ProductFacilityPrice).filter(
        ProductFacilityPrice.variant_id == promotion_in.variant_id,
        ProductFacilityPrice.facility_id == promotion_in.facility_id
    ).first()

    if not db_price:
        db_price = ProductFacilityPrice(
            variant_id=promotion_in.variant_id,
            facility_id=promotion_in.facility_id,
            sales_price=variant.sales_price or 0,
            target_utility_pct=None
        )
        db.add(db_price)

    db_price.promo_price = promotion_in.promo_price
    db_price.promo_target_utility_pct = promotion_in.promo_target_utility_pct
    db_price.promo_start_at = promotion_in.promo_start_at
    db_price.promo_end_at = promotion_in.promo_end_at

    try:
        db.commit()
        db.refresh(db_price)
        return db_price
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error updating promotional price: {str(e)}")

@router.get("/variant/{variant_id}", response_model=List[PromotionResponse])
def get_promotions_by_variant(
    variant_id: int,
    db: Session = Depends(deps.get_db)
) -> Any:
    """
    Get all facility prices/promotions for a variant.
    """
    prices = db.query(ProductFacilityPrice).filter(ProductFacilityPrice.variant_id == variant_id).all()
    return prices

@router.post("/apply-bulk")
def apply_bulk_promotion(
    *,
    db: Session = Depends(deps.get_db),
    bulk_in: BulkPromotionApply,
) -> Any:
    """
    Apply promotions to products in bulk based on supplier, category and facility filters.
    """
    from app.models.inventory import PromotionCampaign, PromotionCampaignLine
    
    try:
        query = db.query(ProductVariant).join(Product, ProductVariant.product_id == Product.id)
        
        # Filter by specific variants if provided
        if bulk_in.variant_ids:
            query = query.filter(ProductVariant.id.in_(bulk_in.variant_ids))
        else:
            # Filter by suppliers
            if bulk_in.supplier_ids:
                query = query.join(SupplierProduct, SupplierProduct.variant_id == ProductVariant.id) \
                             .filter(SupplierProduct.supplier_id.in_(bulk_in.supplier_ids))
                             
            # Filter by categories
            if bulk_in.category_ids:
                query = query.join(Category, Category.id == Product.category_id)
                cats = db.query(Category).filter(Category.id.in_(bulk_in.category_ids)).all()
                cat_conditions = []
                for c in cats:
                    cat_conditions.append(Category.id == c.id)
                    if c.path:
                        cat_conditions.append(Category.path.like(f"{c.path}/%"))
                if cat_conditions:
                    from sqlalchemy import or_
                    query = query.filter(or_(*cat_conditions))
                
        variants = query.distinct().all()
        
        if not variants:
            return {"message": "No matching products found", "updated_count": 0}
            
        # Target facilities
        if not bulk_in.facility_ids:
            facilities = db.query(Facility).filter(Facility.is_active == True).all()
            target_facility_ids = [f.id for f in facilities]
        else:
            target_facility_ids = bulk_in.facility_ids
            
        settings = db.query(SystemSettings).first()
        utility_calc_method = settings.utility_calc_method if settings else 'MARGIN_ON_SALES'
        
        # Create campaign record
        campaign = PromotionCampaign(
            name=bulk_in.name,
            discount_pct=Decimal(bulk_in.discount_pct) if bulk_in.discount_pct is not None else None,
            fixed_price=Decimal(bulk_in.fixed_price) if bulk_in.fixed_price is not None else None,
            start_at=bulk_in.start_at,
            end_at=bulk_in.end_at,
            status="ACTIVE",
            scope={
                "supplier_ids": bulk_in.supplier_ids,
                "category_ids": bulk_in.category_ids,
                "facility_ids": bulk_in.facility_ids,
                "variant_ids": bulk_in.variant_ids,
                "discount_pct": bulk_in.discount_pct,
                "fixed_price": bulk_in.fixed_price
            }
        )
        db.add(campaign)
        db.flush() # Populate campaign.id
        
        # Map custom simulation prices edited by the user
        custom_price_map = {}
        if bulk_in.custom_prices:
            custom_price_map = {item.variant_id: Decimal(item.promo_price) for item in bulk_in.custom_prices}
        
        updated_count = 0
        for variant in variants:
            replacement_cost = variant.replacement_cost or Decimal(0)
            
            for facility_id in target_facility_ids:
                db_price = db.query(ProductFacilityPrice).filter(
                    ProductFacilityPrice.variant_id == variant.id,
                    ProductFacilityPrice.facility_id == facility_id
                ).first()
                
                base_sales_price = db_price.sales_price if db_price else variant.sales_price
                if base_sales_price is None:
                    base_sales_price = Decimal(0)
                
                # Determine promo price
                if variant.id in custom_price_map:
                    promo_price = custom_price_map[variant.id]
                elif bulk_in.fixed_price is not None:
                    promo_price = Decimal(bulk_in.fixed_price)
                elif bulk_in.discount_pct is not None:
                    promo_price = base_sales_price * Decimal(1 - bulk_in.discount_pct / 100.0)
                else:
                    continue
                    
                promo_target_utility_pct = None
                if replacement_cost > 0:
                    if utility_calc_method == 'MARGIN_ON_SALES':
                        if promo_price > 0:
                            promo_target_utility_pct = ((promo_price - replacement_cost) / promo_price) * Decimal(100.0)
                    else: # MARKUP_ON_COST
                        promo_target_utility_pct = ((promo_price - replacement_cost) / replacement_cost) * Decimal(100.0)
                        
                if not db_price:
                    db_price = ProductFacilityPrice(
                        variant_id=variant.id,
                        facility_id=facility_id,
                        sales_price=base_sales_price,
                        target_utility_pct=None
                    )
                    db.add(db_price)
                    
                db_price.promo_price = promo_price
                db_price.promo_target_utility_pct = promo_target_utility_pct
                db_price.promo_start_at = bulk_in.start_at
                db_price.promo_end_at = bulk_in.end_at
                
                # Write campaign line
                line = PromotionCampaignLine(
                    campaign_id=campaign.id,
                    variant_id=variant.id,
                    facility_id=facility_id,
                    applied_promo_price=promo_price
                )
                db.add(line)
                
                updated_count += 1
                
        db.commit()
        return {"message": "Bulk promotion applied successfully", "updated_count": updated_count, "campaign_id": campaign.id}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error applying bulk promotions: {str(e)}")


@router.get("/campaigns", response_model=List[CampaignResponse])
def get_campaigns(
    db: Session = Depends(deps.get_db)
) -> Any:
    """
    Get all promotion campaigns ordered by creation date descending.
    """
    from app.models.inventory import PromotionCampaign
    campaigns = db.query(PromotionCampaign).order_by(PromotionCampaign.created_at.desc()).all()
    return campaigns


@router.post("/campaigns/{id}/void")
def void_campaign(
    id: int,
    db: Session = Depends(deps.get_db)
) -> Any:
    """
    Void/cancel a promotion campaign and remove its promotional pricing.
    """
    from app.models.inventory import PromotionCampaign, PromotionCampaignLine, ProductFacilityPrice
    campaign = db.query(PromotionCampaign).filter(PromotionCampaign.id == id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign.status == "CANCELLED":
        raise HTTPException(status_code=400, detail="Campaign is already cancelled")
        
    # Get all lines
    lines = db.query(PromotionCampaignLine).filter(PromotionCampaignLine.campaign_id == campaign.id).all()
    
    for line in lines:
        # Find product facility price
        db_price = db.query(ProductFacilityPrice).filter(
            ProductFacilityPrice.variant_id == line.variant_id,
            ProductFacilityPrice.facility_id == line.facility_id
        ).first()
        if db_price:
            db_price.promo_price = None
            db_price.promo_target_utility_pct = None
            db_price.promo_start_at = None
            db_price.promo_end_at = None
            
    campaign.status = "CANCELLED"
    try:
        db.commit()
        return {"message": "Campaign voided successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error voiding campaign: {str(e)}")

