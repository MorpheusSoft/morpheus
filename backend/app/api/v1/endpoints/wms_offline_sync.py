from typing import List, Optional, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func
from pydantic import BaseModel

from app.api import deps
from app.models.inventory import (
    Warehouse, Location, Product, ProductVariant, ProductBarcode,
    ProductPackaging, StockPicking, StockMove, StockPickingType, InventorySnapshot
)
from app.models.core import Facility, User

router = APIRouter()

# ==============================================================================
# SCHEMAS DE ENTRADA Y SALIDA
# ==============================================================================

class RelocationSyncItem(BaseModel):
    client_uuid: str
    barcode: Optional[str] = None
    variant_id: Optional[int] = None
    source_warehouse_id: int
    source_location_id: Optional[int] = None
    dest_warehouse_id: int
    dest_location_id: Optional[int] = None
    quantity: float
    uom: Optional[str] = "UND"
    packaging_id: Optional[int] = None
    factor: Optional[float] = 1.0
    operator_code: Optional[str] = None
    device_id: Optional[str] = None
    offline_scanned_at: Optional[datetime] = None

class RelocationBatchPayload(BaseModel):
    device_id: Optional[str] = "KIOSK-UNKNOWN"
    operator_code: Optional[str] = None
    facility_id: Optional[int] = None
    items: List[RelocationSyncItem]

# ==============================================================================
# HELPER: Obtener o crear ubicación por defecto de almacén
# ==============================================================================
def get_or_create_default_wh_location(wh: Warehouse, db: Session) -> Location:
    loc = db.query(Location).filter(
        Location.warehouse_id == wh.id,
        Location.usage == 'INTERNAL'
    ).first()
    if not loc:
        loc = db.query(Location).filter(
            Location.warehouse_id == wh.id,
            Location.location_type == 'DOCK'
        ).first()
    if not loc:
        loc = db.query(Location).filter(Location.warehouse_id == wh.id).first()
    if not loc:
        loc_code = f"{wh.code}-STOCK"
        loc_barcode = f"LOC-WH{wh.id}-STOCK"
        existing = db.query(Location).filter(
            (Location.barcode == loc_barcode) | 
            ((Location.warehouse_id == wh.id) & (Location.code == loc_code))
        ).first()
        if existing:
            loc = existing
        else:
            loc = Location(
                warehouse_id=wh.id,
                name=f"Ubicación General {wh.name}",
                code=loc_code,
                barcode=loc_barcode,
                location_type="SHELF",
                usage="INTERNAL",
                capacity_volume=100.0
            )
            db.add(loc)
            db.flush()
    return loc

# ==============================================================================
# 1. HEALTH CHECK DE SINCRONIZACIÓN (Ping para Kioscos y Móviles)
# ==============================================================================
@router.get("/health")
def sync_health():
    """
    Verifica disponibilidad y conectividad del servidor de Neo ERP.
    Usado por el SyncWorker para detectar transición Offline -> Online.
    """
    return {
        "status": "online",
        "system": "Neo ERP - WMS Sync Engine",
        "server_time": datetime.utcnow().isoformat()
    }

