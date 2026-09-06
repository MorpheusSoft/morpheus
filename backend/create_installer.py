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

    build_dir = "/tmp/morpheus_installer_build"
    if os.path.exists(build_dir):
        shutil.rmtree(build_dir)
    os.makedirs(build_dir, exist_ok=True)

    print("[1/4] Extrayendo ejecutable base...")
    with zipfile.ZipFile(src_zip, "r") as z:
        with open(os.path.join(build_dir, "MorpheusSyncAgent.exe"), "wb") as f:
            f.write(z.read("msync.exe"))

    print("[2/4] Generando appsettings.json para QA...")
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
                "Enabled": True,
                "IntervalMinutes": 60,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/products-legacy",
                "ExportMode": "OnlyWithStock"
            },
            "ProductBarcodes": {
                "Enabled": True,
                "IntervalMinutes": 60,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/products-barcodes-legacy",
                "ExportMode": "OnlyWithStock"
            },
            "InventoryBaseline": {
                "Enabled": True,
                "IntervalMinutes": 60,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/inventory-baseline-legacy",
                "BaselineCutoffDate": "2026-06-07"
            },
            "InventoryMovements": {
                "Enabled": True,
                "IntervalMinutes": 10,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/inventory-movements-legacy"
            },
            "Sales": {
                "Enabled": True,
                "IntervalMinutes": 10,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/sales-legacy"
            },
            "SupplierProducts": {
                "Enabled": True,
                "IntervalMinutes": 30,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/supplier-products-legacy"
            },
            "Suppliers": {
                "Enabled": True,
                "IntervalMinutes": 60,
                "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/suppliers-legacy"
            }
        },
        "StoreFacilityId": 1
    }

    with open(os.path.join(build_dir, "appsettings.json"), "w", encoding="utf-8") as f:
        json.dump(appsettings, f, indent=2)

    print("[3/4] Creando scripts automatizados de gestion...")
    
    bat_install = """@echo off
chcp 65001 > nul
echo =========================================================
echo   MORPHEUS SYNC AGENT - INSTALADOR DE SERVICIO WINDOWS
echo =========================================================
echo.
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Este script debe ejecutarse como Administrador.
    echo Haz clic derecho sobre el archivo y selecciona:
    echo 'Ejecutar como administrador'.
    echo.
    pause
    exit /b 1
)

set INSTALL_DIR=%~dp0
if "%INSTALL_DIR:~-1%"=="\\" set INSTALL_DIR=%INSTALL_DIR:~0,-1%
set EXE_PATH=%INSTALL_DIR%\\MorpheusSyncAgent.exe

if not exist "%EXE_PATH%" (
    echo [ERROR] No se encuentra: %EXE_PATH%
    pause
    exit /b 1
)

echo [1/3] Deteniendo servicio previo si existe...
sc stop "MorpheusSyncAgent" >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/3] Registrando servicio Windows...
sc delete "MorpheusSyncAgent" >nul 2>&1
timeout /t 1 /nobreak >nul

sc create "MorpheusSyncAgent" binPath= "\\"%EXE_PATH%\\"" start= auto DisplayName= "Morpheus Sync Agent"
if %errorLevel% neq 0 (
    echo [ERROR] Fallo la creacion del servicio.
    pause
    exit /b 1
)

sc description "MorpheusSyncAgent" "Agente de sincronizacion en tiempo real de Morpheus ERP / WMS"
sc failure "MorpheusSyncAgent" reset= 86400 actions= restart/60000/restart/60000/restart/60000

echo.
echo [3/3] Servicio instalado exitosamente con inicio automatico.
echo.
echo =========================================================
echo PASOS SIGUIENTES RECOMENDADOS:
echo 1. Ejecuta '1_Carga_Inicial_Maestros.bat' para enviar la semilla.
echo 2. Ejecuta '2_Iniciar_Servicio.bat' para sincronizar ventas continuas.
echo =========================================================
echo.
pause
"""
    with open(os.path.join(build_dir, "Instalar_Servicio.bat"), "w", encoding="utf-8") as f:
        f.write(bat_install)

    bat_carga = """@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo =========================================================
echo   MORPHEUS SYNC AGENT - CARGA INICIAL DE DATOS MAESTROS
echo =========================================================
echo.
echo Este proceso enviara la semilla inicial desde el POS hacia Morpheus QA:
echo   1. Proveedores (Suppliers)
echo   2. Maestro de Productos y Variantes (Products)
echo   3. Codigos de Barra Alternativos (Barcodes)
echo   4. Cruces Proveedor-Producto (Supplier-Products)
echo   5. Inventario Inicial (Baseline)
echo.
echo Pulsa cualquier tecla para comenzar...
pause > nul

echo.
echo =========================================================
echo [1/5] Extrayendo y enviando PROVEEDORES...
echo =========================================================
MorpheusSyncAgent.exe --run suppliers
timeout /t 2 /nobreak >nul

echo.
echo =========================================================
echo [2/5] Extrayendo y enviando PRODUCTOS Y VARIANTES...
echo =========================================================
MorpheusSyncAgent.exe --run products
timeout /t 2 /nobreak >nul

echo.
echo =========================================================
echo [3/5] Extrayendo y enviando CODIGOS DE BARRA ALTERNATIVOS...
echo =========================================================
MorpheusSyncAgent.exe --run barcodes
timeout /t 2 /nobreak >nul

echo.
echo =========================================================
echo [4/5] Extrayendo y enviando CRUCES PROVEEDOR-PRODUCTO...
echo =========================================================
MorpheusSyncAgent.exe --run supplier-products
timeout /t 2 /nobreak >nul

echo.
echo =========================================================
echo [5/5] Extrayendo y enviando INVENTARIO INICIAL (BASELINE)...
echo =========================================================
MorpheusSyncAgent.exe --run baseline
timeout /t 2 /nobreak >nul

echo.
echo =========================================================
echo   ¡CARGA INICIAL DE MAESTROS FINALIZADA!
echo =========================================================
echo Ahora puedes iniciar el servicio de fondo con '2_Iniciar_Servicio.bat'.
echo.
pause
"""
    with open(os.path.join(build_dir, "1_Carga_Inicial_Maestros.bat"), "w", encoding="utf-8") as f:
        f.write(bat_carga)

    bat_start = """@echo off
chcp 65001 > nul
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Ejecutar como Administrador.
    pause
    exit /b 1
)
echo Iniciando servicio MorpheusSyncAgent...
sc start "MorpheusSyncAgent"
echo.
sc query "MorpheusSyncAgent"
echo.
pause
"""
    with open(os.path.join(build_dir, "2_Iniciar_Servicio.bat"), "w", encoding="utf-8") as f:
        f.write(bat_start)

    bat_stop = """@echo off
chcp 65001 > nul
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Ejecutar como Administrador.
    pause
    exit /b 1
)
echo Deteniendo servicio MorpheusSyncAgent...
sc stop "MorpheusSyncAgent"
echo.
sc query "MorpheusSyncAgent"
echo.
pause
"""
    with open(os.path.join(build_dir, "3_Detener_Servicio.bat"), "w", encoding="utf-8") as f:
        f.write(bat_stop)

    bat_console = """@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo =========================================================
echo   EJECUTANDO MORPHEUS SYNC AGENT EN CONSOLA
echo   (Modo de prueba en vivo. Presiona Ctrl + C para salir)
echo =========================================================
echo.
MorpheusSyncAgent.exe
pause
"""
    with open(os.path.join(build_dir, "4_Probar_En_Consola.bat"), "w", encoding="utf-8") as f:
        f.write(bat_console)

    bat_uninstall = """@echo off
chcp 65001 > nul
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Ejecutar como Administrador.
    pause
    exit /b 1
)
echo Deteniendo y eliminando servicio MorpheusSyncAgent...
sc stop "MorpheusSyncAgent" >nul 2>&1
timeout /t 2 /nobreak >nul
sc delete "MorpheusSyncAgent"
echo.
echo Servicio desinstalado exitosamente.
pause
"""
    with open(os.path.join(build_dir, "5_Desinstalar_Servicio.bat"), "w", encoding="utf-8") as f:
        f.write(bat_uninstall)

    readme = """===========================================================
  GUIA RAPIDA: MORPHEUS SYNC AGENT (WINDOWS)
===========================================================

REQUISITOS:
- Windows 10, 11 o Windows Server (64 bits).
- Acceso a la base de datos SQL Server (VAD10).
- NO requiere instalar .NET (es auto-contenido).

PASOS DE INSTALACION RAPIDA:

1. Ubicacion recomendada:
   Extrae esta carpeta en: C:\\MorpheusSyncAgent

2. Cadena de conexion (si aplica):
   Abre 'appsettings.json' y revisa que la cadena a SQL Server
   en 'LocalSqlServer' sea la correcta para esta tienda.
   Por defecto apunta al servidor y credenciales de AGUERREVERE.

3. Enviar datos maestros a la nube:
   Haz doble clic sobre '1_Carga_Inicial_Maestros.bat'.
   El asistente enviara secuencialmente:
   - Proveedores
   - Productos y Variantes
   - Codigos de Barra
   - Costos y Empaques
   - Existencias Iniciales

4. Instalar como Servicio Windows:
   Haz clic derecho sobre 'Instalar_Servicio.bat' y selecciona:
   "Ejecutar como administrador".

5. Iniciar sincronizacion de ventas continua:
   Haz clic derecho sobre '2_Iniciar_Servicio.bat' y selecciona:
   "Ejecutar como administrador".

Listo. El agente operara en segundo plano y se iniciara
automaticamente con Windows.
===========================================================
"""
    with open(os.path.join(build_dir, "README_INSTALACION.txt"), "w", encoding="utf-8") as f:
        f.write(readme)

    print("[4/4] Empaquetando instalador final en ZIP...")
    dest_zip = os.path.join(static_dir, "MorpheusSyncAgent_Installer.zip")
    with zipfile.ZipFile(dest_zip, "w", zipfile.ZIP_DEFLATED) as z:
        for filename in sorted(os.listdir(build_dir)):
            filepath = os.path.join(build_dir, filename)
            z.write(filepath, filename)
            print(f"  -> Incluido: {filename} ({os.path.getsize(filepath):,} bytes)")

    ps1_content = """# Script de Instalacion Rapida Morpheus Sync Agent
$ErrorActionPreference = "Stop"
$zipUrl = "https://api.qa.morpheussoft.net/static/MorpheusSyncAgent_Installer.zip"
$destDir = "C:\\MorpheusSyncAgent"
$tempZip = "$env:TEMP\\MorpheusSyncAgent_Installer.zip"

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "  DESCARGANDO E INSTALANDO MORPHEUS SYNC AGENT" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

Write-Host "`n[1/3] Descargando paquete desde la nube..." -ForegroundColor Yellow
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $zipUrl -OutFile $tempZip

Write-Host "[2/3] Descomprimiendo en $destDir..." -ForegroundColor Yellow
if (!(Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}
Expand-Archive -Path $tempZip -DestinationPath $destDir -Force
Remove-Item $tempZip -Force

Write-Host "[3/3] Registrando servicio Windows..." -ForegroundColor Yellow
$exePath = "$destDir\\MorpheusSyncAgent.exe"

sc.exe stop "MorpheusSyncAgent" 2>$null
Start-Sleep -Seconds 2
sc.exe delete "MorpheusSyncAgent" 2>$null
Start-Sleep -Seconds 1

sc.exe create "MorpheusSyncAgent" binPath= "`"$exePath`"" start= auto DisplayName= "Morpheus Sync Agent"
sc.exe description "MorpheusSyncAgent" "Agente de sincronizacion en tiempo real de Morpheus ERP / WMS"
sc.exe failure "MorpheusSyncAgent" reset= 86400 actions= restart/60000/restart/60000/restart/60000

Write-Host "`n=========================================================" -ForegroundColor Green
Write-Host "  ¡INSTALACION COMPLETADA EXITOSAMENTE!" -ForegroundColor Green
Write-Host "  Archivos ubicados en: $destDir" -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "`nSiguiente paso: Abre $destDir y ejecuta '1_Carga_Inicial_Maestros.bat'`n" -ForegroundColor White
"""
    with open(os.path.join(static_dir, "instalar.ps1"), "w", encoding="utf-8") as f:
        f.write(ps1_content)

    print(f"\n[OK] Instalador empaquetado: {dest_zip} ({os.path.getsize(dest_zip):,} bytes)")
    print(f"[OK] Script PowerShell generado: {os.path.join(static_dir, 'instalar.ps1')}")

if __name__ == "__main__":
    build_installer()
