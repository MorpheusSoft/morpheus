from typing import List, Optional, Tuple, Any
from sqlalchemy.orm import Session
from sqlalchemy import or_

def get_barcode_candidates(code: Optional[str]) -> List[str]:
    """
    Generates an ordered list of candidate barcode/SKU variations for robust matching:
    1. Exact trimmed code.
    2. UPC-A (12 digits) <-> EAN-13 (13 digits starting with 0) standard conversion.
    3. Code without leading zeros (lstrip('0')).
    4. Code padded to standard lengths (6 digits for Stellar codes, 13 digits for EAN-13, 12 for UPC-A, 14 for GTIN-14, 8 for EAN-8).
    Preserves candidate priority order without duplicates.
    """
    if not code:
        return []
    
    raw = code.strip().upper()
    if not raw:
        return []
    
    candidates = [raw]
    
    if raw.isdigit():
        # GS1 standard: 12-digit UPC-A is equivalent to 13-digit EAN-13 with leading zero
        if len(raw) == 12:
            candidates.append(f"0{raw}")
        elif len(raw) == 13 and raw.startswith("0"):
            candidates.append(raw[1:])
        
        # Stripped leading zeros (e.g. '021724' -> '21724')
        unpadded = raw.lstrip("0")
        if unpadded and unpadded not in candidates:
            candidates.append(unpadded)
            
        # Common barcode and ERP padding lengths
        # 6 = Stellar internal code
        # 13 = EAN-13 standard
        # 12 = UPC-A standard
        # 14 = GTIN-14 (packaging / ITF-14)
        # 8 = EAN-8
        for length in (6, 13, 12, 14, 8):
            padded = unpadded.zfill(length) if unpadded else raw.zfill(length)
            if padded and padded not in candidates:
                candidates.append(padded)
                
    # Return unique candidates preserving order
    seen = set()
    unique_candidates = []
    for c in candidates:
        if c not in seen:
            seen.add(c)
            unique_candidates.append(c)
            
    return unique_candidates

def find_variant_by_code(
    db: Session,
    code: str
) -> Tuple[Optional[Any], Optional[str], Optional[str]]:
    """
    Finds a ProductVariant given a barcode or SKU, applying intelligent candidate variations.
    Returns:
        (variant, uom, matched_barcode) or (None, None, None)
    """
    from app.models.inventory import ProductBarcode, ProductVariant
    
    candidates = get_barcode_candidates(code)
    if not candidates:
        return (None, None, None)
        
    # 1. Search in ProductBarcode (multi-unit barcodes & Stellar codes)
    barcodes = db.query(ProductBarcode).filter(ProductBarcode.barcode.in_(candidates)).all()
    if barcodes:
        # Sort by candidate priority order
        barcodes.sort(key=lambda b: candidates.index(b.barcode) if b.barcode in candidates else 999)
        best_bc = barcodes[0]
        variant = db.query(ProductVariant).filter(ProductVariant.id == best_bc.product_variant_id).first()
        if variant:
            uom = best_bc.uom or (variant.product.uom_base if variant.product else "UND")
            return (variant, uom, best_bc.barcode)
            
    # 2. Search in ProductVariant directly (SKU or main barcode)
    variants = db.query(ProductVariant).filter(
        (ProductVariant.sku.in_(candidates)) | (ProductVariant.barcode.in_(candidates))
    ).all()
    
    if variants:
        def get_variant_priority(v):
            p_bc = candidates.index(v.barcode) if v.barcode in candidates else 999
            p_sku = candidates.index(v.sku) if v.sku in candidates else 999
            return min(p_bc, p_sku)
            
        variants.sort(key=get_variant_priority)
        best_var = variants[0]
        uom = best_var.product.uom_base if best_var.product else "UND"
        matched = best_var.barcode if (best_var.barcode and best_var.barcode in candidates) else best_var.sku
        return (best_var, uom, matched)
        
    return (None, None, None)
