from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from app.api import deps
# Modelos
from app.models.sales import Document, DocumentLine, DocumentType, DocumentState
from app.models.inventory import StockPicking, StockMove, ProductVariant, Location, StockPickingType
from app.models.core import Facility

router = APIRouter()

# --- Pydantic Schema para la ingesta ---
class TransactionPayload(BaseModel):
    Referencia: str
    Fecha: datetime
    Tipo_Operacion: str # VTA, REC, TRA, TRS, AJU, PRD, INV, DEV
    Localidad_Origen: Optional[str] = None
    Almacen_Origen: Optional[str] = None
    Localidad_Destino: Optional[str] = None
    Almacen_Destino: Optional[str] = None
    SKU: str
    Cantidad: float
    Precio_Unitario: Optional[float] = 0.0
    Costo_Unitario: Optional[float] = 0.0
    Impuesto_Monto: Optional[float] = 0.0
    Cliente_Proveedor_RIF: Optional[str] = None
    Nro_Fiscal: Optional[str] = None
    Serial_Fiscal: Optional[str] = None # Agregado por solicitud del cliente

@router.post("/transactions", status_code=status.HTTP_201_CREATED)
def sync_transactions(
    transactions: List[TransactionPayload],
    db: Session = Depends(deps.get_db)
):
    """
    Recibe un array JSON masivo con movimientos transaccionales y los enruta 
    automáticamente al esquema de Ventas, Compras o Inventario basado en Tipo_Operacion.
    """
    if not transactions:
        return {"msg": "No transactions provided", "count": 0}
        
    # Agrupar transacciones por Referencia para crear cabeceras únicas
    grouped_txs = {}
    for tx in transactions:
        if tx.Referencia not in grouped_txs:
            grouped_txs[tx.Referencia] = []
        grouped_txs[tx.Referencia].append(tx)
        
    for ref, lines in grouped_txs.items():
        # Tomar metadatos de la primera línea de este grupo
        head = lines[0]
        op_type = head.Tipo_Operacion.upper()
        
        # Buscar Variante de forma inteligente (o fallback a 1)
        # En producción esto debe logear si el SKU no existe
        def get_variant_id(sku):
            var = db.query(ProductVariant).filter(ProductVariant.sku == sku).first()
            if var: return var.id
            
            # Auto-crear producto si no existe (Auto-Discovery)
            from app.models.inventory import Category, Product
            cat = db.query(Category).filter(Category.name == 'SYNC').first()
            if not cat:
                cat = Category(name='SYNC', is_active=True)
                db.add(cat)
                db.flush()
                
            prod = db.query(Product).filter(Product.name == 'SYNC_PROD').first()
            if not prod:
                prod = Product(name='SYNC_PROD', category_id=cat.id, product_type='STOCKED', uom_base='PZA')
                db.add(prod)
                db.flush()
                
            new_var = ProductVariant(product_id=prod.id, sku=sku, is_active=True)
            db.add(new_var)
            db.flush()
            return new_var.id
            
        def get_loc_id(code, default_usage='INTERNAL'):
            if not code:
                code = default_usage
            loc = db.query(Location).filter(Location.code == code).first()
            if loc: return loc.id
            
            from app.models.inventory import Warehouse
            wh = db.query(Warehouse).filter(Warehouse.code == 'SYNC').first()
            if not wh:
                wh = Warehouse(name='SYNC', code='SYNC', facility_id=1)
                db.add(wh)
                db.flush()
                
            new_loc = Location(code=code, name=code, warehouse_id=wh.id, usage=default_usage)
            db.add(new_loc)
            db.flush()
            return new_loc.id

        if op_type in ['VTA', 'FAC', 'VEN']:
            doc = db.query(Document).filter(Document.document_number == ref).first()
            if not doc:
                doc = Document(
                    document_number=ref,
                    type=DocumentType.INVOICE,
                    state=DocumentState.CONFIRMED,
                    fiscal_number=head.Nro_Fiscal,
                    fiscal_serial=head.Serial_Fiscal,
                    customer_name_snap=head.Cliente_Proveedor_RIF,
                    customer_tax_snap=head.Cliente_Proveedor_RIF,
                    customer_id=1, facility_id=1, currency_id=1,
                    subtotal=sum((l.Cantidad or 0) * (l.Precio_Unitario or 0) for l in lines),
                    tax_amount=sum((l.Impuesto_Monto or 0) for l in lines),
                    total_amount=sum((l.Cantidad or 0) * (l.Precio_Unitario or 0) + (l.Impuesto_Monto or 0) for l in lines)
                )
                db.add(doc)
                db.flush()
            
            # Movimiento de inventario para ventas (Salida a Cliente)
            picking = db.query(StockPicking).filter(StockPicking.name == f"OUT-{ref}").first()
            if not picking:
                picking = StockPicking(
                    name=f"OUT-{ref}", origin_document=ref, facility_id=1, status='DONE', picking_type_id=1
                )
                db.add(picking)
                db.flush()
            
            for line in lines:
                vid = get_variant_id(line.SKU)
                # Comercial
                doc_line = DocumentLine(
                    document_id=doc.id, variant_id=vid, quantity=(line.Cantidad or 0),
                    unit_price=(line.Precio_Unitario or 0), tax_pct=0.0, line_total=((line.Cantidad or 0) * (line.Precio_Unitario or 0))
                )
                db.add(doc_line)
                
                # Logístico
                move = StockMove(
                    picking_id=picking.id, product_id=vid,
                    location_src_id=get_loc_id(line.Almacen_Origen, 'INTERNAL'),
                    location_dest_id=get_loc_id(None, 'CUSTOMER'), # Virtual Cliente
                    quantity_demand=(line.Cantidad or 0), quantity_done=(line.Cantidad or 0),
                    unit_cost=(line.Costo_Unitario or 0), state='DONE', reference=ref
                )
                db.add(move)
                
        elif op_type in ['REC', 'AJU', 'INV', 'TRA', 'TRS']:
            picking = db.query(StockPicking).filter(StockPicking.name == f"{op_type}-{ref}").first()
            if not picking:
                picking = StockPicking(
                    name=f"{op_type}-{ref}", origin_document=ref, facility_id=1, status='DONE', picking_type_id=1
                )
                db.add(picking)
                db.flush()
            
            for line in lines:
                vid = get_variant_id(line.SKU)
                # Definir comportamiento por tipo (Ej: REC entra, TRA mueve, AJU depende de signo)
                # Para simplificar el MVP, usamos los campos Origen y Destino que trae el JSON
                loc_src = get_loc_id(line.Almacen_Origen, 'SUPPLIER' if op_type == 'REC' else 'INTERNAL')
                loc_dest = get_loc_id(line.Almacen_Destino, 'INTERNAL')
                
                move = StockMove(
                    picking_id=picking.id, product_id=vid,
                    location_src_id=loc_src, location_dest_id=loc_dest,
                    quantity_demand=(line.Cantidad or 0), quantity_done=(line.Cantidad or 0),
                    unit_cost=(line.Costo_Unitario or 0), state='DONE', reference=ref
                )
                db.add(move)
            
        elif op_type in ['DEV']:
            doc = db.query(Document).filter(Document.document_number == ref).first()
            if not doc:
                doc = Document(
                    document_number=ref, type=DocumentType.CREDIT_NOTE, state=DocumentState.CONFIRMED,
                    fiscal_number=head.Nro_Fiscal, fiscal_serial=head.Serial_Fiscal,
                    customer_name_snap=head.Cliente_Proveedor_RIF, customer_tax_snap=head.Cliente_Proveedor_RIF,
                    customer_id=1, facility_id=1, currency_id=1,
                    subtotal=sum((l.Cantidad or 0) * (l.Precio_Unitario or 0) for l in lines),
                    tax_amount=sum((l.Impuesto_Monto or 0) for l in lines),
                    total_amount=sum((l.Cantidad or 0) * (l.Precio_Unitario or 0) + (l.Impuesto_Monto or 0) for l in lines)
                )
                db.add(doc)
                db.flush()
            
            picking = db.query(StockPicking).filter(StockPicking.name == f"RET-{ref}").first()
            if not picking:
                picking = StockPicking(
                    name=f"RET-{ref}", origin_document=ref, facility_id=1, status='DONE', picking_type_id=1
                )
                db.add(picking)
                db.flush()
            
            for line in lines:
                vid = get_variant_id(line.SKU)
                doc_line = DocumentLine(
                    document_id=doc.id, variant_id=vid, quantity=(line.Cantidad or 0),
                    unit_price=(line.Precio_Unitario or 0), tax_pct=0.0, line_total=((line.Cantidad or 0) * (line.Precio_Unitario or 0))
                )
                db.add(doc_line)
                
                # Devolución: Cliente devuelve al Almacen
                move = StockMove(
                    picking_id=picking.id, product_id=vid,
                    location_src_id=get_loc_id(None, 'CUSTOMER'),
                    location_dest_id=get_loc_id(line.Almacen_Origen, 'INTERNAL'), 
                    quantity_demand=(line.Cantidad or 0), quantity_done=(line.Cantidad or 0),
                    unit_cost=(line.Costo_Unitario or 0), state='DONE', reference=ref
                )
                db.add(move)

    db.commit()
    return {"msg": "Sincronización procesada", "records_received": len(transactions)}
