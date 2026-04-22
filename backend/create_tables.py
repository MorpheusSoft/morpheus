import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__)))

from app.api.deps import engine
from app.models import core, inventory, sales, purchasing
from app.db.base_class import Base

from sqlalchemy import text

def init_db():
    print("Creating schema if not exists...")
    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS sales;"))
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS pur;"))
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS core;"))
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS inv;"))
        conn.commit()
    print("Creating tables if they don't exist...")
    Base.metadata.create_all(bind=engine)
    print("Done")

if __name__ == "__main__":
    init_db()
