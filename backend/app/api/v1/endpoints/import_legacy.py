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
    print("Iniciando carga Maestro de Productos con UPSERT (Sin truncar tablas)...")
    
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
            
    # Cache existing variants based on STELLAR_CODE to speed up lookups
    stellar_barcodes_db = session.query(ProductBarcode).filter(ProductBarcode.code_type == 'STELLAR_CODE').all()
    variant_map = {bc.barcode: bc.variant for bc in stellar_barcodes_db}
    
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
            
        existing_variant = variant_map.get(legacy_stellar_code)
        
        if existing_variant:
            # UPSERT: Update existing product and variant
            existing_product = existing_variant.product
            existing_product.name = name
            existing_product.category_id = cat_id
            existing_product.tax_id = tax_id
            existing_product.brand = brand
            existing_product.currency_id = curr_id
            if img:
                existing_product.image_main = img
                
            existing_variant.average_cost = cost
            existing_variant.last_cost = cost
            existing_variant.sales_price = price
            
            # Update facility price
            if existing_variant.facility_prices:
                fp = existing_variant.facility_prices[0]
                fp.sales_price = price
                fp.target_utility_pct = margin_pct
        else:
            # CREATE NEW
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
            session.flush() # To get ID
            
            variant = ProductVariant(
                product_id=parent_product.id,
                sku=f"PRD-{parent_product.id}",
                currency_id=curr_id,
                average_cost=cost,
                last_cost=cost,
                sales_price=price,
                is_active=True
            )
            session.add(variant)
            session.flush()
            
            stellar_barcode = ProductBarcode(
                product_variant_id=variant.id,
                barcode=legacy_stellar_code,
                code_type='STELLAR_CODE',
                uom="UND",
                conversion_factor=1.0
            )
            session.add(stellar_barcode)
            
            facility_price = ProductFacilityPrice(
                variant_id=variant.id,
                facility_id=1,
                sales_price=price,
                target_utility_pct=margin_pct
            )
            session.add(facility_price)
            
            # Also add to map so subsequent duplicates in the same payload are ignored or updated
            variant_map[legacy_stellar_code] = variant
            
        count += 1
        if count % 500 == 0:
            session.flush()
            print(f"  ... Procesados {count} productos")
            
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
            
        # Check if barcode already exists GLOBALLY to avoid IntegrityError
        existing = session.query(ProductBarcode).filter(
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

class LegacyInventoryBaseline(BaseModel):
    c_deposito: str
    c_codArticulo: str
    Cantidad: float

@router.post("/inventory-baseline-legacy")
def import_inventory_baseline(
    baseline_in: List[LegacyInventoryBaseline],
    session: Session = Depends(deps.get_db)
):
    print("Iniciando carga de foto inicial de Inventario...")
    from app.models.inventory import InventorySession, InventoryLine
    from datetime import datetime
    
    # Pre-cache variants based on STELLAR_CODE
    stellar_codes_db = session.query(ProductBarcode).filter(ProductBarcode.code_type == 'STELLAR_CODE').all()
    variant_map = {bc.barcode: bc.product_variant_id for bc in stellar_codes_db}
    
    inv_session = InventorySession(
        name=f"Baseline Legacy {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        facility_id=1,
        state='IN_PROGRESS',
        scope_type='GENERAL'
    )
    session.add(inv_session)
    session.flush()
    
    count = 0
    not_found = 0
    for b in baseline_in:
        stellar_code = b.c_codArticulo.strip()
        variant_id = variant_map.get(stellar_code)
        
        if not variant_id:
            not_found += 1
            continue
            
        line = InventoryLine(
            session_id=inv_session.id,
            product_variant_id=variant_id,
            counted_qty=b.Cantidad
        )
        session.add(line)
        count += 1
        if count % 1000 == 0:
            session.flush()
            
    # Validate the session immediately to apply stock
    inv_session.state = 'DONE'
    inv_session.date_end = datetime.now()
    session.commit()
    
    print(f"✅ ¡Carga de Inventario Baseline terminada! Insertados: {count}, No encontrados: {not_found}")
    return {"message": "Success", "imported": count, "not_found": not_found}

class LegacyInventoryMovement(BaseModel):
    c_documento: str
    c_concepto: str
    c_tipoMov: str
    f_fecha: str
    c_deposito: str
    c_codArticulo: str
    n_cantidad: float
    n_costo: float
    n_subtotal: float

@router.post("/inventory-movements-legacy")
def import_inventory_movements(
    movements_in: List[LegacyInventoryMovement],
    session: Session = Depends(deps.get_db)
):
    from app.models.inventory import StockPicking, StockMove
    from datetime import datetime
    
    # Pre-cache variants based on STELLAR_CODE
    stellar_codes_db = session.query(ProductBarcode).filter(ProductBarcode.code_type == 'STELLAR_CODE').all()
    variant_map = {bc.barcode: bc.product_variant_id for bc in stellar_codes_db}
    
    count = 0
    not_found = 0
    
    # Group by document
    grouped_moves = {}
    for m in movements_in:
        key = (m.c_documento, m.c_concepto, m.c_tipoMov, m.f_fecha)
        if key not in grouped_moves:
            grouped_moves[key] = []
        grouped_moves[key].append(m)
        
    for (doc, concepto, tipo_mov, fecha), lines in grouped_moves.items():
        # Deduplication check
        existing = session.query(StockPicking).filter_by(origin=doc, reference=concepto).first()
        if existing:
            continue
            
        is_in = tipo_mov.strip().lower() == 'cargo'
        
        picking = StockPicking(
            facility_id=1,
            type_id=1 if is_in else 2, 
            origin=doc,
            reference=concepto,
            state='DONE',
            scheduled_date=datetime.fromisoformat(fecha) if 'T' in fecha else datetime.strptime(fecha, '%Y-%m-%d %H:%M:%S')
        )
        session.add(picking)
        session.flush()
        
        for m in lines:
            stellar_code = m.c_codArticulo.strip()
            variant_id = variant_map.get(stellar_code)
            if not variant_id:
                not_found += 1
                continue
                
            qty = abs(m.n_cantidad)
            
            move = StockMove(
                picking_id=picking.id,
                variant_id=variant_id,
                quantity_done=qty,
                quantity=qty,
                source_location_id=1,
                dest_location_id=1,
                state='DONE'
            )
            session.add(move)
            count += 1
            
        if count % 500 == 0:
            session.commit()
            
    session.commit()
    print(f"✅ ¡Kardex procesado! Movimientos: {count}, No encontrados: {not_found}")
    return {"message": "Success", "imported": count, "not_found": not_found}

class LegacySalesDocument(BaseModel):
    facility_id: int
    c_Numero: str
    f_Fecha: str
    Cod_Principal: str
    Cantidad: float
    Precio: float
    Subtotal: float
    Impuesto: float
    Total: float

@router.post("/sales-legacy")
def import_sales_legacy(
    sales_in: List[LegacySalesDocument],
    session: Session = Depends(deps.get_db)
):
    from app.models.sales import Document, DocumentLine
    from app.models.inventory import StockPicking, StockMove
    from datetime import datetime
    
    # Pre-cache variants based on STELLAR_CODE
    stellar_codes_db = session.query(ProductBarcode).filter(ProductBarcode.code_type == 'STELLAR_CODE').all()
    variant_map = {bc.barcode: bc.product_variant_id for bc in stellar_codes_db}
    
    count = 0
    not_found = 0
    for s in sales_in:
        stellar_code = s.Cod_Principal.strip()
        variant_id = variant_map.get(stellar_code)
        if not variant_id:
            not_found += 1
            continue
            
        doc_date = datetime.fromisoformat(s.f_Fecha) if 'T' in s.f_Fecha else datetime.strptime(s.f_Fecha, '%Y-%m-%d %H:%M:%S')
        
        doc = Document(
            facility_id=s.facility_id,
            type='INVOICE',
            state='POSTED',
            number=s.c_Numero,
            date=doc_date,
            subtotal=Decimal(str(s.Subtotal)),
            tax_total=Decimal(str(s.Impuesto)),
            total=Decimal(str(s.Total))
        )
        session.add(doc)
        session.flush()
        
        line = DocumentLine(
            document_id=doc.id,
            product_variant_id=variant_id,
            quantity=Decimal(str(s.Cantidad)),
            unit_price=Decimal(str(s.Precio)),
            subtotal=Decimal(str(s.Subtotal)),
            tax_amount=Decimal(str(s.Impuesto)),
            total=Decimal(str(s.Total))
        )
        session.add(line)
        
        # Deduct inventory (Double deduction is avoided because VEN is excluded from Kardex)
        picking = StockPicking(
            facility_id=s.facility_id,
            type_id=2, # Delivery
            origin=s.c_Numero,
            reference="Sale/Venta",
            state='DONE',
            scheduled_date=doc_date
        )
        session.add(picking)
        session.flush()
        
        move = StockMove(
            picking_id=picking.id,
            variant_id=variant_id,
            quantity_done=abs(s.Cantidad),
            quantity=abs(s.Cantidad),
            source_location_id=1,
            dest_location_id=1,
            state='DONE'
        )
        session.add(move)
        count += 1
        
        if count % 500 == 0:
            session.commit()
            
    session.commit()
    print(f"✅ ¡Ventas procesadas! Registros: {count}, No encontrados: {not_found}")
    return {"message": "Success", "imported": count, "not_found": not_found}
