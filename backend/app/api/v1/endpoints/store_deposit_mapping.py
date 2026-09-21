from typing import List, Optional, Any
from datetime import datetime, timezone
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api import deps
from app.models.core import Facility
from app.models.inventory import Warehouse, Location, StoreDepositMapping
from app.models.store_agent_control import StoreAgentCommand
from app.models.sync_telemetry import StoreSyncTelemetry
from app.schemas.store_deposit_mapping import (
    StoreDepositMappingSchema,
    StoreDepositMappingCreate,
    StoreDepositMappingUpdate,
    WarehouseOptionSchema,
    LocationOptionSchema,
    FacilityDepositMappingResponse
)

router = APIRouter()

class DiscoveredDepositItem(BaseModel):
    code: str
    name: Optional[str] = None

def sync_discovered_deposits(db: Session, facility_id: int, deposits: List[Any]) -> List[StoreDepositMapping]:
    """
    Registra o actualiza depósitos descubiertos desde Stellar en inv.store_deposit_mappings,
    creando automáticamente los almacenes y ubicaciones en inv.warehouses e inv.locations si no existen.
    """
    fac = db.query(Facility).filter(Facility.id == facility_id).first()
    if not fac:
        return []

    results = []
    now = datetime.now(timezone.utc)
    for dep in deposits:
        if isinstance(dep, dict):
            raw_code = dep.get("code") or dep.get("c_deposito") or ""
            raw_name = dep.get("name") or dep.get("descripcion") or f"Depósito {raw_code}"
        elif isinstance(dep, DiscoveredDepositItem):
            raw_code = dep.code
            raw_name = dep.name or f"Depósito {dep.code}"
        else:
            raw_code = getattr(dep, "code", "")
            raw_name = getattr(dep, "name", f"Depósito {raw_code}")

        code_clean = str(raw_code).strip()
        name_clean = str(raw_name).strip() if raw_name else f"Depósito {code_clean}"
        if not code_clean:
            continue

        # 1. Buscar o crear Warehouse
        wh = db.query(Warehouse).filter(
            Warehouse.facility_id == facility_id,
            Warehouse.code == code_clean
        ).first()

        if not wh:
            wh_display_name = f"Almacén {code_clean} - {name_clean}" if not name_clean.lower().startswith("almacén") else name_clean
            wh = Warehouse(
                name=wh_display_name,
                code=code_clean,
                facility_id=facility_id
            )
            db.add(wh)
            db.flush()

        # 2. Buscar o crear Location
        loc = db.query(Location).filter(
            Location.warehouse_id == wh.id,
            Location.usage == 'INTERNAL'
        ).first()
        if not loc:
            loc = db.query(Location).filter(Location.warehouse_id == wh.id).first()
        if not loc:
            loc = Location(
                name=f"ALM-{code_clean}/STOCK",
                code=f"ALM-{code_clean}/STOCK",
                warehouse_id=wh.id,
                usage="INTERNAL"
            )
            db.add(loc)
            db.flush()

        # 3. Buscar o crear StoreDepositMapping
        mapping = db.query(StoreDepositMapping).filter(
            StoreDepositMapping.facility_id == facility_id,
            StoreDepositMapping.external_deposit_code == code_clean
        ).first()

        if not mapping:
            mapping = StoreDepositMapping(
                facility_id=facility_id,
                external_deposit_code=code_clean,
                external_deposit_name=name_clean,
                warehouse_id=wh.id,
                location_id=loc.id,
                affects_inventory=True,
                is_active=True,
                auto_discovered=True,
                created_at=now,
                updated_at=now
            )
            db.add(mapping)
            db.flush()
        else:
            if not mapping.external_deposit_name or (mapping.external_deposit_name.startswith("Depósito ") and not name_clean.startswith("Depósito ")):
                mapping.external_deposit_name = name_clean
                mapping.updated_at = now
                db.flush()

        results.append(mapping)

    db.commit()
    return results

