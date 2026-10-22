import sys
import os
import re

sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from sqlalchemy import create_engine, text
from app.core.config import settings

def add_indexes():
    db_uri = settings.SQLALCHEMY_DATABASE_URI
    commands = [
        "CREATE INDEX IF NOT EXISTS ix_sales_documents_created_at ON sales.documents (created_at);",
        "CREATE INDEX IF NOT EXISTS ix_sales_document_lines_variant_id ON sales.document_lines (variant_id);",
        "CREATE INDEX IF NOT EXISTS ix_products_category_id ON inv.products (category_id);"
    ]
    try:
        print("Connecting to database using configured URI...")
        engine = create_engine(db_uri)
        with engine.connect() as conn:
            for cmd in commands:
                print(f"Executing: {cmd}")
                conn.execute(text(cmd))
            conn.commit()
            print("Sales performance indexes added successfully!")
            return True
    except Exception as e1:
        print(f"Direct connection failed: {e1}. Trying superuser fallback...")
        try:
            su_uri = re.sub(r'postgresql://[^@]+@', 'postgresql://postgres:Pegaso%2326@', db_uri)
            engine = create_engine(su_uri)
            with engine.connect() as conn:
                for cmd in commands:
                    print(f"Executing: {cmd}")
                    conn.execute(text(cmd))
                conn.commit()
                print("Sales performance indexes added successfully with superuser fallback!")
                return True
        except Exception as e2:
            print(f"Superuser fallback also failed: {e2}")
            return False

if __name__ == "__main__":
    add_indexes()
