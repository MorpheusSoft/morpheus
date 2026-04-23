import sys
import os
import csv

# Aseguramos que la carpeta backend/ esté en el radar de Python
sys.path.append(os.path.join(os.path.dirname(__file__)))

from sqlalchemy.orm import Session
from app.api.deps import engine
from app.models.core import Supplier, Currency

def import_suppliers():
    with Session(engine) as session:
        print("Iniciando carga de Proveedores...")
        
        # 1. Obtener la moneda por defecto (Asumimos VES o USD para proveedores nacionales)
        currency = session.query(Currency).filter(Currency.code.in_(['VES', 'USD'])).first()
        default_currency_id = currency.id if currency else 1
        
        # Ruta del CSV
        base_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data_import', 'proveedores.csv')
        
        if not os.path.exists(base_path):
            print(f"Error: No se encontró el archivo: {base_path}")
            return
            
        count = 0
        with open(base_path, 'r', encoding='utf-8-sig') as f:
            # Archivo sin encabezados, separado por punto y coma
            # Columnas: 0: RIF, 1: Razón Social, 2: Nombre Comercial, 3: Dirección Fiscal
            reader = csv.reader(f, delimiter=';')
            for row in reader:
                if len(row) < 2: continue # Mínimo RIF y Nombre
                
                tax_id = str(row[0]).strip()
                name = str(row[1]).strip()
                
                if not tax_id or not name: continue
                
                commercial_name = str(row[2]).strip() if len(row) > 2 else name
                fiscal_address = str(row[3]).strip() if len(row) > 3 else "No registrada"
                
                # Check de Idempotencia: Si ya existe el RIF, se salta
                existing_supplier = session.query(Supplier).filter_by(tax_id=tax_id).first()
                if existing_supplier:
                    continue 
                    
                # Inserta el Proveedor
                new_supplier = Supplier(
                    tax_id=tax_id,
                    name=name,
                    commercial_name=commercial_name,
                    fiscal_address=fiscal_address,
                    currency_id=default_currency_id,
                    credit_days=0,
                    is_active=True
                )
                session.add(new_supplier)
                
                count += 1
                if count % 500 == 0:
                    session.commit()
                    print(f"  ... Insertados {count} proveedores")
                    
        session.commit()
        print(f"✅ ¡Carga de Proveedores terminada! Total insertados: {count}")

if __name__ == "__main__":
    import_suppliers()
