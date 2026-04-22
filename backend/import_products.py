import sys
import os
import csv
from decimal import Decimal

# Aseguramos que la carpeta backend/ esté en el radar de Python
sys.path.append(os.path.join(os.path.dirname(__file__)))

from sqlalchemy.orm import Session
from app.api.deps import engine
from app.models.inventory import Product, ProductVariant, Category
from app.models.core import Currency

def import_products():
    with Session(engine) as session:
        print("Iniciando carga Maestro de Productos...")
        
        # 1. Obtener monedas
        currencies = {c.code.upper(): c.id for c in session.query(Currency).all()}
        default_currency_id = currencies.get('USD') or currencies.get('VES') or 1
        
        # 2. Categorías (Cache para búsquedas súper rápidas de códigos numéricos)
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
            # Archivo sin encabezados e idealmente separado por punto y coma
            reader = csv.reader(f, delimiter=';')
            for row in reader:
                if len(row) < 5: continue
                
                sku = str(row[0]).strip()
                name = str(row[1]).strip()
                cat_code = str(row[2]).strip()
                cost = row[3].strip() if row[3] else "0"
                price = row[4].strip() if row[4] else "0"
                currency_code = str(row[5]).strip().upper() if len(row) > 5 else "USD"
                
                brand = str(row[6]).strip() if len(row) > 6 else ""
                if brand.upper() == "NULL": brand = None
                img = str(row[7]).strip() if len(row) > 7 else ""
                if img.upper() == "NULL": img = None
                
                curr_id = currencies.get(currency_code, default_currency_id)
                cat_id = cat_cache.get(cat_code, None)
                
                # Check de Idempotencia: Si ya existe el SKU, se salta
                variant = session.query(ProductVariant).filter_by(sku=sku).first()
                if variant:
                    continue 
                    
                # Inserta Cabecera
                parent_product = Product(
                    name=name,
                    category_id=cat_id,
                    currency_id=curr_id,
                    brand=brand,
                    product_type='STOCKED',
                    uom_base='PZA',
                    origin='NACIONAL',
                    is_active=True,
                    has_variants=False,
                    image_main=img
                )
                session.add(parent_product)
                session.flush() # Obtiene el ID inmediatamente
                
                # Inserta Variante/SKU amarrada a la Cabecera
                new_variant = ProductVariant(
                    product_id=parent_product.id,
                    sku=sku,
                    currency_id=curr_id,
                    standard_cost=Decimal(cost),
                    last_cost=Decimal(cost),
                    average_cost=Decimal(cost),
                    sales_price=Decimal(price),
                    is_active=True
                )
                session.add(new_variant)
                
                count += 1
                if count % 500 == 0:
                    session.commit()
                    print(f"  ... Insertados {count} productos")
                    
        session.commit()
        print(f"✅ ¡Carga Maestro terminada! Total productos nuevos: {count}")

if __name__ == "__main__":
    import_products()
