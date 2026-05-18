import pyodbc
import requests
import json
import os
import datetime
import argparse

# ==========================================
# CONFIGURACIÓN
# ==========================================
MORPHEUS_API_URL = "http://localhost:8000/api/v1/sync/transactions"
MORPHEUS_API_TOKEN = "AQUI_TU_BEARER_TOKEN"

DB_VAD10_DSN = "DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost;DATABASE=VAD10;UID=sa;PWD=tu_password"
DB_VAD20_DSN = "DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost;DATABASE=VAD20;UID=sa;PWD=tu_password"

WATERMARK_FILE = "last_sync_date.txt"

def get_last_sync_date():
    if os.path.exists(WATERMARK_FILE):
        with open(WATERMARK_FILE, 'r') as f:
            return f.read().strip()
            
    # Si no existe archivo, asume por defecto "Hoy a la medianoche"
    today_midnight = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    return today_midnight.strftime("%Y-%m-%d %H:%M:%S")

def update_last_sync_date(new_date):
    with open(WATERMARK_FILE, 'w') as f:
        f.write(new_date)

def fetch_data(conn_str, query, params):
    """Conecta a SQL Server y ejecuta un query con los parámetros provistos."""
    print(f"[*] Ejecutando extracción...")
    try:
        conn = pyodbc.connect(conn_str)
        cursor = conn.cursor()
        cursor.execute(query, params)
        
        columns = [column[0] for column in cursor.description]
        results = []
        for row in cursor.fetchall():
            row_dict = dict(zip(columns, row))
            for k, v in row_dict.items():
                if isinstance(v, datetime.datetime):
                    row_dict[k] = v.isoformat()
            results.append(row_dict)
            
        conn.close()
        return results
    except Exception as e:
        print(f"[!] Error ejecutando query: {e}")
        return []

def is_morpheus_reachable():
    """Hace un 'ping' rápido a la API para no gastar recursos de BD si no hay internet."""
    print("[*] Verificando conexión con el servidor Morpheus...")
    try:
        # Usamos OPTIONS o GET con timeout muy corto para verificar que hay vida
        response = requests.options(MORPHEUS_API_URL, timeout=5)
        return True
    except Exception:
        return False

def send_to_morpheus(payload):
    if not payload:
        return True
        
    print(f"[*] Enviando {len(payload)} registros a Morpheus...")
    headers = {
        "Authorization": f"Bearer {MORPHEUS_API_TOKEN}",
        "Content-Type": "application/json"
    }
    try:
        response = requests.post(MORPHEUS_API_URL, json=payload, headers=headers)
        if response.status_code in [200, 201]:
            print("[+] Sincronización exitosa.")
            return True
        else:
            print(f"[!] Error de API: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"[!] Error de conexión con Morpheus: {e}")
        return False

def main():
    # ---------------------------------------------------------
    # PARSER DE ARGUMENTOS PARA MODO HISTÓRICO O INCREMENTAL
    # ---------------------------------------------------------
    parser = argparse.ArgumentParser(description="Morpheus Sync Agent")
    parser.add_argument("--start", type=str, help="Fecha inicio carga histórica (ej: '2026-03-01')")
    parser.add_argument("--end", type=str, help="Fecha fin carga histórica (ej: '2026-04-30')")
    args = parser.parse_args()

    print("=== INICIANDO MORPHEUS SYNC AGENT ===")
    
    # ---------------------------------------------------------
    # OPTIMIZACIÓN: Ping First
    # ---------------------------------------------------------
    if not is_morpheus_reachable():
        print("[!] No hay conexión con el servidor. Abortando para ahorrar recursos locales.")
        return
        
    is_historical = bool(args.start and args.end)
    
    if is_historical:
        print(f"[!] MODO HISTÓRICO: {args.start} hasta {args.end}")
        where_inv = "d_FECHA BETWEEN ? AND ?"
        where_vta = "(f.f_Fecha + convert(time,f.f_Hora)) BETWEEN ? AND ?"
        params = (args.start, args.end)
    else:
        last_sync = get_last_sync_date()
        print(f"[*] MODO INCREMENTAL: Extrayendo registros posteriores a {last_sync}")
        where_inv = "d_FECHA > ?"
        where_vta = "(f.f_Fecha + convert(time,f.f_Hora)) > ?"
        params = (last_sync,)
    
    # ---------------------------------------------------------
    # 1. QUERY DE INVENTARIOS (VAD10)
    # ---------------------------------------------------------
    query_inventario = f"""
        SELECT i.c_DOCUMENTO as Referencia, d_FECHA as Fecha, i.c_CONCEPTO as Tipo_Operacion, 
               i.c_CODLOCALIDAD as Localidad_Origen, c_DEP_ORIG as Almacen_Origen,
               LEFT(c_DEP_DEST,2) as Localidad_Destino, c_DEP_DEST as Almacen_Destino, 
               d.c_CodArticulo as SKU, d.n_Cantidad as Cantidad,
               d.n_Precio as Precio_Unitario, d.n_Costo as Costo_Unitario, d.Impuesto as Impuesto_Monto,
               i.c_CODPROVEEDOR as Cliente_Proveedor_RIF, NULL as Nro_Fiscal, NULL as Serial_Fiscal
        FROM MA_INVENTARIO i
        INNER JOIN TR_INVENTARIO d ON i.c_DOCUMENTO=d.c_Documento AND i.c_CONCEPTO=d.c_Concepto
        WHERE {where_inv}
        ORDER BY d_FECHA ASC
    """
    datos_inv = fetch_data(DB_VAD10_DSN, query_inventario, params)
    
    # ---------------------------------------------------------
    # 2. QUERY DE VENTAS (VAD20)
    # ---------------------------------------------------------
    query_ventas = f"""
        SELECT f.c_Numero as Referencia, f.f_Fecha + convert(time,f.f_Hora) as Fecha, 
               f.c_Concepto as Tipo_Operacion, c_Sucursal as Localidad_Origen, c.C_CODDEPOSITO as Almacen_Origen, 
               NULL as Localidad_Destino, NULL as Almacen_Destino, 
               t.Cod_Principal as SKU, t.Cantidad as Cantidad, 
               t.Precio as Precio_Unitario, t.n_Costo as Costo_Unitario, t.Impuesto as Impuesto_Monto, 
               f.c_Rif as Cliente_Proveedor_RIF, df.cu_DocumentoFiscal as Nro_Fiscal, df.cu_SerialImpresora as Serial_Fiscal
        FROM MA_PAGOS f
        INNER JOIN MA_TRANSACCION t ON f.c_Caja=t.c_Caja 
            AND f.c_Sucursal=t.c_Localidad
            AND f.c_Numero=t.c_Numero
        INNER JOIN MA_CAJA c ON c.C_Codigo=f.c_Caja
        INNER JOIN MA_DOCUMENTOS_FISCAL df ON df.cu_Localidad=f.c_Sucursal 
            AND df.cu_DocumentoTipo=f.c_Concepto AND df.cu_DocumentoStellar=f.c_Numero
        WHERE {where_vta}
        ORDER BY (f.f_Fecha + convert(time,f.f_Hora)) ASC
    """
    datos_ventas = fetch_data(DB_VAD20_DSN, query_ventas, params)
    
    payload_total = datos_inv + datos_ventas
    
    if payload_total:
        exito = send_to_morpheus(payload_total)
        # Solo actualizamos la marca de agua si es modo incremental y todo fue un éxito
        if exito and not is_historical:
            current_sync_run = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            update_last_sync_date(current_sync_run)
    else:
        print("[*] No hay datos nuevos para sincronizar.")

if __name__ == "__main__":
    main()
