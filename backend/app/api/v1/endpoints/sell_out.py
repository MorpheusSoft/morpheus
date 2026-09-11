from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Any, Optional

from app.api.deps import get_db
from app.schemas.sell_out import (
    SellOutAgreementCreate, SellOutAgreementResponse,
    SettleSellOutResponse, ConciliateCreditNoteRequest, ConciliateCreditNoteResponse
)
from app.services.sell_out_service import (
    create_sell_out_agreement, settle_sell_out_agreement,
    conciliate_sell_out_credit_note, get_sell_out_agreements
)

router = APIRouter()

@router.get("/", response_model=List[SellOutAgreementResponse])
def list_agreements(
    status: Optional[str] = Query(None, description="Filtrar por estado: DRAFT, ACTIVE, SETTLED, CONCILIATED"),
    supplier_id: Optional[int] = Query(None, description="Filtrar por proveedor"),
    db: Session = Depends(get_db)
) -> Any:
    """Lista todos los convenios Sell-Out con sus líneas y datos de conciliación."""
    return get_sell_out_agreements(db, status=status, supplier_id=supplier_id)

@router.post("/", response_model=SellOutAgreementResponse)
def create_agreement(
    payload: SellOutAgreementCreate,
    db: Session = Depends(get_db)
) -> Any:
    """Crea un nuevo convenio Sell-Out con líneas de productos y aporte pactado del proveedor."""
    agreement = create_sell_out_agreement(db, payload)
    # Recargar con relaciones
    agreements = get_sell_out_agreements(db)
    created = next((a for a in agreements if a["id"] == agreement.id), None)
    if not created:
        raise HTTPException(status_code=500, detail="Error recuperando el convenio creado.")
    return created

@router.post("/{agreement_id}/settle", response_model=SettleSellOutResponse)
def settle_agreement(
    agreement_id: int,
    db: Session = Depends(get_db)
) -> Any:
    """Clara audita las ventas en POS del periodo del convenio y calcula el reclamo a exigir al proveedor."""
    try:
        return settle_sell_out_agreement(db, agreement_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/{agreement_id}/conciliate-nc", response_model=ConciliateCreditNoteResponse)
def conciliate_credit_note(
    agreement_id: int,
    req: ConciliateCreditNoteRequest,
    db: Session = Depends(get_db)
) -> Any:
    """Concilia la Nota de Crédito emitida por el proveedor contra el monto liquidado del convenio."""
    try:
        return conciliate_sell_out_credit_note(db, agreement_id, req)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
