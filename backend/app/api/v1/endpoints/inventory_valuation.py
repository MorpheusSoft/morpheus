from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, date
from decimal import Decimal
from pydantic import BaseModel

from app.api import deps
from app.models.inventory import ProductVariant, Product, Category, InventorySnapshot, StockMove, StockPicking, Location, Warehouse
from app.models.core import Currency, ExchangeRate
from app.services.currency_service import CurrencyService

router = APIRouter()

# --- Pydantic Schemas ---
class ValuationItem(BaseModel):
    sku: str
    name: str
    category: str
    qty: float
    cost_avg_usd: float
    cost_avg_ves: float
    cost_actual_usd: float
    cost_actual_ves: float
    val_total_avg_usd: float
    val_total_avg_ves: float
    val_total_actual_usd: float
    val_total_actual_ves: float

class ValuationResponse(BaseModel):
    rate: float
    items: List[ValuationItem]
    total_qty: float
    total_val_avg_usd: float
    total_val_avg_ves: float
    total_val_actual_usd: float
    total_val_actual_ves: float

class BookItem(BaseModel):
    sku: str
    name: str
    category: str
    
    # Saldo Inicial
    initial_qty: float
    initial_val_avg_usd: float
    initial_val_avg_ves: float
    initial_val_actual_usd: float
    initial_val_actual_ves: float
    
    # Entradas
    in_receptions_qty: float
    in_receptions_val_usd: float
    in_receptions_val_ves: float
    in_notes_qty: float
    in_notes_val_usd: float
    in_notes_val_ves: float
    in_transfers_qty: float
    in_transfers_val_usd: float
    in_transfers_val_ves: float
    in_adjustments_qty: float
    in_adjustments_val_usd: float
    in_adjustments_val_ves: float
    in_others_qty: float
    in_others_val_usd: float
    in_others_val_ves: float
    
    # Salidas
    out_sales_qty: float
    out_sales_val_usd: float
    out_sales_val_ves: float
    out_notes_qty: float
    out_notes_val_usd: float
    out_notes_val_ves: float
    out_transfers_qty: float
    out_transfers_val_usd: float
    out_transfers_val_ves: float
    out_adjustments_qty: float
    out_adjustments_val_usd: float
    out_adjustments_val_ves: float
    out_others_qty: float
    out_others_val_usd: float
    out_others_val_ves: float
    
    # Saldo Final
    final_qty: float
    final_val_avg_usd: float
    final_val_avg_ves: float
    final_val_actual_usd: float
    final_val_actual_ves: float

class BookResponse(BaseModel):
    start_date: str
    end_date: str
    rate: float
    items: List[BookItem]
    totals: dict

# --- Helpers ---
def get_rate_for_date(db: Session, dt: datetime) -> Decimal:
    """
    Busca la tasa de cambio de VES correspondiente a una fecha histórica.
    """
    rate_record = db.query(ExchangeRate)\
        .join(Currency, ExchangeRate.currency_id == Currency.id)\
        .filter(Currency.code == "VES", ExchangeRate.effective_date <= dt)\
        .order_by(ExchangeRate.effective_date.desc(), ExchangeRate.id.desc())\
        .first()
    if rate_record:
        return rate_record.rate
    # Fallback a la tasa activa actual
    currency = db.query(Currency).filter(Currency.code == "VES").first()
    return currency.exchange_rate if currency else Decimal("40.0")

def get_target_locations(db: Session, facility_id: Optional[int], warehouse_id: Optional[int]) -> List[int]:
    """
    Retorna los IDs de ubicaciones INTERNAL que corresponden al filtro de sucursal/almacén.
    """
    query = db.query(Location.id).filter(Location.usage == 'INTERNAL')
    if warehouse_id:
        query = query.filter(Location.warehouse_id == warehouse_id)
    elif facility_id:
        query = query.join(Warehouse, Location.warehouse_id == Warehouse.id)\
                     .filter(Warehouse.facility_id == facility_id)
    
    return [r[0] for r in query.all()]

# --- Endpoints ---

