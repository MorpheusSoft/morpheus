import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.api.deps import SessionLocal
from sqlalchemy import text

db = SessionLocal()
res = db.execute(text("SELECT table_name FROM information_schema.views WHERE table_schema IN ('inv', 'public')")).fetchall()
print([r[0] for r in res])
