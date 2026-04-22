import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.path.dirname(__file__)))

from app.api.deps import SessionLocal
from app.models.core import Facility

def main():
    db = SessionLocal()
    try:
        facilities = db.query(Facility).all()
        print(f"Current facilities: {[f.name for f in facilities]}")
        
        if not facilities:
            print("No facilities found. Inserting default ones...")
            f1 = Facility(name="CEDI Central", code="CEDI", address="HQ Central")
            f2 = Facility(name="Tienda Norte", code="NORTE", address="Sede Norte")
            f3 = Facility(name="Tienda Sur", code="SUR", address="Sede Sur")
            db.add_all([f1, f2, f3])
            db.commit()
            print("Successfully inserted 3 facilities.")
        else:
            print("Facilities already exist.")
            
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == '__main__':
    main()