# ==============================================================================
# 2. DESCARGA DE CATÁLOGO MAESTRO (Para Cache Local en SQLite)
# ==============================================================================
@router.get("/catalog")
def get_sync_catalog(
    facility_id: Optional[int] = Query(None, description="Filtrar por sucursal del kiosco"),
    db: Session = Depends(deps.get_db)
):
    """
    Descarga el catálogo maestro optimizado para guardado local en el Kiosco (SQLite).
    Incluye productos, variantes, códigos de barra, empaques, almacenes y ubicaciones.
    """
    # 0. Localidades / Sucursales activas
    facilities = db.query(Facility).filter(Facility.is_active == True).order_by(Facility.name).all()
    facilities_data = [
        {
            "id": f.id,
            "name": f.name,
            "code": f.code,
            "address": f.address or ""
        }
        for f in facilities
    ]

    # 1. Almacenes
    wh_query = db.query(Warehouse).filter(Warehouse.is_scrap == False)
    if facility_id:
        wh_query = wh_query.filter(Warehouse.facility_id == facility_id)
    warehouses = wh_query.order_by(Warehouse.name).all()
    wh_ids = [w.id for w in warehouses]

    warehouses_data = [
        {
            "id": w.id,
            "name": w.name,
            "code": w.code,
            "facility_id": w.facility_id,
            "is_transit": w.is_transit
        }
        for w in warehouses
    ]

    # 2. Ubicaciones de los almacenes
    locations_query = db.query(Location).filter(Location.warehouse_id.in_(wh_ids)) if wh_ids else db.query(Location)
    locations = locations_query.filter(Location.is_blocked == False).order_by(Location.name).all()
    locations_data = [
        {
            "id": l.id,
            "warehouse_id": l.warehouse_id,
            "name": l.name,
            "code": l.code,
            "barcode": l.barcode or l.code,
            "location_type": l.location_type
        }
        for l in locations
    ]

    # 3. Productos y Variantes activas
    variants = db.query(ProductVariant).join(Product).options(
        selectinload(ProductVariant.product).selectinload(Product.packagings),
        selectinload(ProductVariant.barcodes),
    ).filter(
        ProductVariant.is_active == True,
        Product.is_active == True
    ).all()

    products_data = []
    for v in variants:
        prod = v.product
        barcodes_list = []
        # Agregar código directo de la variante si existe
        if v.barcode:
            barcodes_list.append({
                "barcode": v.barcode.strip(),
                "conversion_factor": 1.0,
                "uom": prod.uom_base or "UND"
            })
        # Agregar SKU como código escaneable
        if v.sku:
            barcodes_list.append({
                "barcode": v.sku.strip(),
                "conversion_factor": 1.0,
                "uom": prod.uom_base or "UND"
            })
        # Agregar códigos de barra adicionales registrados
        for b in v.barcodes:
            if b.barcode:
                barcodes_list.append({
                    "barcode": b.barcode.strip(),
                    "conversion_factor": float(b.conversion_factor or 1.0),
                    "uom": b.uom or prod.uom_base or "UND"
                })

        packagings_list = []
        if prod:
            for p in prod.packagings:
                packagings_list.append({
                    "id": p.id,
                    "name": p.name,
                    "qty_per_unit": float(p.qty_per_unit)
                })

        products_data.append({
            "variant_id": v.id,
            "product_id": v.product_id,
            "sku": v.sku,
            "name": prod.name if prod else v.sku,
            "uom_base": (prod.uom_base if prod else "UND") or "UND",
            "sales_price": float(v.sales_price or 0.0),
            "barcodes": barcodes_list,
            "packagings": packagings_list
        })

    return {
        "server_time": datetime.utcnow().isoformat(),
        "facility_id": facility_id,
        "total_facilities": len(facilities_data),
        "total_warehouses": len(warehouses_data),
        "total_locations": len(locations_data),
        "total_products": len(products_data),
        "facilities": facilities_data,
        "warehouses": warehouses_data,
        "locations": locations_data,
        "products": products_data
    }

