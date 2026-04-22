import sys
sys.path.append("/home/lzambrano/Desarrollo/Morpheus/backend")
from app.api.deps import engine
from sqlalchemy import text

def run():
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(text("ALTER TABLE core.buyers ADD COLUMN IF NOT EXISTS approval_limit NUMERIC(12,2) DEFAULT 0.0;"))
            conn.execute(text("ALTER TABLE core.buyers ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;"))
            print("Column approval_limit added to core.buyers")

if __name__ == "__main__":
    run()
