import openpyxl
import os
import json
import urllib.request
import urllib.error

# Load environment API Key from .env
api_key = None
env_path = "/home/lzambrano/Morpheus/backend/.env"
if os.path.exists(env_path):
    with open(env_path, "r") as f:
        for line in f:
            if "GEMINI_API_KEY" in line:
                parts = line.strip().split("=")
                if len(parts) > 1:
                    api_key = parts[1].strip().strip('"').strip("'")

if not api_key:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")

print(f"Loaded API key: {'Available' if api_key else 'Not Available'}")

# Extract Excel text
path = "/home/lzambrano/Morpheus/backend/scratch/LP.xlsx"
wb = openpyxl.load_workbook(path, data_only=True)
sheet = wb.active
lines = []
for row_idx, row in enumerate(sheet.iter_rows(values_only=True), start=1):
    if row_idx > 40: # just first 40 rows for testing
        break
    row_vals = [str(cell).strip() if cell is not None else "" for cell in row]
    if any(row_vals):
        lines.append(" | ".join(row_vals))
extracted_text = "\n".join(lines)

def test_parse(currency):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    prompt = (
        "Eres un asistente de procesamiento de datos experto para Neo ERP.\n"
        "Tu tarea es analizar el siguiente texto de una lista de precios o factura de un proveedor y extraer todos los productos de forma estructurada.\n\n"
        f"IMPORTANTE: El usuario ha seleccionado la moneda {currency} para esta importación. "
        f"Si la lista contiene precios en múltiples monedas (por ejemplo, USD y VES en columnas distintas), "
        f"debes extraer únicamente los valores correspondientes a la columna de {currency}. "
        "No mezcles monedas ni extraigas valores de otras monedas.\n\n"
        "Identifica las columnas de la tabla de productos. Para cada producto, extrae los siguientes campos:\n"
        "1. `supplier_sku`: Código del producto asignado por el proveedor o código de referencia principal (ej. BE0328). Si no hay, colócalo como null.\n"
        "2. `barcode`: Código de barras numérico del producto (ej. 5000267024233). Si no tiene, colócalo como null.\n"
        "3. `description`: Descripción o nombre del producto (ej. WHISKY JOHNNIE WALKER GOLD LABEL RESERVE).\n"
        "4. `cost`: Costo de adquisición unitario. Si la lista presenta precios por caja/empaque (UMD > 1) y costos por empaque, divide el costo por la cantidad para obtener el costo unitario. El costo de adquisición debe incluir los impuestos especiales no recuperables (como impuestos de licores), pero excluir el IVA. Si el formato tiene BASE e IMP (Impuesto especial), súmalos para obtener el costo unitario de adquisición.\n"
        "5. `suggested_price`: Precio de venta sugerido (PVP) al cliente final (incluyendo impuestos si está disponible, ej. 36.00). Si no se proporciona, colócalo como null.\n\n"
        "Retorna ÚNICAMENTE un JSON válido (un arreglo de objetos) con la siguiente estructura exacta, sin bloques markdown ni formateos adicionales (directamente el JSON):\n"
        "[\n"
        "  {\n"
        "    \"supplier_sku\": \"string o null\",\n"
        "    \"barcode\": \"string o null\",\n"
        "    \"description\": \"string\",\n"
        "    \"cost\": float,\n"
        "    \"suggested_price\": float o null\n"
        "  }\n"
        "]\n\n"
        f"A continuación, el texto extraído del archivo:\n{extracted_text}"
    )

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json"}
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode('utf-8'),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=120) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            text_content = res_data['candidates'][0]['content']['parts'][0]['text'].strip()
            print(f"\n--- SUCCESS PARSING FOR {currency} ---")
            parsed = json.loads(text_content)
            # print first 5 products
            for p in parsed[:5]:
                print(p)
    except urllib.error.HTTPError as e:
        print(f"HTTP Error parsing for {currency}: {e}")
        try:
            print("Response body:", e.read().decode('utf-8'))
        except:
            pass
    except Exception as e:
        print(f"Error parsing for {currency}: {e}")

if api_key:
    test_parse("USD")
    test_parse("VES")
else:
    print("Cannot run test, API key missing.")
