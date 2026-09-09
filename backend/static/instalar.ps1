$ErrorActionPreference = "Stop"
$zipUrl = "https://api.qa.morpheussoft.net/static/MorpheusSyncAgent_Installer.zip"
$destDir = "C:\MorpheusSyncAgent"
$tempZip = "$env:TEMP\MorpheusSyncAgent_Installer.zip"

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
$backupConfig = "$env:TEMP\morpheus_appsettings_backup.json"
$hasExistingConfig = Test-Path "$destDir\appsettings.json"
if ($hasExistingConfig) {
    Copy-Item "$destDir\appsettings.json" -Destination $backupConfig -Force
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
    Copy-Item $backupConfig -Destination "$destDir\appsettings.json" -Force
    Remove-Item $backupConfig -Force
    Write-Host "  -> Tu configuracion previa de tienda y conexion SQL fue preservada [OK]." -ForegroundColor Green
}

# Registrar o actualizar servicio NeoAgentSync con nombre 'NEO Agent Sync' y descripcion 'Integrador con Stellar'
$agentExe = "$destDir\MorpheusSyncAgent.exe"
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
Start-Process "$destDir\MorpheusConfigurador.exe"
