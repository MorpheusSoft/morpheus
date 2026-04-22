import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__)))

from sqlalchemy.orm import Session
from app.api.deps import engine
from app.models.core import Currency, Tribute, Company, Facility, User, SystemSettings
from app.models.inventory import Warehouse, Location
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def seed():
    with Session(engine) as session:
        print("Iniciando inyección de la base de datos maestra...")
        
        # 1. Monedas (Currencies)
        if not session.query(Currency).filter_by(code="USD").first():
            session.add(Currency(code="USD", name="US Dollar", symbol="$", exchange_rate=1.0))
        if not session.query(Currency).filter_by(code="VES").first():
            session.add(Currency(code="VES", name="Bolívar", symbol="Bs", exchange_rate=40.0))
            
        # 2. Impuestos (Tributes)
        if not session.query(Tribute).filter_by(name="IVA 16%").first():
            session.add_all([
                Tribute(name="IVA 16%", rate=16.00, is_active=True),
                Tribute(name="Exento", rate=0.00, is_active=True)
            ])
            
        session.commit()
        
        # 3. Empresa (Company)
        comp = session.query(Company).first()
        if not comp:
            comp = Company(name="Morpheus C.A.", tax_id="J-12345678-9", currency_code="USD")
            session.add(comp)
            session.commit()
            
        # 4. Sucursal (Facility)
        fac = session.query(Facility).first()
        if not fac:
            fac = Facility(company_id=comp.id, name="Centro de Distribución", code="CENDI-01", address="Caracas, Venezuela")
            session.add(fac)
            session.commit()
            
        # 5. Almacenes (Warehouses & Locations)
        wh = session.query(Warehouse).first()
        if not wh:
            wh = Warehouse(facility_id=fac.id, name="Bodega Principal", code="BOD-MAIN")
            session.add(wh)
            session.commit()
            
        if not session.query(Location).first():
            session.add(Location(warehouse_id=wh.id, name="Pasillo 1 - Rack A", code="PASILLO-1", barcode="LOC-MAIN-001"))
            session.commit()
            
        # 6. Cuenta de Administrador (User)
        if not session.query(User).filter_by(email="admin@morpheus.com").first():
            admin = User(
                email="admin@morpheus.com",
                full_name="Administrador Master",
                hashed_password=pwd_context.hash("Admin123!"),
                is_superuser=True
            )
            session.add(admin)
            session.commit()

        print("✅ ¡Carga maestra (Niveles 1 y 2) exitosa! Tablas de Monedas, Impuestos, Empresas, Bodegas y Admin listas.")

if __name__ == "__main__":
    seed()
