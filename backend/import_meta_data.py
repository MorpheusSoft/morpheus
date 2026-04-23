import sys
import os
import csv

sys.path.append(os.path.join(os.path.dirname(__file__)))

from sqlalchemy.orm import Session
from app.api.deps import engine
from app.models.inventory import ProductVariant, ProductBarcode
from app.models.core import Supplier
from app.models.purchasing import SupplierProduct

def import_barcodes():
    print("Iniciando importación de Códigos Multi-Unidad (Stellar)...")
    base_path = os.path.join(os.path.dirname(__file__), '../data_import', 'codigos.csv')
    if not os.path.exists(base_path):
        print("❌ No se encontró codigos.csv")
        return
        
    count = 0
    with Session(engine) as session:
        with open(base_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.reader(f, delimiter=';')
            for row in reader:
                if len(row) < 2: continue
                legacy_stellar_code = str(row[0]).strip()
                barcode = str(row[1]).strip()
                
                stellar_barcode = session.query(ProductBarcode).filter_by(barcode=legacy_stellar_code, code_type='STELLAR_CODE').first()
                if not stellar_barcode or not barcode: continue
                
                # Check idempotencia
                existing = session.query(ProductBarcode).filter_by(barcode=barcode).first()
                if not existing:
                    session.add(ProductBarcode(
                        product_variant_id=stellar_barcode.product_variant_id,
                        barcode=barcode,
                        code_type='BARCODE',
                        uom="UND",
                        conversion_factor=1.0
                    ))
                    count += 1
                    
                if count > 0 and count % 500 == 0:
                    session.commit()
                    print(f"  ... Insertados {count} códigos")
        session.commit()
    print(f"✅ Códigos Multi-Unidad importados. Total: {count}")

def import_suppliers_links():
    print("\nIniciando importación de Vínculos Proveedor-Producto...")
    base_path = os.path.join(os.path.dirname(__file__), '../data_import', 'opcionales.csv')
    if not os.path.exists(base_path):
        print("❌ No se encontró opcionales.csv")
        return
        
    count = 0
    with Session(engine) as session:
        with open(base_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.reader(f, delimiter=';')
            for row in reader:
                if len(row) < 2: continue
                legacy_stellar_code = str(row[0]).strip()
                tax_id = str(row[1]).strip()
                
                stellar_barcode = session.query(ProductBarcode).filter_by(barcode=legacy_stellar_code, code_type='STELLAR_CODE').first()
                supplier = session.query(Supplier).filter_by(tax_id=tax_id).first()
                
                if not stellar_barcode or not supplier: continue
                
                existing = session.query(SupplierProduct).filter_by(
                    variant_id=stellar_barcode.product_variant_id, supplier_id=supplier.id
                ).first()
                
                if not existing:
                    session.add(SupplierProduct(
                        variant_id=stellar_barcode.product_variant_id,
                        supplier_id=supplier.id,
                        is_primary=True,
                        replacement_cost=0
                    ))
                    count += 1
                    
                if count > 0 and count % 500 == 0:
                    session.commit()
                    print(f"  ... Enlazados {count} productos a proveedores")
        session.commit()
    print(f"✅ Proveedores enlazados exitosamente. Total: {count}")

if __name__ == "__main__":
    import_barcodes()
    import_suppliers_links()