@router.get("/{facility_id}/deposits", response_model=FacilityDepositMappingResponse)
def get_facility_deposit_mappings(
    facility_id: int,
    db: Session = Depends(deps.get_db)
):
    """
    Obtiene todos los mapeos de depósitos configurados para una sucursal,
    junto con la lista de almacenes y ubicaciones disponibles para asignar.
    """
    fac = db.query(Facility).filter(Facility.id == facility_id).first()
    if not fac:
        raise HTTPException(status_code=404, detail="Sucursal no encontrada")

    # 1. Obtener mapeos existentes
    mappings_db = db.query(StoreDepositMapping).filter(
        StoreDepositMapping.facility_id == facility_id
    ).order_by(StoreDepositMapping.external_deposit_code.asc()).all()

    # Si no hay mapeos, intentar auto-cargar desde la última telemetría reportada por el agente
    if not mappings_db:
        last_telem = db.query(StoreSyncTelemetry).filter(
            StoreSyncTelemetry.facility_id == facility_id
        ).order_by(StoreSyncTelemetry.id.desc()).first()

        if last_telem and last_telem.telemetry_metadata:
            cached_deps = last_telem.telemetry_metadata.get("deposits")
            if cached_deps and isinstance(cached_deps, list):
                sync_discovered_deposits(db, facility_id, cached_deps)
                mappings_db = db.query(StoreDepositMapping).filter(
                    StoreDepositMapping.facility_id == facility_id
                ).order_by(StoreDepositMapping.external_deposit_code.asc()).all()

    mappings = []
    for m in mappings_db:
        wh = db.query(Warehouse).filter(Warehouse.id == m.warehouse_id).first()
        loc = db.query(Location).filter(Location.id == m.location_id).first()
        mappings.append(StoreDepositMappingSchema(
            id=m.id,
            facility_id=m.facility_id,
            external_deposit_code=m.external_deposit_code,
            external_deposit_name=m.external_deposit_name or "",
            warehouse_id=m.warehouse_id,
            warehouse_name=wh.name if wh else "Desconocido",
            warehouse_code=wh.code if wh else "",
            location_id=m.location_id,
            location_name=loc.name if loc else "Desconocido",
            location_code=loc.code if loc else "",
            affects_inventory=m.affects_inventory,
            is_active=m.is_active,
            auto_discovered=m.auto_discovered,
            created_at=m.created_at,
            updated_at=m.updated_at
        ))

    # 2. Obtener almacenes y ubicaciones disponibles para esta sede
    warehouses_db = db.query(Warehouse).filter(
        Warehouse.facility_id == facility_id
    ).order_by(Warehouse.name.asc()).all()

    # Si la sede no tiene ningún almacén registrado, auto-aprovisionar el Almacén Principal
    if not warehouses_db:
        default_code = fac.code or f"CAT-{facility_id}"
        default_wh = Warehouse(
            name=f"Almacén Principal {fac.name}",
            code=default_code,
            facility_id=facility_id
        )
        db.add(default_wh)
        db.flush()

        default_loc = Location(
            name=f"ALM-{default_code}/STOCK",
            code=f"ALM-{default_code}/STOCK",
            warehouse_id=default_wh.id,
            usage="INTERNAL"
        )
        db.add(default_loc)
        db.commit()

        warehouses_db = [default_wh]

    available_warehouses = []
    for w in warehouses_db:
        locs_db = db.query(Location).filter(
            Location.warehouse_id == w.id
        ).order_by(Location.name.asc()).all()

        available_warehouses.append(WarehouseOptionSchema(
            id=w.id,
            name=w.name,
            code=w.code,
            locations=[
                LocationOptionSchema(
                    id=l.id,
                    name=l.name,
                    code=l.code,
                    usage=l.usage
                )
                for l in locs_db
            ]
        ))

    return FacilityDepositMappingResponse(
        facility_id=fac.id,
        facility_name=fac.name,
        mappings=mappings,
        available_warehouses=available_warehouses
    )

