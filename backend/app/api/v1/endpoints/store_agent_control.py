from typing import List, Optional, Any, Dict
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.api import deps
from app.models.core import Facility
from app.models.sync_telemetry import StoreSyncTelemetry
from app.models.store_agent_control import StoreAgentConfig, StoreAgentCommand
from app.models.inventory import Product, ProductBarcode, StoreDepositMapping
from app.models.purchasing import SupplierProduct
from app.schemas.store_agent_control import (
    StoreAgentConfigSchema,
    StoreAgentConfigUpdateSchema,
    StoreAgentCommandCreateSchema,
    StoreAgentCommandSchema,
    CommandAckSchema,
    FacilityAgentStatusSchema
)

router = APIRouter()

LATEST_AGENT_VERSION = "2.4.2-neo"

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

        # Sanitizar anomalías de fechas futuras en Stellar (ej. transacciones con año espurio)
        stellar_time = latest.last_stellar_sale_time if latest else None
        synced_sale_time = latest.last_synced_sale_time if latest else None
        lag_minutes = latest.lag_minutes if latest else 0

        if stellar_time and stellar_time.year > now.year + 1:
            stellar_time = None
            if synced_sale_time:
                stz = synced_sale_time if synced_sale_time.tzinfo else synced_sale_time.replace(tzinfo=timezone.utc)
                diff_sale = (now - stz).total_seconds() / 60
                lag_minutes = max(0, int(diff_sale))
            else:
                lag_minutes = 0

        # Extraer marcas de sincronización de catálogo desde telemetría (sync_state.json)
        meta = latest.telemetry_metadata if latest and latest.telemetry_metadata else {}

        def parse_meta_dt(key):
            val = meta.get(key)
            if not val:
                return None
            try:
                if isinstance(val, str):
                    return datetime.fromisoformat(val.replace("Z", "+00:00"))
                elif isinstance(val, datetime):
                    return val
            except Exception:
                pass
            return None

        last_prod = parse_meta_dt("last_product_sync")
        last_bc = parse_meta_dt("last_barcode_sync")
        last_sup_prod = parse_meta_dt("last_supplier_product_sync")
        last_mov = parse_meta_dt("last_movement_sync")
        baseline_done = bool(meta.get("baseline_done", False))

        # Fallback inteligente contra base de datos si la telemetría aún no reporta las marcas:
        if not last_prod:
            last_prod = db.query(func.max(Product.created_at)).scalar()
        if not last_sup_prod:
            last_sup_prod = db.query(func.max(SupplierProduct.created_at)).scalar()
        if not last_bc and last_prod:
            has_bc = db.query(ProductBarcode.id).filter(ProductBarcode.code_type == 'BARCODE').first()
            if has_bc:
                last_bc = last_prod
        if not baseline_done:
            has_dep = db.query(StoreDepositMapping.id).filter(
                StoreDepositMapping.facility_id == fac.id,
                StoreDepositMapping.is_active == True
            ).first()
            if has_dep:
                baseline_done = True

        current_ver = (latest.agent_version or "").strip() if latest else ""
        has_update = bool(is_online and current_ver and current_ver != LATEST_AGENT_VERSION)

        results.append(FacilityAgentStatusSchema(
            facility_id=fac.id,
            facility_name=fac.name,
            facility_code=fac.code,
            is_online=is_online,
            last_heartbeat=latest.created_at if latest else None,
            agent_version=latest.agent_version if latest else None,
            latest_available_version=LATEST_AGENT_VERSION,
            has_update_available=has_update,
            sql_server_status=latest.sql_server_status if latest else None,
            last_synced_sale_time=synced_sale_time,
            last_stellar_sale_time=stellar_time,
            sales_today_count=latest.sales_today_count if latest else 0,
            sales_today_amount=float(latest.sales_today_amount or 0.0) if latest else 0.0,
            lag_minutes=lag_minutes,
            config=StoreAgentConfigSchema.from_orm(cfg),
            pending_commands_count=pending_count,
            last_product_sync=last_prod,
            last_barcode_sync=last_bc,
            last_supplier_product_sync=last_sup_prod,
            baseline_inventory_done=baseline_done,
            last_movement_sync=last_mov,
            is_sync_paused=bool(cfg.is_sync_paused if cfg else False)
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
            "movements_enabled": cfg.movements_enabled,
            "is_sync_paused": cfg.is_sync_paused
        },
        status="PENDING"
    )
    db.add(cmd)
    db.commit()
    db.refresh(cfg)
    return cfg

