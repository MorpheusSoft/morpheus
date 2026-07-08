import sys
import os

# Insert venv site-packages and backend to sys.path first
sys.path.insert(0, '/home/lzambrano/Desarrollo/Morpheus/.venv/lib/python3.12/site-packages')
sys.path.insert(0, '/home/lzambrano/Desarrollo/Morpheus/backend')

import pypdf
import urllib.request
import json
import re
import time

def test_debug_pdf_gemini():
    output_file_path = "/home/lzambrano/Desarrollo/Morpheus/scratch/debug_pdf_output.txt"
    logs = []
    
    def log(msg):
        print(msg)
        logs.append(msg)
        
    log("Starting page-by-page PDF debug with 120s timeout...")
    
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
    reader = pypdf.PdfReader(pdf_path)
    pages_text = []
    for i, page in enumerate(reader.pages):
        t = page.extract_text()
        if t and t.strip():
            pages_text.append((i + 1, t))
            
    log(f"Total pages with text: {len(pages_text)}")

    all_parsed_items = []
    
    for page_num, text in pages_text:
        log(f"\n--- Processing Page {page_num} (text length: {len(text)}) ---")
        prompt = (
            "Eres un asistente de procesamiento de datos experto para Neo ERP.\n"
            "Tu tarea es analizar el siguiente texto de una página de una lista de precios o factura de un proveedor y extraer todos los productos de forma estructurada.\n\n"
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
            f"A continuación, el texto extraído de la página {page_num}:\n{text}"
        )

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json"}
        }

        log(f"Calling Gemini API for page {page_num}...")
        start_time = time.time()
        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode('utf-8'),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=120) as response:
                res_data = json.loads(response.read().decode('utf-8'))
                elapsed = time.time() - start_time
                log(f"Gemini response for page {page_num} received in {elapsed:.2f} seconds.")
                text_content = res_data['candidates'][0]['content']['parts'][0]['text']
                
                parsed_items = json.loads(text_content.strip())
                log(f"Successfully parsed {len(parsed_items)} items for page {page_num}.")
                all_parsed_items.extend(parsed_items)
        except Exception as e:
            elapsed = time.time() - start_time
            log(f"Error calling Gemini for page {page_num} after {elapsed:.2f} seconds: {e}")

        # Sleep to avoid rate limiting
        time.sleep(5)

    log(f"\nTotal parsed items across all pages: {len(all_parsed_items)}")
    
    if all_parsed_items:
        log("\nStarting local database reconciliation simulation...")
        from app.api.deps import SessionLocal
        from app.models.inventory import ProductVariant, ProductBarcode, Product
        from app.models.core import Supplier
        from app.models.purchasing import SupplierProduct
        
        db = SessionLocal()
        try:
            # Check supplier ID. Let's find one matching Alfonzo Rivas.
            supplier = db.query(Supplier).filter(Supplier.name.ilike('%alfonzo%')).first()
            if not supplier:
                log("No supplier matching 'Alfonzo' found. Let's check all suppliers.")
                suppliers = db.query(Supplier).all()
                for s in suppliers:
                    log(f"Supplier ID: {s.id}, Name: {s.name}")
                # Use first supplier as fallback if any, or ID 1
                supplier_id = suppliers[0].id if suppliers else 1
            else:
                log(f"Found supplier: {supplier.name} (ID: {supplier.id})")
                supplier_id = supplier.id
                
            lines_created = 0
            matched_count = 0
            unmatched_count = 0
            
            for idx, item in enumerate(all_parsed_items):
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
                    log(f"[{idx+1}] MATCHED: '{clean_desc}' -> variant SKU: {variant.sku}, name: {variant.product.name if variant.product else 'N/A'} via {match_method}")
                else:
                    unmatched_count += 1
                    log(f"[{idx+1}] UNMATCHED: '{clean_desc}' (SKU: {item_sku}, Barcode: {item_barcode})")
                    
                lines_created += 1
                
            log(f"\nReconciliation Summary: Total lines: {lines_created}, Matched: {matched_count}, Unmatched: {unmatched_count}")
        finally:
            db.close()
            
    # Save all logs to output file
    with open(output_file_path, "w") as out:
        out.write("\n".join(logs))
    print(f"Logs successfully written to {output_file_path}")
