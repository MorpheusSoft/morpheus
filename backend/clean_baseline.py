import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.api.deps import SessionLocal
from sqlalchemy import text

db = SessionLocal()

print("Sessions:")
res = db.execute(text("SELECT id, name FROM inv.inventory_sessions WHERE name LIKE 'Baseline%'")).fetchall()
for r in res:
    lines = db.execute(text(f"SELECT COUNT(*) FROM inv.inventory_lines WHERE session_id = {r.id}")).scalar()
    print(f"Session {r.id}: {r.name} - {lines} lines")