@router.post("/all/pause")
def pause_all_stores(db: Session = Depends(deps.get_db)):
    """Pausa todos los procesos de extracción para todas las sedes activas."""
    facilities = db.query(Facility).filter(Facility.is_active == True).all()
    count = 0
    now = datetime.now(timezone.utc)
    for fac in facilities:
        cfg = db.query(StoreAgentConfig).filter(StoreAgentConfig.facility_id == fac.id).first()
        if not cfg:
            cfg = StoreAgentConfig(facility_id=fac.id)
            db.add(cfg)
        cfg.is_sync_paused = True
        cfg.config_version += 1
        cfg.updated_at = now
        
        cmd = StoreAgentCommand(
            facility_id=fac.id,
            command_type="PAUSE_SYNC",
            parameters={"message": "Pausa global de sincronización activada por administración."},
            status="PENDING"
        )
        db.add(cmd)
        count += 1
    db.commit()
    return {"status": "SUCCESS", "message": f"Sincronización pausada para {count} sucursales."}

@router.post("/all/resume")
def resume_all_stores(db: Session = Depends(deps.get_db)):
    """Reanuda todos los procesos de extracción para todas las sedes activas."""
    facilities = db.query(Facility).filter(Facility.is_active == True).all()
    count = 0
    now = datetime.now(timezone.utc)
    for fac in facilities:
        cfg = db.query(StoreAgentConfig).filter(StoreAgentConfig.facility_id == fac.id).first()
        if not cfg:
            cfg = StoreAgentConfig(facility_id=fac.id)
            db.add(cfg)
        cfg.is_sync_paused = False
        cfg.config_version += 1
        cfg.updated_at = now
        
        cmd = StoreAgentCommand(
            facility_id=fac.id,
            command_type="RESUME_SYNC",
            parameters={"message": "Reanudación global de sincronización activada por administración."},
            status="PENDING"
        )
        db.add(cmd)
        count += 1
    db.commit()
    return {"status": "SUCCESS", "message": f"Sincronización reanudada para {count} sucursales."}

@router.post("/{facility_id}/commands", response_model=StoreAgentCommandSchema)
def create_store_command(
    facility_id: int,
    payload: StoreAgentCommandCreateSchema,
    db: Session = Depends(deps.get_db)
):
    """
    Encola una orden o comando remoto para ser ejecutado por el servicio de Windows de la tienda.
    Tipos válidos: FORCE_SYNC_SALES, FORCE_SYNC_MASTERS, SYNC_HISTORICAL, SYNC_BASELINE, RESTART_SERVICE, UPDATE_SOFTWARE, PAUSE_SYNC, RESUME_SYNC.
    """
    fac = db.query(Facility).filter(Facility.id == facility_id).first()
    if not fac:
        raise HTTPException(status_code=404, detail="Sede no encontrada")

    cmd_type = payload.command_type.strip().upper()
    params = payload.parameters or {}

    if cmd_type == "UPDATE_SOFTWARE":
        if "package_url" not in params or not params["package_url"]:
            params["package_url"] = "https://api.qa.morpheussoft.net/static/MorpheusSyncAgent_Installer.zip"
        if "target_version" not in params or not params["target_version"]:
            params["target_version"] = LATEST_AGENT_VERSION

    elif cmd_type in ["PAUSE_SYNC", "STOP_SYNC"]:
        cmd_type = "PAUSE_SYNC"
        cfg = db.query(StoreAgentConfig).filter(StoreAgentConfig.facility_id == facility_id).first()
        if not cfg:
            cfg = StoreAgentConfig(facility_id=facility_id)
            db.add(cfg)
        cfg.is_sync_paused = True
        cfg.config_version += 1
        cfg.updated_at = datetime.now(timezone.utc)
        params["message"] = "Pausa de sincronización activada desde Centro de Operaciones."

    elif cmd_type in ["RESUME_SYNC", "START_SYNC"]:
        cmd_type = "RESUME_SYNC"
        cfg = db.query(StoreAgentConfig).filter(StoreAgentConfig.facility_id == facility_id).first()
        if not cfg:
            cfg = StoreAgentConfig(facility_id=facility_id)
            db.add(cfg)
        cfg.is_sync_paused = False
        cfg.config_version += 1
        cfg.updated_at = datetime.now(timezone.utc)
        params["message"] = "Reanudación de sincronización activada desde Centro de Operaciones."

    cmd = StoreAgentCommand(
        facility_id=facility_id,
        command_type=cmd_type,
        parameters=params,
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

@router.get("/commands/{command_id}", response_model=StoreAgentCommandSchema)
def get_store_command(
    command_id: int,
    db: Session = Depends(deps.get_db)
):
    """Obtiene el estado y detalles de un comando específico."""
    cmd = db.query(StoreAgentCommand).filter(StoreAgentCommand.id == command_id).first()
    if not cmd:
        raise HTTPException(status_code=404, detail="Comando no encontrado")
    return cmd

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
