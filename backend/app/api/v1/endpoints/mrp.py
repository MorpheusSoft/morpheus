from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app.schemas import mrp as schemas
from app.services.mrp_service import MRPService

router = APIRouter()

@router.get("/simulator", response_model=List[schemas.MRPSimulatorLine])
def read_simulator(
    db: Session = Depends(deps.get_db),
    supplier_id: Optional[int] = Query(None, description="Filtrar por proveedor específico"),
    buyer_id: Optional[int] = Query(None, description="Filtrar por analista (comprador)"),
    facility_id: int = Query(1, description="Locación para medir el inventario")
):
    """
    Obtener sugeridos de reposición predictiva calculando matemáticamente las variables de control y plazos logísticos.
    """
    lines = MRPService.get_simulator_data(db, facility_id=facility_id, supplier_id=supplier_id, buyer_id=buyer_id)
    return lines

@router.put("/sync-metrics")
def sync_metrics(
    payload: schemas.MRPSyncValues,
    db: Session = Depends(deps.get_db)
):
    """
    Actualiza manualmente las métricas matemáticas desde la Interfaz.
    """
    res = MRPService.sync_mrp_variables(db, facility_id=payload.facility_id, variant_id=payload.variant_id, run_rate=payload.run_rate, safety_stock=payload.safety_stock)
    return {"status": "ok"}

@router.post("/generate-orders")
def generate_orders_endpoint(
    payload: schemas.GenerateOrdersRequest,
    db: Session = Depends(deps.get_db)
):
    """
    Toma la bandeja de quiebres MRP y consolida las cabeceras/renglones transaccionales (DRAFT).
    """
    lines_data = [line.model_dump() for line in payload.lines]
    created = MRPService.generate_orders(db, lines_data, payload.facility_id, payload.buyer_id)
    return {"status": "success", "orders_created": len(created), "data": created}