@router.get("/valuation", response_model=ValuationResponse)
def get_inventory_valuation(
    db: Session = Depends(deps.get_db),
    facility_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
    category_id: Optional[int] = None
):
    """
    Valora el stock disponible en tiempo real.
    Soporta filtrado por sucursal (facility), almacén (warehouse) y categoría.
    Retorna montos bimonetarios (USD/VES) a costo promedio (WAVG) y costo actual.
    """
    # Obtener tasa del día
    ves_curr = db.query(Currency).filter(Currency.code == "VES").first()
    rate = ves_curr.exchange_rate if ves_curr else Decimal("40.0")

    # Identificar ubicaciones de destino para el filtro
    loc_ids = get_target_locations(db, facility_id, warehouse_id)
    if not loc_ids:
        # Si no hay ubicaciones que coincidan, retornar respuesta vacía
        return ValuationResponse(
            rate=float(rate), items=[], total_qty=0,
            total_val_avg_usd=0, total_val_avg_ves=0,
            total_val_actual_usd=0, total_val_actual_ves=0
        )

    # Si no se filtra por almacén específico, podemos usar InventorySnapshot que es directo y rápido
    # De lo contrario, calculamos el stock sumando movimientos
    use_snapshots = (warehouse_id is None)
    
    variant_stocks = {}
    
    if use_snapshots:
        # Consultar snapshots
        snap_query = db.query(
            InventorySnapshot.variant_id,
            func.sum(InventorySnapshot.stock_qty).label('qty')
        ).group_by(InventorySnapshot.variant_id)
        
        if facility_id:
            snap_query = snap_query.filter(InventorySnapshot.facility_id == facility_id)
            
        for vid, qty in snap_query.all():
            variant_stocks[vid] = float(qty)
    else:
        # Calcular mediante movimientos para las ubicaciones del almacén específico
        # Entradas
        in_query = db.query(
            StockMove.product_id,
            func.sum(StockMove.quantity_done).label('qty')
        ).filter(StockMove.state == 'DONE', StockMove.location_dest_id.in_(loc_ids))\
         .group_by(StockMove.product_id).all()
         
        # Salidas
        out_query = db.query(
            StockMove.product_id,
            func.sum(StockMove.quantity_done).label('qty')
        ).filter(StockMove.state == 'DONE', StockMove.location_src_id.in_(loc_ids))\
         .group_by(StockMove.product_id).all()
         
        for vid, qty in in_query:
            variant_stocks[vid] = variant_stocks.get(vid, 0.0) + float(qty)
        for vid, qty in out_query:
            variant_stocks[vid] = variant_stocks.get(vid, 0.0) - float(qty)

    # Cargar detalles de variantes y productos
    variants_query = db.query(ProductVariant).join(Product, ProductVariant.product_id == Product.id)
    if category_id:
        from app.api.v1.endpoints.inventory_session import get_all_related_category_ids
        rel_cat_ids = get_all_related_category_ids(db, category_id)
        variants_query = variants_query.filter(Product.category_id.in_(rel_cat_ids))
        
    variants = variants_query.all()
    
    items = []
    total_qty = 0.0
    total_val_avg_usd = Decimal("0.0")
    total_val_avg_ves = Decimal("0.0")
    total_val_actual_usd = Decimal("0.0")
    total_val_actual_ves = Decimal("0.0")
    
    for var in variants:
        qty = variant_stocks.get(var.id, 0.0)
        if qty <= 0:
            continue
            
        qty_dec = Decimal(str(qty))
        
        cost_avg_usd = var.average_cost or Decimal("0.0")
        cost_actual_usd = var.last_cost or var.replacement_cost or Decimal("0.0")
        
        cost_avg_ves = cost_avg_usd * rate
        cost_actual_ves = cost_actual_usd * rate
        
        val_avg_usd = qty_dec * cost_avg_usd
        val_avg_ves = val_avg_usd * rate
        
        val_actual_usd = qty_dec * cost_actual_usd
        val_actual_ves = val_actual_usd * rate
        
        total_qty += qty
        total_val_avg_usd += val_avg_usd
        total_val_avg_ves += val_avg_ves
        total_val_actual_usd += val_actual_usd
        total_val_actual_ves += val_actual_ves
        
        cat_name = var.product.category.name if var.product.category else "Sin Categoría"
        
        items.append(ValuationItem(
            sku=var.sku,
            name=f"{var.product.name} {var.part_number or ''}".strip(),
            category=cat_name,
            qty=qty,
            cost_avg_usd=float(cost_avg_usd),
            cost_avg_ves=float(cost_avg_ves),
            cost_actual_usd=float(cost_actual_usd),
            cost_actual_ves=float(cost_actual_ves),
            val_total_avg_usd=float(val_avg_usd),
            val_total_avg_ves=float(val_avg_ves),
            val_total_actual_usd=float(val_actual_usd),
            val_total_actual_ves=float(val_actual_ves)
        ))
        
    return ValuationResponse(
        rate=float(rate),
        items=items,
        total_qty=total_qty,
        total_val_avg_usd=float(total_val_avg_usd),
        total_val_avg_ves=float(total_val_avg_ves),
        total_val_actual_usd=float(total_val_actual_usd),
        total_val_actual_ves=float(total_val_actual_ves)
    )

