import re
from decimal import Decimal
from typing import Optional, Union
from fastapi import HTTPException

VOLUME_UOMS = {
    'L', 'LT', 'LTS', 'LITRO', 'LITROS',
    'ML', 'CC', 'MILILITRO', 'MILILITROS'
}

MASS_UOMS = {
    'KG', 'KGS', 'KILO', 'KILOS', 'KILOGRAMO', 'KILOGRAMOS',
    'LBS', 'LIBRA', 'LIBRAS',
    'G', 'GR', 'GRS', 'GRAMO', 'GRAMOS'
}

WEIGHT_UOMS = MASS_UOMS | VOLUME_UOMS | {
    'M', 'MT', 'MTS', 'METRO', 'METROS'
}


def normalize_uom_code(uom: Optional[str]) -> str:
    if not uom:
        return "UND"
    clean = str(uom).strip().upper()
    if clean in ('L', 'LT', 'LTS', 'LITRO', 'LITROS'):
        return 'LT'
    if clean in ('ML', 'CC', 'MILILITRO', 'MILILITROS'):
        return 'ML'
    if clean in ('KG', 'KGS', 'KILO', 'KILOS', 'KILOGRAMO', 'KILOGRAMOS'):
        return 'KG'
    if clean in ('G', 'GR', 'GRS', 'GRAMO', 'GRAMOS'):
        return 'G'
    if clean in ('UND', 'UNID', 'UNIDAD', 'UNIDADES', 'PZA', 'PIEZA', 'PIEZAS', 'UNI', 'UN'):
        return 'UND'
    return clean


def has_volume_marker_in_name(product_name: Optional[str]) -> bool:
    if not product_name:
        return False
    upper = product_name.upper()
    if re.search(r'\b\d+(?:\.\d+)?\s*(?:KG|KGS|KILO|KILOS|GR|GRAMOS)\b', upper):
        return False
    return bool(re.search(r'\b(?:\d+(?:\.\d+)?\s*(?:LT|LTS|LITRO|LITROS)\b|\bAGUA\s+POTABLE\b)', upper))


def resolve_mfg_uom_base(
    prod_uom_base: Optional[str],
    recipe_uom: Optional[str] = None,
    product_name: Optional[str] = None
) -> str:
    """
    Resuelve la unidad logística base real de un insumo o producto en manufactura:
    - Si el producto en catálogo ya es 'LT', devuelve 'LT'.
    - Si la receta expresa el insumo en 'LT' o 'ML' y el catálogo tenía 'KG' (por n_tipopeso de Stellar),
      la unidad base efectiva de inventario es 'LT'.
    - Si el catálogo tiene 'KG' pero el nombre del insumo indica explícitamente litros (ej. '1LT', 'AGUA POTABLE'),
      devuelve 'LT'.
    """
    norm_prod = normalize_uom_code(prod_uom_base) if prod_uom_base else ""
    norm_rec = normalize_uom_code(recipe_uom) if recipe_uom else ""

    if norm_prod in ('LT', 'ML'):
        return 'LT'
    if norm_rec in ('LT', 'ML') and norm_prod in ('', 'KG', 'LT', 'ML'):
        return 'LT'
    if norm_prod == 'KG' and has_volume_marker_in_name(product_name):
        return 'LT'
    if norm_prod:
        return 'KG' if norm_prod == 'G' else norm_prod
    if norm_rec in ('KG', 'G'):
        return 'KG'
    if norm_rec in ('LT', 'ML'):
        return 'LT'
    return norm_rec or 'UND'


def resolve_recipe_conversion_factor(
    recipe_uom: Optional[str],
    uom_base: Optional[str],
    raw_factor: Optional[float] = None
) -> float:
    """
    Normaliza el factor de conversión entre la unidad de la receta (recipe_uom)
    y la unidad base de inventario (uom_base).
    """
    norm_rec = normalize_uom_code(recipe_uom)
    norm_base = normalize_uom_code(uom_base)
    factor = float(raw_factor) if (raw_factor is not None and float(raw_factor) > 0) else 1.0

    # Submúltiplos estándar (G -> KG, ML -> LT)
    if norm_rec in ('G', 'ML') and norm_base in ('KG', 'LT'):
        if abs(factor - 1.0) < 1e-6:
            return 0.001
        return factor

    # Misma unidad base (KG -> KG, LT -> LT, UND -> UND)
    if norm_rec == norm_base and norm_rec in ('KG', 'LT', 'UND'):
        if abs(factor - 0.001) < 1e-6:
            return 1.0
        return factor

    return factor


def is_weight_uom(uom: Optional[str]) -> bool:
    if not uom:
        return False
    return uom.strip().upper() in WEIGHT_UOMS

def validate_quantity_uom(
    qty: Union[float, Decimal, int, None],
    uom: Optional[str],
    item_label: str = "Producto"
) -> None:
    """
    Raises HTTPException(422) if a non-weight product has a fractional quantity.
    """
    if qty is None:
        return
    
    if not is_weight_uom(uom):
        try:
            d_qty = Decimal(str(qty))
            if d_qty % 1 != 0:
                raise HTTPException(
                    status_code=422,
                    detail=f"{item_label} se gestiona por unidades ({uom or 'UND'}) y no admite cantidades decimales ({qty}). Ingrese un número entero."
                )
        except HTTPException:
            raise
        except Exception:
            pass
