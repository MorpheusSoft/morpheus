import sys
sys.path.insert(0, '/home/lzambrano/Desarrollo/Morpheus/backend')
from fastapi.testclient import TestClient
from app.main import app
import traceback

client = TestClient(app)

try:
    response = client.get("/api/v1/purchase-orders/")
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print("FATAL ERROR IN FASTAPI STARTUP OR ROUTING:")
    traceback.print_exc()
