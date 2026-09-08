import zipfile
import os
import shutil
import json

def build_installer():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    static_dir = os.path.join(base_dir, "static")
    os.makedirs(static_dir, exist_ok=True)
    
    published_agent = os.path.join(base_dir, "..", "MorpheusInventoryAgent", "bin", "Release", "net9.0", "win-x64", "publish", "MorpheusSyncAgent.exe")
    published_conf = os.path.join(base_dir, "..", "MorpheusConfigurador", "bin", "Release", "net9.0-windows", "win-x64", "publish", "MorpheusConfigurador.exe")

    src_zip = os.path.join(static_dir, "msync_update.zip")
    configurador_dir = os.path.join(static_dir, "configurador_win")

    build_dir = "/tmp/morpheus_installer_build"
    if os.path.exists(build_dir):
        shutil.rmtree(build_dir)
    os.makedirs(build_dir, exist_ok=True)
    scripts_dir = os.path.join(build_dir, "scripts")
    os.makedirs(scripts_dir, exist_ok=True)

    print("[1/5] Obteniendo motor de sincronizacion MorpheusSyncAgent.exe...")
    published_agent = os.path.join(base_dir, "..", "MorpheusInventoryAgent", "bin", "Release", "net9.0", "win-x64", "publish", "MorpheusSyncAgent.exe")
    agent_dir = os.path.join(static_dir, "agent_win")
    agent_exe = os.path.join(agent_dir, "MorpheusSyncAgent.exe")
    if os.path.exists(published_agent):
        print(f"  -> Usando binario compilado reciente desde {published_agent}")
        shutil.copy2(published_agent, os.path.join(build_dir, "MorpheusSyncAgent.exe"))
    elif os.path.exists(agent_exe):
        print(f"  -> Usando binario compilado reciente desde {agent_exe}")
        shutil.copy2(agent_exe, os.path.join(build_dir, "MorpheusSyncAgent.exe"))
    else:
        with zipfile.ZipFile(src_zip, "r") as z:
            with open(os.path.join(build_dir, "MorpheusSyncAgent.exe"), "wb") as f:
                f.write(z.read("msync.exe"))

    print("[2/5] Incluyendo aplicacion nativa en C# MorpheusConfigurador.exe...")
    published_conf = os.path.join(base_dir, "..", "MorpheusConfigurador", "bin", "Release", "net9.0-windows", "win-x64", "publish", "MorpheusConfigurador.exe")
    conf_exe = os.path.join(configurador_dir, "MorpheusConfigurador.exe")
    if os.path.exists(published_conf):
        print(f"  -> Usando binario compilado reciente desde {published_conf}")
        shutil.copy2(published_conf, os.path.join(build_dir, "MorpheusConfigurador.exe"))
    elif os.path.exists(conf_exe):
        shutil.copy2(conf_exe, os.path.join(build_dir, "MorpheusConfigurador.exe"))
    
    # Include native DLLs (SNI and SQLite) for rock-solid runtime execution on any Windows
    native_dirs = [
        os.path.dirname(published_conf),
        os.path.dirname(os.path.dirname(published_conf)),
        os.path.dirname(published_agent),
        os.path.dirname(os.path.dirname(published_agent)),
        configurador_dir,
        agent_dir,
        os.path.expanduser("~/.nuget/packages/microsoft.data.sqlclient.sni.runtime/6.0.2/runtimes/win-x64/native")
    ]
    for nd in native_dirs:
        if not os.path.exists(nd): continue
        for native_name in ["Microsoft.Data.SqlClient.SNI.dll", "Microsoft.Data.SqlClient.SNI.x64.dll", "e_sqlite3.dll"]:
            cand = os.path.join(nd, native_name)
            target = os.path.join(build_dir, native_name)
            if os.path.exists(cand) and not os.path.exists(target):
                print(f"  -> Incluyendo DLL nativa: {native_name}")
                shutil.copy2(cand, target)

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
            "Categories": {
                "Enabled": False,
                "IntervalMinutes": 1440,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/categories-legacy"
            },
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
                "BaselineCutoffDate": "now"
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
        "StoreFacilityId": 10,
        "StoreFacilityCode": "CAT-01"
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
net start "NeoAgentSync"
pause
"""
    with open(os.path.join(scripts_dir, "Iniciar_Servicio.bat"), "w", encoding="utf-8") as f:
        f.write(bat_start)

    bat_stop = """@echo off
net stop "NeoAgentSync"
pause
"""
    with open(os.path.join(scripts_dir, "Detener_Servicio.bat"), "w", encoding="utf-8") as f:
        f.write(bat_stop)

    bat_uninstall = """@echo off
sc stop "NeoAgentSync" >nul 2>&1
timeout /t 1 /nobreak >nul
sc delete "NeoAgentSync"
sc stop "NEO" >nul 2>&1
timeout /t 1 /nobreak >nul
sc delete "NEO"
sc stop "MorpheusSyncAgent" >nul 2>&1
timeout /t 1 /nobreak >nul
sc delete "MorpheusSyncAgent"
echo Servicio NEO Agent Sync desinstalado exitosamente.
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
   - Pestaña 3: Registrar el servicio de Windows (NEO Agent Sync) y crear icono en el Escritorio.
   - Pestaña 1: Resetear estado local (Fase 2) y sembrar maestros 1 al 5 (Fase 3).
   - Pestaña 2: Sincronizar ventas historicas y movimientos (Kardex).
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

# 1. Detener procesos o servicios previos si estan corriendo para liberar los archivos .exe
Write-Host "`n[1/4] Verificando y liberando procesos en ejecucion..." -ForegroundColor Yellow
Get-Process -Name "MorpheusConfigurador", "MorpheusSyncAgent" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
if (Get-Service -Name "NeoAgentSync" -ErrorAction SilentlyContinue) {
    Stop-Service -Name "NeoAgentSync" -Force -ErrorAction SilentlyContinue
}
if (Get-Service -Name "NEO" -ErrorAction SilentlyContinue) {
    Stop-Service -Name "NEO" -Force -ErrorAction SilentlyContinue
    & sc.exe delete "NEO" | Out-Null
}
if (Get-Service -Name "MorpheusSyncAgent" -ErrorAction SilentlyContinue) {
    Stop-Service -Name "MorpheusSyncAgent" -Force -ErrorAction SilentlyContinue
    & sc.exe delete "MorpheusSyncAgent" | Out-Null
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

# Registrar o actualizar servicio NeoAgentSync con nombre 'NEO Agent Sync' y descripcion 'Integrador con Stellar'
$agentExe = "$destDir\\MorpheusSyncAgent.exe"
if (Test-Path $agentExe) {
    if (!(Get-Service -Name "NeoAgentSync" -ErrorAction SilentlyContinue)) {
        & sc.exe create "NeoAgentSync" binPath= "`"$agentExe`"" start= auto DisplayName= "NEO Agent Sync" | Out-Null
    } else {
        & sc.exe config "NeoAgentSync" binPath= "`"$agentExe`"" DisplayName= "NEO Agent Sync" | Out-Null
    }
    & sc.exe description "NeoAgentSync" "Integrador con Stellar" | Out-Null
    Write-Host "  -> Servicio Windows 'NEO Agent Sync' registrado con descripcion 'Integrador con Stellar' [OK]." -ForegroundColor Green
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