@router.post("/{facility_id}/sync-deposits")
def sync_store_deposits(
    facility_id: int,
    payload: List[DiscoveredDepositItem],
    db: Session = Depends(deps.get_db)
):
    """
    Recibe la lista de depósitos existentes en Stellar (MA_DEPOSITO)
    reportados por el agente de tienda y sincroniza los almacenes y mapeos.
    """
    fac = db.query(Facility).filter(Facility.id == facility_id).first()
    if not fac:
        raise HTTPException(status_code=404, detail="Sucursal no encontrada")

    deposits_dicts = [{"code": d.code, "name": d.name} for d in payload]
    synced = sync_discovered_deposits(db, facility_id, deposits_dicts)
    return {"status": "SUCCESS", "count": len(synced), "message": f"Sincronizados {len(synced)} depósitos de Stellar."}

@router.post("/{facility_id}/discover")
def trigger_discover_deposits(
    facility_id: int,
    db: Session = Depends(deps.get_db)
):
    """
    Encola la orden DISCOVER_DEPOSITS para que el agente de tienda consulte
    la tabla MA_DEPOSITO en SQL Server y transmita los depósitos de inmediato.
    """
    fac = db.query(Facility).filter(Facility.id == facility_id).first()
    if not fac:
        raise HTTPException(status_code=404, detail="Sucursal no encontrada")

    cmd = StoreAgentCommand(
        facility_id=facility_id,
        command_type="DISCOVER_DEPOSITS",
        parameters={},
        status="PENDING",
        created_at=datetime.now(timezone.utc)
    )
    db.add(cmd)
    db.commit()
    db.refresh(cmd)
    return {"status": "SUCCESS", "command_id": cmd.id, "message": f"Orden de detección de depósitos despachada a {fac.name}."}

@router.post("/{facility_id}/deposits", response_model=StoreDepositMappingSchema)
def create_or_upsert_deposit_mapping(
    facility_id: int,
    payload: StoreDepositMappingCreate,
    db: Session = Depends(deps.get_db)
):
    """
    Crea o actualiza la asociación de un depósito de tienda (Stellar POS)
    con un almacén y ubicación en Neo ERP.
    """
    fac = db.query(Facility).filter(Facility.id == facility_id).first()
    if not fac:
        raise HTTPException(status_code=404, detail="Sucursal no encontrada")

    # Validar que el almacén pertenezca a la sucursal
    wh = db.query(Warehouse).filter(
        Warehouse.id == payload.warehouse_id,
        Warehouse.facility_id == facility_id
    ).first()
    if not wh:
        raise HTTPException(status_code=400, detail="El almacén seleccionado no pertenece a esta sucursal")

    # Validar que la ubicación pertenezca al almacén
    loc = db.query(Location).filter(
        Location.id == payload.location_id,
        Location.warehouse_id == wh.id
    ).first()
    if not loc:
        raise HTTPException(status_code=400, detail="La ubicación seleccionada no pertenece al almacén indicado")

    code_clean = payload.external_deposit_code.strip()
    mapping = db.query(StoreDepositMapping).filter(
        StoreDepositMapping.facility_id == facility_id,
        StoreDepositMapping.external_deposit_code == code_clean
    ).first()

    now = datetime.now(timezone.utc)
    if not mapping:
        mapping = StoreDepositMapping(
            facility_id=facility_id,
            external_deposit_code=code_clean,
            external_deposit_name=payload.external_deposit_name,
            warehouse_id=wh.id,
            location_id=loc.id,
            affects_inventory=payload.affects_inventory,
            is_active=payload.is_active,
            auto_discovered=False,
            created_at=now,
            updated_at=now
        )
        db.add(mapping)
    else:
        mapping.external_deposit_name = payload.external_deposit_name or mapping.external_deposit_name
        mapping.warehouse_id = wh.id
        mapping.location_id = loc.id
        mapping.affects_inventory = payload.affects_inventory
        mapping.is_active = payload.is_active
        mapping.auto_discovered = False # Validado formalmente por el usuario
        mapping.updated_at = now

    db.commit()
    db.refresh(mapping)

    return StoreDepositMappingSchema(
        id=mapping.id,
        facility_id=mapping.facility_id,
        external_deposit_code=mapping.external_deposit_code,
        external_deposit_name=mapping.external_deposit_name,
        warehouse_id=mapping.warehouse_id,
        warehouse_name=wh.name,
        warehouse_code=wh.code,
        location_id=mapping.location_id,
        location_name=loc.name,
        location_code=loc.code,
        affects_inventory=mapping.affects_inventory,
        is_active=mapping.is_active,
        auto_discovered=mapping.auto_discovered,
        created_at=mapping.created_at,
        updated_at=mapping.updated_at
    )

