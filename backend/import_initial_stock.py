import sys
import os
import csv
from collections import defaultdict
from sqlalchemy.orm import Session

sys.path.append(os.path.join(os.path.dirname(__file__)))

from app.api.deps import engine
from app.models.inventory import InventorySession, Warehouse, Location
from app.models.core import Facility
from app.schemas.inventory_session import InventoryLineBulkUpload, InventoryLineBulkItem
from app.api.v1.endpoints.inventory_session import bulk_upload_lines, validate_session
from datetime import datetime

def import_initial_stock(csv_filepath="existencias.csv"):
    if not os.path.exists(csv_filepath):
        print(f"❌ Error: No se encontró el archivo '{csv_filepath}'")
        return

    with Session(engine) as db:
        print("\n🚀 Iniciando Motor de Inyección de Inventario Físico Multipunto...")
        
        facility_code = "CAT-11"
        facility = db.query(Facility).filter_by(code=facility_code).first()
        if not facility:
            print(f"❌ Falta generar la sucursal (Facility) base con código {facility_code}.")
            return

        # 1. Agrupamiento por Depósito
        HEADER_WH = 'DEPOSITO'
        HEADER_SKU = 'SKU'
        HEADER_QTY = 'CANTIDAD'
        HEADER_COST = 'COSTO'
        HEADER_LOC = 'LOCALIDAD'
            
        deposits_data = defaultdict(list)
        
        with open(csv_filepath, mode='r', encoding='utf-8-sig') as file:
            reader = csv.DictReader(file, delimiter=';')
            for row in reader:
                 wh_code = str(row.get(HEADER_WH, 'MAIN_WH')).strip()
                 if not wh_code: wh_code = 'MAIN_WH'
                 
                 sku = str(row.get(HEADER_SKU, '')).strip()
                 if not sku: continue
                 
                 qty_str = str(row.get(HEADER_QTY, '0')).replace(',', '.')
                 qty = float(qty_str) if qty_str else 0.0
                    
                 cost_str = str(row.get(HEADER_COST, '')).replace(',', '.')
                 cost = float(cost_str) if cost_str else None
                    
                 loc_code = str(row.get(HEADER_LOC, '')).strip()
                 if not loc_code: loc_code = 'DEF_LOC'
                 
                 deposits_data[wh_code].append(InventoryLineBulkItem(
                     sku=sku,
                     location_code=loc_code,
                     counted_qty=qty,
                     cost=cost,
                     notes="Carga Inicial CSV"
                 ))

        print(f"📦 Detectados {len(deposits_data.keys())} depósitos distintos en el archivo.")
        
        # 2. Procesar cada depósito
        for wh_code, items in deposits_data.items():
            print(f"\n--- Procesando Depósito: {wh_code} ({len(items)} líneas) ---")
            warehouse = db.query(Warehouse).filter_by(facility_id=facility.id, code=wh_code).first()
            
            if not warehouse:
                print(f"❌ El depósito '{wh_code}' no existe en Morpheus. Se creará automáticamente...")
                warehouse = Warehouse(
                    facility_id=facility.id,
                    name=f"Almacén {wh_code}",
                    code=wh_code,
                    is_scrap=False,
                    is_transit=False
                )
                db.add(warehouse)
                db.flush()
                
                # Crear locación por defecto para este nuevo depósito
                def_loc = Location(
                    warehouse_id=warehouse.id,
                    code=f"LOC_{wh_code}",
                    name="Ubicación General"
                )
                db.add(def_loc)
                db.flush()
                
                # Update loc_code in items if they used the generic DEF_LOC
                for it in items:
                    if it.location_code == 'DEF_LOC':
                        it.location_code = f"LOC_{wh_code}"
                
            session = InventorySession(
                name=f"Carga Inicial - {wh_code} - {datetime.now().strftime('%d/%m/%Y %H:%M')}",
                facility_id=facility.id,
                warehouse_id=warehouse.id,
                state="DRAFT" 
            )
            db.add(session)
            db.commit()
            db.refresh(session)
            
            bulk_payload = InventoryLineBulkUpload(lines=items)
            try:
                bulk_upload_lines(db=db, id=session.id, bulk_in=bulk_payload)
                validate_session(id=session.id, db=db)
                print(f"✅ ¡Stock inyectado y estabilizado para el depósito {wh_code}!")
            except Exception as api_err:
                 print(f"❌ Error subiendo depósito {wh_code}: {str(api_err)}")
                 db.rollback()

if __name__ == "__main__":
    import_initial_stock("existencias.csv")
