from app.db.session import engine
from sqlalchemy import text

try:
    with engine.connect() as conn:
        res = conn.execute(text("SELECT * FROM core.currencies"))
        print(res.fetchall())
except Exception as e:
    print("DB ERROR:", e)
