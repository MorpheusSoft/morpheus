import sys
sys.path.append("/home/lzambrano/Desarrollo/Morpheus/backend")
from app.api.deps import engine
from sqlalchemy import text

def run():
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(text("ALTER TABLE inv.products ADD COLUMN IF NOT EXISTS origin VARCHAR DEFAULT 'NACIONAL';"))
            print("Column origin added to inv.products")

if __name__ == "__main__":
    run()
