from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api import deps
from app.schemas import inventory_session as schemas
from app.models.inventory import InventorySession, InventoryLine, Product, ProductVariant, Location, StockMove, InventorySnapshot, ProductBarcode, Category, Warehouse
from app.models.purchasing import SupplierProduct
from app.models.core import User
from app.core.uom import validate_quantity_uom
from datetime import datetime

router = APIRouter()

def get_all_descendant_category_ids(db: Session, root_cat_id: int) -> List[int]:
    """
    Returns the root category id along with all descendants in the hierarchy,
    handling both tree path and parent_id references (even if path is NULL).
    """
    all_cat_ids = {root_cat_id}
    root_cat = db.query(Category).filter(Category.id == root_cat_id).first()
    if not root_cat:
        return list(all_cat_ids)
    
    # 1. If path is present, fetch subcategories by path prefix
    if root_cat.path:
        sub_cats = db.query(Category.id).filter(
            (Category.id == root_cat.id) | (Category.path.like(f"{root_cat.path}/%"))
        ).all()
        for sc in sub_cats:
            all_cat_ids.add(sc.id)

    # 2. Traverse parent_id to catch categories where path might be NULL or not updated
    to_visit = [root_cat_id]
    while to_visit:
        curr_id = to_visit.pop(0)
        children = db.query(Category.id).filter(Category.parent_id == curr_id).all()
        for ch in children:
            if ch.id not in all_cat_ids:
                all_cat_ids.add(ch.id)
                to_visit.append(ch.id)
                
    return list(all_cat_ids)

def attach_anomaly_fields(session: InventorySession, db: Session):
    for line in session.lines:
        line.is_anomaly = False
        line.anomaly_reason = None
        
        variant = db.query(ProductVariant).filter(ProductVariant.id == line.product_variant_id).first()
        prod = variant.product if (variant and hasattr(variant, 'product')) else None
        line.uom_base = (prod.uom_base if prod else None) or (variant.uom_base if variant else None) or "UND"
        line.sku = variant.sku if variant else f"ID {line.product_variant_id}"
        line.product_name = prod.name if prod else f"Producto #{line.product_variant_id}"
        
        diff = float(line.counted_qty or 0) - float(line.theoretical_qty or 0)
        abs_diff = abs(diff)
        
        if abs_diff > 0:
            if variant:
                cost = float(variant.standard_cost or variant.replacement_cost or 0)
                if cost > 50.0:
                    line.is_anomaly = True
                    line.anomaly_reason = f"Diferencia en artículo de alto valor ({cost} USD). Delta: {diff} {line.uom_base}."
                elif line.theoretical_qty and (abs_diff / float(line.theoretical_qty)) > 0.5 and abs_diff > 5:
                    line.is_anomaly = True
                    line.anomaly_reason = f"Desviación significativa (>50%). Teórico: {line.theoretical_qty} {line.uom_base}, Contado: {line.counted_qty} {line.uom_base}."
                elif not line.theoretical_qty and abs_diff > 20:
                    line.is_anomaly = True
                    line.anomaly_reason = f"Cantidad contada inesperada sin stock teórico previo ({line.counted_qty} {line.uom_base})."

@router.get("/", response_model=List[schemas.InventorySessionListItem])
def read_inventory_sessions(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: Any = Depends(deps.get_current_active_user)
) -> Any:
    """
    Retrieve inventory sessions list with fast aggregate counts (no heavy lines payload).
    """
    sessions = db.query(InventorySession).order_by(InventorySession.id.desc()).offset(skip).limit(limit).all()
    session_ids = [s.id for s in sessions]
    line_counts = {}
    if session_ids:
        from sqlalchemy.sql import func
        counts = db.query(InventoryLine.session_id, func.count(InventoryLine.id))\
            .filter(InventoryLine.session_id.in_(session_ids))\
            .group_by(InventoryLine.session_id).all()
        line_counts = {c[0]: c[1] for c in counts}

    results = []
    for s in sessions:
        results.append(schemas.InventorySessionListItem(
            id=s.id,
            name=s.name,
            facility_id=s.facility_id,
            warehouse_id=s.warehouse_id,
            scope_type=s.scope_type,
            scope_value=s.scope_value,
            state=s.state,
            date_start=s.date_start,
            date_end=s.date_end,
            total_lines=line_counts.get(s.id, 0),
            lines=[]
        ))
    return results

