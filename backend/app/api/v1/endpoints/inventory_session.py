from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api import deps
from app.schemas import inventory_session as schemas
from app.models.inventory import InventorySession, InventoryLine, Product, ProductVariant, Location, StockMove, InventorySnapshot, ProductBarcode, Category, Warehouse, AdjustmentReason
from app.models.purchasing import SupplierProduct
from app.models.core import User
from app.core.uom import validate_quantity_uom
from datetime import datetime

router = APIRouter()

def get_category_breadcrumb_path(db: Session, cat_id: int) -> Optional[str]:
    """
    Returns the breadcrumb string for a category (e.g. 'CIGARROS > CIGARROS/CHIMO/ENCENDEDORES > CIGARROS').
    """
    cat = db.query(Category).filter(Category.id == cat_id).first()
    if not cat:
        return None
    chain = []
    curr = cat
    visited = set()
    while curr and curr.id not in visited:
        visited.add(curr.id)
        chain.append(curr.name)
        if curr.parent_id:
            curr = db.query(Category).filter(Category.id == curr.parent_id).first()
        else:
            break
    return " > ".join(reversed(chain))

def get_all_related_category_ids(db: Session, cat_id: int) -> List[int]:
    """
    Returns the target category id along with all descendants in the hierarchy
    (children, grandchildren, etc.).
    Guarantees strict hierarchical containment:
    - If a user chooses a root department, all its groups and subgroups are included.
    - If a user chooses a group, all its subgroups are included.
    - If a user chooses a subgroup, ONLY that subgroup and its children are included (never parent groups or departments).
    """
    if not cat_id:
        return []
    all_cat_ids = {cat_id}
    target_cat = db.query(Category).filter(Category.id == cat_id).first()
    if not target_cat:
        return list(all_cat_ids)

    # 1. If path is present, fetch subcategories by path prefix (downwards)
    if target_cat.path:
        sub_cats = db.query(Category.id).filter(
            (Category.id == target_cat.id) | (Category.path.like(f"{target_cat.path}/%"))
        ).all()
        for sc in sub_cats:
            all_cat_ids.add(sc.id)

    # 3. Traverse parent_id DOWNWARDS to catch any subcategories
    visited_desc = set()
    to_visit = [cat_id]
    while to_visit:
        curr_id = to_visit.pop(0)
        visited_desc.add(curr_id)
        children = db.query(Category.id).filter(Category.parent_id == curr_id).all()
        for ch in children:
            all_cat_ids.add(ch.id)
            if ch.id not in visited_desc and ch.id not in to_visit:
                to_visit.append(ch.id)

    return list(all_cat_ids)

def get_all_descendant_category_ids(db: Session, root_cat_id: int) -> List[int]:
    """
    Backwards-compatible wrapper delegating to get_all_related_category_ids
    so that all callers automatically benefit from bidirectional resolution.
    """
    return get_all_related_category_ids(db, root_cat_id)

def populate_session_category_metadata(session: Any, db: Session):
    """
    Safely attaches category_id, category_name, category_full_path, valid_category_ids,
    facility_name, warehouse_name, and location_name to an InventorySession instance.
    """
    cat_id = getattr(session, 'category_id', None)
    if not cat_id and session.scope_type in ('CATEGORY', 'CYCLIC') and session.scope_value:
        clean_val = str(session.scope_value).strip()
        if clean_val.isdigit():
            cat_id = int(clean_val)
    if cat_id:
        setattr(session, 'category_id', cat_id)
        cat_obj = db.query(Category).filter(Category.id == cat_id).first()
        if cat_obj:
            setattr(session, 'category_name', cat_obj.name)
            setattr(session, 'category_full_path', get_category_breadcrumb_path(db, cat_id))
        setattr(session, 'valid_category_ids', get_all_related_category_ids(db, cat_id))

    if getattr(session, 'facility_id', None):
        from app.models.core import Facility
        fac = db.query(Facility).filter(Facility.id == session.facility_id).first()
        if fac:
            setattr(session, 'facility_name', f"{fac.name} ({fac.code})" if fac.code else fac.name)

    if getattr(session, 'warehouse_id', None):
        wh = db.query(Warehouse).filter(Warehouse.id == session.warehouse_id).first()
        if wh:
            setattr(session, 'warehouse_name', wh.name)

    loc_id = getattr(session, 'location_id', None)
    if not loc_id and getattr(session, 'lines', None):
        first_line_loc = next((l.location_id for l in session.lines if l.location_id), None)
        if first_line_loc:
            loc_id = first_line_loc
            setattr(session, 'location_id', loc_id)
    if loc_id:
        loc = db.query(Location).filter(Location.id == loc_id).first()
        if loc:
            setattr(session, 'location_name', f"{loc.name} ({loc.code})" if loc.code else loc.name)

