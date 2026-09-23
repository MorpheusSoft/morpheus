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


@router.get("/dead-stock-export/pdf")
@router.get("/dead-stock/pdf")
def download_dead_stock_pdf(
    days_threshold: int = Query(30, description="Días sin venta para calificar Dead Stock (default: 30)"),
    db: Session = Depends(get_db)
) -> Any:
    """Genera y descarga el reporte ejecutivo de Rotación & Dead Stock en PDF con gráficos embebidos."""
    from fastapi.responses import Response
    from app.services.dead_stock_pdf_service import generate_dead_stock_pdf

    result = generate_dead_stock_pdf(db, days_threshold=days_threshold)
    pdf_bytes = result["pdf_bytes"]
    filename = f"NeoERP_Reporte_Dead_Stock_{days_threshold}dias.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )


@router.get("/dead-stock-export/excel")
@router.get("/dead-stock/excel")
def download_dead_stock_excel(
    days_threshold: int = Query(30, description="Días sin venta para calificar Dead Stock (default: 30)"),
    db: Session = Depends(get_db)
) -> Any:
    """Genera y descarga el reporte de Rotación & Dead Stock en formato Excel corporativo."""
    from fastapi.responses import FileResponse
    from app.services.dynamic_export_service import generate_excel_export

    audit_data = audit_all_dead_stock(db, days_threshold=days_threshold, auto_block=False)
    items = audit_data.get("items", [])

    headers = [
        "SKU", "Código Barra", "Descripción de Producto", "Categoría", "Marca",
        "Existencia Actual", "Costo Reposición ($)", "Valoración Total ($)",
        "Días sin Venta", "Fecha Última Venta", "Estado de Rotación",
        "Bloqueado para Compra", "Acción Recomendada por Clara"
    ]

    rows = []
    for it in items:
        rows.append([
            it.get("sku", ""),
            it.get("barcode", "") or "",
            it.get("product_name", ""),
            it.get("category_name", "") or "General",
            it.get("brand", "") or "",
            float(it.get("qty_on_hand", 0)),
            float(it.get("replacement_cost", 0) or 0),
            float(it.get("stock_valuation_usd", 0) or 0),
            int(it.get("days_without_sales", 0)),
            str(it.get("last_sale_date", "") or "Sin ventas"),
            "Inmóvil (Dead Stock)" if it.get("dead_stock_status") == "DEAD_STOCK" else "Rotación Lenta",
            "SÍ" if it.get("is_blocked_for_purchasing") else "NO",
            it.get("clara_recommended_action", "") or ""
        ])

    export_result = generate_excel_export(
        title=f"Reporte de Rotación & Dead Stock ({days_threshold} días)",
        headers=headers,
        rows=rows,
        filename_prefix="Reporte_Dead_Stock",
        sheet_title="Dead Stock & Rotación"
    )

    return FileResponse(
        path=export_result["filepath"],
        filename=export_result["filename"],
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

