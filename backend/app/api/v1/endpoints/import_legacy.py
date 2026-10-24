from fastapi import APIRouter, Depends
from typing import List, Optional, Union
from pydantic import BaseModel
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.api import deps
from app.models.inventory import Product, ProductVariant, Category, ProductFacilityPrice, ProductBarcode, ProductPackaging
from app.models.core import Currency, Tribute, Supplier, Facility
from app.models.purchasing import SupplierProduct, PurchaseOrder, PurchaseOrderLine
from app.models.store_agent_control import StoreAgentConfig

router = APIRouter()

def is_facility_sync_paused(session: Session, facility_id: Optional[int] = None) -> bool:
    if facility_id:
        cfg = session.query(StoreAgentConfig).filter(StoreAgentConfig.facility_id == facility_id).first()
        if cfg and cfg.is_sync_paused:
            return True
    else:
        # Si la configuración de sucursal por defecto o todas están en pausa
        paused_count = session.query(StoreAgentConfig).filter(StoreAgentConfig.is_sync_paused == True).count()
        total_count = session.query(StoreAgentConfig).count()
        if total_count > 0 and paused_count == total_count:
            return True
    return False

class LegacyProduct(BaseModel):
    c_Codigo: str
    c_Descri: str
    c_Departamento: Optional[str] = None
    c_Grupo: Optional[str] = None
    c_Subgrupo: Optional[str] = None
    n_CostoAct: Optional[float] = 0.0
    n_CostoRep: Optional[float] = 0.0
    n_precio1: Optional[float] = 0.0
    n_Impuesto1: Optional[float] = 0.0
    moneda: Optional[str] = "USD"
    c_Marca: Optional[str] = None
    imagen: Optional[str] = None
    n_tipopeso: Optional[int] = 0

@router.get("/facilities")
def get_legacy_facilities(session: Session = Depends(deps.get_db)):
    """
    Retorna la lista activa de sucursales en Morpheus para que el Agente
    y el Configurador puedan asociar dinámicamente cada tienda física por ID y Código.
    """
    facilities = session.query(Facility).filter(Facility.is_active == True).order_by(Facility.id).all()
    return [
        {
            "id": f.id,
            "code": f.code,
            "name": f.name
        }
        for f in facilities
    ]


