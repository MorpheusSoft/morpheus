import sys
import os
# Add the backend directory to the path so we can import app modules
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from sqlalchemy import create_engine, text
from app.core.config import settings
from app.db.base_class import Base
# Import model to register it in Base.metadata
from app.models.inventory import PrintTemplate

engine = create_engine(settings.SQLALCHEMY_DATABASE_URI)

def create_table():
    print(f"Connecting to database to create print_templates table...")
    print(f"Database URI: {settings.SQLALCHEMY_DATABASE_URI}")
    with engine.connect() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS inv;"))
        conn.commit()
    # Explicitly create only the print_templates table if others already exist
    Base.metadata.create_all(bind=engine, tables=[PrintTemplate.__table__])
    print("Table print_templates created successfully.")

if __name__ == "__main__":
    create_table()
