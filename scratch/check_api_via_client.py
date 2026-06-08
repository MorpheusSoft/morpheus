import sys
sys.path.insert(0, '/home/lzambrano/Desarrollo/Morpheus/backend')

from datetime import datetime, timedelta
from jose import jwt
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings
from app.core import security

# Generate token for user id 1
expire = datetime.utcnow() + timedelta(minutes=15)
to_encode = {"exp": expire, "sub": str(1)}
token = jwt.encode(to_encode, security.SECRET_KEY, algorithm=security.ALGORITHM)

client = TestClient(app)
headers = {"Authorization": f"Bearer {token}"}

print("1. Fetching /api/v1/facilities/")
res = client.get("/api/v1/facilities/", headers=headers)
print("Status code:", res.status_code)
print("Headers:", res.headers)
try:
    print("JSON:", res.json())
except Exception as e:
    print("Text:", res.text)

print("\n2. Fetching /api/v1/categories")
res = client.get("/api/v1/categories?limit=1000", headers=headers)
print("Status: ", res.status_code)
try:
    print("JSON length:", len(res.json()))
except Exception as e:
    print("Text:", res.text)

print("\n3. Fetching /api/v1/suppliers?limit=1000 (without trailing slash)")
res = client.get("/api/v1/suppliers?limit=1000", headers=headers)
print("Status:", res.status_code)
try:
    print("JSON keys:", res.json().keys() if isinstance(res.json(), dict) else type(res.json()))
    print("JSON total:", res.json().get('total') if isinstance(res.json(), dict) else "N/A")
except Exception as e:
    print("Text:", res.text)

print("\n4. Fetching /api/v1/suppliers/?limit=1000 (with trailing slash)")
res = client.get("/api/v1/suppliers/?limit=1000", headers=headers)
print("Status:", res.status_code)
try:
    print("JSON total:", res.json().get('total') if isinstance(res.json(), dict) else "N/A")
except Exception as e:
    print("Text:", res.text)

