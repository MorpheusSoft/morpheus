import sys
import os
import csv
from decimal import Decimal, InvalidOperation

sys.path.append(os.path.join(os.path.dirname(__file__)))

from sqlalchemy.orm import Session
from sqlalchemy import text
from app.api.deps import engine
from app.models.inventory import Product, ProductVariant, Category, ProductFacilityPrice, ProductBarcode
from app.models.core import Currency, Tribute

def import_products():
    with Session(engine) as session:
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
                
        base_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data_import', 'productos_base.csv')
        
        if not os.path.exists(base_path):
            print(f"Error: No se encontró el archivo: {base_path}")
            return
            
        count = 0
        with open(base_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.reader(f, delimiter=';')
            for row in reader:
                if len(row) < 9: continue
                # Codigo, descripcion , categoria, Costo actual, n_Precio, Impuesto, moneda, Marca, imagen
                
                legacy_stellar_code = str(row[0]).strip()
                if legacy_stellar_code.lower() in ('codigo', 'sku'): continue
                
                name = str(row[1]).strip()
                cat_code = str(row[2]).strip()
                
                try:
                    cost_val = str(row[3]).replace(',','.').strip() or "0"
                    cost = Decimal(cost_val)
                    
                    price_val = str(row[4]).replace(',','.').strip() or "0"
                    price = Decimal(price_val)
                    
                    tax_val = str(row[5]).replace(',','.').replace('%','').strip() or "0"
                    tax_rate = float(tax_val)
                except InvalidOperation:
                    continue
                
                currency_code = str(row[6]).strip().upper()
                brand = str(row[7]).strip()
                if brand.upper() == "NULL": brand = None
                img = str(row[8]).strip()
                if img.upper() == "NULL": img = None
                
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

if __name__ == "__main__":
    import_products()
