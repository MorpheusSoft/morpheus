from typing import List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api import deps
from app.models.core import Facility
from app.models.inventory import Warehouse, Location, StoreDepositMapping
from app.schemas.store_deposit_mapping import (
    StoreDepositMappingSchema,
    StoreDepositMappingCreate,
    StoreDepositMappingUpdate,
    WarehouseOptionSchema,
    LocationOptionSchema,
    FacilityDepositMappingResponse
)

router = APIRouter()

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
