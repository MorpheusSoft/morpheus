import requests
from datetime import datetime

url = "http://localhost:8000/api/v1/sync/transactions"

payload = [
    {
        "Referencia": "FAC-TEST-001",
        "Fecha": datetime.now().isoformat(),
        "Tipo_Operacion": "VTA",
        "Localidad_Origen": "01",
        "Almacen_Origen": "01",
        "Localidad_Destino": None,
        "Almacen_Destino": None,
        "SKU": "12345",
        "Cantidad": 2.0,
        "Precio_Unitario": 50.0,
        "Costo_Unitario": 30.0,
        "Impuesto_Monto": 5.0,
        "Cliente_Proveedor_RIF": "V-12345678",
        "Nro_Fiscal": "0001",
        "Serial_Fiscal": "Z1234"
    }
]

print("Enviando JSON mock a la API...")
try:
    response = requests.post(url, json=payload)
    print(f"Status Code: {response.status_code}")
    print(f"Respuesta: {response.text}")
except Exception as e:
    print(f"Error: {e}")
