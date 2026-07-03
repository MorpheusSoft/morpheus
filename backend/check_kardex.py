import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.api.deps import SessionLocal
from sqlalchemy import text

db = SessionLocal()

# Check locations and warehouses
print("--- FACILITIES ---")
res = db.execute(text("SELECT id, name, code FROM core.facilities")).fetchall()
for r in res: print(r)

print("\n--- INVENTORY SESSIONS (Baseline) ---")
res = db.execute(text("SELECT id, name, warehouse_id FROM inv.inventory_sessions WHERE name LIKE 'Baseline%' LIMIT 5")).fetchall()
for r in res: print(r)

