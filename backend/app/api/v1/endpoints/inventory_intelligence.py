from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Any, Optional

from app.api.deps import get_db
from app.schemas.inventory_intelligence import (
    DeadStockSummary, ShrinkageSummary, TogglePurchasingBlockRequest,
    ScheduledReportResponse, ScheduledReportCreate
)
from app.services.dead_stock_service import audit_all_dead_stock, evaluate_variant_dead_stock
from app.services.shrinkage_profitability_service import (
    audit_all_shrinkage_profitability, evaluate_variant_shrinkage_and_margin,
    toggle_purchasing_block
)
from app.services.monthly_reports_service import generate_monthly_comprehensive_report
from app.models.core import ScheduledReport

router = APIRouter()

@router.get("/dead-stock", response_model=DeadStockSummary)
def get_dead_stock_analysis(
    days_threshold: Optional[int] = Query(None, description="Días sin venta para calificar Dead Stock (default: 60)"),
    auto_block: bool = Query(True, description="Si es True, Clara bloquea la recompra de SKUs estancados"),
    db: Session = Depends(get_db)
) -> Any:
    """Auditoría completa de existencias estancadas y capital inmovilizado en almacenes."""
    return audit_all_dead_stock(db, days_threshold=days_threshold, auto_block=auto_block)

@router.get("/dead-stock/{variant_id}")
def get_variant_dead_stock(
    variant_id: int,
    days_threshold: Optional[int] = Query(None),
    db: Session = Depends(get_db)
) -> Any:
    """Evaluación individual de rotación y estatus de Dead Stock para un SKU específico."""
    try:
        return evaluate_variant_dead_stock(db, variant_id, days_threshold=days_threshold)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get("/shrinkage-profitability", response_model=ShrinkageSummary)
def get_shrinkage_profitability(
    lookback_days: int = Query(90, description="Días hacia atrás para auditar mermas y ventas"),
    auto_block: bool = Query(True, description="Si es True, bloquea recompra de SKUs con margen real negativo"),
    db: Session = Depends(get_db)
) -> Any:
    """Auditoría de pérdidas por merma e impacto en el margen real neto de rentabilidad."""
    return audit_all_shrinkage_profitability(db, lookback_days=lookback_days, auto_block=auto_block)

@router.get("/shrinkage-profitability/{variant_id}")
def get_variant_shrinkage(
    variant_id: int,
    lookback_days: int = Query(90),
    db: Session = Depends(get_db)
) -> Any:
    """Evaluación puntual de merma y margen neto real para un SKU específico."""
    try:
        return evaluate_variant_shrinkage_and_margin(db, variant_id, lookback_days=lookback_days)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/toggle-purchasing-block/{variant_id}")
def toggle_block(
    variant_id: int,
    req: TogglePurchasingBlockRequest,
    db: Session = Depends(get_db)
) -> Any:
    """Permite al analista de compras bloquear o desbloquear manualmente la recompra de un SKU."""
    try:
        return toggle_purchasing_block(db, variant_id, req.is_blocked, reason=req.reason)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/generate-monthly-report")
def generate_monthly_report(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    db: Session = Depends(get_db)
) -> Any:
    """Genera bajo demanda el paquete integral mensual de compras y rentabilidad en Excel."""
    return generate_monthly_comprehensive_report(db, year=year, month=month)

@router.get("/scheduled-reports", response_model=List[ScheduledReportResponse])
def list_scheduled_reports(db: Session = Depends(get_db)) -> Any:
    """Lista los reportes automáticos programados en el sistema."""
    return db.query(ScheduledReport).all()