@router.put("/{facility_id}/deposits/{mapping_id}", response_model=StoreDepositMappingSchema)
def update_deposit_mapping(
    facility_id: int,
    mapping_id: int,
    payload: StoreDepositMappingUpdate,
    db: Session = Depends(deps.get_db)
):
    """
    Actualiza la configuración de un depósito existente.
    """
    mapping = db.query(StoreDepositMapping).filter(
        StoreDepositMapping.id == mapping_id,
        StoreDepositMapping.facility_id == facility_id
    ).first()
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapeo de depósito no encontrado")

    if payload.warehouse_id is not None:
        wh = db.query(Warehouse).filter(
            Warehouse.id == payload.warehouse_id,
            Warehouse.facility_id == facility_id
        ).first()
        if not wh:
            raise HTTPException(status_code=400, detail="El almacén no pertenece a esta sucursal")
        mapping.warehouse_id = wh.id

    if payload.location_id is not None:
        loc = db.query(Location).filter(
            Location.id == payload.location_id,
            Location.warehouse_id == mapping.warehouse_id
        ).first()
        if not loc:
            raise HTTPException(status_code=400, detail="La ubicación no pertenece al almacén seleccionado")
        mapping.location_id = loc.id

    if payload.external_deposit_name is not None:
        mapping.external_deposit_name = payload.external_deposit_name

    if payload.affects_inventory is not None:
        mapping.affects_inventory = payload.affects_inventory

    if payload.is_active is not None:
        mapping.is_active = payload.is_active

    mapping.auto_discovered = False # Si fue editado, ya está aprobado por el usuario
    mapping.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(mapping)

    wh = db.query(Warehouse).filter(Warehouse.id == mapping.warehouse_id).first()
    loc = db.query(Location).filter(Location.id == mapping.location_id).first()

    return StoreDepositMappingSchema(
        id=mapping.id,
        facility_id=mapping.facility_id,
        external_deposit_code=mapping.external_deposit_code,
        external_deposit_name=mapping.external_deposit_name,
        warehouse_id=mapping.warehouse_id,
        warehouse_name=wh.name if wh else "",
        warehouse_code=wh.code if wh else "",
        location_id=mapping.location_id,
        location_name=loc.name if loc else "",
        location_code=loc.code if loc else "",
        affects_inventory=mapping.affects_inventory,
        is_active=mapping.is_active,
        auto_discovered=mapping.auto_discovered,
        created_at=mapping.created_at,
        updated_at=mapping.updated_at
    )

@router.delete("/{facility_id}/deposits/{mapping_id}")
def delete_deposit_mapping(
    facility_id: int,
    mapping_id: int,
    db: Session = Depends(deps.get_db)
):
    """
    Elimina un mapeo de depósito configurado.
    """
    mapping = db.query(StoreDepositMapping).filter(
        StoreDepositMapping.id == mapping_id,
        StoreDepositMapping.facility_id == facility_id
    ).first()
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapeo no encontrado")

    db.delete(mapping)
    db.commit()
    return {"status": "SUCCESS", "message": f"Mapeo de depósito {mapping.external_deposit_code} eliminado"}