def populate_line_details(session: InventorySession, db: Session, is_supervisor: bool = False):
    """
    Populates product_name, sku, and uom_base on all lines for both operators and supervisors.
    For non-supervisors, masks theoretical quantities and anomalies for blind counting.
    For supervisors, calculates discrepancies, anomalies, and anomaly reasons.
    """
    if not session or not session.lines:
        return

    v_ids = [line.product_variant_id for line in session.lines if line.product_variant_id]
    variant_map = {}
    if v_ids:
        from sqlalchemy.orm import joinedload
        variants = db.query(ProductVariant).options(joinedload(ProductVariant.product))\
            .filter(ProductVariant.id.in_(v_ids)).all()
        variant_map = {v.id: v for v in variants}

    reason_ids = [line.adjustment_reason_id for line in session.lines if getattr(line, 'adjustment_reason_id', None)]
    reason_map = {}
    if reason_ids:
        reasons = db.query(AdjustmentReason).filter(AdjustmentReason.id.in_(reason_ids)).all()
        reason_map = {r.id: r for r in reasons}

    for line in session.lines:
        variant = variant_map.get(line.product_variant_id)
        prod = variant.product if (variant and hasattr(variant, 'product')) else None
        line.uom_base = (prod.uom_base if prod else None) or (variant.uom_base if variant else None) or "UND"
        line.sku = variant.sku if variant else f"ID {line.product_variant_id}"
        line.product_name = prod.name if prod else f"Producto #{line.product_variant_id}"

        r_id = getattr(line, 'adjustment_reason_id', None)
        if r_id and r_id in reason_map:
            r = reason_map[r_id]
            line.adjustment_reason_code = r.code
            line.adjustment_reason_name = r.name
        else:
            line.adjustment_reason_code = None
            line.adjustment_reason_name = None

        if not is_supervisor:
            line.theoretical_qty = None
            line.difference_qty = None
            line.is_anomaly = False
            line.anomaly_reason = None
        else:
            line.is_anomaly = False
            line.anomaly_reason = None
            diff = float(line.counted_qty or 0) - float(line.theoretical_qty or 0)
            line.difference_qty = diff
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

def attach_anomaly_fields(session: InventorySession, db: Session):
    """
    Backwards-compatible wrapper delegating to populate_line_details with is_supervisor=True.
    """
    populate_line_details(session, db, is_supervisor=True)

