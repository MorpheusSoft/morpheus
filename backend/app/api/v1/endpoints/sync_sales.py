from typing import List, Optional, Any, Dict
from datetime import datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.api import deps
from app.schemas.sync_sales import (
    SalesBatchPayloadIn,
    StoreSyncTelemetryIn,
    StoreSyncTelemetryOut
)
from app.models.sales import Document, DocumentLine, Customer, DocumentType, DocumentState
from app.models.inventory import (
    Product, ProductVariant, ProductBarcode, Category,
    StockPicking, StockMove, Warehouse, Location, InventorySession
)
from app.models.core import Facility
from app.models.sync_telemetry import StoreSyncTelemetry
from app.models.store_agent_control import StoreAgentConfig, StoreAgentCommand

router = APIRouter()

def resolve_facility(session: Session, facility_id: Optional[int], facility_code: Optional[str]) -> Optional[Facility]:
    if facility_id and facility_id > 0:
        fac = session.query(Facility).filter(Facility.id == facility_id).first()
        if fac:
            return fac
    if facility_code:
        fac = session.query(Facility).filter(Facility.code == facility_code.strip()).first()
        if fac:
            return fac
    return session.query(Facility).first()

@router.post("/import/sales-batch")
def import_sales_batch(
    payload: SalesBatchPayloadIn,
    session: Session = Depends(deps.get_db)
):
    """
    Ingesta por lotes de facturas completas (cabecera y renglones).
    - Idempotente: Si el ticket (facility_id, register_code, document_number) ya existe, se omite.
    - Cero pérdidas: Si el SKU no existe, se auto-crea en inv.products con código real de Stellar.
    - is_historical: Si es True (o fecha <= corte baseline), NO genera movimientos de stock.
      Si es False, genera StockMove para el Kardex oficial.
    """
    if not payload.documents:
        return {"message": "No documents in batch", "processed": 0, "duplicates": 0, "autocreated": 0}

    # 1. Pre-cargar mapeo de variantes existentes por código de barra y STELLAR_CODE
    all_barcodes = session.query(ProductBarcode.barcode, ProductBarcode.product_variant_id).all()
    variant_map = {b[0].strip(): b[1] for b in all_barcodes if b[0]}

    # También pre-cargar por SKU de variante
    all_variants = session.query(ProductVariant.sku, ProductVariant.id).all()
    for v in all_variants:
        if v[0] and v[0].strip() not in variant_map:
            variant_map[v[0].strip()] = v[1]

    # Categoría comodín para auto-creados
    default_cat = session.query(Category).first()
    default_cat_id = default_cat.id if default_cat else None

    # Caché de clientes
    customer_cache = {}
    generic_customer = session.query(Customer).filter_by(id=1).first()
    if not generic_customer:
        generic_customer = Customer(id=1, rif="J-000000000", name="Cliente Contado")
        session.add(generic_customer)
        session.flush()
    customer_cache["J-000000000"] = generic_customer.id

    # Caché de ubicaciones de almacén
    loc_cache = {}
    def get_warehouse_location_id(fac_id: int, dep_code: str) -> int:
        key = (fac_id, dep_code)
        if key in loc_cache:
            return loc_cache[key]
        
        wh = session.query(Warehouse).filter_by(facility_id=fac_id, code=dep_code).first()
        if not wh:
            wh = Warehouse(
                name=f"Almacén {dep_code}",
                code=dep_code,
                facility_id=fac_id
            )
            session.add(wh)
            session.flush()
            loc = Location(
                name=f"ALM-{dep_code}/STOCK",
                code=f"ALM-{dep_code}/STOCK",
                warehouse_id=wh.id,
                usage="INTERNAL"
            )
            session.add(loc)
            session.flush()
            loc_cache[key] = loc.id
            return loc.id
        else:
            loc = session.query(Location).filter_by(warehouse_id=wh.id, usage='INTERNAL').first()
            if not loc:
                loc = session.query(Location).filter_by(warehouse_id=wh.id).first()
            if loc:
                loc_cache[key] = loc.id
                return loc.id
        loc_cache[key] = 1
        return 1

    baseline_cutoff_cache = {}
    def get_baseline_cutoff(f_id: int) -> datetime:
        if f_id in baseline_cutoff_cache:
            return baseline_cutoff_cache[f_id]
        sess = session.query(InventorySession).filter(
            InventorySession.facility_id == f_id,
            InventorySession.state == 'DONE'
        ).order_by(InventorySession.date_start.asc()).first()
        if sess and sess.date_start:
            dt = sess.date_start.replace(tzinfo=None) if sess.date_start.tzinfo else sess.date_start
            baseline_cutoff_cache[f_id] = dt
            return dt
        # Fallback a fecha de corte físico Sesión 25 (2026-06-29 20:35:00)
        default_cutoff = datetime(2026, 6, 29, 20, 35, 0)
        baseline_cutoff_cache[f_id] = default_cutoff
        return default_cutoff

    processed_count = 0
    duplicates_count = 0
    autocreated_count = 0

    for doc_in in payload.documents:
        fac = resolve_facility(session, doc_in.facility_id, doc_in.facility_code)
        fac_id = fac.id if fac else (doc_in.facility_id or 1)
        reg_code = (doc_in.register_code or "01").strip()
        doc_num = doc_in.document_number.strip()

        # Idempotencia: Verificar existencia previa por (facility_id, register_code, document_number)
        existing = session.query(Document).filter(
            Document.facility_id == fac_id,
            Document.register_code == reg_code,
            Document.document_number == doc_num
        ).first()

        if existing:
            duplicates_count += 1
            continue

        # Parsear fecha
        if 'T' in doc_in.doc_date:
            doc_date = datetime.fromisoformat(doc_in.doc_date)
        else:
            doc_date = datetime.strptime(doc_in.doc_date, '%Y-%m-%d %H:%M:%S')

        # Determinar is_historical:
        # Criterio híbrido inteligente acordado en Paso 4:
        # Ventas previas o iguales al corte de Baseline Físico (2026-06-29 20:35:00)
        # se marcan is_historical = True (no descuentan stock).
        # Ventas posteriores al Baseline se marcan is_historical = False y descuentan stock en Kardex.
        cutoff = get_baseline_cutoff(fac_id)
        doc_is_historical = (doc_date <= cutoff)

        # Cliente
        cust_rif = (doc_in.customer_tax_id or "J-000000000").strip()
        if cust_rif not in customer_cache:
            c = session.query(Customer).filter_by(rif=cust_rif).first()
            if not c:
                c = Customer(
                    rif=cust_rif,
                    name=(doc_in.customer_name or "Cliente Contado").strip()
                )
                session.add(c)
                session.flush()
            customer_cache[cust_rif] = c.id
        customer_id = customer_cache[cust_rif]

        # Mapear tipo de documento
        raw_type = (doc_in.doc_type or "FAC").strip().upper()
        if raw_type in ("DEV", "NC", "NOTA_CREDITO"):
            doc_type = DocumentType.CREDIT_NOTE
        else:
            doc_type = DocumentType.INVOICE

        # Crear cabecera Document
        doc = Document(
            facility_id=fac_id,
            customer_id=customer_id,
            currency_id=1,
            type=doc_type,
            state=DocumentState.CONFIRMED,
            register_code=reg_code,
            document_number=doc_num,
            fiscal_number=doc_in.fiscal_number,
            fiscal_serial=doc_in.fiscal_serial,
            customer_name_snap=doc_in.customer_name,
            customer_tax_snap=doc_in.customer_tax_id,
            is_historical=doc_is_historical,
            created_at=doc_date,
            subtotal=Decimal(str(round(doc_in.subtotal, 4))),
            tax_amount=Decimal(str(round(doc_in.tax_amount, 4))),
            total_amount=Decimal(str(round(doc_in.total_amount, 4)))
        )
        session.add(doc)
        session.flush()

        picking = None
        if not doc_is_historical and doc_in.lines:
            picking_name = f"POS-{fac_id}-C{reg_code}-{doc_num}"[:45]
            picking = session.query(StockPicking).filter(StockPicking.name == picking_name).first()
            if not picking:
                picking = StockPicking(
                    facility_id=fac_id,
                    name=picking_name,
                    picking_type_id=2, # Salida por venta
                    origin_document=f"C{reg_code}-{doc_num}",
                    status='DONE',
                    scheduled_date=doc_date,
                    date_done=doc_date
                )
                session.add(picking)
                session.flush()

        # Procesar cada renglón del documento
        for line_in in doc_in.lines:
            sku = line_in.sku_code.strip()
            variant_id = variant_map.get(sku)

            # Auto-resolución de producto si no existe en Neo ERP (Cero Pérdidas)
            if not variant_id:
                new_prod = Product(
                    name=line_in.description or f"Producto Stellar {sku}",
                    category_id=default_cat_id,
                    currency_id=1,
                    product_type='STOCKED',
                    uom_base='UND',
                    is_active=True
                )
                session.add(new_prod)
                session.flush()

                new_variant = ProductVariant(
                    product_id=new_prod.id,
                    sku=sku,
                    sales_price=Decimal(str(round(line_in.unit_price, 4)))
                )
                session.add(new_variant)
                session.flush()

                existing_bc = session.query(ProductBarcode).filter(ProductBarcode.barcode == sku).first()
                if not existing_bc:
                    new_barcode = ProductBarcode(
                        product_variant_id=new_variant.id,
                        barcode=sku,
                        code_type='STELLAR_CODE',
                        uom='UND',
                        conversion_factor=1.0
                    )
                    session.add(new_barcode)
                    session.flush()

                variant_id = new_variant.id
                variant_map[sku] = variant_id
                autocreated_count += 1

            # Inserción de DocumentLine
            qty = Decimal(str(round(line_in.quantity, 4)))
            price = Decimal(str(round(line_in.unit_price, 4)))
            total = Decimal(str(round(line_in.total, 4)))

            line = DocumentLine(
                document_id=doc.id,
                variant_id=variant_id,
                quantity=qty,
                unit_price=price,
                tax_pct=Decimal('0.0'),
                line_total=total
            )
            session.add(line)

            # Si NO es histórico, generamos el movimiento de inventario (Kardex)
            if not doc_is_historical and picking:
                loc_src_id = get_warehouse_location_id(fac_id, line_in.deposit_code or "01")
                loc_dest_id = 2 # Clientes (VIRT_CUSTOMER)

                move = StockMove(
                    picking_id=picking.id,
                    product_id=variant_id,
                    quantity_demand=abs(qty),
                    quantity_done=abs(qty),
                    uom_id='UND',
                    location_src_id=loc_src_id,
                    location_dest_id=loc_dest_id,
                    state='DONE',
                    reference=f"POS Sale C{reg_code}-{doc_num}"
                )
                session.add(move)

        processed_count += 1

    session.commit()
    return {
        "status": "SUCCESS",
        "processed": processed_count,
        "duplicates": duplicates_count,
        "autocreated": autocreated_count,
        "is_historical": payload.is_historical
    }

