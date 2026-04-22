import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__)))

from app.api.deps import engine
from app.models import core, inventory, sales, purchasing
from app.db.base_class import Base
from sqlalchemy import text

def reset_db():
    print(">> Starting Inventory Cleanup...")
    with engine.connect() as conn:
        # Drop cascade will remove all variants, barcodes, packagings linked to products
        conn.execute(text("DROP TABLE IF EXISTS inv.products CASCADE;"))
        conn.commit()
        print(">> Dropped inv.products CASCADE")
        
    print(">> Rebuilding tables from SQLAlchemy Models...")
    Base.metadata.create_all(bind=engine)
    print(">> Done! track_batches column is now live and DB is clean.")

if __name__ == "__main__":
    reset_db()