@router.get("/book", response_model=BookResponse)
def get_inventory_book(
    start_date: str = Query(..., description="Fecha de inicio (YYYY-MM-DD)"),
    end_date: str = Query(..., description="Fecha de fin (YYYY-MM-DD)"),
    facility_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
    category_id: Optional[int] = None,
    db: Session = Depends(deps.get_db)
):
    """
    Genera el reporte consolidado 'Libro de Inventario' para un rango de fechas.
    Retorna Saldo Inicial, Entradas detalladas por columna, Salidas detalladas y Saldo Final.
    Valores en USD y VES históricos.
    """
    try:
        dt_start = datetime.combine(date.fromisoformat(start_date), datetime.min.time())
        dt_end = datetime.combine(date.fromisoformat(end_date), datetime.max.time())
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")

    ves_curr = db.query(Currency).filter(Currency.code == "VES").first()
    curr_rate = ves_curr.exchange_rate if ves_curr else Decimal("40.0")

    # Obtener ubicaciones que componen el filtro
    loc_ids = get_target_locations(db, facility_id, warehouse_id)
    if not loc_ids:
        return BookResponse(
            start_date=start_date, end_date=end_date, rate=float(curr_rate),
            items=[], totals={"initial_qty": 0, "final_qty": 0}
        )

    # Filtrar variantes por categoría si aplica
    variants_query = db.query(ProductVariant).join(Product, ProductVariant.product_id == Product.id)
    if category_id:
        from app.api.v1.endpoints.inventory_session import get_all_related_category_ids
        rel_cat_ids = get_all_related_category_ids(db, category_id)
        variants_query = variants_query.filter(Product.category_id.in_(rel_cat_ids))
    variants = variants_query.all()
    
    # 1. Obtener todos los movimientos terminados (DONE) para este conjunto de variantes y ubicaciones
    vids = [v.id for v in variants]
    if not vids:
        return BookResponse(
            start_date=start_date, end_date=end_date, rate=float(curr_rate),
            items=[], totals={}
        )

    # Consultar movimientos en orden cronológico
    moves = db.query(StockMove).join(StockPicking, StockMove.picking_id == StockPicking.id)\
              .filter(
                  StockMove.product_id.in_(vids),
                  StockMove.state == 'DONE'
              ).order_by(StockMove.date.asc()).all()

    # Estructura para acumular la información de cada SKU
    sku_data = {}
    for var in variants:
        cat_name = var.product.category.name if var.product.category else "Sin Categoría"
        sku_data[var.id] = {
            "sku": var.sku,
            "name": f"{var.product.name} {var.part_number or ''}".strip(),
            "category": cat_name,
            
            # Cantidades físicas
            "initial_qty": 0.0,
            
            "in_receptions_qty": 0.0, "in_receptions_val_usd": Decimal("0.0"), "in_receptions_val_ves": Decimal("0.0"),
            "in_notes_qty": 0.0, "in_notes_val_usd": Decimal("0.0"), "in_notes_val_ves": Decimal("0.0"),
            "in_transfers_qty": 0.0, "in_transfers_val_usd": Decimal("0.0"), "in_transfers_val_ves": Decimal("0.0"),
            "in_adjustments_qty": 0.0, "in_adjustments_val_usd": Decimal("0.0"), "in_adjustments_val_ves": Decimal("0.0"),
            "in_others_qty": 0.0, "in_others_val_usd": Decimal("0.0"), "in_others_val_ves": Decimal("0.0"),
            
            "out_sales_qty": 0.0, "out_sales_val_usd": Decimal("0.0"), "out_sales_val_ves": Decimal("0.0"),
            "out_notes_qty": 0.0, "out_notes_val_usd": Decimal("0.0"), "out_notes_val_ves": Decimal("0.0"),
            "out_transfers_qty": 0.0, "out_transfers_val_usd": Decimal("0.0"), "out_transfers_val_ves": Decimal("0.0"),
            "out_adjustments_qty": 0.0, "out_adjustments_val_usd": Decimal("0.0"), "out_adjustments_val_ves": Decimal("0.0"),
            "out_others_qty": 0.0, "out_others_val_usd": Decimal("0.0"), "out_others_val_ves": Decimal("0.0"),
            
            "final_qty": 0.0,
            
            # Costos de referencia históricos
            "initial_cost_avg_usd": Decimal("0.0"),
            "initial_cost_actual_usd": Decimal("0.0"),
            "final_cost_avg_usd": Decimal("0.0"),
            "final_cost_actual_usd": Decimal("0.0"),
        }

    # Procesar todos los movimientos
    # Nota: dividimos en dos fases para calcular el Saldo Inicial y luego los movimientos del rango
    for move in moves:
        vid = move.product_id
        if vid not in sku_data:
            continue
            
        qty = float(move.quantity_done)
        unit_cost = move.unit_cost or Decimal("0.0")
        hist_avg = move.historic_avg_cost or unit_cost
        
        move_date = move.date
        is_inflow = (move.location_dest_id in loc_ids) and (move.location_src_id not in loc_ids)
        is_outflow = (move.location_src_id in loc_ids) and (move.location_dest_id not in loc_ids)
        
        # Obtener tasa de cambio del día del movimiento
        rate_on_date = get_rate_for_date(db, move_date)

        if move_date < dt_start:
            # Fase 1: Movimientos previos a start_date -> Definen cantidad inicial y costos iniciales
            if is_inflow:
                sku_data[vid]["initial_qty"] += qty
            elif is_outflow:
                sku_data[vid]["initial_qty"] -= qty
                
            # Mantener costos de referencia antes del inicio
            sku_data[vid]["initial_cost_avg_usd"] = hist_avg
            if is_inflow and unit_cost > 0:
                sku_data[vid]["initial_cost_actual_usd"] = unit_cost
                
        elif dt_start <= move_date <= dt_end:
            # Fase 2: Movimientos dentro del rango de fechas -> Clasificar detalladamente
            # Clasificar subtipos
            picking_name = (move.picking.name if move.picking else "").upper()
            picking_code = (move.picking.picking_type.code if move.picking and move.picking.picking_type else "").upper()
            ref = (move.reference or "").upper()
            
            val_usd = Decimal(str(qty)) * unit_cost
            val_ves = val_usd * rate_on_date

            if is_inflow:
                if "RECEIPT" in picking_code or picking_name.startswith("REC") or ref.startswith("REC"):
                    sku_data[vid]["in_receptions_qty"] += qty
                    sku_data[vid]["in_receptions_val_usd"] += val_usd
                    sku_data[vid]["in_receptions_val_ves"] += val_ves
                elif picking_name.startswith("ENT") or "ENTREGA" in picking_name:
                    sku_data[vid]["in_notes_qty"] += qty
                    sku_data[vid]["in_notes_val_usd"] += val_usd
                    sku_data[vid]["in_notes_val_ves"] += val_ves
                elif "INT" in picking_code or picking_name.startswith("TRA") or picking_name.startswith("TRS") or ref.startswith("TRA") or ref.startswith("TRS"):
                    sku_data[vid]["in_transfers_qty"] += qty
                    sku_data[vid]["in_transfers_val_usd"] += val_usd
                    sku_data[vid]["in_transfers_val_ves"] += val_ves
                elif "ADJ" in picking_code or picking_name.startswith("AJU") or picking_name.startswith("INV"):
                    sku_data[vid]["in_adjustments_qty"] += qty
                    sku_data[vid]["in_adjustments_val_usd"] += val_usd
                    sku_data[vid]["in_adjustments_val_ves"] += val_ves
                else:
                    sku_data[vid]["in_others_qty"] += qty
                    sku_data[vid]["in_others_val_usd"] += val_usd
                    sku_data[vid]["in_others_val_ves"] += val_ves
                    
            elif is_outflow:
                # El costo de la salida se valoriza a promedio o costo unitario histórico
                val_out_usd = Decimal(str(qty)) * hist_avg
                val_out_ves = val_out_usd * rate_on_date
                
                if "OUT" in picking_code or picking_name.startswith("OUT") or picking_name.startswith("VTA") or picking_name.startswith("FAC") or ref.startswith("VTA") or ref.startswith("FAC"):
                    sku_data[vid]["out_sales_qty"] += qty
                    sku_data[vid]["out_sales_val_usd"] += val_out_usd
                    sku_data[vid]["out_sales_val_ves"] += val_out_ves
                elif picking_name.startswith("SAL") or "ENTREGA" in picking_name:
                    sku_data[vid]["out_notes_qty"] += qty
                    sku_data[vid]["out_notes_val_usd"] += val_out_usd
                    sku_data[vid]["out_notes_val_ves"] += val_out_ves
                elif "INT" in picking_code or picking_name.startswith("TRA") or picking_name.startswith("TRS") or ref.startswith("TRA") or ref.startswith("TRS"):
                    sku_data[vid]["out_transfers_qty"] += qty
                    sku_data[vid]["out_transfers_val_usd"] += val_out_usd
                    sku_data[vid]["out_transfers_val_ves"] += val_out_ves
                elif "ADJ" in picking_code or picking_name.startswith("AJU") or picking_name.startswith("INV") or picking_name.startswith("MER"):
                    sku_data[vid]["out_adjustments_qty"] += qty
                    sku_data[vid]["out_adjustments_val_usd"] += val_out_usd
                    sku_data[vid]["out_adjustments_val_ves"] += val_out_ves
                else:
                    sku_data[vid]["out_others_qty"] += qty
                    sku_data[vid]["out_others_val_usd"] += val_out_usd
                    sku_data[vid]["out_others_val_ves"] += val_out_ves
                    
            # Actualizar costos finales
            sku_data[vid]["final_cost_avg_usd"] = hist_avg
            if is_inflow and unit_cost > 0:
                sku_data[vid]["final_cost_actual_usd"] = unit_cost

    # Procesar saldos finales y construir respuesta
    items = []
    
    totals = {
        "initial_qty": 0.0,
        "initial_val_avg_usd": Decimal("0.0"),
        "initial_val_avg_ves": Decimal("0.0"),
        "initial_val_actual_usd": Decimal("0.0"),
        "initial_val_actual_ves": Decimal("0.0"),
        
        "in_receptions_qty": 0.0, "in_receptions_val_usd": Decimal("0.0"), "in_receptions_val_ves": Decimal("0.0"),
        "in_notes_qty": 0.0, "in_notes_val_usd": Decimal("0.0"), "in_notes_val_ves": Decimal("0.0"),
        "in_transfers_qty": 0.0, "in_transfers_val_usd": Decimal("0.0"), "in_transfers_val_ves": Decimal("0.0"),
        "in_adjustments_qty": 0.0, "in_adjustments_val_usd": Decimal("0.0"), "in_adjustments_val_ves": Decimal("0.0"),
        "in_others_qty": 0.0, "in_others_val_usd": Decimal("0.0"), "in_others_val_ves": Decimal("0.0"),
        
        "out_sales_qty": 0.0, "out_sales_val_usd": Decimal("0.0"), "out_sales_val_ves": Decimal("0.0"),
        "out_notes_qty": 0.0, "out_notes_val_usd": Decimal("0.0"), "out_notes_val_ves": Decimal("0.0"),
        "out_transfers_qty": 0.0, "out_transfers_val_usd": Decimal("0.0"), "out_transfers_val_ves": Decimal("0.0"),
        "out_adjustments_qty": 0.0, "out_adjustments_val_usd": Decimal("0.0"), "out_adjustments_val_ves": Decimal("0.0"),
        "out_others_qty": 0.0, "out_others_val_usd": Decimal("0.0"), "out_others_val_ves": Decimal("0.0"),
        
        "final_qty": 0.0,
        "final_val_avg_usd": Decimal("0.0"),
        "final_val_avg_ves": Decimal("0.0"),
        "final_val_actual_usd": Decimal("0.0"),
        "final_val_actual_ves": Decimal("0.0")
    }

    # Tasa del día para los saldos iniciales y finales estáticos
    for vid, data in sku_data.items():
        var = db.query(ProductVariant).get(vid)
        
        # Calcular cantidades finales
        inflow_total = (data["in_receptions_qty"] + data["in_notes_qty"] + data["in_transfers_qty"] + data["in_adjustments_qty"] + data["in_others_qty"])
        outflow_total = (data["out_sales_qty"] + data["out_notes_qty"] + data["out_transfers_qty"] + data["out_adjustments_qty"] + data["out_others_qty"])
        data["final_qty"] = data["initial_qty"] + inflow_total - outflow_total
        
        # Costo Promedio Inicial / Final
        c_ini_avg = data["initial_cost_avg_usd"] or var.average_cost or Decimal("0.0")
        c_fin_avg = data["final_cost_avg_usd"] or var.average_cost or Decimal("0.0")
        
        # Costo Actual Inicial / Final
        c_ini_act = data["initial_cost_actual_usd"] or var.last_cost or var.replacement_cost or Decimal("0.0")
        c_fin_act = data["final_cost_actual_usd"] or var.last_cost or var.replacement_cost or Decimal("0.0")
        
        # Valoraciones Iniciales
        init_qty_dec = Decimal(str(data["initial_qty"]))
        init_avg_usd = init_qty_dec * c_ini_avg
        init_avg_ves = init_avg_usd * curr_rate
        init_act_usd = init_qty_dec * c_ini_act
        init_act_ves = init_act_usd * curr_rate
        
        # Valoraciones Finales
        fin_qty_dec = Decimal(str(data["final_qty"]))
        fin_avg_usd = fin_qty_dec * c_fin_avg
        fin_avg_ves = fin_avg_usd * curr_rate
        fin_act_usd = fin_qty_dec * c_fin_act
        fin_act_ves = fin_act_usd * curr_rate

        # Acumular Totales Generales del Reporte
        totals["initial_qty"] += data["initial_qty"]
        totals["initial_val_avg_usd"] += init_avg_usd
        totals["initial_val_avg_ves"] += init_avg_ves
        totals["initial_val_actual_usd"] += init_act_usd
        totals["initial_val_actual_ves"] += init_act_ves
        
        totals["in_receptions_qty"] += data["in_receptions_qty"]
        totals["in_receptions_val_usd"] += data["in_receptions_val_usd"]
        totals["in_receptions_val_ves"] += data["in_receptions_val_ves"]
        totals["in_notes_qty"] += data["in_notes_qty"]
        totals["in_notes_val_usd"] += data["in_notes_val_usd"]
        totals["in_notes_val_ves"] += data["in_notes_val_ves"]
        totals["in_transfers_qty"] += data["in_transfers_qty"]
        totals["in_transfers_val_usd"] += data["in_transfers_val_usd"]
        totals["in_transfers_val_ves"] += data["in_transfers_val_ves"]
        totals["in_adjustments_qty"] += data["in_adjustments_qty"]
        totals["in_adjustments_val_usd"] += data["in_adjustments_val_usd"]
        totals["in_adjustments_val_ves"] += data["in_adjustments_val_ves"]
        totals["in_others_qty"] += data["in_others_qty"]
        totals["in_others_val_usd"] += data["in_others_val_usd"]
        totals["in_others_val_ves"] += data["in_others_val_ves"]
        
        totals["out_sales_qty"] += data["out_sales_qty"]
        totals["out_sales_val_usd"] += data["out_sales_val_usd"]
        totals["out_sales_val_ves"] += data["out_sales_val_ves"]
        totals["out_notes_qty"] += data["out_notes_qty"]
        totals["out_notes_val_usd"] += data["out_notes_val_usd"]
        totals["out_notes_val_ves"] += data["out_notes_val_ves"]
        totals["out_transfers_qty"] += data["out_transfers_qty"]
        totals["out_transfers_val_usd"] += data["out_transfers_val_usd"]
        totals["out_transfers_val_ves"] += data["out_transfers_val_ves"]
        totals["out_adjustments_qty"] += data["out_adjustments_qty"]
        totals["out_adjustments_val_usd"] += data["out_adjustments_val_usd"]
        totals["out_adjustments_val_ves"] += data["out_adjustments_val_ves"]
        totals["out_others_qty"] += data["out_others_qty"]
        totals["out_others_val_usd"] += data["out_others_val_usd"]
        totals["out_others_val_ves"] += data["out_others_val_ves"]
        
        totals["final_qty"] += data["final_qty"]
        totals["final_val_avg_usd"] += fin_avg_usd
        totals["final_val_avg_ves"] += fin_avg_ves
        totals["final_val_actual_usd"] += fin_act_usd
        totals["final_val_actual_ves"] += fin_act_ves

        items.append(BookItem(
            sku=data["sku"],
            name=data["name"],
            category=data["category"],
            
            initial_qty=data["initial_qty"],
            initial_val_avg_usd=float(init_avg_usd),
            initial_val_avg_ves=float(init_avg_ves),
            initial_val_actual_usd=float(init_act_usd),
            initial_val_actual_ves=float(init_act_ves),
            
            in_receptions_qty=data["in_receptions_qty"],
            in_receptions_val_usd=float(data["in_receptions_val_usd"]),
            in_receptions_val_ves=float(data["in_receptions_val_ves"]),
            in_notes_qty=data["in_notes_qty"],
            in_notes_val_usd=float(data["in_notes_val_usd"]),
            in_notes_val_ves=float(data["in_notes_val_ves"]),
            in_transfers_qty=data["in_transfers_qty"],
            in_transfers_val_usd=float(data["in_transfers_val_usd"]),
            in_transfers_val_ves=float(data["in_transfers_val_ves"]),
            in_adjustments_qty=data["in_adjustments_qty"],
            in_adjustments_val_usd=float(data["in_adjustments_val_usd"]),
            in_adjustments_val_ves=float(data["in_adjustments_val_ves"]),
            in_others_qty=data["in_others_qty"],
            in_others_val_usd=float(data["in_others_val_usd"]),
            in_others_val_ves=float(data["in_others_val_ves"]),
            
            out_sales_qty=data["out_sales_qty"],
            out_sales_val_usd=float(data["out_sales_val_usd"]),
            out_sales_val_ves=float(data["out_sales_val_ves"]),
            out_notes_qty=data["out_notes_qty"],
            out_notes_val_usd=float(data["out_notes_val_usd"]),
            out_notes_val_ves=float(data["out_notes_val_ves"]),
            out_transfers_qty=data["out_transfers_qty"],
            out_transfers_val_usd=float(data["out_transfers_val_usd"]),
            out_transfers_val_ves=float(data["out_transfers_val_ves"]),
            out_adjustments_qty=data["out_adjustments_qty"],
            out_adjustments_val_usd=float(data["out_adjustments_val_usd"]),
            out_adjustments_val_ves=float(data["out_adjustments_val_ves"]),
            out_others_qty=data["out_others_qty"],
            out_others_val_usd=float(data["out_others_val_usd"]),
            out_others_val_ves=float(data["out_others_val_ves"]),
            
            final_qty=data["final_qty"],
            final_val_avg_usd=float(fin_avg_usd),
            final_val_avg_ves=float(fin_avg_ves),
            final_val_actual_usd=float(fin_act_usd),
            final_val_actual_ves=float(fin_act_ves)
        ))

    # Formatear totals para serialización JSON
    serialized_totals = {}
    for k, v in totals.items():
        if isinstance(v, Decimal):
            serialized_totals[k] = float(v)
        else:
            serialized_totals[k] = v

    return BookResponse(
        start_date=start_date,
        end_date=end_date,
        rate=float(curr_rate),
        items=items,
        totals=serialized_totals
    )


