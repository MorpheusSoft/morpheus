from app.api.deps import SessionLocal
from app.models.core import Currency as DBCurrency
from app.schemas.catalog import Currency as SchemaCurrency

db = SessionLocal()
try:
    currencies = db.query(DBCurrency).all()
    for c in currencies:
        print(f"Validating ID {c.id}")
        schema_obj = SchemaCurrency.model_validate(c)
        print("Success:", schema_obj)
except Exception as e:
    import traceback
    traceback.print_exc()
finally:
    db.close()