@router.post("/products-legacy")
def import_products_legacy(
    products_in: List[LegacyProduct],
    facility_id: Optional[int] = None,
    force: Optional[bool] = False,
    session: Session = Depends(deps.get_db)
):
    if not force and is_facility_sync_paused(session, facility_id):
        print(f"[PAUSA] Ingesta de productos bloqueada (Pausa activa para sede {facility_id or 'global'}).")
        return {"message": "Sincronización de productos pausada por administración.", "count": 0, "paused": True}

    print("Iniciando carga Maestro de Productos con UPSERT (Sin truncar tablas)...")
    
    # 1. Obtener monedas y sucursal por defecto
    currencies = {c.code.upper(): c.id for c in session.query(Currency).all()}
    default_currency_id = currencies.get('USD') or currencies.get('VES') or 1
    default_fac = session.query(Facility).first()
    default_fac_id = default_fac.id if default_fac else 10
    
    # Obtener Impuestos
    taxes_db = session.query(Tribute).all()
    def get_tax_id(rate: float):
        for t in taxes_db:
            if t.rate == Decimal(str(rate)) or float(t.rate) == rate:
                return t.id
        if rate == 0: return 1 
        return None
        
    # 2. Categorías Jerárquicas (3 Niveles: Subgrupo -> Grupo -> Departamento)
    sub_map = {}
    grp_map = {}
    dep_map = {}
    cat_level_by_id = {}
    for cat in session.query(Category).all():
        if not cat.slug:
            continue
        slug = cat.slug.strip()
        parts = slug.split('-')
        if slug.startswith("sub-") and len(parts) >= 3:
            cat_level_by_id[cat.id] = 3
            g_code = parts[1]
            s_code = parts[2]
            clean_g = g_code.lstrip('0') or '0'
            clean_s = s_code.lstrip('0') or '0'
            sub_map[(g_code, s_code)] = cat.id
            sub_map[(clean_g, clean_s)] = cat.id
            sub_map[(g_code, clean_s)] = cat.id
            sub_map[(clean_g, s_code)] = cat.id
            if s_code not in sub_map:
                sub_map[s_code] = cat.id
            elif isinstance(sub_map.get(s_code), int) and sub_map[s_code] != cat.id:
                sub_map[s_code] = None
        elif slug.startswith("grp-") and len(parts) >= 3:
            cat_level_by_id[cat.id] = 2
            d_code = parts[1]
            g_code = parts[2]
            clean_d = d_code.lstrip('0') or '0'
            clean_g = g_code.lstrip('0') or '0'
            grp_map[(d_code, g_code)] = cat.id
            grp_map[(clean_d, clean_g)] = cat.id
            grp_map[(d_code, clean_g)] = cat.id
            grp_map[(clean_d, g_code)] = cat.id
            if g_code not in grp_map:
                grp_map[g_code] = cat.id
            elif isinstance(grp_map.get(g_code), int) and grp_map[g_code] != cat.id:
                grp_map[g_code] = None
        elif slug.startswith("dep-") and len(parts) >= 2:
            cat_level_by_id[cat.id] = 1
            d_code = parts[1]
            clean_d = d_code.lstrip('0') or '0'
            dep_map[d_code] = cat.id
            dep_map[clean_d] = cat.id
            dep_map[clean_d.zfill(2)] = cat.id

    def resolve_category(dep_val: Optional[str], grp_val: Optional[str], sub_val: Optional[str]) -> Optional[int]:
        d = str(dep_val).strip() if dep_val is not None else ""
        g = str(grp_val).strip() if grp_val is not None else ""
        s = str(sub_val).strip() if sub_val is not None else ""
        clean_d = d.lstrip('0') or '0' if d else ""
        clean_g = g.lstrip('0') or '0' if g else ""
        clean_s = s.lstrip('0') or '0' if s else ""

        # 1. Prioridad: Subgrupo
        if s and s not in ('0', 'NULL', 'None', ''):
            if g and g not in ('0', 'NULL', 'None', ''):
                cat = (sub_map.get((g, s)) or sub_map.get((clean_g, clean_s)) or
                       sub_map.get((g, clean_s)) or sub_map.get((clean_g, s)))
                if cat: return cat
            single = sub_map.get(s) or sub_map.get(clean_s)
            if single and isinstance(single, int):
                return single

        # 2. Prioridad: Grupo
        if g and g not in ('0', 'NULL', 'None', ''):
            if d and d not in ('0', 'NULL', 'None', ''):
                cat = (grp_map.get((d, g)) or grp_map.get((clean_d, clean_g)) or
                       grp_map.get((d, clean_g)) or grp_map.get((clean_d, g)))
                if cat: return cat
            single = grp_map.get(g) or grp_map.get(clean_g)
            if single and isinstance(single, int):
                return single

        # 3. Prioridad: Departamento
        if d and d not in ('0', 'NULL', 'None', ''):
            cat = dep_map.get(d) or dep_map.get(clean_d) or dep_map.get(clean_d.zfill(2))
            if cat: return cat

        return None
            
    # Cache existing products, variants, barcodes, and facility prices in 4 bulk queries (avoiding 100,000+ N+1 lazy loads)
    variants_by_id = {v.id: v for v in session.query(ProductVariant).all()}
    products_by_id = {pr.id: pr for pr in session.query(Product).all()}

    all_barcodes_db = session.query(ProductBarcode).all()
    existing_barcodes_all = {bc.barcode for bc in all_barcodes_db}
    variant_map = {}
    unit_barcodes_by_variant = {}
    for bc in all_barcodes_db:
        if bc.code_type == 'STELLAR_CODE':
            v_obj = variants_by_id.get(bc.product_variant_id)
            if v_obj is not None:
                variant_map[bc.barcode] = v_obj
        if bc.code_type == 'STELLAR_CODE' or (bc.conversion_factor is not None and float(bc.conversion_factor) == 1.0):
            unit_barcodes_by_variant.setdefault(bc.product_variant_id, []).append(bc)

    fp_by_variant = {}
    for fp in session.query(ProductFacilityPrice).all():
        if fp.variant_id not in fp_by_variant:
            fp_by_variant[fp.variant_id] = fp

    pending_new_batch = []

    def flush_new_products_batch():
        if not pending_new_batch:
            return
        new_products = []
        for item in pending_new_batch:
            parent_product = Product(
                name=item["name"],
                category_id=item["cat_id"],
                currency_id=item["curr_id"],
                tax_id=item["tax_id"],
                brand=item["brand"],
                product_type='STOCKED',
                uom_base=item["uom_base"],
                origin='NACIONAL',
                is_active=True,
                has_variants=False,
                image_main=item["img"]
            )
            new_products.append(parent_product)
            item["product_obj"] = parent_product

        session.add_all(new_products)
        session.flush()

        new_variants = []
        for item in pending_new_batch:
            parent_product = item["product_obj"]
            products_by_id[parent_product.id] = parent_product
            variant = ProductVariant(
                product_id=parent_product.id,
                sku=f"PRD-{parent_product.id}",
                currency_id=item["curr_id"],
                standard_cost=item["cost"],
                replacement_cost=item["cost"],
                average_cost=item["cost"],
                last_cost=item["cost"],
                sales_price=item["price"],
                is_active=True
            )
            new_variants.append(variant)
            item["variant_obj"] = variant

        session.add_all(new_variants)
        session.flush()

        new_bcs_and_fps = []
        for item in pending_new_batch:
            variant = item["variant_obj"]
            code = item["code"]
            variants_by_id[variant.id] = variant
            variant_map[code] = variant

            if code not in existing_barcodes_all:
                stellar_barcode = ProductBarcode(
                    product_variant_id=variant.id,
                    barcode=code,
                    code_type='STELLAR_CODE',
                    uom=item["uom_base"],
                    conversion_factor=1.0
                )
                new_bcs_and_fps.append(stellar_barcode)
                existing_barcodes_all.add(code)
                unit_barcodes_by_variant.setdefault(variant.id, []).append(stellar_barcode)

            facility_price = ProductFacilityPrice(
                variant_id=variant.id,
                facility_id=default_fac_id,
                sales_price=item["price"],
                target_utility_pct=item["margin_pct"]
            )
            new_bcs_and_fps.append(facility_price)
            fp_by_variant[variant.id] = facility_price

        session.add_all(new_bcs_and_fps)
        pending_new_batch.clear()

    pending_new_by_code = {}
    count = 0
    for p in products_in:
        legacy_stellar_code = p.c_Codigo.strip()
        if not legacy_stellar_code or legacy_stellar_code.lower() in ('codigo', 'sku'): continue
        
        # Validar tipo de producto (n_tipopeso): 0 = Unidad (UND), 1 y 2 = Volumen/Pesado (KG), 3, 4 y 5 = Omitir
        tipopeso = int(p.n_tipopeso) if p.n_tipopeso is not None else 0
        if tipopeso in (3, 4, 5):
            continue
        uom_base = 'KG' if tipopeso in (1, 2) else 'UND'
        
        name = p.c_Descri.strip()
        raw_cost = p.n_CostoAct if (p.n_CostoAct is not None and p.n_CostoAct > 0) else (p.n_CostoRep or 0.0)
        cost = Decimal(str(raw_cost or 0.0))
        price = Decimal(str(p.n_precio1 or 0.0))
        tax_rate = float(p.n_Impuesto1)
        
        currency_code = p.moneda.strip().upper()
        brand = p.c_Marca.strip() if p.c_Marca else None
        if brand and brand.upper() == "NULL": brand = None
        img = p.imagen.strip() if p.imagen else None
        if img and img.upper() == "NULL": img = None
        
        curr_id = currencies.get(currency_code, default_currency_id)
        cat_id = resolve_category(p.c_Departamento, p.c_Grupo, p.c_Subgrupo)
        tax_id = get_tax_id(tax_rate)
        
        # Calculate Utility Pct (Margen sobre Ventas)
        margin_pct = Decimal(0)
        if price > 0 and cost > 0:
            margin_pct = ((price - cost) / price) * Decimal(100)
        elif price > 0:
            margin_pct = Decimal(100)
        
        # Evitar desbordamiento en Numeric(5,2) (Rango -999.99 a 999.99)
        margin_pct = max(Decimal('-999.99'), min(Decimal('999.99'), round(margin_pct, 2)))
            
        existing_variant = variant_map.get(legacy_stellar_code)
        
        if existing_variant:
            # UPSERT: Update existing product and variant only when values changed
            existing_product = products_by_id.get(existing_variant.product_id)
            if existing_product:
                if existing_product.name != name:
                    existing_product.name = name
                if cat_id and existing_product.category_id != cat_id:
                    cur_lvl = cat_level_by_id.get(existing_product.category_id, 0)
                    new_lvl = cat_level_by_id.get(cat_id, 0)
                    if new_lvl >= cur_lvl:
                        existing_product.category_id = cat_id
                if existing_product.tax_id != tax_id:
                    existing_product.tax_id = tax_id
                if existing_product.brand != brand:
                    existing_product.brand = brand
                if existing_product.currency_id != curr_id:
                    existing_product.currency_id = curr_id
                if existing_product.uom_base != uom_base:
                    existing_product.uom_base = uom_base
                if img and existing_product.image_main != img:
                    existing_product.image_main = img
                
            if existing_variant.standard_cost != cost:
                existing_variant.standard_cost = cost
            if existing_variant.replacement_cost != cost:
                existing_variant.replacement_cost = cost
            if existing_variant.average_cost != cost:
                existing_variant.average_cost = cost
            if existing_variant.last_cost != cost:
                existing_variant.last_cost = cost
            if existing_variant.sales_price != price:
                existing_variant.sales_price = price
            
            for bc in unit_barcodes_by_variant.get(existing_variant.id, ()):
                if bc.uom != uom_base:
                    bc.uom = uom_base
            
            # Update facility price
            fp = fp_by_variant.get(existing_variant.id)
            if fp:
                if fp.sales_price != price:
                    fp.sales_price = price
                if fp.target_utility_pct != margin_pct:
                    fp.target_utility_pct = margin_pct
        elif legacy_stellar_code in pending_new_by_code:
            item = pending_new_by_code[legacy_stellar_code]
            item.update({
                "name": name,
                "cat_id": cat_id,
                "curr_id": curr_id,
                "tax_id": tax_id,
                "brand": brand,
                "uom_base": uom_base,
                "img": img,
                "cost": cost,
                "price": price,
                "margin_pct": margin_pct,
            })
        else:
            item = {
                "code": legacy_stellar_code,
                "name": name,
                "cat_id": cat_id,
                "curr_id": curr_id,
                "tax_id": tax_id,
                "brand": brand,
                "uom_base": uom_base,
                "img": img,
                "cost": cost,
                "price": price,
                "margin_pct": margin_pct,
            }
            pending_new_batch.append(item)
            pending_new_by_code[legacy_stellar_code] = item
            if len(pending_new_batch) >= 1000:
                flush_new_products_batch()
                pending_new_by_code.clear()
            
        count += 1
        if count % 5000 == 0:
            print(f"  ... Procesados {count} productos")

    if pending_new_batch:
        flush_new_products_batch()
        pending_new_by_code.clear()
            
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
    facility_id: Optional[int] = None,
    force: Optional[bool] = False,
    session: Session = Depends(deps.get_db)
):
    if not force and is_facility_sync_paused(session, facility_id):
        print(f"[PAUSA] Ingesta de códigos de barra bloqueada (Pausa activa para sede {facility_id or 'global'}).")
        return {"message": "Sincronización de códigos de barra pausada por administración.", "count": 0, "paused": True}

    print("Iniciando carga de Códigos Alternos (Barras)...")
    
    count = 0
    not_found = 0
    
    # Pre-cache variants based on STELLAR_CODE using lightweight column tuple query
    stellar_codes_db = session.query(ProductBarcode.barcode, ProductBarcode.product_variant_id).filter(
        ProductBarcode.code_type == 'STELLAR_CODE'
    ).all()
    variant_map = {row[0]: row[1] for row in stellar_codes_db}
    
    # Pre-cache existing barcodes in memory to avoid DB roundtrips and timeouts
    existing_barcodes = set(b[0] for b in session.query(ProductBarcode.barcode).all())
    new_barcodes = []
    
    for b in barcodes_in:
        stellar_code = b.c_Codigo.strip()
        alterno = b.c_CodAlterno.strip()
        
        if not alterno or alterno.lower() in ('codigo', 'sku'):
            continue
            
        variant_id = variant_map.get(stellar_code)
        
        if not variant_id:
            not_found += 1
            continue
            
        if alterno not in existing_barcodes:
            new_barcode = ProductBarcode(
                product_variant_id=variant_id,
                barcode=alterno,
                code_type='BARCODE',
                uom="UND",
                conversion_factor=b.n_Cantidad or 1.0
            )
            new_barcodes.append(new_barcode)
            existing_barcodes.add(alterno)
            count += 1
            
            if count % 5000 == 0:
                print(f"  ... Preparados {count} códigos de barra")

    if new_barcodes:
        session.bulk_save_objects(new_barcodes)
    session.commit()
    print(f"✅ ¡Carga de Códigos terminada! Insertados: {count}, No encontrados: {not_found}")
    return {"message": "Success", "imported": count, "not_found": not_found}