@router.get("/{id}", response_model=schemas.InventorySession)
def get_inventory_session(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    current_user: Any = Depends(deps.get_current_active_user)
) -> Any:
    session = db.query(InventorySession).filter(InventorySession.id == id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    is_supervisor = False
    if hasattr(current_user, 'roles'):
        is_supervisor = any(r.name.upper() in ('SUPERVISOR', 'ADMIN', 'GERENTE') for r in current_user.roles)
        
    if is_supervisor:
        attach_anomaly_fields(session, db)
    else:
        for line in session.lines:
            line.theoretical_qty = None
            line.difference_qty = None
            line.is_anomaly = False
            line.anomaly_reason = None
            
    return session

@router.post("/", response_model=schemas.InventorySession)
def create_inventory_session(
    *,
    db: Session = Depends(deps.get_db),
    session_in: schemas.InventorySessionCreate,
) -> Any:
    db_obj = InventorySession(
        name=session_in.name,
        facility_id=session_in.facility_id,
        warehouse_id=session_in.warehouse_id,
        scope_type=session_in.scope_type or "GENERAL",
        scope_value=session_in.scope_value,
        state="IN_PROGRESS"
    )
    db.add(db_obj)
    db.flush()

    target_wh = None
    if session_in.warehouse_id:
        target_wh = db.query(Warehouse).filter(Warehouse.id == session_in.warehouse_id).first()
    elif session_in.facility_id:
        target_wh = db.query(Warehouse).filter(Warehouse.facility_id == session_in.facility_id).first()

    # Capturar Fotografía Teórica (Snapshot) para la Toma Física
    snapshots_query = db.query(InventorySnapshot)
    if session_in.facility_id:
        snapshots_query = snapshots_query.filter(InventorySnapshot.facility_id == session_in.facility_id)

    # Filtrar por Categoría Jerárquica (si se especifica en scope_value, category_id o scope_type == 'CYCLIC')
    cat_id_to_filter = session_in.category_id or (int(session_in.scope_value) if (session_in.scope_value and session_in.scope_value.isdigit()) else None)
    if cat_id_to_filter:
        cat_ids = get_all_descendant_category_ids(db, cat_id_to_filter)
        prod_ids = db.query(Product.id).filter(Product.category_id.in_(cat_ids)).all()
        p_ids = [p.id for p in prod_ids]
        var_ids = db.query(ProductVariant.id).filter(ProductVariant.product_id.in_(p_ids)).all()
        target_vids = [v.id for v in var_ids]
        snapshots_query = snapshots_query.filter(InventorySnapshot.variant_id.in_(target_vids))

    snapshots = snapshots_query.all()
    default_loc = db.query(Location).filter(Location.warehouse_id == target_wh.id).first() if target_wh else None
    assigned_loc_id = session_in.location_id or (default_loc.id if default_loc else None)

    for snap in snapshots:
        line = InventoryLine(
            session_id=db_obj.id,
            product_variant_id=snap.variant_id,
            location_id=assigned_loc_id,
            theoretical_qty=float(snap.stock_qty or 0),
            counted_qty=0.0,
            notes=None
        )
        db.add(line)

    db.commit()
    db.refresh(db_obj)
    return db_obj


@router.post("/{id}/count", response_model=schemas.InventorySession)
def record_line_count(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    line_in: schemas.InventoryLineCreate,
) -> Any:
    session = db.query(InventorySession).filter(InventorySession.id == id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    if session.state == "DONE":
        raise HTTPException(status_code=400, detail="La sesión ya fue validada y consolidada.")

    # Validar unidad de medida del producto
    variant = db.query(ProductVariant).filter(ProductVariant.id == line_in.product_variant_id).first()
    prod = variant.product if (variant and hasattr(variant, 'product')) else None
    uom = (prod.uom_base if prod else None) or (variant.uom_base if variant else None) or "UND"
    validate_quantity_uom(line_in.counted_qty, uom, item_label=prod.name if prod else f"Variante #{line_in.product_variant_id}")

    # Buscar línea existente o crear nueva
    existing_line = db.query(InventoryLine).filter(
        InventoryLine.session_id == id,
        InventoryLine.product_variant_id == line_in.product_variant_id
    ).first()

    if existing_line:
        existing_line.counted_qty = line_in.counted_qty
        if line_in.location_id:
            existing_line.location_id = line_in.location_id
        if line_in.notes:
            existing_line.notes = line_in.notes
    else:
        # Consultar stock teórico snapshot
        snap = db.query(InventorySnapshot).filter(
            InventorySnapshot.variant_id == line_in.product_variant_id,
            InventorySnapshot.facility_id == session.facility_id
        ).first()
        theo = float(snap.stock_qty) if snap else 0.0

        new_line = InventoryLine(
            session_id=session.id,
            product_variant_id=line_in.product_variant_id,
            location_id=line_in.location_id,
            theoretical_qty=theo,
            counted_qty=line_in.counted_qty,
            notes=line_in.notes
        )
        db.add(new_line)

    db.commit()
    db.refresh(session)
    return session

@router.post("/{id}/lines/bulk", response_model=schemas.InventorySession)
def bulk_upload_lines(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    bulk_in: schemas.InventoryLineBulkUpload,
) -> Any:
    session = db.query(InventorySession).filter(InventorySession.id == id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    count_inserted = 0
    for item in bulk_in.lines:
        code_clean = (item.sku or "").strip()
        if not code_clean:
            continue
            
        variant = db.query(ProductVariant).filter(
            (ProductVariant.sku.ilike(code_clean)) |
            (ProductVariant.barcode.ilike(code_clean)) |
            (ProductVariant.part_number.ilike(code_clean))
        ).first()
        if not variant:
            barcode = db.query(ProductBarcode).filter(ProductBarcode.barcode.ilike(code_clean)).first()
            if barcode:
                variant = db.query(ProductVariant).filter(ProductVariant.id == barcode.product_variant_id).first()
        if not variant:
            supplier_prod = db.query(SupplierProduct).filter(SupplierProduct.supplier_sku.ilike(code_clean)).first()
            if supplier_prod:
                variant = db.query(ProductVariant).filter(ProductVariant.id == supplier_prod.variant_id).first()
                
        loc_code_clean = (item.location_code or "").strip()
        location = db.query(Location).filter(Location.code.ilike(loc_code_clean)).first()
        
        if not variant or not location:
            # Saltamos silenciosamente los códigos o Ubicaciones no encontrados
            continue

        prod = variant.product if (variant and hasattr(variant, 'product')) else None
        uom = (prod.uom_base if prod else None) or (variant.uom_base if variant else None) or "UND"
        validate_quantity_uom(item.counted_qty, uom, item_label=prod.name if prod else f"SKU {item.sku}")
            
        # Validar Filtros de Alcance (Scope Filters)
        if session.scope_type == 'WAREHOUSE' and session.scope_value:
            try:
                scope_wh_id = int(session.scope_value)
                if location.warehouse_id != scope_wh_id:
                    continue
            except ValueError:
                pass
        elif session.scope_type == 'LOCATION' and session.scope_value:
            try:
                scope_loc_id = int(session.scope_value)
                if location.id != scope_loc_id:
                    continue
            except ValueError:
                if location.code != session.scope_value:
                    continue
        elif session.scope_type in ('CATEGORY', 'CYCLIC') and session.scope_value and variant.product:
            try:
                scope_cat_id = int(session.scope_value)
                valid_cat_ids = get_all_descendant_category_ids(db, scope_cat_id)
                if variant.product.category_id not in valid_cat_ids:
                    continue
            except ValueError:
                pass
            
        # Calcular Stock Teórico dinámico desde InventorySnapshot
        snapshot = db.query(InventorySnapshot).filter_by(
            variant_id=variant.id,
            facility_id=session.facility_id
        ).first()
        
        theoretical = float(snapshot.stock_qty) if snapshot else 0.0
        
        db_line = InventoryLine(
            session_id=session.id,
            product_variant_id=variant.id,
            location_id=location.id,
            theoretical_qty=theoretical,
            counted_qty=item.counted_qty,
            notes=item.notes
        )
        db.add(db_line)
        
        # Mapeo vital de costos para la carga inicial
        if item.cost is not None:
             variant.average_cost = item.cost
             variant.last_cost = item.cost
             variant.standard_cost = item.cost
             
        count_inserted += 1
    
    db.commit()
    db.refresh(session)
    return session
    
@router.post("/{id}/validate")
def validate_session(
    *,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
    id: int,
) -> Any:
    session = db.query(InventorySession).filter(InventorySession.id == id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    if session.state == "DONE":
        raise HTTPException(status_code=400, detail="Ya se encuentra consolidada.")
        
    target_wh = db.query(Warehouse).filter(Warehouse.facility_id == session.facility_id).first() if session.facility_id else None
    virtual_loss_loc = db.query(Location).filter(Location.code == "INV_ADJ").first()
    if not virtual_loss_loc:
        virtual_loss_loc = Location(
            name="Ubicación Virtual de Ajustes",
            code="INV_ADJ",
            location_type="LOSS",
            warehouse_id=target_wh.id if target_wh else None
        )
        db.add(virtual_loss_loc)
        db.flush()
        
    user_id_val = getattr(current_user, 'id', None)

    # Si el alcance es GENERAL (Total Almacén), todo producto del almacén no contado se debe llevar a CERO (0)
    if session.scope_type == 'GENERAL':
        existing_vids = {line.product_variant_id for line in session.lines}
        all_snapshots = db.query(InventorySnapshot).filter(InventorySnapshot.facility_id == session.facility_id).all()
        default_loc = db.query(Location).filter(Location.warehouse_id == target_wh.id).first() if target_wh else None

        for snap in all_snapshots:
            if snap.variant_id not in existing_vids:
                new_zero_line = InventoryLine(
                    session_id=session.id,
                    product_variant_id=snap.variant_id,
                    location_id=default_loc.id if default_loc else None,
                    theoretical_qty=float(snap.stock_qty or 0),
                    counted_qty=0.0,
                    notes="Ajuste a CERO por Toma General No Contada"
                )
                db.add(new_zero_line)
        db.flush()

    # Consolidar líneas (Delta Dinámico)
    for line in session.lines:
        diff = float(line.counted_qty or 0) - float(line.theoretical_qty or 0)
        
        if diff == 0:
            continue
            
        # Generar movimientos matemáticos compensatorios
        src_id = virtual_loss_loc.id if diff > 0 else (line.location_id or virtual_loss_loc.id)
        dest_id = (line.location_id or virtual_loss_loc.id) if diff > 0 else virtual_loss_loc.id
        
        # Consultar Costo en tiempo real
        variant = db.query(ProductVariant).filter(ProductVariant.id == line.product_variant_id).first()
        current_cost = variant.average_cost if variant else 0
        
        move = StockMove(
            product_id=line.product_variant_id,
            location_src_id=src_id,
            location_dest_id=dest_id,
            quantity_demand=abs(diff),
            quantity_done=abs(diff),
            state="DONE",
            reference=f"TOMA-FISICA-{session.id}",
            unit_cost=current_cost,
            created_by_id=user_id_val
        )
        db.add(move)
        
        # Actualización de la Pizarra Snapshot
        snapshot = db.query(InventorySnapshot).filter_by(
            variant_id=line.product_variant_id,
            facility_id=session.facility_id
        ).first()
        
        if not snapshot:
            snapshot = InventorySnapshot(
                variant_id=line.product_variant_id,
                facility_id=session.facility_id,
                stock_qty=0,
                avg_cost=current_cost
            )
            db.add(snapshot)
            
        snapshot.stock_qty = float(snapshot.stock_qty) + diff
        
    session.state = "DONE"
    session.date_end = datetime.now()
    db.commit()
    return {"status": "success", "message": "Toma Física validada y consolidada exitosamente."}


@router.post("/{id}/advance-phase")
def advance_session_phase(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    target_state: str = "REVIEW"
) -> Any:
    session = db.query(InventorySession).filter(InventorySession.id == id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    if session.state == "DONE":
        raise HTTPException(status_code=400, detail="Sesión ya se encuentra finalizada.")

    session.state = target_state
    db.commit()
    db.refresh(session)
    return session


@router.post("/{id}/ai-audit")
def run_ai_audit(
    *,
    db: Session = Depends(deps.get_db),
    id: int
) -> Any:
    session = db.query(InventorySession).filter(InventorySession.id == id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    total_items = len(session.lines)
    exact_matches = 0
    anomalies = []
    total_val_diff = 0.0

    for line in session.lines:
        diff = float(line.counted_qty or 0) - float(line.theoretical_qty or 0)
        variant = db.query(ProductVariant).filter(ProductVariant.id == line.product_variant_id).first()
        cost = float(variant.average_cost or variant.standard_cost or 1.0) if variant else 1.0
        val_diff = round(diff * cost, 2)
        total_val_diff += val_diff

        if diff == 0:
            exact_matches += 1
        elif abs(val_diff) >= 50.0 or abs(diff) >= 10:
            anomalies.append({
                "line_id": line.id,
                "variant_id": line.product_variant_id,
                "sku": variant.sku if variant else f"VAR-{line.product_variant_id}",
                "name": variant.product.name if (variant and variant.product) else f"Producto #{line.product_variant_id}",
                "counted": line.counted_qty,
                "theoretical": line.theoretical_qty,
                "diff": diff,
                "val_diff": val_diff
            })

    accuracy_pct = round((exact_matches / total_items * 100.0), 2) if total_items > 0 else 100.0

    recommendation = ""
    if len(anomalies) == 0:
        recommendation = "✅ Auditoría IA Conforme: 100% de coincidencia física. Se sugiere proceder con la Consolidación Final."
    else:
        top_anom = sorted(anomalies, key=lambda x: abs(x['val_diff']), reverse=True)[0]
        recommendation = f"⚠️ Alerta Auditoría IA: Se detectaron {len(anomalies)} anomalías de impacto significativo. Descuadre principal en SKU [{top_anom['sku']}] {top_anom['name']} (Variación: ${top_anom['val_diff']} USD). Recomendación: Enviar a Reconteo (2da Vuelta) antes de consolidar."

    return {
        "accuracy_pct": accuracy_pct,
        "total_items": total_items,
        "exact_matches": exact_matches,
        "anomalies_count": len(anomalies),
        "total_value_diff_usd": round(total_val_diff, 2),
        "anomalies": anomalies,
        "ai_recommendation": recommendation
    }
