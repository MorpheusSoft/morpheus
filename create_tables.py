import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))
from sqlalchemy import create_engine
from app.db.base_class import Base
# Import all models to ensure they are registered
from app.models.inventory import *
from app.models.core import *
from app.models.sales import *
from sqlalchemy import text

SQLALCHEMY_DATABASE_URL = "postgresql://postgres:Pegaso26@localhost:5433/morpheus"
engine = create_engine(SQLALCHEMY_DATABASE_URL)

def create_tables():
    print("Creating schemas and missing tables...")
    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS sales;"))
        conn.commit()
    Base.metadata.create_all(bind=engine)
    print("Tables created.")

if __name__ == "__main__":
    create_tables()
