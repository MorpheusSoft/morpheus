from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app, raise_server_exceptions=True)
try:
    response = client.get("/api/v1/currencies/")
    print(response.status_code)
    print(response.json())
except Exception as e:
    import traceback
    traceback.print_exc()