class PhysicalCountSheetItem(BaseModel):
    variant_id: int
    product_code: str
    barcode: Optional[str] = None
    sku: str
    description: str
    category: str
    uom: str
    theoretical_qty: float
    counted_qty: Optional[float] = None


class PhysicalCountSheetResponse(BaseModel):
    session_id: Optional[int] = None
    session_code: Optional[str] = None
    session_name: Optional[str] = None
    session_state: Optional[str] = None
    company_name: str
    facility_name: str
    facility_code: str
    deposit_code: str
    deposit_name: str
    department_name: str
    currency_name: str
    emission_date: str
    total_items: int
    total_theoretical_qty: float
    items: List[PhysicalCountSheetItem]


@router.get("/physical-count-sheet", response_model=PhysicalCountSheetResponse)
def get_physical_count_sheet(
    db: Session = Depends(deps.get_db),
    session_id: Optional[int] = None,
    facility_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
    location_id: Optional[int] = None,
    category_id: Optional[int] = None,
    include_zero_stock: bool = True,
    search: Optional[str] = None
):
    """
    Genera la planilla/reporte para Toma de Inventario (Conteo Físico).
    Puede generarse directamente a partir de una Toma Física abierta (`session_id`) mostrando exactamente
    los productos de esa toma física, o libremente por Sucursal, Depósito, Ubicación y Categoría.
    """
    from sqlalchemy.orm import joinedload
    from app.models.core import Company, Facility
    from app.models.inventory import InventorySession, InventoryLine
    from app.api.v1.endpoints.inventory_session import get_all_related_category_ids
    from app.api.v1.endpoints.reports import resolve_variant_barcodes_batch

    session_obj = None
    session_code = None
    session_name = None
    session_state = None

    if session_id:
        session_obj = db.query(InventorySession).filter(InventorySession.id == session_id).first()
        if not session_obj:
            raise HTTPException(status_code=404, detail=f"Toma física #{session_id} no encontrada.")
        session_code = f"SES-{session_obj.id}"
        session_name = session_obj.name
        session_state = session_obj.state
        if not facility_id and session_obj.facility_id:
            facility_id = session_obj.facility_id
        if not warehouse_id and session_obj.warehouse_id:
            warehouse_id = session_obj.warehouse_id
        if not category_id and session_obj.scope_type in ('CATEGORY', 'CYCLIC') and session_obj.scope_value:
            clean_val = str(session_obj.scope_value).strip()
            if clean_val.isdigit():
                category_id = int(clean_val)

    # 1. Resolver metadatos de encabezado (Compañía, Localidad, Depósito, Departamento, Moneda)
    company = db.query(Company).order_by(Company.id.asc()).first()
    company_name = company.name if company else "GRUPO CATANIA, C.A."

    facility_name = "TODAS LAS LOCALIDADES"
    facility_code = "GLOBAL"
    fac_obj = None
    if facility_id:
        fac_obj = db.query(Facility).filter(Facility.id == facility_id).first()
        if fac_obj:
            if company is None and fac_obj.company_id:
                comp = db.query(Company).filter(Company.id == fac_obj.company_id).first()
                if comp:
                    company_name = comp.name
            facility_name = fac_obj.name.upper()
            if not facility_name.startswith("CATANIA"):
                facility_name = f"CATANIA {facility_name}"
            facility_code = fac_obj.code or str(fac_obj.id)

    deposit_code = "TODOS"
    deposit_name = "TODOS LOS DEPÓSITOS"
    wh_obj = None
    if warehouse_id:
        wh_obj = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
        if wh_obj:
            deposit_code = wh_obj.code or str(wh_obj.id)
            deposit_name = wh_obj.name.upper()
            if not fac_obj and wh_obj.facility_id:
                fac_obj = db.query(Facility).filter(Facility.id == wh_obj.facility_id).first()
                if fac_obj:
                    facility_name = fac_obj.name.upper()
                    if not facility_name.startswith("CATANIA"):
                        facility_name = f"CATANIA {facility_name}"
                    facility_code = fac_obj.code or str(fac_obj.id)
    elif fac_obj:
        main_wh = db.query(Warehouse).filter(Warehouse.facility_id == fac_obj.id).order_by(Warehouse.id.asc()).first()
        if main_wh:
            deposit_code = main_wh.code or str(main_wh.id)
            deposit_name = main_wh.name.upper() if main_wh.name else f"GENERAL - {fac_obj.name.upper()}"

    if location_id:
        loc_obj = db.query(Location).filter(Location.id == location_id).first()
        if loc_obj:
            deposit_code = loc_obj.code or str(loc_obj.id)
            deposit_name = f"{deposit_name} / {loc_obj.name.upper()}" if wh_obj else loc_obj.name.upper()

    department_name = "TODOS LOS DEPARTAMENTOS"
    rel_cat_ids = None
    if category_id:
        cat_obj = db.query(Category).filter(Category.id == category_id).first()
        if cat_obj:
            department_name = cat_obj.name.upper()
        rel_cat_ids = get_all_related_category_ids(db, category_id)
    elif session_obj and session_obj.name:
        department_name = session_obj.name.upper()

    ves_curr = db.query(Currency).filter(Currency.code == "VES").first()
    currency_name = (ves_curr.name.upper() if ves_curr and ves_curr.name else "BOLIVAR DIGITAL")

    # Si se seleccionó una Toma Física (session_id) y tiene renglones registrados, extraer directamente sus productos
    if session_obj:
        session_lines = db.query(InventoryLine).filter(InventoryLine.session_id == session_obj.id).all()
        if session_lines:
            line_by_vid = {}
            for l in session_lines:
                if l.product_variant_id:
                    line_by_vid[l.product_variant_id] = l

            vids = list(line_by_vid.keys())
            variants_q = db.query(ProductVariant).join(Product, ProductVariant.product_id == Product.id).options(
                joinedload(ProductVariant.product).joinedload(Product.category)
            ).filter(ProductVariant.id.in_(vids))

            if search and search.strip():
                from sqlalchemy import or_
                q_str = f"%{search.strip()}%"
                variants_q = variants_q.filter(
                    or_(
                        Product.name.ilike(q_str),
                        ProductVariant.sku.ilike(q_str),
                        ProductVariant.barcode.ilike(q_str),
                        ProductVariant.part_number.ilike(q_str)
                    )
                )

            variants = variants_q.order_by(Product.name.asc(), ProductVariant.sku.asc()).all()
            barcode_map = resolve_variant_barcodes_batch(db, variants)

            sheet_items: List[PhysicalCountSheetItem] = []
            total_theo = 0.0

            for var in variants:
                l_obj = line_by_vid.get(var.id)
                theo_qty = round(float(l_obj.theoretical_qty or 0.0), 4) if l_obj else 0.0
                cnt_qty = round(float(l_obj.counted_qty or 0.0), 4) if (l_obj and l_obj.counted_qty is not None) else None

                if not include_zero_stock and abs(theo_qty) <= 1e-4:
                    continue

                total_theo += theo_qty
                bc_info = barcode_map.get(var.id, {})
                primary_bc = bc_info.get("barcode") or var.barcode or ""
                prod_code = primary_bc if primary_bc else (var.sku or "")

                cat_name = var.product.category.name if (var.product and var.product.category) else department_name
                uom_val = (var.product.uom_base if var.product and var.product.uom_base else "UND").upper()
                desc = f"{var.product.name if var.product else ''} {var.part_number or ''}".strip().upper()

                sheet_items.append(PhysicalCountSheetItem(
                    variant_id=var.id,
                    product_code=prod_code,
                    barcode=primary_bc or None,
                    sku=var.sku,
                    description=desc,
                    category=cat_name.upper(),
                    uom=uom_val,
                    theoretical_qty=theo_qty,
                    counted_qty=cnt_qty
                ))

            return PhysicalCountSheetResponse(
                session_id=session_obj.id,
                session_code=session_code,
                session_name=session_name,
                session_state=session_state,
                company_name=company_name,
                facility_name=facility_name,
                facility_code=facility_code,
                deposit_code=deposit_code,
                deposit_name=deposit_name,
                department_name=department_name,
                currency_name=currency_name,
                emission_date=datetime.now().strftime("%d/%m/%Y"),
                total_items=len(sheet_items),
                total_theoretical_qty=round(total_theo, 4),
                items=sheet_items
            )

    # 2. Calcular existencias teóricas según el alcance seleccionado
    variant_stocks = {}

    if location_id:
        loc_ids = [location_id]
        in_query = db.query(
            StockMove.product_id,
            func.sum(StockMove.quantity_done).label('qty')
        ).filter(StockMove.state == 'DONE', StockMove.location_dest_id.in_(loc_ids))\
         .group_by(StockMove.product_id).all()

        out_query = db.query(
            StockMove.product_id,
            func.sum(StockMove.quantity_done).label('qty')
        ).filter(StockMove.state == 'DONE', StockMove.location_src_id.in_(loc_ids))\
         .group_by(StockMove.product_id).all()

        for vid, qty in in_query:
            variant_stocks[vid] = variant_stocks.get(vid, 0.0) + float(qty or 0)
        for vid, qty in out_query:
            variant_stocks[vid] = variant_stocks.get(vid, 0.0) - float(qty or 0)
    elif warehouse_id:
        loc_ids = get_target_locations(db, facility_id, warehouse_id)
        if loc_ids:
            in_query = db.query(
                StockMove.product_id,
                func.sum(StockMove.quantity_done).label('qty')
            ).filter(StockMove.state == 'DONE', StockMove.location_dest_id.in_(loc_ids))\
             .group_by(StockMove.product_id).all()

            out_query = db.query(
                StockMove.product_id,
                func.sum(StockMove.quantity_done).label('qty')
            ).filter(StockMove.state == 'DONE', StockMove.location_src_id.in_(loc_ids))\
             .group_by(StockMove.product_id).all()

            for vid, qty in in_query:
                variant_stocks[vid] = variant_stocks.get(vid, 0.0) + float(qty or 0)
            for vid, qty in out_query:
                variant_stocks[vid] = variant_stocks.get(vid, 0.0) - float(qty or 0)

        # Si el almacén seleccionado es el almacén general/principal de la sucursal y no registra movimientos directos,
        # usar los snapshots de la sucursal para reflejar la existencia teórica real.
        is_general_wh = bool(
            wh_obj and (
                wh_obj.code in ('WH01', 'MAIN_WH') or
                (fac_obj and wh_obj.code == fac_obj.code) or
                'PRINCIPAL' in (wh_obj.name or '').upper() or
                'GENERAL' in (wh_obj.name or '').upper()
            )
        )
        if is_general_wh and len(variant_stocks) < 50:
            snap_query = db.query(
                InventorySnapshot.variant_id,
                func.sum(InventorySnapshot.stock_qty).label('qty')
            ).group_by(InventorySnapshot.variant_id)
            target_fac_id = facility_id or (wh_obj.facility_id if wh_obj else None)
            if target_fac_id:
                snap_query = snap_query.filter(InventorySnapshot.facility_id == target_fac_id)
            for vid, qty in snap_query.all():
                if vid not in variant_stocks or variant_stocks[vid] == 0:
                    variant_stocks[vid] = float(qty or 0)
    else:
        snap_query = db.query(
            InventorySnapshot.variant_id,
            func.sum(InventorySnapshot.stock_qty).label('qty')
        ).group_by(InventorySnapshot.variant_id)
        if facility_id:
            snap_query = snap_query.filter(InventorySnapshot.facility_id == facility_id)
        for vid, qty in snap_query.all():
            variant_stocks[vid] = float(qty or 0)

    # 3. Consultar productos y variantes activas del catálogo
    variants_query = db.query(ProductVariant).join(Product, ProductVariant.product_id == Product.id).options(
        joinedload(ProductVariant.product).joinedload(Product.category)
    ).filter(
        Product.is_active.isnot(False),
        ProductVariant.is_active.isnot(False)
    )

    if rel_cat_ids is not None:
        variants_query = variants_query.filter(Product.category_id.in_(rel_cat_ids))

    if search and search.strip():
        from sqlalchemy import or_
        q_str = f"%{search.strip()}%"
        variants_query = variants_query.filter(
            or_(
                Product.name.ilike(q_str),
                ProductVariant.sku.ilike(q_str),
                ProductVariant.barcode.ilike(q_str),
                ProductVariant.part_number.ilike(q_str)
            )
        )

    # Si no se filtró por categoría ni búsqueda y NO se desean productos en 0, limitar en SQL a los que tienen stock != 0
    if not include_zero_stock:
        non_zero_vids = [vid for vid, q in variant_stocks.items() if abs(q) > 1e-4]
        if not non_zero_vids:
            return PhysicalCountSheetResponse(
                session_id=session_obj.id if session_obj else None,
                session_code=session_code,
                session_name=session_name,
                session_state=session_state,
                company_name=company_name,
                facility_name=facility_name,
                facility_code=facility_code,
                deposit_code=deposit_code,
                deposit_name=deposit_name,
                department_name=department_name,
                currency_name=currency_name,
                emission_date=datetime.now().strftime("%d/%m/%Y"),
                total_items=0,
                total_theoretical_qty=0.0,
                items=[]
            )
        variants_query = variants_query.filter(ProductVariant.id.in_(non_zero_vids))

    variants = variants_query.order_by(Product.name.asc(), ProductVariant.sku.asc()).all()
    barcode_map = resolve_variant_barcodes_batch(db, variants)

    sheet_items: List[PhysicalCountSheetItem] = []
    total_theo = 0.0

    for var in variants:
        qty = round(variant_stocks.get(var.id, 0.0), 4)
        if not include_zero_stock and abs(qty) <= 1e-4:
            continue

        total_theo += qty
        bc_info = barcode_map.get(var.id, {})
        primary_bc = bc_info.get("barcode") or var.barcode or ""
        prod_code = primary_bc if primary_bc else (var.sku or "")

        cat_name = var.product.category.name if (var.product and var.product.category) else "SIN DEPARTAMENTO"
        uom_val = (var.product.uom_base if var.product and var.product.uom_base else "UND").upper()
        desc = f"{var.product.name if var.product else ''} {var.part_number or ''}".strip().upper()

        sheet_items.append(PhysicalCountSheetItem(
            variant_id=var.id,
            product_code=prod_code,
            barcode=primary_bc or None,
            sku=var.sku,
            description=desc,
            category=cat_name.upper(),
            uom=uom_val,
            theoretical_qty=qty
        ))

    return PhysicalCountSheetResponse(
        session_id=session_obj.id if session_obj else None,
        session_code=session_code,
        session_name=session_name,
        session_state=session_state,
        company_name=company_name,
        facility_name=facility_name,
        facility_code=facility_code,
        deposit_code=deposit_code,
        deposit_name=deposit_name,
        department_name=department_name,
        currency_name=currency_name,
        emission_date=datetime.now().strftime("%d/%m/%Y"),
        total_items=len(sheet_items),
        total_theoretical_qty=round(total_theo, 4),
        items=sheet_items
    )