def resolve_facility(session: Session, fid: Optional[int] = None, fcode: Optional[str] = None) -> Optional[Facility]:
    """
    Resuelve inteligentemente la sucursal de Morpheus a partir del ID numérico,
    del código de sede (ej: 'CAT-02') o del número/nombre de tienda (ej: '08').
    """
    fac = None
    if fid:
        fac = session.query(Facility).filter(Facility.id == fid).first()
        if fac:
            return fac
    if fcode and str(fcode).strip():
        code_clean = str(fcode).strip()
        fac = session.query(Facility).filter(
            (Facility.code.ilike(code_clean)) |
            (Facility.name.ilike(f"%{code_clean}%"))
        ).first()
        if fac:
            return fac
    if fid:
        # Fallback: buscar si el ID fue usado como código (ej: código '08' o '8')
        fid_str = str(fid).zfill(2)
        fac = session.query(Facility).filter(
            (Facility.code.ilike(f"%{fid}%")) |
            (Facility.code.ilike(f"%{fid_str}%")) |
            (Facility.name.ilike(f"%{fid}%")) |
            (Facility.name.ilike(f"%{fid_str}%"))
        ).first()
        if fac:
            return fac
    return session.query(Facility).first()

class LegacyInventoryBaseline(BaseModel):
    facility_id: Optional[int] = None
    facility_code: Optional[str] = None
    cutoff_date: Optional[str] = None
    c_deposito: str
    c_codArticulo: str
    Cantidad: float

