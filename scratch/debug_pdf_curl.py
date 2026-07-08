import sys
import os
import pypdf
import json
import re
import subprocess

# Insert backend to sys.path so we can import from app
sys.path.insert(0, '/home/lzambrano/Desarrollo/Morpheus/backend')

def load_env(env_path):
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, val = line.split('=', 1)
                    os.environ[key] = val

load_env('/home/lzambrano/Desarrollo/Morpheus/.env')
api_key = os.getenv("GEMINI_API_KEY")

pdf_path = "/home/lzambrano/Downloads/AlfonzoRivas.pdf"

print(f"Loading PDF: {pdf_path}")
try:
    reader = pypdf.PdfReader(pdf_path)
    pages_text = []
    for i, page in enumerate(reader.pages):
        t = page.extract_text()
        print(f"--- Page {i+1} Length: {len(t) if t else 0} ---")
        if t:
            pages_text.append(t)
    extracted_text = "\n".join(pages_text)
    print(f"Total extracted text length: {len(extracted_text)}")
except Exception as e:
    print(f"Error extracting text with pypdf: {e}")
    sys.exit(1)

# Now, build the prompt exactly like upload_pdf_to_session
prompt = (
    "Eres un asistente de procesamiento de datos experto para Neo ERP.\n"
    "Tu tarea es analizar el siguiente texto de una lista de precios o factura de un proveedor y extraer todos los productos de forma estructurada.\n\n"
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

print(f"API KEY: {api_key[:5]}...{api_key[-5:] if api_key else ''}")
url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"

payload = {
    "contents": [{"parts": [{"text": prompt}]}],
    "generationConfig": {"responseMimeType": "application/json"}
}

# Save payload to json file
payload_file = "scratch/gemini_payload.json"
response_file = "scratch/gemini_response.json"

with open(payload_file, 'w') as f:
    json.dump(payload, f)

print("Running curl to call Gemini API...")
try:
    result = subprocess.run([
        'curl', '-s', '-i', '-H', 'Content-Type: application/json',
        '-d', f'@{payload_file}', url
    ], capture_output=True, text=True)
    
    # Save raw response to check headers and body
    with open(response_file, 'w') as f:
        f.write(result.stdout)
        
    print("Curl command executed.")
    
    # Extract JSON body (skip HTTP headers)
    if "\r\n\r\n" in result.stdout:
        headers, body = result.stdout.split("\r\n\r\n", 1)
    else:
        body = result.stdout
        
    res_data = json.loads(body)
    if 'candidates' in res_data:
        text_content = res_data['candidates'][0]['content']['parts'][0]['text']
        print("Raw response text content:")
        print(text_content[:2000])
        print("..." if len(text_content) > 2000 else "")
        print("-" * 50)
        parsed_items = json.loads(text_content.strip())
        print(f"Successfully parsed {len(parsed_items)} items from Gemini response.")
    else:
        print("Error in response data:")
        print(res_data)
        parsed_items = []
except Exception as e:
    print(f"Error calling Gemini via curl: {e}")
    parsed_items = []

if parsed_items:
    print("\nStarting local database reconciliation simulation...")
    from app.api.deps import SessionLocal
    from app.models.inventory import ProductVariant, ProductBarcode, Product
    from app.models.core import Supplier, SupplierProduct
    
    db = SessionLocal()
    try:
        supplier = db.query(Supplier).filter(Supplier.name.ilike('%alfonzo%')).first()
        if not supplier:
            print("No supplier matching 'Alfonzo' found.")
            supplier_id = 1
        else:
            print(f"Found supplier: {supplier.name} (ID: {supplier.id})")
            supplier_id = supplier.id
            
        lines_created = 0
        matched_count = 0
        unmatched_count = 0
        
        for idx, item in enumerate(parsed_items):
            clean_desc = item["description"].strip()
            item_sku = item.get("supplier_sku")
            item_barcode = item.get("barcode")
            
            variant = None
            match_method = None
            
            # 1. Match por código de barra
            if item_barcode:
                variant = db.query(ProductVariant).filter(
                    (ProductVariant.barcode == item_barcode) |
                    (ProductVariant.barcodes.any(ProductBarcode.barcode == item_barcode))
                ).first()
                if variant:
                    match_method = f"barcode ({item_barcode})"
                
            # 2. Match por SKU de proveedor
            if not variant and item_sku:
                supplier_product = db.query(SupplierProduct).filter(
                    (SupplierProduct.supplier_sku == item_sku) &
                    (SupplierProduct.supplier_id == supplier_id)
                ).first()
                if supplier_product:
                    variant = db.query(ProductVariant).filter(ProductVariant.id == supplier_product.variant_id).first()
                    if variant:
                        match_method = f"supplier sku ({item_sku})"
                    
            # 3. Match semántico / fuzzy por nombre
            if not variant:
                stop_words = {'con', 'del', 'para', 'los', 'las', 'una', 'uno', 'por', 'umd', 'base', 'imp', 'iva', 'total', 'de', 'en', 'x'}
                keywords = [k.lower() for k in re.split(r'[\s\-\/\*]+', clean_desc) if len(k) > 2 and k.lower() not in stop_words]
                if keywords:
                    query = db.query(ProductVariant).join(Product, ProductVariant.product_id == Product.id)
                    query = query.filter(Product.name.ilike(f"%{keywords[0]}%"))
                    if len(keywords) > 1:
                        query = query.filter(Product.name.ilike(f"%{keywords[1]}%"))
                    candidates = query.all()
                    
                    best_candidate = None
                    best_score = 0
                    for cand in candidates:
                        cand_name = cand.product.name.lower()
                        score = sum(1 for kw in keywords if kw in cand_name)
                        if score > best_score:
                            best_score = score
                            best_candidate = cand
                    
                    if best_candidate and (best_score / len(keywords)) >= 0.5:
                        variant = best_candidate
                        match_method = f"fuzzy name ({clean_desc} vs {best_candidate.product.name})"

            if variant:
                matched_count += 1
                print(f"[{idx+1}] MATCHED: '{clean_desc}' -> variant SKU: {variant.sku}, name: {variant.product.name if variant.product else 'N/A'} via {match_method}")
            else:
                unmatched_count += 1
                print(f"[{idx+1}] UNMATCHED: '{clean_desc}' (SKU: {item_sku}, Barcode: {item_barcode})")
                
            lines_created += 1
            
        print(f"\nReconciliation Summary: Total lines: {lines_created}, Matched: {matched_count}, Unmatched: {unmatched_count}")
    finally:
        db.close()
