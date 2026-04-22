import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__)))
from app.api.deps import engine
from sqlalchemy import text

with engine.begin() as conn:
    conn.execute(text("INSERT INTO core.currencies (id, code, name, symbol) VALUES (1, 'USD', 'US Dollar', '$') ON CONFLICT (id) DO NOTHING;"))
    print('Seeded Currency 1')
