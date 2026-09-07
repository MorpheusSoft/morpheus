import zipfile
import os
import shutil
import json

def build_installer():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    static_dir = os.path.join(base_dir, "static")
    os.makedirs(static_dir, exist_ok=True)
    
    src_zip = os.path.join(static_dir, "msync_update.zip")
    if not os.path.exists(src_zip):
        alt_zip = os.path.join(base_dir, "..", "static", "msync_update.zip")
        if os.path.exists(alt_zip):
            src_zip = alt_zip
        else:
            raise FileNotFoundError(f"Cannot find source msync_update.zip at {src_zip}")

    configurador_dir = os.path.join(static_dir, "configurador_win")
    if not os.path.exists(configurador_dir):
        alt_conf = os.path.join(base_dir, "..", "MorpheusConfigurador", "publish")
        if os.path.exists(alt_conf):
            configurador_dir = alt_conf
        else:
            raise FileNotFoundError(f"Cannot find compiled MorpheusConfigurador at {configurador_dir}")

    build_dir = "/tmp/morpheus_installer_build"
    if os.path.exists(build_dir):
        shutil.rmtree(build_dir)
    os.makedirs(build_dir, exist_ok=True)
    scripts_dir = os.path.join(build_dir, "scripts")
    os.makedirs(scripts_dir, exist_ok=True)

    print("[1/5] Obteniendo motor de sincronizacion MorpheusSyncAgent.exe...")
    agent_dir = os.path.join(static_dir, "agent_win")
    agent_exe = os.path.join(agent_dir, "MorpheusSyncAgent.exe")
    if os.path.exists(agent_exe):
        print(f"  -> Usando binario compilado reciente desde {agent_exe}")
        shutil.copy2(agent_exe, os.path.join(build_dir, "MorpheusSyncAgent.exe"))
    else:
        with zipfile.ZipFile(src_zip, "r") as z:
            with open(os.path.join(build_dir, "MorpheusSyncAgent.exe"), "wb") as f:
                f.write(z.read("msync.exe"))

    print("[2/5] Incluyendo aplicacion nativa en C# MorpheusConfigurador.exe...")
    conf_exe = os.path.join(configurador_dir, "MorpheusConfigurador.exe")
    shutil.copy2(conf_exe, os.path.join(build_dir, "MorpheusConfigurador.exe"))
    
    sni_dll = os.path.join(configurador_dir, "Microsoft.Data.SqlClient.SNI.dll")
    if os.path.exists(sni_dll):
        shutil.copy2(sni_dll, os.path.join(build_dir, "Microsoft.Data.SqlClient.SNI.dll"))

    print("[3/5] Generando appsettings.json base preconfigurado...")
    appsettings = {
        "Logging": {
            "LogLevel": {
                "Default": "Information",
                "Microsoft.Hosting.Lifetime": "Information"
            }
        },
        "ConnectionStrings": {
            "LocalSqlServer": "Server=AGUERREVERE\\SRVAGUERREVERE;Database=VAD10;User Id=jqFydZPO;Password=+121f4T$19;TrustServerCertificate=True;",
            "LocalSQLite": "Data Source=morpheus_local.db"
        },
        "DirectExtractors": {
            "Products": {
                "Enabled": False,
                "IntervalMinutes": 60,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/products-legacy",
                "ExportMode": "OnlyWithStock"
            },
            "ProductBarcodes": {
                "Enabled": False,
                "IntervalMinutes": 60,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/products-barcodes-legacy",
                "ExportMode": "OnlyWithStock"
            },
            "InventoryBaseline": {
                "Enabled": False,
                "IntervalMinutes": 60,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/inventory-baseline-legacy",
                "BaselineCutoffDate": "2026-06-07"
            },
            "InventoryMovements": {
                "Enabled": False,
                "IntervalMinutes": 10,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/inventory-movements-legacy"
            },
            "Sales": {
                "Enabled": True,
                "IntervalMinutes": 10,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/sales-legacy"
            },
            "SupplierProducts": {
                "Enabled": False,
                "IntervalMinutes": 30,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/supplier-products-legacy"
            },
            "Suppliers": {
                "Enabled": False,
                "IntervalMinutes": 60,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/suppliers-legacy"
            }
        },
        "StoreFacilityId": 1
    }

    with open(os.path.join(build_dir, "appsettings.json"), "w", encoding="utf-8") as f:
        json.dump(appsettings, f, indent=2)

    print("[4/5] Creando utilidades y documentacion oficial...")
    # Lanzador batch auxiliar opcional
    bat_config = """@echo off
start "" "%~dp0MorpheusConfigurador.exe"
"""
    with open(os.path.join(build_dir, "Configurar_Agente.bat"), "w", encoding="utf-8") as f:
        f.write(bat_config)

    # Scripts auxiliares dentro de scripts/
    bat_start = """@echo off
net start "MorpheusSyncAgent"
pause
"""
    with open(os.path.join(scripts_dir, "Iniciar_Servicio.bat"), "w", encoding="utf-8") as f:
        f.write(bat_start)

    bat_stop = """@echo off
net stop "MorpheusSyncAgent"
pause
"""
    with open(os.path.join(scripts_dir, "Detener_Servicio.bat"), "w", encoding="utf-8") as f:
        f.write(bat_stop)

    bat_uninstall = """@echo off
sc stop "MorpheusSyncAgent" >nul 2>&1
timeout /t 2 /nobreak >nul
sc delete "MorpheusSyncAgent"
echo Servicio desinstalado exitosamente.
pause
"""
    with open(os.path.join(scripts_dir, "Desinstalar_Servicio.bat"), "w", encoding="utf-8") as f:
        f.write(bat_uninstall)

    readme = """===========================================================
  MORPHEUS SYNC AGENT - APLICACION OFICIAL DE TIENDAS (C#)
===========================================================

INSTRUCCIONES DE USO:

1. Ejecuta directamente el programa:
   👉 MorpheusConfigurador.exe

2. Desde la aplicacion podras:
   - Pestaña 4: Seleccionar tu tienda (Patio Trigal, Cumboto, etc.) y probar conexion SQL.
   - Pestaña 3: Registrar el servicio de Windows y crear icono en el Escritorio.
   - Pestaña 1: Resetear estado local (Fase 2) y sembrar maestros 1 al 5 (Fase 3).
   - Pestaña 2: Sincronizar ventas historicas a voluntad.
   - Pestaña 3: Iniciar el servicio para que opere en segundo plano.

Solucion 100% nativa en C# (.NET). Sin scripts ni ventanas intermedias.
===========================================================
"""
    with open(os.path.join(build_dir, "LEEME_INSTALACION.txt"), "w", encoding="utf-8") as f:
        f.write(readme)

    print("[5/5] Empaquetando instalador final en ZIP...")
    dest_zip = os.path.join(static_dir, "MorpheusSyncAgent_Installer.zip")
    with zipfile.ZipFile(dest_zip, "w", zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(build_dir):
            for file in files:
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, build_dir)
                z.write(full_path, rel_path)
                print(f"  -> Incluido: {rel_path} ({os.path.getsize(full_path):,} bytes)")

    # Actualizar script powershell para instalacion web rapida y actualizacion segura (instalar.ps1)
    ps1_web = """$ErrorActionPreference = "Stop"
$zipUrl = "https://api.qa.morpheussoft.net/static/MorpheusSyncAgent_Installer.zip"
$destDir = "C:\\MorpheusSyncAgent"
$tempZip = "$env:TEMP\\MorpheusSyncAgent_Installer.zip"

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "  MORPHEUS SYNC AGENT - INSTALACION / ACTUALIZACION (C#)" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

# 1. Detener procesos o servicio si estan corriendo para liberar los archivos .exe
Write-Host "`n[1/4] Verificando y liberando procesos en ejecucion..." -ForegroundColor Yellow
Get-Process -Name "MorpheusConfigurador", "MorpheusSyncAgent" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
if (Get-Service -Name "MorpheusSyncAgent" -ErrorAction SilentlyContinue) {
    Stop-Service -Name "MorpheusSyncAgent" -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 1

# 2. Descargar el nuevo paquete
Write-Host "[2/4] Descargando version mas reciente desde QA..." -ForegroundColor Yellow
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $zipUrl -OutFile $tempZip

# 3. Respaldar appsettings.json previo para no sobreescribir la configuracion de tienda
$backupConfig = "$env:TEMP\\morpheus_appsettings_backup.json"
$hasExistingConfig = Test-Path "$destDir\\appsettings.json"
if ($hasExistingConfig) {
    Copy-Item "$destDir\\appsettings.json" -Destination $backupConfig -Force
}

# 4. Extraer actualizacion
Write-Host "[3/4] Extrayendo archivos actualizados en $destDir..." -ForegroundColor Yellow
if (!(Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}
Expand-Archive -Path $tempZip -DestinationPath $destDir -Force
Remove-Item $tempZip -Force

# Restaurar configuracion previa personalizada si existia
if ($hasExistingConfig -and (Test-Path $backupConfig)) {
    Copy-Item $backupConfig -Destination "$destDir\\appsettings.json" -Force
    Remove-Item $backupConfig -Force
    Write-Host "  -> Tu configuracion previa de tienda y conexion SQL fue preservada [OK]." -ForegroundColor Green
}

Write-Host "[4/4] Abriendo MorpheusConfigurador.exe actualizado..." -ForegroundColor Green
Start-Process "$destDir\\MorpheusConfigurador.exe"
"""
    with open(os.path.join(static_dir, "instalar.ps1"), "w", encoding="utf-8") as f:
        f.write(ps1_web)

    print(f"\n[OK] Instalador empaquetado: {dest_zip} ({os.path.getsize(dest_zip):,} bytes)")
    print(f"[OK] Script de instalacion web: {os.path.join(static_dir, 'instalar.ps1')}")

if __name__ == "__main__":
    build_installer()