@router.get("/", response_model=List[schemas.InventorySessionListItem])
def read_inventory_sessions(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: Any = Depends(deps.get_current_active_user)
) -> Any:
    """
    Retrieve inventory sessions list with fast aggregate counts, facilities, and category breadcrumbs.
    """
    from app.api.v1.endpoints.catalog import build_category_metadata_map
    from app.models.core import Facility
    cat_meta = build_category_metadata_map(db)
    facs = {f.id: (f"{f.name} ({f.code})" if f.code else f.name) for f in db.query(Facility).all()}
    whs = {w.id: w.name for w in db.query(Warehouse).all()}

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
        cat_id = None
        if s.scope_type in ('CATEGORY', 'CYCLIC') and s.scope_value:
            clean_s = str(s.scope_value).strip()
            if clean_s.isdigit():
                cat_id = int(clean_s)
        meta = cat_meta.get(cat_id) if cat_id else None

        results.append(schemas.InventorySessionListItem(
            id=s.id,
            name=s.name,
            facility_id=s.facility_id,
            facility_name=facs.get(s.facility_id),
            warehouse_id=s.warehouse_id,
            warehouse_name=whs.get(s.warehouse_id),
            scope_type=s.scope_type,
            scope_value=s.scope_value,
            category_id=cat_id,
            category_name=meta.get("full_path", "").split(" > ")[-1] if (meta and meta.get("full_path")) else None,
            category_full_path=meta.get("full_path") if meta else None,
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
        
    populate_line_details(session, db, is_supervisor=is_supervisor)
    populate_session_category_metadata(session, db)
    return session


@router.post("/", response_model=schemas.InventorySession)
def create_inventory_session(
    *,
    db: Session = Depends(deps.get_db),
    session_in: schemas.InventorySessionCreate,
) -> Any:
    cat_id_to_filter = session_in.category_id or (int(session_in.scope_value.strip()) if (session_in.scope_value and session_in.scope_value.strip().isdigit()) else None)
    scope_val = session_in.scope_value or (str(cat_id_to_filter) if cat_id_to_filter else None)

    db_obj = InventorySession(
        name=session_in.name,
        facility_id=session_in.facility_id,
        warehouse_id=session_in.warehouse_id,
        scope_type=session_in.scope_type or "GENERAL",
        scope_value=scope_val,
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

    default_loc = db.query(Location).filter(Location.warehouse_id == target_wh.id).first() if target_wh else None
    assigned_loc_id = None
    if session_in.location_id and target_wh:
        valid_loc = db.query(Location).filter(Location.id == session_in.location_id, Location.warehouse_id == target_wh.id).first()
        if valid_loc:
            assigned_loc_id = valid_loc.id
    if not assigned_loc_id and default_loc:
        assigned_loc_id = default_loc.id

    # Filtrar por Categoría Jerárquica (si se especifica en scope_value, category_id o scope_type == 'CYCLIC')
    if cat_id_to_filter:
        cat_ids = get_all_related_category_ids(db, cat_id_to_filter)
        prod_ids = db.query(Product.id).filter(
            Product.category_id.in_(cat_ids),
            Product.is_active.isnot(False)
        ).all()
        p_ids = [p.id for p in prod_ids]
        var_ids = db.query(ProductVariant.id).filter(
            ProductVariant.product_id.in_(p_ids),
            ProductVariant.is_active.isnot(False)
        ).all()
        target_vids = [v.id for v in var_ids]
        snapshots = snapshots_query.filter(InventorySnapshot.variant_id.in_(target_vids)).all()
        snap_map = {s.variant_id: float(s.stock_qty or 0) for s in snapshots}

        for vid in target_vids:
            line = InventoryLine(
                session_id=db_obj.id,
                product_variant_id=vid,
                location_id=assigned_loc_id,
                theoretical_qty=snap_map.get(vid, 0.0),
                counted_qty=0.0,
                notes=None
            )
            db.add(line)
    else:
        snapshots = snapshots_query.all()
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
    populate_session_category_metadata(db_obj, db)
    populate_line_details(db_obj, db, is_supervisor=True)
    return db_obj



@router.post("/{id}/count", response_model=schemas.InventorySession)
def record_line_count(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    line_in: schemas.InventoryLineCreate,
    current_user: Optional[Any] = Depends(deps.get_current_active_user),
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

    # Validar que el producto pertenezca a la categoría asignada si es conteo cíclico
    if session.scope_type in ('CATEGORY', 'CYCLIC') and session.scope_value:
        clean_val = str(session.scope_value).strip()
        if clean_val.isdigit():
            scope_cat_id = int(clean_val)
            valid_cat_ids = get_all_related_category_ids(db, scope_cat_id)
            if prod and prod.category_id not in valid_cat_ids:
                cat_obj = db.query(Category).filter(Category.id == scope_cat_id).first()
                cat_label = get_category_breadcrumb_path(db, scope_cat_id) or (cat_obj.name if cat_obj else f"#{scope_cat_id}")
                raise HTTPException(
                    status_code=400,
                    detail=f"El producto '{prod.name}' no pertenece a la categoría '{cat_label}' configurada para esta toma física cíclica."
                )

    # Validar que la ubicación pertenezca al almacén de la sesión
    target_wh = None
    if session.warehouse_id:
        target_wh = db.query(Warehouse).filter(Warehouse.id == session.warehouse_id).first()
    elif session.facility_id:
        target_wh = db.query(Warehouse).filter(Warehouse.facility_id == session.facility_id).first()
    default_loc = db.query(Location).filter(Location.warehouse_id == target_wh.id).first() if target_wh else None

    line_loc_id = None
    if line_in.location_id and target_wh:
        valid_loc = db.query(Location).filter(Location.id == line_in.location_id, Location.warehouse_id == target_wh.id).first()
        if valid_loc:
            line_loc_id = valid_loc.id
    if not line_loc_id and default_loc:
        line_loc_id = default_loc.id

    # Buscar línea existente o crear nueva
    existing_line = db.query(InventoryLine).filter(
        InventoryLine.session_id == id,
        InventoryLine.product_variant_id == line_in.product_variant_id
    ).first()

    if existing_line:
        existing_line.counted_qty = line_in.counted_qty
        if line_loc_id:
            existing_line.location_id = line_loc_id
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
            location_id=line_loc_id,
            theoretical_qty=theo,
            counted_qty=line_in.counted_qty,
            notes=line_in.notes
        )
        db.add(new_line)

    db.commit()
    db.refresh(session)
    populate_session_category_metadata(session, db)
    is_supervisor = False
    if current_user and hasattr(current_user, 'roles'):
        is_supervisor = any(r.name.upper() in ('SUPERVISOR', 'ADMIN', 'GERENTE') for r in current_user.roles)
    populate_line_details(session, db, is_supervisor=is_supervisor)
    return session


@router.patch("/{id}/lines/{line_id}/reason", response_model=schemas.InventoryLine)
def update_line_adjustment_reason(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    line_id: int,
    payload: schemas.InventoryLineReasonUpdate,
    current_user: Any = Depends(deps.get_current_active_user)
) -> Any:
    """
    Asignar o actualizar el motivo contable de ajuste para una línea específica en Fase 2 (REVIEW).
    """
    session = db.query(InventorySession).filter(InventorySession.id == id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    if session.state == "DONE":
        raise HTTPException(status_code=400, detail="No se pueden modificar motivos de una sesión finalizada.")

    line = db.query(InventoryLine).filter(InventoryLine.id == line_id, InventoryLine.session_id == id).first()
    if not line:
        raise HTTPException(status_code=404, detail="Línea no encontrada")

    if payload.adjustment_reason_id is not None:
        if payload.adjustment_reason_id > 0:
            reason = db.query(AdjustmentReason).filter(AdjustmentReason.id == payload.adjustment_reason_id).first()
            if not reason:
                raise HTTPException(status_code=404, detail="Motivo de ajuste no encontrado")
            line.adjustment_reason_id = reason.id
        else:
            line.adjustment_reason_id = None

    if payload.notes is not None:
        line.notes = payload.notes

    db.commit()
    db.refresh(line)

    if line.adjustment_reason_id:
        r = db.query(AdjustmentReason).filter(AdjustmentReason.id == line.adjustment_reason_id).first()
        line.adjustment_reason_code = r.code if r else None
        line.adjustment_reason_name = r.name if r else None
    else:
        line.adjustment_reason_code = None
        line.adjustment_reason_name = None

    variant = db.query(ProductVariant).filter(ProductVariant.id == line.product_variant_id).first()
    prod = variant.product if variant else None
    line.sku = variant.sku if variant else None
    line.product_name = prod.name if prod else None
    line.uom_base = prod.uom_base if prod else "UND"
    diff = float(line.counted_qty or 0) - float(line.theoretical_qty or 0)
    line.difference_qty = diff
    return line


@router.post("/{id}/lines/reasons/batch", response_model=schemas.InventorySession)
def batch_assign_adjustment_reasons(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    payload: schemas.InventorySessionBatchReasonUpdate,
    current_user: Any = Depends(deps.get_current_active_user)
) -> Any:
    """
    Asignación masiva rápida de motivos de ajuste a todos los faltantes (OUT) y/o sobrantes (IN).
    """
    session = db.query(InventorySession).filter(InventorySession.id == id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    if session.state == "DONE":
        raise HTTPException(status_code=400, detail="No se pueden modificar motivos de una sesión finalizada.")

    if payload.reason_id_out is not None:
        reason_out = db.query(AdjustmentReason).filter(AdjustmentReason.id == payload.reason_id_out).first() if payload.reason_id_out > 0 else None
        for line in session.lines:
            diff = float(line.counted_qty or 0) - float(line.theoretical_qty or 0)
            if diff < 0:
                line.adjustment_reason_id = reason_out.id if reason_out else None

    if payload.reason_id_in is not None:
        reason_in = db.query(AdjustmentReason).filter(AdjustmentReason.id == payload.reason_id_in).first() if payload.reason_id_in > 0 else None
        for line in session.lines:
            diff = float(line.counted_qty or 0) - float(line.theoretical_qty or 0)
            if diff > 0:
                line.adjustment_reason_id = reason_in.id if reason_in else None

    db.commit()
    db.refresh(session)
    populate_session_category_metadata(session, db)
    populate_line_details(session, db, is_supervisor=True)
    return session


@router.post("/{id}/refresh-lines", response_model=schemas.InventorySession)
def refresh_session_lines(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    current_user: Any = Depends(deps.get_current_active_user)
) -> Any:
    """
    Populate or refresh snapshot lines for an active session with bidirectional category hierarchy matching.
    """
    session = db.query(InventorySession).filter(InventorySession.id == id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    if session.state == "DONE":
        raise HTTPException(status_code=400, detail="No se pueden refrescar líneas de una sesión finalizada.")

    target_wh = None
    if session.warehouse_id:
        target_wh = db.query(Warehouse).filter(Warehouse.id == session.warehouse_id).first()
    elif session.facility_id:
        target_wh = db.query(Warehouse).filter(Warehouse.facility_id == session.facility_id).first()

    default_loc = db.query(Location).filter(Location.warehouse_id == target_wh.id).first() if target_wh else None
    assigned_loc_id = default_loc.id if default_loc else None

    # Sanitizar líneas existentes para garantizar que su ubicación corresponda al almacén
    if target_wh and default_loc and session.lines:
        for l in session.lines:
            if not l.location_id:
                l.location_id = default_loc.id
            else:
                loc_check = db.query(Location.warehouse_id).filter(Location.id == l.location_id).first()
                if not loc_check or loc_check[0] != target_wh.id:
                    l.location_id = default_loc.id

    snapshots_query = db.query(InventorySnapshot)
    if session.facility_id:
        snapshots_query = snapshots_query.filter(InventorySnapshot.facility_id == session.facility_id)

    cat_id_to_filter = getattr(session, 'category_id', None) or (
        int(session.scope_value.strip()) if (session.scope_value and session.scope_value.strip().isdigit()) else None
    )
    if cat_id_to_filter:
        cat_ids = get_all_related_category_ids(db, cat_id_to_filter)
        prod_ids = db.query(Product.id).filter(
            Product.category_id.in_(cat_ids),
            Product.is_active.isnot(False)
        ).all()
        p_ids = [p.id for p in prod_ids]
        var_ids = db.query(ProductVariant.id).filter(
            ProductVariant.product_id.in_(p_ids),
            ProductVariant.is_active.isnot(False)
        ).all()
        target_vids = [v.id for v in var_ids]
        snapshots = snapshots_query.filter(InventorySnapshot.variant_id.in_(target_vids)).all()
        snap_map = {s.variant_id: float(s.stock_qty or 0) for s in snapshots}

        existing_lines_map = {line.product_variant_id: line for line in session.lines}
        for vid in target_vids:
            if vid in existing_lines_map:
                existing_line = existing_lines_map[vid]
                if (existing_line.counted_qty or 0.0) == 0.0 and vid in snap_map:
                    existing_line.theoretical_qty = snap_map[vid]
            else:
                line = InventoryLine(
                    session_id=session.id,
                    product_variant_id=vid,
                    location_id=assigned_loc_id,
                    theoretical_qty=snap_map.get(vid, 0.0),
                    counted_qty=0.0,
                    notes=None
                )
        # Remove lines that no longer belong to target_vids (only if counted_qty == 0)
        target_vids_set = set(target_vids)
        for line in list(session.lines):
            if line.product_variant_id not in target_vids_set and (line.counted_qty or 0.0) == 0.0:
                db.delete(line)
    else:
        snapshots = snapshots_query.all()
        existing_lines_map = {line.product_variant_id: line for line in session.lines}

        for snap in snapshots:
            if snap.variant_id in existing_lines_map:
                existing_line = existing_lines_map[snap.variant_id]
                if (existing_line.counted_qty or 0.0) == 0.0:
                    existing_line.theoretical_qty = float(snap.stock_qty or 0)
            else:
                line = InventoryLine(
                    session_id=session.id,
                    product_variant_id=snap.variant_id,
                    location_id=assigned_loc_id,
                    theoretical_qty=float(snap.stock_qty or 0),
                    counted_qty=0.0,
                    notes=None
                )
                db.add(line)

    db.commit()
    db.refresh(session)
    populate_session_category_metadata(session, db)
    is_supervisor = False
    if hasattr(current_user, 'roles'):
        is_supervisor = any(r.name.upper() in ('SUPERVISOR', 'ADMIN', 'GERENTE') for r in current_user.roles)
    populate_line_details(session, db, is_supervisor=is_supervisor)
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
                scope_cat_id = int(str(session.scope_value).strip())
                valid_cat_ids = get_all_related_category_ids(db, scope_cat_id)
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
    populate_session_category_metadata(session, db)
    populate_line_details(session, db, is_supervisor=True)
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
        
    target_wh = None
    if session.warehouse_id:
        target_wh = db.query(Warehouse).filter(Warehouse.id == session.warehouse_id).first()
    elif session.facility_id:
        target_wh = db.query(Warehouse).filter(Warehouse.facility_id == session.facility_id).first()
    default_loc = db.query(Location).filter(Location.warehouse_id == target_wh.id).first() if target_wh else None

    virtual_loss_loc = db.query(Location).filter(Location.code == "INV_ADJ").first()
    if not virtual_loss_loc:
        virtual_loss_loc = Location(
            name="Ubicación Virtual de Ajustes",
            code="INV_ADJ",
            usage="EXTERNAL",
            location_type="LOSS",
            warehouse_id=None
        )
        db.add(virtual_loss_loc)
        db.flush()
    elif virtual_loss_loc.warehouse_id is not None:
        virtual_loss_loc.warehouse_id = None
        db.add(virtual_loss_loc)
        db.flush()
        
    user_id_val = getattr(current_user, 'id', None)

    # Si el alcance es GENERAL (Total Almacén), todo producto del almacén no contado se debe llevar a CERO (0)
    if session.scope_type == 'GENERAL':
        existing_vids = {line.product_variant_id for line in session.lines}
        all_snapshots = db.query(InventorySnapshot).filter(InventorySnapshot.facility_id == session.facility_id).all()

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
        
        # Garantizar que la ubicación física pertenezca estrictamente al almacén de la sesión
        line_loc = db.query(Location).filter(Location.id == line.location_id).first() if line.location_id else None
        if not line_loc or (target_wh and line_loc.warehouse_id != target_wh.id):
            physical_loc_id = default_loc.id if default_loc else (line.location_id or virtual_loss_loc.id)
            line.location_id = physical_loc_id
        else:
            physical_loc_id = line_loc.id

        if diff == 0:
            continue
            
        # Generar movimientos matemáticos compensatorios
        src_id = virtual_loss_loc.id if diff > 0 else physical_loc_id
        dest_id = physical_loc_id if diff > 0 else virtual_loss_loc.id
        
        # Consultar Costo en tiempo real
        variant = db.query(ProductVariant).filter(ProductVariant.id == line.product_variant_id).first()
        current_cost = variant.average_cost if variant else 0

        # Razón y notas de auditoría
        reason_obj = db.query(AdjustmentReason).filter(AdjustmentReason.id == line.adjustment_reason_id).first() if line.adjustment_reason_id else None
        reason_note = f"[{reason_obj.code}] {reason_obj.name}" if reason_obj else ""

        move_notes = f"Ajuste Toma Física #{session.id}"
        if reason_note:
            move_notes = f"{reason_note} - {move_notes}"
        if line.notes:
            move_notes = f"{move_notes} ({line.notes})"

        move = StockMove(
            product_id=line.product_variant_id,
            location_src_id=src_id,
            location_dest_id=dest_id,
            quantity_demand=abs(diff),
            quantity_done=abs(diff),
            state="DONE",
            reference=f"TOMA-FISICA-{session.id}",
            unit_cost=current_cost,
            created_by_id=user_id_val,
            adjustment_reason_id=line.adjustment_reason_id,
            notes=move_notes
        )
        db.add(move)

        # Registrar diferencia consolidada en la línea de inventario
        line.difference_qty = diff
        
    session.state = "DONE"
    session.date_end = datetime.now()
    db.commit()
    return {"status": "success", "message": "Toma Física validada y consolidada exitosamente."}


@router.post("/{id}/advance-phase", response_model=schemas.InventorySession)
def advance_session_phase(
    *,
    db: Session = Depends(deps.get_db),
    id: int,
    target_state: str = "REVIEW",
    current_user: Any = Depends(deps.get_current_active_user)
) -> Any:
    session = db.query(InventorySession).filter(InventorySession.id == id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    if session.state == "DONE":
        raise HTTPException(status_code=400, detail="Sesión ya se encuentra finalizada.")

    session.state = target_state
    db.commit()
    db.refresh(session)
    populate_session_category_metadata(session, db)
    is_supervisor = False
    if current_user and hasattr(current_user, 'roles'):
        is_supervisor = any(r.name.upper() in ('SUPERVISOR', 'ADMIN', 'GERENTE') for r in current_user.roles)
    populate_line_details(session, db, is_supervisor=is_supervisor)
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
