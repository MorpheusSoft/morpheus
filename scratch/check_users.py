import sys
sys.path.insert(0, '/home/lzambrano/Desarrollo/Morpheus/backend')

from app.api.deps import SessionLocal
from app.models.core import User

db = SessionLocal()
try:
    users = db.query(User).all()
    print(f"Total Users: {len(users)}")
    for u in users:
        print(f"ID: {u.id} | Email: {u.email} | Active: {u.is_active} | IsSuperuser: {u.is_superuser}")
finally:
    db.close()
