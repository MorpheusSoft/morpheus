from typing import List, Optional, Any, Dict
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.api import deps
from app.models.core import Facility
from app.models.sync_telemetry import StoreSyncTelemetry
from app.models.store_agent_control import StoreAgentConfig, StoreAgentCommand
from app.schemas.store_agent_control import (
    StoreAgentConfigSchema,
    StoreAgentConfigUpdateSchema,
    StoreAgentCommandCreateSchema,
    StoreAgentCommandSchema,
    CommandAckSchema,
    FacilityAgentStatusSchema
)

router = APIRouter()

@router.get("/facilities", response_model=List[FacilityAgentStatusSchema])
def list_facilities_agent_status(db: Session = Depends(deps.get_db)):
    """
    Retorna la lista de todas las sedes activas con su estado de telemetría en vivo,
    salud de conexión, configuración remota y comandos pendientes.
    """
    facilities = db.query(Facility).filter(Facility.is_active == True).order_by(Facility.id.asc()).all()
    results = []

    now = datetime.now(timezone.utc)

    for fac in facilities:
        # Última telemetría
        latest = db.query(StoreSyncTelemetry).filter(
            StoreSyncTelemetry.facility_id == fac.id
        ).order_by(StoreSyncTelemetry.created_at.desc()).first()

        is_online = False
        if latest and latest.created_at:
            # Si el latido fue hace menos de 5 minutos, se considera en línea
            diff_sec = (now - latest.created_at).total_seconds()
            is_online = diff_sec <= 300

        # Configuración remota
        cfg = db.query(StoreAgentConfig).filter(StoreAgentConfig.facility_id == fac.id).first()
        if not cfg:
            cfg = StoreAgentConfig(
                facility_id=fac.id,
                config_version=1,
                sales_interval_minutes=5,
                sales_batch_size=500,
                heartbeat_interval_seconds=60
            )
            db.add(cfg)
            db.commit()
            db.refresh(cfg)

        # Comandos pendientes
        pending_count = db.query(func.count(StoreAgentCommand.id)).filter(
            StoreAgentCommand.facility_id == fac.id,
            StoreAgentCommand.status.in_(["PENDING", "SENT", "RUNNING"])
        ).scalar() or 0

        results.append(FacilityAgentStatusSchema(
            facility_id=fac.id,
            facility_name=fac.name,
            facility_code=fac.code,
            is_online=is_online,
            last_heartbeat=latest.created_at if latest else None,
            agent_version=latest.agent_version if latest else None,
            sql_server_status=latest.sql_server_status if latest else None,
            sales_today_count=latest.sales_today_count if latest else 0,
            sales_today_amount=float(latest.sales_today_amount or 0.0) if latest else 0.0,
            lag_minutes=latest.lag_minutes if latest else 0,
            config=StoreAgentConfigSchema.from_orm(cfg),
            pending_commands_count=pending_count
        ))

    return results

@router.get("/{facility_id}/config", response_model=StoreAgentConfigSchema)
def get_store_config(facility_id: int, db: Session = Depends(deps.get_db)):
    """Obtiene la configuración activa de una tienda física."""
    cfg = db.query(StoreAgentConfig).filter(StoreAgentConfig.facility_id == facility_id).first()
    if not cfg:
        cfg = StoreAgentConfig(facility_id=facility_id)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg

@router.put("/{facility_id}/config", response_model=StoreAgentConfigSchema)
def update_store_config(
    facility_id: int,
    payload: StoreAgentConfigUpdateSchema,
    db: Session = Depends(deps.get_db)
):
    """
    Actualiza la configuración remota de una tienda.
    Incrementa automáticamente el config_version para que el agente en tienda lo detecte.
    """
    cfg = db.query(StoreAgentConfig).filter(StoreAgentConfig.facility_id == facility_id).first()
    if not cfg:
        cfg = StoreAgentConfig(facility_id=facility_id)
        db.add(cfg)

    update_data = payload.dict(exclude_unset=True)
    for field, val in update_data.items():
        setattr(cfg, field, val)

    cfg.config_version += 1
    cfg.updated_at = datetime.now(timezone.utc)

    # Encolar comando explícito de actualización de configuración
    cmd = StoreAgentCommand(
        facility_id=facility_id,
        command_type="CONFIG_UPDATE",
        parameters={
            "config_version": cfg.config_version,
            "sales_interval_minutes": cfg.sales_interval_minutes,
            "sales_batch_size": cfg.sales_batch_size,
            "heartbeat_interval_seconds": cfg.heartbeat_interval_seconds,
            "sales_enabled": cfg.sales_enabled,
            "products_enabled": cfg.products_enabled,
            "barcodes_enabled": cfg.barcodes_enabled,
            "categories_enabled": cfg.categories_enabled,
            "suppliers_enabled": cfg.suppliers_enabled,
            "supplier_products_enabled": cfg.supplier_products_enabled,
            "movements_enabled": cfg.movements_enabled
        },
        status="PENDING"
    )
    db.add(cmd)
    db.commit()
    db.refresh(cfg)
    return cfg

@router.post("/{facility_id}/commands", response_model=StoreAgentCommandSchema)
def create_store_command(
    facility_id: int,
    payload: StoreAgentCommandCreateSchema,
    db: Session = Depends(deps.get_db)
):
    """
    Encola una orden o comando remoto para ser ejecutado por el servicio de Windows de la tienda.
    Tipos válidos: FORCE_SYNC_SALES, FORCE_SYNC_MASTERS, SYNC_HISTORICAL, RESTART_SERVICE.
    """
    fac = db.query(Facility).filter(Facility.id == facility_id).first()
    if not fac:
        raise HTTPException(status_code=404, detail="Sede no encontrada")

    cmd = StoreAgentCommand(
        facility_id=facility_id,
        command_type=payload.command_type.strip().upper(),
        parameters=payload.parameters or {},
        status="PENDING"
    )
    db.add(cmd)
    db.commit()
    db.refresh(cmd)
    return cmd

@router.get("/{facility_id}/commands", response_model=List[StoreAgentCommandSchema])
def list_store_commands(
    facility_id: int,
    limit: int = 50,
    db: Session = Depends(deps.get_db)
):
    """Lista el historial de comandos enviados a una tienda física."""
    return db.query(StoreAgentCommand).filter(
        StoreAgentCommand.facility_id == facility_id
    ).order_by(StoreAgentCommand.id.desc()).limit(limit).all()

@router.post("/commands/{command_id}/ack")
def acknowledge_command(
    command_id: int,
    payload: CommandAckSchema,
    db: Session = Depends(deps.get_db)
):
    """
    Endpoint invocado por el agente en tienda para reportar el progreso
    o resultado de un comando (RUNNING, COMPLETED, FAILED).
    """
    cmd = db.query(StoreAgentCommand).filter(StoreAgentCommand.id == command_id).first()
    if not cmd:
        raise HTTPException(status_code=404, detail="Comando no encontrado")

    cmd.status = payload.status
    if payload.result_details:
        cmd.result_details = payload.result_details
    if payload.error_message:
        cmd.error_message = payload.error_message

    if payload.status in ("COMPLETED", "FAILED"):
        cmd.completed_at = datetime.now(timezone.utc)

    db.commit()
    return {"status": "SUCCESS", "command_id": cmd.id, "current_status": cmd.status}
