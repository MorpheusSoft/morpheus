from decimal import Decimal
from typing import Optional, Union
from fastapi import HTTPException

WEIGHT_UOMS = {
    'KG', 'KGS', 'KILOGRAMO', 'KILOGRAMOS',
    'LBS', 'LIBRA', 'LIBRAS',
    'G', 'GR', 'GRS', 'GRAMO', 'GRAMOS',
    'L', 'LT', 'LTS', 'LITRO', 'LITROS',
    'M', 'MT', 'MTS', 'METRO', 'METROS'
}

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
