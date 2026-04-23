import sys
import os

# Adds the current directory to the sys path so we can import 'app'
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from app.api.deps import engine
from app.models.inventory import Warehouse, Location
from app.models.core import Facility

def seed():
    db = Session(engine)
    try:
        # Check if Facility exists
        facility = db.query(Facility).first()
        if not facility:
            facility = Facility(name="Tienda Principal", code="MAIN")
            db.add(facility)
            db.flush()
            
        # Ensure Default Warehouse
        warehouse = db.query(Warehouse).filter_by(code="MAIN_WH").first()
        if not warehouse:
            warehouse = Warehouse(
                facility_id=facility.id,
                name="Almacén Principal",
                code="MAIN_WH"
            )
            db.add(warehouse)
            db.flush()
            
        # Ensure VIRTUAL INVENTORY Location
        virtual_wh = db.query(Warehouse).filter_by(code="VIRTUAL").first()
        if not virtual_wh:
            virtual_wh = Warehouse(
                facility_id=facility.id,
                name="Almacén de Ajustes y Tránsitos",
                code="VIRTUAL",
                is_transit=True
            )
            db.add(virtual_wh)
            db.flush()
            
        # Real location
        location = db.query(Location).filter_by(code="DEF_LOC").first()
        if not location:
            location = Location(
                warehouse_id=warehouse.id,
                name="Ubicación General",
                code="DEF_LOC",
                location_type="SHELF",
                usage="INTERNAL"
            )
            db.add(location)
            
        # Virtual location
        v_location = db.query(Location).filter_by(code="INV_ADJ").first()
        if not v_location:
            v_location = Location(
                warehouse_id=virtual_wh.id,
                name="Ajuste de Inventario (Mermas y Pérdidas)",
                code="INV_ADJ",
                usage="INTERNAL",
                location_type="LOSS"
            )
            db.add(v_location)
            
        db.commit()
        print("✅ Almacenes y Ubicaciones Iniciales insertadas correctamente.")
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed()
