import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.api.deps import SessionLocal
from sqlalchemy import text

db = SessionLocal()

print("Deleting session 22 and 20...")
db.execute(text("DELETE FROM inv.inventory_lines WHERE session_id IN (20, 22)"))
db.execute(text("DELETE FROM inv.inventory_sessions WHERE id IN (20, 22)"))
db.commit()
print("Done.")