# ==============================================================================
# 3. SINCRONIZACIÓN DE LOTE OFFLINE (Idempotente & Prioridad Física Opción 1)
# ==============================================================================
@router.post("/relocations", status_code=status.HTTP_200_OK)
def sync_offline_relocations(
    payload: RelocationBatchPayload,
    db: Session = Depends(deps.get_db)
):
    """
    Procesa un lote de reubicaciones registradas offline en Kioscos o dispositivos móviles.
    Garantiza:
    1. Idempotencia mediante client_uuid (reintentos de red no duplican movimientos).
    2. Política de continuidad física (Opción 1): el movimiento se aplica siempre.
    3. Huella digital exhaustiva: operador, terminal/kiosco, fecha/hora offline y banderas de descuadre.
    """
    if not payload.items:
        return {
            "message": "No hay movimientos para sincronizar.",
            "total_processed": 0,
            "synced": 0,
            "duplicates": 0,
            "discrepancies": 0,
            "results": []
        }

    # Resolver tipo de picking para transferencias internas
    picking_type = db.query(StockPickingType).filter(StockPickingType.code == 'INTERNAL').first()
    if not picking_type:
        picking_type = StockPickingType(name="Transferencia Interna", code="INTERNAL", sequence_prefix="INT")
        db.add(picking_type)
        db.flush()

    results = []
    synced_count = 0
    duplicate_count = 0
    discrepancy_count = 0

    for item in payload.items:
        # A. Verificar IDEMPOTENCIA (¿Ya fue procesado este client_uuid?)
        existing_move = db.query(StockMove).filter(
            StockMove.reference.like(f"%{item.client_uuid}%")
        ).first()

        if existing_move:
            duplicate_count += 1
            results.append({
                "client_uuid": item.client_uuid,
                "status": "ALREADY_SYNCED",
                "move_id": existing_move.id,
                "picking_id": existing_move.picking_id,
                "has_discrepancy": False,
                "message": "Transacción ya procesada previamente (idempotencia verificada)."
            })
            continue

        # B. Resolver Almacén Origen y Destino
        src_wh = db.query(Warehouse).filter(Warehouse.id == item.source_warehouse_id).first()
        dest_wh = db.query(Warehouse).filter(Warehouse.id == item.dest_warehouse_id).first()
        if not src_wh or not dest_wh:
            results.append({
                "client_uuid": item.client_uuid,
                "status": "ERROR",
                "has_discrepancy": True,
                "message": f"Almacén origen ({item.source_warehouse_id}) o destino ({item.dest_warehouse_id}) no existe."
            })
            continue

        # C. Resolver Ubicaciones
        src_loc = None
        if item.source_location_id:
            src_loc = db.query(Location).filter(
                Location.id == item.source_location_id,
                Location.warehouse_id == src_wh.id
            ).first()
        if not src_loc:
            src_loc = get_or_create_default_wh_location(src_wh, db)

        dest_loc = None
        if item.dest_location_id:
            dest_loc = db.query(Location).filter(
                Location.id == item.dest_location_id,
                Location.warehouse_id == dest_wh.id
            ).first()
        if not dest_loc:
            dest_loc = get_or_create_default_wh_location(dest_wh, db)

        # D. Resolver Variante de Producto
        variant = None
        if item.variant_id:
            variant = db.query(ProductVariant).filter(ProductVariant.id == item.variant_id).first()
        
        if not variant and item.barcode:
            clean_code = item.barcode.strip()
            # Buscar en ProductBarcode
            bar = db.query(ProductBarcode).filter(ProductBarcode.barcode == clean_code).first()
            if bar:
                variant = db.query(ProductVariant).filter(ProductVariant.id == bar.product_variant_id).first()
            if not variant:
                # Buscar por barcode directo o SKU en ProductVariant
                variant = db.query(ProductVariant).filter(
                    (ProductVariant.barcode == clean_code) | (ProductVariant.sku == clean_code)
                ).first()

        if not variant:
            results.append({
                "client_uuid": item.client_uuid,
                "status": "ERROR",
                "has_discrepancy": True,
                "message": f"Producto con código '{item.barcode}' o variante '{item.variant_id}' no encontrado en el sistema."
            })
            continue

        # E. Factor de conversión / Empaque
        multiplier = float(item.factor or 1.0)
        if item.packaging_id and item.packaging_id > 0:
            pkg = db.query(ProductPackaging).filter(ProductPackaging.id == item.packaging_id).first()
            if pkg:
                multiplier = float(pkg.qty_per_unit)

        total_base_qty = round(float(item.quantity) * multiplier, 4)
        if total_base_qty <= 0:
            total_base_qty = float(item.quantity)

        # F. POLÍTICA DE DISCREPANCIA (OPCIÓN 1: Prioridad Física y Auditoría)
        src_snap = db.query(InventorySnapshot).filter(
            InventorySnapshot.variant_id == variant.id,
            InventorySnapshot.facility_id == src_wh.facility_id
        ).first()

        available_qty = float(src_snap.stock_qty or 0.0) if src_snap else 0.0
        has_discrepancy = (available_qty < total_base_qty)
        if has_discrepancy:
            discrepancy_count += 1

        # G. Construcción de Huella Digital de Auditoría
        operator_str = item.operator_code or payload.operator_code or "OPERADOR-DESCONOCIDO"
        device_str = item.device_id or payload.device_id or "KIOSK-GENERICO"
        scanned_str = item.offline_scanned_at.strftime("%Y-%m-%d %H:%M:%S") if item.offline_scanned_at else "Fecha N/A"

        audit_prefix = "[DISCREPANCIA-OFFLINE]" if has_discrepancy else "[REUBICACION-OFFLINE]"
        audit_note = (
            f"{audit_prefix} "
            f"Kiosco: {device_str} | Operador: {operator_str} | Escaneado Offline: {scanned_str} | "
            f"UUID: {item.client_uuid} | Saldo origen previo: {available_qty} | Movido: {total_base_qty} UND"
        )

        # H. Crear StockPicking (Estado DONE inmediato)
        picking = StockPicking(
            picking_type_id=picking_type.id,
            name=f"REUB-OFF-{device_str[:8]}-{datetime.now().strftime('%Y%m%d%H%M%S%f')[:18]}",
            origin_document=f"Reubicación Offline Kiosk [{device_str}] UUID:{item.client_uuid}",
            facility_id=src_wh.facility_id,
            dest_facility_id=dest_wh.facility_id,
            status='DONE',
            notes=audit_note,
            scheduled_date=item.offline_scanned_at or datetime.now(),
            date_done=datetime.now()
        )
        db.add(picking)
        db.flush()

        # I. Crear StockMove (Estado DONE inmediato)
        move = StockMove(
            picking_id=picking.id,
            product_id=variant.id,
            location_src_id=src_loc.id,
            location_dest_id=dest_loc.id,
            quantity_demand=total_base_qty,
            quantity_done=total_base_qty,
            uom_id=item.uom or "UND",
            state='DONE',
            reference=f"UUID:{item.client_uuid}",
            notes=audit_note,
            date=item.offline_scanned_at or datetime.now()
        )
        db.add(move)
        db.flush()

        # J. El inventario (InventorySnapshot) se actualiza de forma atómica y nativa
        # mediante el trigger de PostgreSQL 'inv.trg_moves_update_snapshot' al asentar el StockMove.

        synced_count += 1
        results.append({
            "client_uuid": item.client_uuid,
            "status": "SYNCED",
            "move_id": move.id,
            "picking_id": picking.id,
            "has_discrepancy": has_discrepancy,
            "quantity_moved": total_base_qty,
            "message": "Reubicación asentada con éxito." if not has_discrepancy else "Reubicación asentada con alerta de discrepancia registrada."
        })

    db.commit()

    return {
        "message": f"Lote procesado. Sincronizados: {synced_count}, Duplicados: {duplicate_count}, Con discrepancia: {discrepancy_count}.",
        "total_processed": len(payload.items),
        "synced": synced_count,
        "duplicates": duplicate_count,
        "discrepancies": discrepancy_count,
        "results": results
    }
