import os
import subprocess
import zipfile
import pexpect
import sys

# CONFIGURACIÓN DEL VPS (QA)
VPS_IP = "217.216.83.151"
VPS_USER = "lzambrano"
VPS_PASSWORD = "Pegaso#26"
VPS_TARGET_DIR = "/home/lzambrano/Morpheus/backend/static"

# CONFIGURACIÓN LOCAL
PROJECT_DIR = "/home/lzambrano/Desarrollo/Morpheus/MorpheusInventoryAgent"
PUBLISH_DIR = os.path.join(PROJECT_DIR, "bin/Release/net9.0/win-x64/publish")
EXE_NAME = "MorpheusSyncAgent.exe"
TARGET_EXE_NAME = "msync.exe"
ZIP_NAME = "msync_update.zip"
LOCAL_ZIP_PATH = os.path.join("/home/lzambrano/Desarrollo", ZIP_NAME)

def run_command(cmd, cwd=None):
    print(f"[*] Ejecutando: {cmd}")
    result = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[!] Error ejecutando comando: {result.stderr}")
        return False
    return True

def compile_agent():
    print("=== PASO 1: Compilando el Agente para Windows (win-x64) ===")
    # dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
    cmd = "dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true"
    return run_command(cmd, cwd=PROJECT_DIR)

def package_zip():
    print("=== PASO 2: Creando el archivo ZIP ===")
    exe_src = os.path.join(PUBLISH_DIR, EXE_NAME)
    config_src = os.path.join(PROJECT_DIR, "appsettings.json")
    
    if not os.path.exists(exe_src):
        print(f"[!] No se encontró el ejecutable en: {exe_src}")
        return False
    
    if not os.path.exists(config_src):
        print(f"[!] No se encontró appsettings.json en: {config_src}")
        return False
    
    try:
        print(f"[*] Creando {LOCAL_ZIP_PATH}...")
        with zipfile.ZipFile(LOCAL_ZIP_PATH, 'w', zipfile.ZIP_DEFLATED) as zipf:
            # Añadir msync.exe (renombrado de MorpheusSyncAgent.exe)
            zipf.write(exe_src, arcname=TARGET_EXE_NAME)
            # Añadir appsettings.json
            zipf.write(config_src, arcname="appsettings.json")
        print(f"[+] ZIP creado con éxito en: {LOCAL_ZIP_PATH}")
        return True
    except Exception as e:
        print(f"[!] Error creando ZIP: {e}")
        return False

def upload_to_vps():
    print("=== PASO 3: Subiendo el ZIP al servidor QA (VPS) ===")
    if not os.path.exists(LOCAL_ZIP_PATH):
        print(f"[!] No se encontró el archivo ZIP para subir: {LOCAL_ZIP_PATH}")
        return False
    
    # Usar SCP para copiar el archivo
    scp_cmd = f"scp -o StrictHostKeyChecking=no {LOCAL_ZIP_PATH} {VPS_USER}@{VPS_IP}:{VPS_TARGET_DIR}/{ZIP_NAME}"
    print(f"[*] Ejecutando subida vía SCP...")
    
    try:
        child = pexpect.spawn(scp_cmd, encoding='utf-8', timeout=300)
        # Esperar la solicitud de contraseña
        index = child.expect(['assword:', pexpect.EOF, pexpect.TIMEOUT])
        if index == 0:
            child.sendline(VPS_PASSWORD)
            child.expect(pexpect.EOF)
            print("[+] Archivo subido con éxito al servidor QA!")
            print(f"[+] Disponible en: https://api.qa.morpheussoft.net/static/{ZIP_NAME}")
            return True
        else:
            print(f"[!] Error de conexión o timeout. Salida: {child.before}")
            return False
    except Exception as e:
        print(f"[!] Error de SCP: {e}")
        return False

def main():
    if not compile_agent():
        print("[!] Compilación fallida. Abortando.")
        sys.exit(1)
        
    if not package_zip():
        print("[!] Empaquetado fallido. Abortando.")
        sys.exit(1)
        
    if not upload_to_vps():
        print("[!] Subida fallida. Abortando.")
        sys.exit(1)
        
    print("=== PROCESO COMPLETADO CON ÉXITO ===")

if __name__ == "__main__":
    main()
