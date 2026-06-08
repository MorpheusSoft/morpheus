from fastapi import APIRouter, Depends
from typing import List, Optional
from pydantic import BaseModel
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.api import deps
from app.models.inventory import Product, ProductVariant, Category, ProductFacilityPrice, ProductBarcode
from app.models.core import Currency, Tribute

router = APIRouter()

class LegacyProduct(BaseModel):
    c_Codigo: str
    c_Descri: str
    c_Departamento: str
    n_CostoAct: float
    n_precio1: float
    n_Impuesto1: float
    moneda: str
    c_Marca: Optional[str] = None
    imagen: Optional[str] = None

@router.post("/products-legacy")
def import_products_legacy(
    products_in: List[LegacyProduct],
    session: Session = Depends(deps.get_db)
):
    print("Iniciando limpieza de tablas de productos...")
    session.execute(text("TRUNCATE TABLE inv.products, inv.product_variants, inv.product_facility_prices CASCADE;"))
    session.commit()
    
    print("Iniciando carga Maestro de Productos con nueva estructura...")
    
    # 1. Obtener monedas
    currencies = {c.code.upper(): c.id for c in session.query(Currency).all()}
    default_currency_id = currencies.get('USD') or currencies.get('VES') or 1
    
    # Obtener Impuestos
    taxes_db = session.query(Tribute).all()
    def get_tax_id(rate: float):
        for t in taxes_db:
            if t.rate == Decimal(str(rate)) or float(t.rate) == rate:
                return t.id
        if rate == 0: return 1 
        return None
        
    # 2. Categorías 
    cat_cache = {}
    for cat in session.query(Category).all():
        if cat.slug:
            part = cat.slug.split('-')[-1]
            cat_cache[part] = cat.id
            
    count = 0
    for p in products_in:
        legacy_stellar_code = p.c_Codigo.strip()
        if legacy_stellar_code.lower() in ('codigo', 'sku'): continue
        
        name = p.c_Descri.strip()
        cat_code = p.c_Departamento.strip()
        
        cost = Decimal(str(p.n_CostoAct))
        price = Decimal(str(p.n_precio1))
        tax_rate = float(p.n_Impuesto1)
        
        currency_code = p.moneda.strip().upper()
        brand = p.c_Marca.strip() if p.c_Marca else None
        if brand and brand.upper() == "NULL": brand = None
        img = p.imagen.strip() if p.imagen else None
        if img and img.upper() == "NULL": img = None
        
        curr_id = currencies.get(currency_code, default_currency_id)
        cat_id = cat_cache.get(cat_code, None)
        tax_id = get_tax_id(tax_rate)
        
        # Calculate Utility Pct (MarkUp)
        margin_pct = Decimal(0)
        if cost > 0:
            margin_pct = ((price - cost) / cost) * Decimal(100)
        elif price > 0:
            margin_pct = Decimal(100)
        
        # Evitar desbordamiento en Numeric(5,2) (Max 999.99)
        margin_pct = min(round(margin_pct, 2), Decimal('999.99'))
            
        parent_product = Product(
            name=name,
            category_id=cat_id,
            currency_id=curr_id,
            tax_id=tax_id,
            brand=brand,
            product_type='STOCKED',
            uom_base='PZA',
            origin='NACIONAL',
            is_active=True,
            has_variants=False,
            image_main=img
        )
        session.add(parent_product)
        session.flush() 
        
        new_variant = ProductVariant(
            product_id=parent_product.id,
            sku=f"PRD-{parent_product.id}",
            currency_id=curr_id,
            standard_cost=cost,
            last_cost=cost,
            average_cost=cost,
            sales_price=price,
            is_active=True
        )
        session.add(new_variant)
        session.flush()
        
        stellar_barcode = ProductBarcode(
            product_variant_id=new_variant.id,
            barcode=legacy_stellar_code,
            code_type='STELLAR_CODE',
            uom="UND",
            conversion_factor=1.0
        )
        session.add(stellar_barcode)
        
        facility_price = ProductFacilityPrice(
            variant_id=new_variant.id,
            facility_id=1,
            sales_price=price,
            target_utility_pct=margin_pct
        )
        session.add(facility_price)
        
        count += 1
        if count % 500 == 0:
            session.commit()
            print(f"  ... Insertados {count} productos")
            
    session.commit()
    print(f"✅ ¡Carga Maestro terminada! Total productos procesados con Costo, Impuesto y Margen Utilidad: {count}")

    return {"message": "Success", "imported": count}

class LegacyBarcode(BaseModel):
    c_Codigo: str
    c_CodAlterno: str
    n_Cantidad: Optional[float] = 1.0

@router.post("/products-barcodes-legacy")
def import_barcodes_legacy(
    barcodes_in: List[LegacyBarcode],
    session: Session = Depends(deps.get_db)
):
    print("Iniciando carga de Códigos Alternos (Barras)...")
    
    count = 0
    not_found = 0
    
    # Pre-cache variants based on STELLAR_CODE to optimize inserts
    stellar_codes_db = session.query(ProductBarcode).filter(ProductBarcode.code_type == 'STELLAR_CODE').all()
    variant_map = {bc.barcode: bc.product_variant_id for bc in stellar_codes_db}
    
    for b in barcodes_in:
        stellar_code = b.c_Codigo.strip()
        alterno = b.c_CodAlterno.strip()
        
        if not alterno or alterno.lower() in ('codigo', 'sku'):
            continue
            
        variant_id = variant_map.get(stellar_code)
        
        if not variant_id:
            not_found += 1
            continue
            
        # Check if barcode already exists for this variant to avoid duplicates
        existing = session.query(ProductBarcode).filter(
            ProductBarcode.product_variant_id == variant_id,
            ProductBarcode.barcode == alterno
        ).first()
        
        if not existing:
            new_barcode = ProductBarcode(
                product_variant_id=variant_id,
                barcode=alterno,
                code_type='BARCODE',
                uom="UND",
                conversion_factor=b.n_Cantidad or 1.0
            )
            session.add(new_barcode)
            count += 1
            
            if count % 1000 == 0:
                session.commit()
                print(f"  ... Insertados {count} códigos de barra")
                
    session.commit()
    print(f"✅ ¡Carga de Códigos terminada! Insertados: {count}, No encontrados: {not_found}")
    return {"message": "Success", "imported": count, "not_found": not_found}