@router.post("/inventory-baseline")
@router.post("/inventory-baseline-legacy")
def import_inventory_baseline(
    baseline_in: List[LegacyInventoryBaseline],
    session: Session = Depends(deps.get_db)
):
    print("Iniciando carga de foto inicial de Inventario...")
    from app.models.inventory import InventorySession, InventoryLine, StoreDepositMapping
    from datetime import datetime
    
    # Pre-cache variants based on STELLAR_CODE
    stellar_codes_db = session.query(ProductBarcode).filter(ProductBarcode.code_type == 'STELLAR_CODE').all()
    variant_map = {bc.barcode: bc.product_variant_id for bc in stellar_codes_db}
    
    first_item = baseline_in[0] if baseline_in else None
    fac = resolve_facility(session, getattr(first_item, 'facility_id', None), getattr(first_item, 'facility_code', None))
    fac_id = fac.id if fac else 10
    fac_name = fac.name if fac else f"Sucursal #{fac_id}"

    # Parse cutoff date if provided
    cutoff_dt = None
    if first_item and getattr(first_item, 'cutoff_date', None):
        try:
            raw_cutoff = str(first_item.cutoff_date).strip()
            if 'T' in raw_cutoff:
                cutoff_dt = datetime.fromisoformat(raw_cutoff)
            else:
                cutoff_dt = datetime.strptime(raw_cutoff.split('.')[0], '%Y-%m-%d %H:%M:%S')
        except Exception:
            cutoff_dt = None
    
    effective_date = cutoff_dt or datetime.now()
    
    # Pre-cache deposit mappings for this facility
    mappings_db = session.query(StoreDepositMapping).filter(StoreDepositMapping.facility_id == fac_id).all()
    dep_map = {m.external_deposit_code.strip(): m for m in mappings_db}
    
    # Detect if items belong to a single specific deposit
    unique_deposits = {b.c_deposito.strip() for b in baseline_in if b.c_deposito}
    is_single_deposit = len(unique_deposits) == 1
    single_deposit_code = list(unique_deposits)[0] if is_single_deposit else None

    date_label = effective_date.strftime('%Y-%m-%d %H:%M')
    session_name = f"Baseline Apertura {fac_name} {date_label}"
    scope_type = 'GENERAL'
    scope_val = None

    if is_single_deposit and single_deposit_code:
        session_name = f"Baseline Apertura {fac_name} - Depósito {single_deposit_code} ({date_label})"
        scope_type = 'LOCATION'
        scope_val = single_deposit_code

    inv_session = InventorySession(
        name=session_name,
        facility_id=fac_id,
        state='DONE',
        date_start=effective_date,
        date_end=effective_date,
        scope_type=scope_type,
        scope_value=scope_val
    )
    session.add(inv_session)
    session.flush()
    
    count = 0
    not_found = 0
    ignored_inactive = 0
    ignored_no_affects = 0
    for b in baseline_in:
        stellar_code = b.c_codArticulo.strip()
        variant_id = variant_map.get(stellar_code)
        
        if not variant_id:
            not_found += 1
            continue

        dep_code = (b.c_deposito or "").strip()
        loc_id = None
        if dep_map:
            mapping = dep_map.get(dep_code)
            if not mapping or not mapping.is_active:
                ignored_inactive += 1
                continue
            if not mapping.affects_inventory:
                ignored_no_affects += 1
                continue
            loc_id = mapping.location_id
            
        line = InventoryLine(
            session_id=inv_session.id,
            product_variant_id=variant_id,
            location_id=loc_id,
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
    
    print(f"✅ ¡Carga de Inventario Baseline terminada! Insertados: {count}, No encontrados: {not_found}, Omitidos inactivos/no mapeados: {ignored_inactive}, Omitidos por no afectar stock: {ignored_no_affects}")
    return {
        "message": "Success",
        "imported": count,
        "not_found": not_found,
        "ignored_inactive": ignored_inactive,
        "ignored_no_affects": ignored_no_affects
    }

class LegacyInventoryMovement(BaseModel):
    facility_id: Optional[int] = 1
    facility_code: Optional[str] = None
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
    from app.models.inventory import StockPicking, StockMove, Warehouse, Location, StoreDepositMapping
    from datetime import datetime
    
    # Pre-cache variants based on STELLAR_CODE
    stellar_codes_db = session.query(ProductBarcode).filter(ProductBarcode.code_type == 'STELLAR_CODE').all()
    variant_map = {bc.barcode: bc.product_variant_id for bc in stellar_codes_db}
    variant_uom_map = {
        bc.product_variant_id: (bc.variant.product.uom_base if (bc.variant and bc.variant.product) else 'UND')
        for bc in stellar_codes_db
    }
    
    count = 0
    not_found = 0
    
    # Group by document
    grouped_moves = {}
    for m in movements_in:
        key = (m.c_documento, m.c_concepto, m.c_tipoMov, m.f_fecha, m.facility_id, getattr(m, 'facility_code', None), m.c_deposito)
        if key not in grouped_moves:
            grouped_moves[key] = []
        grouped_moves[key].append(m)
        
    for (doc, concepto, tipo_mov, fecha, facility_id, facility_code, deposito), lines in grouped_moves.items():
        # Deduplication check
        existing = session.query(StockPicking).filter(StockPicking.origin_document==doc).first()
        if existing:
            continue
            
        is_in = tipo_mov.strip().lower() == 'cargo'
        doc_date = datetime.fromisoformat(fecha) if 'T' in fecha else datetime.strptime(fecha, '%Y-%m-%d %H:%M:%S')
        
        fac = resolve_facility(session, facility_id, facility_code)
        resolved_fac_id = fac.id if fac else (facility_id or 1)

        # Check StoreDepositMapping
        mapping = session.query(StoreDepositMapping).filter(
            StoreDepositMapping.facility_id == resolved_fac_id,
            StoreDepositMapping.external_deposit_code == deposito.strip()
        ).first()

        facility_mappings_count = session.query(StoreDepositMapping).filter(
            StoreDepositMapping.facility_id == resolved_fac_id
        ).count()

        if facility_mappings_count > 0:
            if not mapping or not mapping.is_active or not mapping.affects_inventory:
                # Si la sede tiene depósitos configurados, ignorar movimientos de depósitos no sincronizados
                continue
            internal_loc_id = mapping.location_id
        elif mapping:
            if not mapping.affects_inventory:
                continue
            internal_loc_id = mapping.location_id
        else:
            # Fallback a búsqueda directa de almacén por código
            wh = session.query(Warehouse).filter_by(facility_id=resolved_fac_id, code=deposito.strip()).first()
            if not wh:
                wh = Warehouse(
                    name=f"Almacén {deposito.strip()}",
                    code=deposito.strip(),
                    facility_id=resolved_fac_id
                )
                session.add(wh)
                session.flush()
                internal_loc = Location(
                    name=f"ALM-{deposito.strip()}/STOCK",
                    code=f"ALM-{deposito.strip()}/STOCK",
                    warehouse_id=wh.id,
                    usage="INTERNAL"
                )
                session.add(internal_loc)
                session.flush()
                internal_loc_id = internal_loc.id
            else:
                internal_loc = session.query(Location).filter_by(warehouse_id=wh.id, usage='INTERNAL').first()
                if not internal_loc:
                    internal_loc = session.query(Location).filter_by(warehouse_id=wh.id).first()
                internal_loc_id = internal_loc.id if internal_loc else 1
                
        if is_in:
            loc_src_id = 1 # Proveedores / Virtual
            loc_dest_id = internal_loc_id
        else:
            loc_src_id = internal_loc_id
            loc_dest_id = 1 # Proveedores / Virtual
                    
        picking = StockPicking(
            facility_id=resolved_fac_id,
            name=f"LEG-{doc}-{concepto}"[:45],
            picking_type_id=1 if is_in else 2, 
            origin_document=doc,
            status='DONE',
            scheduled_date=doc_date,
            date_done=doc_date
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
                product_id=variant_id,
                quantity_demand=qty,
                quantity_done=qty,
                uom_id=variant_uom_map.get(variant_id, 'UND'),
                location_src_id=loc_src_id,
                location_dest_id=loc_dest_id,
                state='DONE',
                reference=concepto
            )
            session.add(move)
            count += 1
            
        if count % 500 == 0:
            session.flush()
            
    session.commit()
    print(f"✅ ¡Kardex procesado! Movimientos: {count}, No encontrados: {not_found}")
    return {"message": "Success", "imported": count, "not_found": not_found}

class LegacySalesDocument(BaseModel):
    facility_id: Optional[int] = 1
    facility_code: Optional[str] = None
    c_Numero: str
    f_Fecha: str
    Cod_Principal: str
    Cantidad: float
    Precio: float
    Subtotal: float
    Impuesto: float
    Total: float
    deposit_code: str = "01"

@router.post("/sales-legacy")
def import_sales_legacy(
    sales_in: List[LegacySalesDocument],
    session: Session = Depends(deps.get_db)
):
    from app.models.sales import Document, DocumentLine, Customer
    from app.models.inventory import StockPicking, StockMove, Warehouse, Location
    from datetime import datetime
    
    # Pre-cache variants based on STELLAR_CODE
    stellar_codes_db = session.query(ProductBarcode).filter(ProductBarcode.code_type == 'STELLAR_CODE').all()
    variant_map = {bc.barcode: bc.product_variant_id for bc in stellar_codes_db}
    variant_uom_map = {
        bc.product_variant_id: (bc.variant.product.uom_base if (bc.variant and bc.variant.product) else 'UND')
        for bc in stellar_codes_db
    }
    
    # Ensure generic customer exists
    generic_customer = session.query(Customer).filter_by(id=1).first()
    if not generic_customer:
        generic_customer = Customer(id=1, rif="J-000000000", name="Cliente Generico Venta Legacy")
        session.add(generic_customer)
        session.flush()
        
    # Cache locations
    loc_cache = {}
    def get_location_id(fac_id, dep_code):
        key = (fac_id, dep_code)
        if key in loc_cache:
            return loc_cache[key]
        wh = session.query(Warehouse).filter_by(facility_id=fac_id, code=dep_code).first()
        if not wh:
            wh = Warehouse(
                name=f"Almacén {dep_code}",
                code=dep_code,
                facility_id=fac_id
            )
            session.add(wh)
            session.flush()
            loc = Location(
                name=f"ALM-{dep_code}/STOCK",
                code=f"ALM-{dep_code}/STOCK",
                warehouse_id=wh.id,
                usage="INTERNAL"
            )
            session.add(loc)
            session.flush()
            loc_cache[key] = loc.id
            return loc.id
        else:
            loc = session.query(Location).filter_by(warehouse_id=wh.id, usage='INTERNAL').first()
            if not loc:
                loc = session.query(Location).filter_by(warehouse_id=wh.id).first()
            if loc:
                loc_cache[key] = loc.id
                return loc.id
        loc_cache[key] = 1
        return 1
        
    count = 0
    not_found = 0
    for s in sales_in:
        stellar_code = s.Cod_Principal.strip()
        variant_id = variant_map.get(stellar_code)
        if not variant_id:
            not_found += 1
            continue
            
        doc_date = datetime.fromisoformat(s.f_Fecha) if 'T' in s.f_Fecha else datetime.strptime(s.f_Fecha, '%Y-%m-%d %H:%M:%S')
        
        fac = resolve_facility(session, s.facility_id, getattr(s, 'facility_code', None))
        fac_id = fac.id if fac else (s.facility_id or 1)

        # Deduplication check
        existing = session.query(Document).filter(
            Document.facility_id == fac_id,
            Document.document_number == s.c_Numero
        ).first()
        if existing:
            continue
            
        doc = Document(
            facility_id=fac_id,
            customer_id=1,
            currency_id=1,
            type='INVOICE',
            state='CONFIRMED',
            document_number=s.c_Numero,
            created_at=doc_date,
            subtotal=Decimal(str(s.Subtotal)),
            tax_amount=Decimal(str(s.Impuesto)),
            total_amount=Decimal(str(s.Total))
        )
        session.add(doc)
        session.flush()
        
        line = DocumentLine(
            document_id=doc.id,
            variant_id=variant_id,
            quantity=Decimal(str(s.Cantidad)),
            unit_price=Decimal(str(s.Precio)),
            tax_pct=Decimal('0.0'),
            line_total=Decimal(str(s.Total))
        )
        session.add(line)
        
        # Deduct inventory (Double deduction is avoided because VEN is excluded from Kardex)
        picking = StockPicking(
            facility_id=fac_id,
            name=f"SALE-{s.c_Numero}-{s.Cod_Principal}"[:45],
            picking_type_id=2, # Delivery
            origin_document=s.c_Numero,
            status='DONE',
            scheduled_date=doc_date,
            date_done=doc_date
        )
        session.add(picking)
        session.flush()
        
        loc_src_id = get_location_id(s.facility_id, s.deposit_code)
        
        move = StockMove(
            picking_id=picking.id,
            product_id=variant_id,
            quantity_demand=abs(s.Cantidad),
            quantity_done=abs(s.Cantidad),
            uom_id=variant_uom_map.get(variant_id, 'UND'),
            location_src_id=loc_src_id,
            location_dest_id=1,
            state='DONE',
            reference="Sale/Venta"
        )
        session.add(move)
        count += 1
        
        if count % 500 == 0:
            session.flush()
            
    session.commit()
    print(f"✅ ¡Ventas procesadas! Registros: {count}, No encontrados: {not_found}")
    return {"message": "Success", "imported": count, "not_found": not_found}

class LegacySupplierProduct(BaseModel):
    c_Codigo: str
    c_CodProveedor: str
    costo: float
    compMin: float = 1.0
    empaque: str = 'UND'
    n_CantiBul: float = 1.0

@router.post("/supplier-products-legacy")
def import_supplier_products_legacy(
    supplier_products_in: List[LegacySupplierProduct],
    facility_id: Optional[int] = None,
    force: Optional[bool] = False,
    session: Session = Depends(deps.get_db)
):
    if not force and is_facility_sync_paused(session, facility_id):
        print(f"[PAUSA] Ingesta de productos por proveedor bloqueada (Pausa activa para sede {facility_id or 'global'}).")
        return {"message": "Sincronización de productos por proveedor pausada por administración.", "count": 0, "paused": True}

    print(f"Iniciando carga de {len(supplier_products_in)} Productos por Proveedor...")
    
    count = 0
    not_found = 0
    
    # 1. Pre-cache variants based on STELLAR_CODE (c_Codigo) mapping to (variant_id, product_id) in 1 JOIN query
    stellar_rows = session.query(
        ProductBarcode.barcode,
        ProductBarcode.product_variant_id,
        ProductVariant.product_id
    ).join(
        ProductVariant, ProductBarcode.product_variant_id == ProductVariant.id
    ).filter(
        ProductBarcode.code_type == 'STELLAR_CODE'
    ).all()
    variant_map = {r[0]: (r[1], r[2]) for r in stellar_rows}
    
    # 2. Pre-cache suppliers by tax_id, GEN-code, and name
    suppliers_db = session.query(Supplier).all()
    supplier_map = {}
    supplier_name_map = {}
    for s in suppliers_db:
        if s.tax_id:
            t_clean = s.tax_id.strip()
            supplier_map[t_clean] = s.id
            supplier_map[t_clean.upper()] = s.id
            if t_clean.upper().startswith("GEN-"):
                raw_c = t_clean[4:].strip()
                supplier_map[raw_c] = s.id
                supplier_map[raw_c.upper()] = s.id
        if s.name:
            n_clean = s.name.strip()
            supplier_name_map[n_clean] = s.id
            supplier_name_map[n_clean.upper()] = s.id

    # 3. Pre-cache packagings by (product_id, name.upper())
    pack_map = {(p.product_id, p.name.upper()): p.id for p in session.query(ProductPackaging).all()}
    
    # 4. Pre-cache existing SupplierProducts to avoid DB roundtrips
    existing_sps = {(sp.variant_id, sp.supplier_id): sp for sp in session.query(SupplierProduct).all()}

    # Batch-create any missing suppliers first
    missing_sup_codes = {}
    for sp in supplier_products_in:
        sup_code = sp.c_CodProveedor.strip() if sp.c_CodProveedor else ""
        if not sup_code:
            continue
        if (sup_code not in supplier_map and sup_code.upper() not in supplier_map
                and sup_code not in supplier_name_map and sup_code.upper() not in supplier_name_map):
            missing_sup_codes.setdefault(sup_code.upper(), sup_code)

    if missing_sup_codes:
        try:
            with session.begin_nested():
                new_sups = [
                    Supplier(name=sc, tax_id=sc, lead_time_days=3, is_active=True)
                    for sc in missing_sup_codes.values()
                ]
                session.add_all(new_sups)
                session.flush()
                for ns in new_sups:
                    supplier_map[ns.tax_id] = ns.id
                    supplier_map[ns.tax_id.upper()] = ns.id
        except Exception:
            for sc in missing_sup_codes.values():
                try:
                    with session.begin_nested():
                        ns = Supplier(name=sc, tax_id=sc, lead_time_days=3, is_active=True)
                        session.add(ns)
                        session.flush()
                        supplier_map[ns.tax_id] = ns.id
                        supplier_map[ns.tax_id.upper()] = ns.id
                except Exception:
                    pass

    # Batch-create any missing packagings
    missing_packs = {}
    for sp in supplier_products_in:
        stellar_code = sp.c_Codigo.strip()
        var_info = variant_map.get(stellar_code)
        if not var_info:
            continue
        _, product_id = var_info
        pack_name = sp.empaque.strip().upper()
        key = (product_id, pack_name)
        if key not in pack_map and key not in missing_packs:
            missing_packs[key] = Decimal(str(sp.n_CantiBul))

    if missing_packs:
        new_packs = [
            ProductPackaging(product_id=pid, name=pname, qty_per_unit=qty)
            for (pid, pname), qty in missing_packs.items()
        ]
        session.add_all(new_packs)
        session.flush()
        for np in new_packs:
            pack_map[(np.product_id, np.name.upper())] = np.id

    new_sps = []
    for sp in supplier_products_in:
        stellar_code = sp.c_Codigo.strip()
        sup_code = sp.c_CodProveedor.strip() if sp.c_CodProveedor else ""
        if not sup_code:
            continue
        
        var_info = variant_map.get(stellar_code)
        if not var_info:
            not_found += 1
            if not_found <= 5 or not_found % 2000 == 0:
                print(f"  [WARN] Variante no encontrada para STELLAR_CODE={stellar_code}. Saltando proveedor {sup_code} (Total no encontradas: {not_found}).")
            continue
            
        variant_id, product_id = var_info
            
        supplier_id = (
            supplier_map.get(sup_code)
            or supplier_map.get(sup_code.upper())
            or supplier_name_map.get(sup_code)
            or supplier_name_map.get(sup_code.upper())
        )
        if not supplier_id:
            continue
            
        pack_name = sp.empaque.strip().upper()
        pack_id = pack_map.get((product_id, pack_name))
            
        # Upsert SupplierProduct
        existing_sp = existing_sps.get((variant_id, supplier_id))
        rep_cost = Decimal(str(sp.costo))
        min_qty = Decimal(str(sp.compMin))
        
        if existing_sp:
            if existing_sp.replacement_cost != rep_cost:
                existing_sp.replacement_cost = rep_cost
            if existing_sp.min_order_qty != min_qty:
                existing_sp.min_order_qty = min_qty
            if existing_sp.pack_id != pack_id:
                existing_sp.pack_id = pack_id
        else:
            new_sp = SupplierProduct(
                variant_id=variant_id,
                supplier_id=supplier_id,
                replacement_cost=rep_cost,
                min_order_qty=min_qty,
                pack_id=pack_id,
                is_active=True
            )
            new_sps.append(new_sp)
            existing_sps[(variant_id, supplier_id)] = new_sp
            
        count += 1
        if count % 5000 == 0:
            print(f"  ... Procesados {count} cruces")

    if new_sps:
        session.add_all(new_sps)
    session.commit()
    print(f"✅ ¡Carga de Proveedores terminada! Registros: {count}, No encontrados: {not_found}")
    return {"message": "Success", "imported": count, "not_found": not_found}

class LegacySupplier(BaseModel):
    codigo: str
    razon_social: str
    nombre_comercial: Optional[str] = None
    rif: str
    direccion: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    estatus: str

@router.post("/suppliers-legacy")
def import_suppliers_legacy(
    suppliers_in: List[LegacySupplier],
    session: Session = Depends(deps.get_db)
):
    print(f"Iniciando carga de {len(suppliers_in)} Proveedores...")
    from app.models.core import Supplier
    
    existing_by_tax_id = {s.tax_id: s for s in session.query(Supplier).all() if s.tax_id}
    new_suppliers = []
    count = 0
    
    for s in suppliers_in:
        is_active = s.estatus.strip().upper() == 'ACTIVO'
        # Fallback to GEN-{codigo} if RIF/tax_id is empty or null to avoid UniqueViolation
        tax_id = s.rif.strip() if s.rif and s.rif.strip() else f"GEN-{s.codigo.strip()}"
        
        existing = existing_by_tax_id.get(tax_id)
        
        if existing:
            if existing.name != s.razon_social:
                existing.name = s.razon_social
            if existing.commercial_name != s.nombre_comercial:
                existing.commercial_name = s.nombre_comercial
            if existing.fiscal_address != s.direccion:
                existing.fiscal_address = s.direccion
            if existing.commercial_contact_phone != s.telefono:
                existing.commercial_contact_phone = s.telefono
            if existing.commercial_email != s.email:
                existing.commercial_email = s.email
            if existing.is_active != is_active:
                existing.is_active = is_active
        else:
            new_sup = Supplier(
                tax_id=tax_id,
                name=s.razon_social,
                commercial_name=s.nombre_comercial,
                fiscal_address=s.direccion,
                commercial_contact_phone=s.telefono,
                commercial_email=s.email,
                is_active=is_active
            )
            new_suppliers.append(new_sup)
            existing_by_tax_id[tax_id] = new_sup
            
        count += 1
        if count % 1000 == 0:
            print(f"  ... Procesados {count} proveedores")

    if new_suppliers:
        session.add_all(new_suppliers)
    session.commit()
    print(f"✅ ¡Carga de Proveedores terminada! Registros procesados: {count}")
    return {"message": "Success", "imported": count}

class LegacyDepartment(BaseModel):
    c_Codigo: Union[str, int]
    c_Descripcio: str

class LegacyGroup(BaseModel):
    c_Codigo: Union[str, int]
    c_Descripcio: str
    c_Departamento: Union[str, int]

class LegacySubGroup(BaseModel):
    c_Codigo: Union[str, int]
    c_Descripcio: str
    c_in_departamento: Union[str, int]
    c_in_grupo: Union[str, int]

class LegacyCategoriesPayload(BaseModel):
    departments: List[LegacyDepartment] = []
    groups: List[LegacyGroup] = []
    subgroups: List[LegacySubGroup] = []

@router.post("/categories-legacy")
def import_categories_legacy(
    payload: LegacyCategoriesPayload,
    session: Session = Depends(deps.get_db)
):
    print(f"Iniciando carga de Categorías Jerárquicas ({len(payload.departments)} Deptos, {len(payload.groups)} Grupos, {len(payload.subgroups)} Subgrupos)...")
    from app.models.inventory import Category
    
    # 1. Departamentos (Nivel 1 - Raíz)
    dept_map = {}
    for d in payload.departments:
        code = str(d.c_Codigo).strip()
        name = str(d.c_Descripcio).strip()
        if not code: continue

        clean_code = code.lstrip('0') or '0'
        padded_code = clean_code.zfill(2) if clean_code.isdigit() else clean_code
        candidate_slugs = list(dict.fromkeys([f"dep-{code}", f"dep-{clean_code}", f"dep-{padded_code}"]))

        cat = session.query(Category).filter(Category.slug.in_(candidate_slugs)).first()
        is_liquor = 'LICOR' in name.upper() or code in ('11', 'dep-11')
        target_slug = f"dep-{padded_code}"

        if not cat:
            cat = Category(name=name, slug=target_slug, parent_id=None, path=target_slug, is_liquor=is_liquor)
            session.add(cat)
            session.flush()
        else:
            cat.name = name
            cat.is_liquor = is_liquor
            if not cat.path:
                cat.path = cat.slug

        dept_map[code] = cat
        dept_map[clean_code] = cat
        dept_map[padded_code] = cat
    session.commit()
    
    # 2. Grupos (Nivel 2 - Hijos de Depto)
    grp_map = {}
    for g in payload.groups:
        code = str(g.c_Codigo).strip()
        name = str(g.c_Descripcio).strip()
        dep_code = str(g.c_Departamento).strip()
        if not code: continue

        clean_dep = dep_code.lstrip('0') or '0'
        padded_dep = clean_dep.zfill(2) if clean_dep.isdigit() else clean_dep
        clean_grp = code.lstrip('0') or '0'
        padded_grp = clean_grp.zfill(2) if clean_grp.isdigit() else code

        target_slug = f"grp-{padded_dep}-{code}"
        candidate_slugs = list(dict.fromkeys([
            f"grp-{dep_code}-{code}",
            f"grp-{clean_dep}-{code}",
            f"grp-{padded_dep}-{code}",
            f"grp-{dep_code}-{clean_grp}",
            f"grp-{padded_dep}-{clean_grp}"
        ]))

        parent = (
            dept_map.get(dep_code)
            or dept_map.get(clean_dep)
            or dept_map.get(padded_dep)
            or session.query(Category).filter(Category.slug.in_([f"dep-{dep_code}", f"dep-{clean_dep}", f"dep-{padded_dep}"])).first()
        )
        parent_id = parent.id if parent else None
        parent_path = parent.path if parent else ""
        is_liquor = (parent and parent.is_liquor) or 'LICOR' in name.upper()
        
        cat = session.query(Category).filter(Category.slug.in_(candidate_slugs)).first()
        if not cat:
            cat = Category(name=name, slug=target_slug, parent_id=parent_id, path=f"{parent_path}/{target_slug}" if parent_path else target_slug, is_liquor=is_liquor)
            session.add(cat)
            session.flush()
        else:
            cat.name = name
            cat.parent_id = parent_id
            cat.path = f"{parent_path}/{cat.slug}" if parent_path else cat.slug
            cat.is_liquor = is_liquor

        grp_map[(dep_code, code)] = cat
        grp_map[(clean_dep, code)] = cat
        grp_map[(padded_dep, code)] = cat
        grp_map[code] = cat
        grp_map[clean_grp] = cat
    session.commit()
    
    # 3. Subgrupos (Nivel 3 - Hijos de Grupo)
    for s in payload.subgroups:
        code = str(s.c_Codigo).strip()
        name = str(s.c_Descripcio).strip()
        dep_code = str(s.c_in_departamento).strip()
        grp_code = str(s.c_in_grupo).strip()
        if not code: continue

        clean_dep = dep_code.lstrip('0') or '0'
        padded_dep = clean_dep.zfill(2) if clean_dep.isdigit() else clean_dep
        clean_grp = grp_code.lstrip('0') or '0'
        padded_grp = clean_grp.zfill(2) if clean_grp.isdigit() else grp_code
        clean_code = code.lstrip('0') or '0'
        padded_code = clean_code.zfill(2) if clean_code.isdigit() else code

        target_slug = f"sub-{grp_code}-{code}"
        candidate_slugs = list(dict.fromkeys([
            f"sub-{grp_code}-{code}",
            f"sub-{clean_grp}-{code}",
            f"sub-{padded_grp}-{code}",
            f"sub-{grp_code}-{clean_code}",
            f"sub-{grp_code}-{padded_code}"
        ]))

        parent = (
            grp_map.get((dep_code, grp_code))
            or grp_map.get((clean_dep, grp_code))
            or grp_map.get((padded_dep, grp_code))
            or grp_map.get(grp_code)
            or grp_map.get(clean_grp)
            or session.query(Category).filter(Category.slug.in_([
                f"grp-{dep_code}-{grp_code}",
                f"grp-{clean_dep}-{grp_code}",
                f"grp-{padded_dep}-{grp_code}",
                f"grp-{padded_dep}-{clean_grp}"
            ])).first()
        )
        parent_id = parent.id if parent else None
        parent_path = parent.path if parent else ""
        is_liquor = (parent and parent.is_liquor) or 'LICOR' in name.upper()
        
        cat = session.query(Category).filter(Category.slug.in_(candidate_slugs)).first()
        if not cat:
            cat = Category(name=name, slug=target_slug, parent_id=parent_id, path=f"{parent_path}/{target_slug}" if parent_path else target_slug, is_liquor=is_liquor)
            session.add(cat)
            session.flush()
        else:
            cat.name = name
            cat.parent_id = parent_id
            cat.path = f"{parent_path}/{cat.slug}" if parent_path else cat.slug
            cat.is_liquor = is_liquor
    session.commit()
    
    total = session.query(Category).count()
    print(f"✅ ¡Categorías procesadas exitosamente! Total en base de datos: {total}")
    return {
        "message": "Success",
        "departments_processed": len(payload.departments),
        "groups_processed": len(payload.groups),
        "subgroups_processed": len(payload.subgroups),
        "total_categories_in_db": total
    }


# ==============================================================================
# Ingesta de Órdenes de Compra (ODC) desde Stellar (Fase de Transición Temporal)
# ==============================================================================

class LegacyPurchaseOrderLinePayload(BaseModel):
    c_LINEA: int
    c_CODARTICULO: str
    c_descripcion: Optional[str] = None
    n_CANTIDAD: float
    n_CANT_RECIBIDA: Optional[float] = 0.0
    n_COSTO: float
    n_subtotal: Optional[float] = 0.0
    n_impuesto: Optional[float] = 0.0
    n_total: Optional[float] = 0.0
    n_porcentajeimp: Optional[float] = 16.0
    ns_cantidadempaque: Optional[float] = 1.0


class LegacyPurchaseOrderPayload(BaseModel):
    c_DOCUMENTO: str
    d_FECHA: Optional[str] = None
    d_fecha_recepcion: Optional[str] = None
    DU_FECHAVENCIMIENTO: Optional[str] = None
    c_DESCRIPCION: Optional[str] = None
    c_status: Optional[str] = "DPE"
    c_CODPROVEEDOR: str
    c_CODLOCALIDAD: Optional[str] = None
    C_CODMONEDA: Optional[str] = "USD"
    n_FACTORCAMBIO: Optional[float] = 1.0
    N_SUBTOTAL: Optional[float] = 0.0
    N_IMPUESTO: Optional[float] = 0.0
    N_TOTAL: Optional[float] = 0.0
    c_OBSERVACION: Optional[str] = None
    lines: List[LegacyPurchaseOrderLinePayload] = []


class LegacyPurchaseOrdersBatch(BaseModel):
    facility_id: Optional[int] = None
    orders: List[LegacyPurchaseOrderPayload]


@router.post("/purchase-orders-legacy")
def import_purchase_orders_legacy(
    payload: Union[LegacyPurchaseOrdersBatch, List[LegacyPurchaseOrderPayload]],
    facility_id: Optional[int] = None,
    allow_expired: Optional[bool] = False,
    session: Session = Depends(deps.get_db)
):
    """
    Ingesta temporal de Órdenes de Compra (ODC) desde Stellar (MA_ODC + TR_ODC).
    Registra las ODC pendientes por recepción en Neo ERP en estado 'approved' o 'partial',
    garantizando idempotencia absoluta y cero duplicados por número de documento.
    """
    from datetime import datetime, date

    if isinstance(payload, LegacyPurchaseOrdersBatch):
        orders_in = payload.orders
        target_facility_id = payload.facility_id or facility_id
    else:
        orders_in = payload
        target_facility_id = facility_id

    if is_facility_sync_paused(session, target_facility_id):
        print(f"[PAUSA] Ingesta de ODC bloqueada por administración para sede {target_facility_id or 'global'}.")
        return {"message": "Sincronización pausada", "created": 0, "updated": 0, "skipped": 0, "paused": True}

    if not orders_in:
        return {"message": "No se recibieron órdenes en el lote", "created": 0, "updated": 0, "skipped": 0}

    print(f"📦 [ODC Sync] Iniciando procesamiento de {len(orders_in)} órdenes de compra...")

    def _parse_date(d_str: Optional[str]) -> Optional[date]:
        if not d_str: return None
        try:
            clean = d_str.split('T')[0].split(' ')[0].strip()
            return datetime.strptime(clean, "%Y-%m-%d").date()
        except Exception:
            return None

    def _parse_datetime(dt_str: Optional[str]) -> Optional[datetime]:
        if not dt_str: return None
        for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d"):
            try:
                return datetime.strptime(dt_str.strip()[:26], fmt)
            except Exception:
                continue
        return None

    today = date.today()

    # 1. Pre-cargar Sucursales
    facilities = session.query(Facility).all()
    facility_by_id = {f.id: f for f in facilities}
    facility_by_code = {f.code.strip().upper(): f.id for f in facilities if f.code}
    default_facility_id = target_facility_id or (facilities[0].id if facilities else 1)

    # 2. Pre-cargar Monedas
    currencies = {c.code.strip().upper(): c.id for c in session.query(Currency).all() if c.code}
    default_currency_id = currencies.get("USD") or (list(currencies.values())[0] if currencies else 1)

    # 3. Pre-cargar Proveedores existentes por RIF normalizado
    all_suppliers = session.query(Supplier).all()
    suppliers_by_tax_id = {}
    for sup in all_suppliers:
        if sup.tax_id:
            clean_rif = sup.tax_id.replace("-", "").replace(".", "").replace(" ", "").upper()
            suppliers_by_tax_id[clean_rif] = sup
            suppliers_by_tax_id[sup.tax_id.upper()] = sup

    # 4. Pre-cargar Variantes por código Stellar
    all_codes = set()
    for odc in orders_in:
        for line in odc.lines:
            c = line.c_CODARTICULO.strip()
            if c:
                all_codes.add(c)
                all_codes.add(c.lstrip('0') or '0')

    variant_by_code = {}
    if all_codes:
        # Cruce vía ProductBarcode (code_type == 'STELLAR_CODE')
        bc_rows = session.query(
            ProductBarcode.barcode,
            ProductBarcode.product_variant_id
        ).filter(
            ProductBarcode.code_type == 'STELLAR_CODE',
            ProductBarcode.barcode.in_(list(all_codes))
        ).all()
        for b, vid in bc_rows:
            variant_by_code[b] = vid
            variant_by_code[b.lstrip('0') or '0'] = vid

        # Cruce complementario vía ProductVariant.sku
        missing = all_codes - set(variant_by_code.keys())
        if missing:
            v_rows = session.query(ProductVariant.id, ProductVariant.sku).filter(
                ProductVariant.sku.in_(list(missing))
            ).all()
            for vid, sku in v_rows:
                if sku:
                    variant_by_code[sku] = vid
                    variant_by_code[sku.lstrip('0') or '0'] = vid

    # 5. Pre-cargar órdenes existentes por reference para garantizar IDEMPOTENCIA
    references = [f"ODC-{odc.c_DOCUMENTO.strip()}" for odc in orders_in if odc.c_DOCUMENTO]
    existing_orders = {}
    if references:
        po_rows = session.query(PurchaseOrder).filter(PurchaseOrder.reference.in_(references)).all()
        for po in po_rows:
            existing_orders[po.reference] = po

    created_count = 0
    updated_count = 0
    skipped_count = 0
    total_lines_created = 0

    for odc in orders_in:
        doc_num = odc.c_DOCUMENTO.strip()
        if not doc_num:
            skipped_count += 1
            continue

        ref = f"ODC-{doc_num}"
        raw_status = (odc.c_status or "DPE").strip().upper()

        # Descartar órdenes completadas en Stellar o anuladas
        if raw_status in ('DCO', 'ANU'):
            skipped_count += 1
            continue

        # Validar fecha de vencimiento (a menos que se permita vencidas para testing)
        exp_date = _parse_date(odc.DU_FECHAVENCIMIENTO) or _parse_date(odc.d_fecha_recepcion)
        if not allow_expired and exp_date and exp_date < today:
            skipped_count += 1
            continue

        # Resolver Sucursal Destino
        fac_id = target_facility_id
        if not fac_id and odc.c_CODLOCALIDAD:
            loc_code = odc.c_CODLOCALIDAD.strip().upper()
            fac_id = facility_by_code.get(loc_code)
        if not fac_id or fac_id not in facility_by_id:
            fac_id = default_facility_id

        # Resolver Proveedor
        prov_code = odc.c_CODPROVEEDOR.strip()
        clean_prov_rif = prov_code.replace("-", "").replace(".", "").replace(" ", "").upper()
        supplier = suppliers_by_tax_id.get(clean_prov_rif) or suppliers_by_tax_id.get(prov_code.upper())
        if not supplier:
            # Auto-crear proveedor provisional para garantizar que ninguna orden se pierda
            sup_name = odc.c_DESCRIPCION.strip() if odc.c_DESCRIPCION else f"PROVEEDOR {clean_prov_rif}"
            supplier = Supplier(
                tax_id=clean_prov_rif or prov_code,
                name=sup_name,
                commercial_name=sup_name,
                is_active=True
            )
            session.add(supplier)
            session.flush()
            suppliers_by_tax_id[clean_prov_rif] = supplier

        # Moneda
        moneda_str = (odc.C_CODMONEDA or "USD").strip().upper()
        curr_id = currencies.get(moneda_str, default_currency_id)
        rate = Decimal(str(odc.n_FACTORCAMBIO or 1.0))

        # Determinar estado de la orden en Neo según avance de líneas
        tot_ordered = sum(l.n_CANTIDAD for l in odc.lines)
        tot_received = sum(l.n_CANT_RECIBIDA or 0.0 for l in odc.lines)
        
        if tot_received >= tot_ordered and tot_ordered > 0:
            target_status = 'received'
        elif tot_received > 0:
            target_status = 'partial'
        else:
            target_status = 'approved'

        # Si ya fue totalmente recibida en Stellar o Neo, no la mostramos como pendiente
        if target_status == 'received':
            skipped_count += 1
            continue

        existing_po = existing_orders.get(ref)

        if existing_po:
            # Si en Neo ya está marcada como 'received' por el almacén, no sobreescribir
            if existing_po.status == 'received':
                skipped_count += 1
                continue

            # Actualizar orden existente (Idempotencia)
            existing_po.status = target_status
            existing_po.total_amount = Decimal(str(odc.N_TOTAL or 0.0))
            if fac_id:
                existing_po.dest_facility_id = fac_id
            if exp_date:
                existing_po.expiration_date = exp_date
            
            # Sincronizar renglones existentes
            existing_lines = {pol.variant_id: pol for pol in existing_po.lines}
            for l in odc.lines:
                art_code = l.c_CODARTICULO.strip()
                var_id = variant_by_code.get(art_code) or variant_by_code.get(art_code.lstrip('0') or '0')
                if not var_id:
                    continue

                q_ord = Decimal(str(l.n_CANTIDAD))
                q_rec = Decimal(str(l.n_CANT_RECIBIDA or 0.0))
                q_exp = Decimal(str(max(0.0, l.n_CANTIDAD - (l.n_CANT_RECIBIDA or 0.0))))
                cost = Decimal(str(l.n_COSTO or 0.0))

                line_obj = existing_lines.get(var_id)
                if line_obj:
                    line_obj.qty_ordered = q_ord
                    line_obj.received_base_qty = q_rec
                    line_obj.expected_base_qty = q_exp
                    line_obj.unit_cost = cost
                else:
                    new_line = PurchaseOrderLine(
                        order_id=existing_po.id,
                        variant_id=var_id,
                        qty_ordered=q_ord,
                        received_base_qty=q_rec,
                        expected_base_qty=q_exp,
                        unit_cost=cost,
                        billed_qty=q_rec,
                        line_discount_str="0"
                    )
                    session.add(new_line)
                    total_lines_created += 1

            updated_count += 1
        else:
            # Crear nueva Orden de Compra en Neo
            notes_str = f"[Sincronizada de Stellar ODC #{doc_num}] {odc.c_OBSERVACION or odc.c_DESCRIPCION or ''}".strip()
            created_at_dt = _parse_datetime(odc.d_FECHA)

            new_po = PurchaseOrder(
                reference=ref,
                supplier_id=supplier.id,
                dest_facility_id=fac_id,
                status=target_status,
                total_amount=Decimal(str(odc.N_TOTAL or 0.0)),
                notes=notes_str,
                expiration_date=exp_date,
                allow_partial_deliveries=True,
                currency_id=curr_id,
                exchange_rate=rate
            )
            if created_at_dt:
                new_po.created_at = created_at_dt

            session.add(new_po)
            session.flush()

            # Insertar renglones
            for l in odc.lines:
                art_code = l.c_CODARTICULO.strip()
                var_id = variant_by_code.get(art_code) or variant_by_code.get(art_code.lstrip('0') or '0')
                if not var_id:
                    continue

                q_ord = Decimal(str(l.n_CANTIDAD))
                q_rec = Decimal(str(l.n_CANT_RECIBIDA or 0.0))
                q_exp = Decimal(str(max(0.0, l.n_CANTIDAD - (l.n_CANT_RECIBIDA or 0.0))))
                cost = Decimal(str(l.n_COSTO or 0.0))

                new_line = PurchaseOrderLine(
                    order_id=new_po.id,
                    variant_id=var_id,
                    qty_ordered=q_ord,
                    received_base_qty=q_rec,
                    expected_base_qty=q_exp,
                    unit_cost=cost,
                    billed_qty=q_rec,
                    line_discount_str="0"
                )
                session.add(new_line)
                total_lines_created += 1

            existing_orders[ref] = new_po
            created_count += 1

    session.commit()
    print(f"✅ [ODC Sync] Finalizado: Creadas={created_count}, Actualizadas={updated_count}, Omitidas={skipped_count}, Renglones={total_lines_created}")

    return {
        "message": "Success",
        "created": created_count,
        "updated": updated_count,
        "skipped": skipped_count,
        "total_lines_created": total_lines_created
    }