@router.post("/sync-telemetry/heartbeat")
def record_heartbeat(
    telemetry_in: StoreSyncTelemetryIn,
    session: Session = Depends(deps.get_db)
):
    """
    Registra el latido (Heartbeat) y métricas de salud emitidas por el agente en tienda.
    """
    fac = session.query(Facility).filter(Facility.id == telemetry_in.facility_id).first()
    if not fac:
        fac = session.query(Facility).first()
        facility_id = fac.id if fac else 1
    else:
        facility_id = fac.id

    entry = StoreSyncTelemetry(
        facility_id=facility_id,
        register_code=telemetry_in.register_code,
        agent_version=telemetry_in.agent_version,
        machine_name=telemetry_in.machine_name,
        sql_server_status=telemetry_in.sql_server_status,
        last_stellar_sale_time=telemetry_in.last_stellar_sale_time,
        last_synced_sale_time=telemetry_in.last_synced_sale_time,
        sales_today_count=telemetry_in.sales_today_count,
        sales_today_amount=Decimal(str(round(telemetry_in.sales_today_amount or 0.0, 4))),
        pending_queue_count=telemetry_in.pending_queue_count,
        lag_minutes=telemetry_in.lag_minutes,
        status=telemetry_in.status or "HEALTHY",
        error_details=telemetry_in.error_details,
        telemetry_metadata=telemetry_in.telemetry_metadata or {}
    )
    session.add(entry)
    session.commit()

    # Consultar configuración deseada para la tienda
    cfg = session.query(StoreAgentConfig).filter(StoreAgentConfig.facility_id == facility_id).first()
    if not cfg:
        cfg = StoreAgentConfig(facility_id=facility_id)
        session.add(cfg)
        session.commit()
        session.refresh(cfg)

    # Consultar comandos pendientes
    pending_cmds = session.query(StoreAgentCommand).filter(
        StoreAgentCommand.facility_id == facility_id,
        StoreAgentCommand.status == 'PENDING'
    ).order_by(StoreAgentCommand.id.asc()).all()

    commands_payload = []
    now_utc = datetime.utcnow()
    for c in pending_cmds:
        c.status = 'SENT'
        c.sent_at = now_utc
        commands_payload.append({
            "id": c.id,
            "command_type": c.command_type,
            "parameters": c.parameters or {}
        })

    if pending_cmds:
        session.commit()

    return {
        "status": "OK",
        "server_time": now_utc.isoformat(),
        "received_facility_id": facility_id,
        "config": {
            "version": cfg.config_version,
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
        "commands": commands_payload
    }

@router.get("/sync-telemetry/status")
def get_sync_status(
    session: Session = Depends(deps.get_db)
):
    """
    Obtiene el estado más reciente de sincronización por cada sucursal activa.
    """
    facilities = session.query(Facility).filter(Facility.is_active == True).all()
    results = []

    for fac in facilities:
        latest = session.query(StoreSyncTelemetry).filter(
            StoreSyncTelemetry.facility_id == fac.id
        ).order_by(StoreSyncTelemetry.created_at.desc()).first()

        if latest:
            diff_seconds = (datetime.now(latest.created_at.tzinfo) - latest.created_at).total_seconds()
            is_online = diff_seconds < 900 # 15 minutos
            results.append({
                "facility_id": fac.id,
                "facility_name": fac.name,
                "facility_code": fac.code,
                "is_online": is_online,
                "last_seen_seconds_ago": int(diff_seconds),
                "last_heartbeat_at": latest.created_at.isoformat(),
                "agent_version": latest.agent_version,
                "sql_server_status": latest.sql_server_status,
                "sales_today_count": latest.sales_today_count,
                "sales_today_amount": float(latest.sales_today_amount or 0.0),
                "lag_minutes": latest.lag_minutes,
                "status": "ONLINE" if is_online else "OFFLINE"
            })
        else:
            results.append({
                "facility_id": fac.id,
                "facility_name": fac.name,
                "facility_code": fac.code,
                "is_online": False,
                "last_seen_seconds_ago": None,
                "last_heartbeat_at": None,
                "agent_version": None,
                "sql_server_status": "UNKNOWN",
                "sales_today_count": 0,
                "sales_today_amount": 0.0,
                "lag_minutes": 0,
                "status": "NEVER_CONNECTED"
            })

    return results
