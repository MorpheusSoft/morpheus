using System.Diagnostics;
using System.IO.Compression;
using System.Text;
using System.Text.Json;
using Dapper;
using Microsoft.Data.SqlClient;
using MorpheusSyncAgent.Models;
using MorpheusSyncAgent.Utils;

namespace MorpheusSyncAgent.Workers;

public class HeartbeatWorker : BackgroundService
{
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<HeartbeatWorker> _logger;
    private int _localConfigVersion = 1;

    public HeartbeatWorker(
        IConfiguration configuration,
        IHttpClientFactory httpClientFactory,
        IServiceProvider serviceProvider,
        ILogger<HeartbeatWorker> logger)
    {
        _configuration = configuration;
        _httpClientFactory = httpClientFactory;
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Iniciando servicio de telemetría y Heartbeat hacia Neo ERP...");

        // Esperar 5 segundos al arranque para permitir inicio de los demás servicios
        await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await EmitHeartbeatAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning("Error en ciclo de Heartbeat: {Message}", ex.Message);
            }

            // Emitir latido cada 1 minuto para respuesta ágil a comandos remotos
            await Task.Delay(TimeSpan.FromSeconds(60), stoppingToken);
        }
    }

    private async Task EmitHeartbeatAsync(CancellationToken stoppingToken)
    {
        string connectionString = _configuration.GetConnectionString("LocalSqlServer") ?? string.Empty;
        int facilityId = _configuration.GetValue<int>("StoreFacilityId", 1);
        string facilityCode = _configuration.GetValue<string>("StoreFacilityCode", "");

        DateTime? lastStellarSale = null;
        int salesTodayCount = 0;
        decimal salesTodayAmount = 0;
        string sqlStatus = "CONNECTED";
        string? errorDetails = null;

        try
        {
            using var connection = new SqlConnection(connectionString);
            await connection.OpenAsync(stoppingToken);

            string basicQuery = @"
                BEGIN TRY
                    SELECT 
                        MAX(f_Fecha + CONVERT(TIME, f_Hora)) AS last_sale,
                        COUNT(DISTINCT CASE WHEN f_Fecha = CAST(GETDATE() AS DATE) THEN c_Numero END) AS count_today
                    FROM VAD20.dbo.MA_PAGOS WITH (NOLOCK)
                    WHERE f_Fecha <= DATEADD(day, 1, GETDATE());
                END TRY
                BEGIN CATCH
                    SELECT 
                        MAX(f_Fecha + CONVERT(TIME, f_Hora)) AS last_sale,
                        COUNT(DISTINCT CASE WHEN f_Fecha = CAST(GETDATE() AS DATE) THEN c_Numero END) AS count_today
                    FROM dbo.MA_PAGOS WITH (NOLOCK)
                    WHERE f_Fecha <= DATEADD(day, 1, GETDATE());
                END CATCH
            ";

            var result = await connection.QueryFirstOrDefaultAsync(basicQuery);
            if (result != null)
            {
                if (result.last_sale != null) lastStellarSale = (DateTime)result.last_sale;
                salesTodayCount = Convert.ToInt32(result.count_today ?? 0);
            }

            if (salesTodayCount > 0)
            {
                try
                {
                    string amountQuery = @"
                        BEGIN TRY
                            SELECT ISNULL(SUM(t.Cantidad * t.Precio), 0) AS amount_today
                            FROM VAD20.dbo.MA_PAGOS f WITH (NOLOCK)
                            INNER JOIN VAD20.dbo.MA_TRANSACCION t WITH (NOLOCK)
                                ON f.c_Caja = t.c_Caja AND f.c_Sucursal = t.c_Localidad AND f.c_Numero = t.c_Numero
                            WHERE f.f_Fecha = CAST(GETDATE() AS DATE);
                        END TRY
                        BEGIN CATCH
                            SELECT ISNULL(SUM(t.Cantidad * t.Precio), 0) AS amount_today
                            FROM dbo.MA_PAGOS f WITH (NOLOCK)
                            INNER JOIN dbo.MA_TRANSACCION t WITH (NOLOCK)
                                ON f.c_Caja = t.c_Caja AND f.c_Sucursal = t.c_Localidad AND f.c_Numero = t.c_Numero
                            WHERE f.f_Fecha = CAST(GETDATE() AS DATE);
                        END CATCH
                    ";
                    var amt = await connection.ExecuteScalarAsync<decimal?>(amountQuery);
                    salesTodayAmount = amt ?? 0;
                }
                catch (Exception exAmt)
                {
                    _logger.LogDebug("No se pudo calcular monto acumulado del día: {Msg}", exAmt.Message);
                }
            }
        }
        catch (Exception ex)
        {
            sqlStatus = "ERROR";
            errorDetails = ex.Message;
            _logger.LogWarning("Fallo al verificar SQL Server en Heartbeat: {Msg}", ex.Message);
        }

        var syncState = SyncStateManager.LoadState();
        DateTime? lastSynced = syncState.LastSalesSync > new DateTime(2000, 1, 1)
            ? syncState.LastSalesSync
            : null;

        int lagMinutes = 0;
        if (lastStellarSale.HasValue && lastSynced.HasValue)
        {
            var diff = lastStellarSale.Value - lastSynced.Value;
            lagMinutes = diff.TotalMinutes > 0 ? (int)diff.TotalMinutes : 0;
        }

        string overallStatus = "HEALTHY";
        if (sqlStatus == "ERROR")
        {
            overallStatus = "CRITICAL";
        }
        else if (lagMinutes > 30)
        {
            overallStatus = "WARNING";
        }

        var telemetryDto = new StoreSyncTelemetryDto
        {
            FacilityId = facilityId,
            RegisterCode = "SERVER-STORE",
            AgentVersion = "2.4.1-neo",
            MachineName = Environment.MachineName,
            SqlServerStatus = sqlStatus,
            LastStellarSaleTime = lastStellarSale,
            LastSyncedSaleTime = lastSynced,
            SalesTodayCount = salesTodayCount,
            SalesTodayAmount = salesTodayAmount,
            PendingQueueCount = 0,
            LagMinutes = lagMinutes,
            Status = overallStatus,
            ErrorDetails = errorDetails,
            TelemetryMetadata = new Dictionary<string, object>
            {
                ["last_product_sync"] = syncState.LastProductSync > new DateTime(2000, 1, 1) ? syncState.LastProductSync.ToString("o") : null!,
                ["last_barcode_sync"] = syncState.LastBarcodeSync > new DateTime(2000, 1, 1) ? syncState.LastBarcodeSync.ToString("o") : null!,
                ["last_supplier_product_sync"] = syncState.LastSupplierProductSync > new DateTime(2000, 1, 1) ? syncState.LastSupplierProductSync.ToString("o") : null!,
                ["last_sales_sync"] = syncState.LastSalesSync > new DateTime(2000, 1, 1) ? syncState.LastSalesSync.ToString("o") : null!,
                ["baseline_done"] = syncState.BaselineInventoryDone,
                ["last_movement_sync"] = syncState.LastMovementSync > new DateTime(2000, 1, 1) ? syncState.LastMovementSync.ToString("o") : null!,
                ["is_sync_paused"] = SyncStateManager.IsSyncPaused()
            }
        };

        var targetUrl = ResolveHeartbeatUrl();
        var json = JsonSerializer.Serialize(telemetryDto);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(30);

        try
        {
            var response = await client.PostAsync(targetUrl, content, stoppingToken);
            if (response.IsSuccessStatusCode)
            {
                var responseBody = await response.Content.ReadAsStringAsync(stoppingToken);
                var respObj = JsonSerializer.Deserialize<HeartbeatResponseDto>(responseBody);
                if (respObj != null)
                {
                    // Procesar nueva configuración si la versión es mayor
                    if (respObj.Config != null && respObj.Config.Version > _localConfigVersion)
                    {
                        _logger.LogInformation("[CONTROL REMOTO] Nueva configuración recibida desde Neo ERP (v{NewVersion} > v{OldVersion}).", respObj.Config.Version, _localConfigVersion);
                        _localConfigVersion = respObj.Config.Version;
                    }

                    // Procesar órdenes y comandos remotos
                    if (respObj.Commands != null && respObj.Commands.Count > 0)
                    {
                        foreach (var cmd in respObj.Commands)
                        {
                            _logger.LogInformation("[CONTROL REMOTO] Orden #{Id} recibida: '{Type}'. Despachando ejecución...", cmd.Id, cmd.CommandType);
                            _ = Task.Run(() => ExecuteRemoteCommandAsync(cmd, stoppingToken), stoppingToken);
                        }
                    }
                }
                _logger.LogDebug("Heartbeat enviado exitosamente a Neo ERP ({TargetUrl}).", targetUrl);
            }
            else
            {
                _logger.LogWarning("Heartbeat respondido con status: {StatusCode}", response.StatusCode);
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug("No se pudo entregar Heartbeat a Neo ERP ({TargetUrl}): {Msg}", targetUrl, ex.Message);
        }
    }

    private async Task ExecuteRemoteCommandAsync(StoreAgentCommandDto cmd, CancellationToken stoppingToken)
    {
        // 1. Notificar RUNNING al servidor central
        await SendCommandAckAsync(cmd.Id, "RUNNING", null, null, stoppingToken);

        try
        {
            string cmdType = (cmd.CommandType ?? "").Trim().ToUpperInvariant();
            switch (cmdType)
            {
                case "FORCE_SYNC_SALES":
                    var salesWorker = _serviceProvider.GetRequiredService<SalesExtractorWorker>();
                    int synced = await salesWorker.TriggerImmediateSyncAsync(stoppingToken);
                    await SendCommandAckAsync(cmd.Id, "COMPLETED", new { processed = synced, message = $"Ventas sincronizadas exitosamente: {synced} facturas." }, null, stoppingToken);
                    break;

                case "FORCE_SYNC_MASTERS":
                    var catWorker = _serviceProvider.GetRequiredService<CategoryExtractorWorker>();
                    await catWorker.RunOnceAsync();
                    var supWorker = _serviceProvider.GetRequiredService<SuppliersExtractorWorker>();
                    await supWorker.RunOnceAsync();
                    var prodWorker = _serviceProvider.GetRequiredService<ProductMasterExtractorWorker>();
                    await prodWorker.RunOnceAsync();
                    var bcWorker = _serviceProvider.GetRequiredService<ProductBarcodesExtractorWorker>();
                    await bcWorker.RunOnceAsync();
                    var spWorker = _serviceProvider.GetRequiredService<SupplierProductsExtractorWorker>();
                    await spWorker.RunOnceAsync();
                    await SendCommandAckAsync(cmd.Id, "COMPLETED", new { message = "Catálogos maestros sincronizados exitosamente (Categorías, Proveedores, Productos, Códigos de barra, Costos por Proveedor)." }, null, stoppingToken);
                    break;

                case "SYNC_HISTORICAL":
                    var histSalesWorker = _serviceProvider.GetRequiredService<SalesExtractorWorker>();
                    DateTime from = DateTime.Today.AddMonths(-3);
                    DateTime to = DateTime.Now;
                    int batchSize = 500;

                    if (cmd.Parameters.ValueKind == JsonValueKind.Object)
                    {
                        if (cmd.Parameters.TryGetProperty("from", out var f) && DateTime.TryParse(f.GetString(), out var pf)) from = pf;
                        else if (cmd.Parameters.TryGetProperty("start_date", out var s) && DateTime.TryParse(s.GetString(), out var ps)) from = ps;

                        if (cmd.Parameters.TryGetProperty("to", out var t) && DateTime.TryParse(t.GetString(), out var pt)) to = pt;
                        else if (cmd.Parameters.TryGetProperty("end_date", out var e) && DateTime.TryParse(e.GetString(), out var pe)) to = pe;

                        if (cmd.Parameters.TryGetProperty("batch_size", out var b)) batchSize = b.GetInt32();
                    }

                    await histSalesWorker.RunHistoricalAsync(from, to, batchSize, stoppingToken);
                    await SendCommandAckAsync(cmd.Id, "COMPLETED", new { message = $"Carga histórica completada ({from:yyyy-MM-dd} a {to:yyyy-MM-dd})." }, null, stoppingToken);
                    break;

                case "SYNC_BASELINE":
                    var baselineWorker = _serviceProvider.GetRequiredService<InventoryBaselineWorker>();
                    string cutoffDate = "now";
                    string? deposit = null;

                    if (cmd.Parameters.ValueKind == JsonValueKind.Object)
                    {
                        if (cmd.Parameters.TryGetProperty("date", out var d) && !string.IsNullOrWhiteSpace(d.GetString())) cutoffDate = d.GetString()!;
                        else if (cmd.Parameters.TryGetProperty("cutoff", out var c) && !string.IsNullOrWhiteSpace(c.GetString())) cutoffDate = c.GetString()!;

                        if (cmd.Parameters.TryGetProperty("deposit", out var dep) && !string.IsNullOrWhiteSpace(dep.GetString())) deposit = dep.GetString();
                        else if (cmd.Parameters.TryGetProperty("deposit_code", out var depCode) && !string.IsNullOrWhiteSpace(depCode.GetString())) deposit = depCode.GetString();
                    }

                    await baselineWorker.RunOnceAsync(cutoffDate, null, deposit, stoppingToken);
                    string targetDepMsg = !string.IsNullOrWhiteSpace(deposit) ? $"para el depósito {deposit.Trim()}" : "general (todos los depósitos activos)";
                    await SendCommandAckAsync(cmd.Id, "COMPLETED", new { message = $"Baseline ejecutado exitosamente {targetDepMsg} con fecha {cutoffDate}." }, null, stoppingToken);
                    break;

                case "CONFIG_UPDATE":
                    if (cmd.Parameters.ValueKind == JsonValueKind.Object)
                    {
                        if (cmd.Parameters.TryGetProperty("is_sync_paused", out var isp))
                        {
                            SyncStateManager.SetSyncPaused(isp.GetBoolean());
                        }
                    }
                    await SendCommandAckAsync(cmd.Id, "COMPLETED", new { message = "Configuración remota aplicada en memoria local." }, null, stoppingToken);
                    break;

                case "PAUSE_SYNC":
                case "STOP_SYNC":
                    SyncStateManager.SetSyncPaused(true);
                    _logger.LogWarning("[CONTROL REMOTO] Procesos de sincronización periódica PAUSADOS por orden central.");
                    await SendCommandAckAsync(cmd.Id, "COMPLETED", new { message = "Procesos de sincronización pausados. Telemetría y actualizaciones continúan activas." }, null, stoppingToken);
                    break;

                case "RESUME_SYNC":
                case "START_SYNC":
                    SyncStateManager.SetSyncPaused(false);
                    _logger.LogInformation("[CONTROL REMOTO] Procesos de sincronización periódica REANUDADOS exitosamente.");
                    await SendCommandAckAsync(cmd.Id, "COMPLETED", new { message = "Procesos de sincronización reanudados exitosamente." }, null, stoppingToken);
                    break;

                case "RESTART_SERVICE":
                    await SendCommandAckAsync(cmd.Id, "COMPLETED", new { message = "Reiniciando servicio NeoAgentSync..." }, null, stoppingToken);
                    await Task.Delay(1000, stoppingToken);
                    if (OperatingSystem.IsWindows())
                    {
                        Process.Start(new ProcessStartInfo
                        {
                            FileName = "cmd.exe",
                            Arguments = "/c timeout /t 3 && sc start NeoAgentSync",
                            CreateNoWindow = true,
                            UseShellExecute = false
                        });
                    }
                    Environment.Exit(0);
                    break;

                case "UPDATE_SOFTWARE":
                    await ExecuteSoftwareUpdateAsync(cmd, stoppingToken);
                    break;

                default:
                    await SendCommandAckAsync(cmd.Id, "FAILED", null, $"Comando desconocido: '{cmdType}'", stoppingToken);
                    break;
            }
        }
        catch (Exception ex)
        {
            string detail = ex.InnerException != null ? $"{ex.Message} -> {ex.InnerException.Message}" : ex.Message;
            _logger.LogError(ex, "[CONTROL REMOTO] Error ejecutando comando #{Id}: {Detail}", cmd.Id, detail);
            await SendCommandAckAsync(cmd.Id, "FAILED", null, detail, stoppingToken);
        }
    }

    private async Task SendCommandAckAsync(long commandId, string status, object? details, string? error, CancellationToken stoppingToken)
    {
        try
        {
            var baseApi = ResolveBaseApiUrl();
            var ackUrl = $"{baseApi}/store-agent/commands/{commandId}/ack";

            var ackDto = new CommandAckDto
            {
                Status = status,
                ResultDetails = details,
                ErrorMessage = error
            };

            var json = JsonSerializer.Serialize(ackDto);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(15);
            await client.PostAsync(ackUrl, content, stoppingToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Fallo al enviar ACK para comando #{Id}: {Msg}", commandId, ex.Message);
        }
    }

    private string ResolveBaseApiUrl()
    {
        var configuredUrl = _configuration.GetValue<string>("DirectExtractors:Sales:TargetApiUrl");
        if (!string.IsNullOrWhiteSpace(configuredUrl))
        {
            var uri = new Uri(configuredUrl);
            return $"{uri.Scheme}://{uri.Authority}/api/v1";
        }

        var defaultApi = _configuration.GetValue<string>("DefaultTargetApiUrl", "http://localhost:8000/api/v1");
        return defaultApi.TrimEnd('/');
    }

    private string ResolveHeartbeatUrl()
    {
        var configuredUrl = _configuration.GetValue<string>("DirectExtractors:Sales:TargetApiUrl");
        if (!string.IsNullOrWhiteSpace(configuredUrl))
        {
            var uri = new Uri(configuredUrl);
            var baseUri = $"{uri.Scheme}://{uri.Authority}";
            return $"{baseUri}/api/v1/sync-telemetry/heartbeat";
        }

        var defaultApi = _configuration.GetValue<string>("DefaultTargetApiUrl", "http://localhost:8000/api/v1");
        return $"{defaultApi.TrimEnd('/')}/sync-telemetry/heartbeat";
    }

    private string ResolveInstallerUrl()
    {
        var configuredUrl = _configuration.GetValue<string>("DirectExtractors:Sales:TargetApiUrl");
        if (!string.IsNullOrWhiteSpace(configuredUrl))
        {
            var uri = new Uri(configuredUrl);
            return $"{uri.Scheme}://{uri.Authority}/static/MorpheusSyncAgent_Installer.zip";
        }
        return "https://api.qa.morpheussoft.net/static/MorpheusSyncAgent_Installer.zip";
    }

    private async Task ExecuteSoftwareUpdateAsync(StoreAgentCommandDto cmd, CancellationToken stoppingToken)
    {
        string targetVersion = "2.4.1-neo";
        string packageUrl = ResolveInstallerUrl();

        if (cmd.Parameters.ValueKind == JsonValueKind.Object)
        {
            if (cmd.Parameters.TryGetProperty("package_url", out var p) && !string.IsNullOrWhiteSpace(p.GetString()))
                packageUrl = p.GetString()!;
            if (cmd.Parameters.TryGetProperty("target_version", out var v) && !string.IsNullOrWhiteSpace(v.GetString()))
                targetVersion = v.GetString()!;
        }

        _logger.LogInformation("[CONTROL REMOTO] Iniciando actualización remota OTA hacia v{TargetVersion} desde {Url}...", targetVersion, packageUrl);
        await SendCommandAckAsync(cmd.Id, "RUNNING", new { message = $"Descargando paquete oficial de actualización (v{targetVersion})..." }, null, stoppingToken);

        string tempDir = Path.GetTempPath();
        string tempZip = Path.Combine(tempDir, "MorpheusSyncAgent_Update.zip");
        string scriptPath = Path.Combine(tempDir, "apply_neo_update.ps1");
        string baseDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');

        try
        {
            // 1. Descargar paquete ZIP
            using (var http = _httpClientFactory.CreateClient())
            {
                http.Timeout = TimeSpan.FromMinutes(5);
                using var resp = await http.GetAsync(packageUrl, HttpCompletionOption.ResponseHeadersRead, stoppingToken);
                resp.EnsureSuccessStatusCode();

                using var fs = new FileStream(tempZip, FileMode.Create, FileAccess.Write, FileShare.None);
                await resp.Content.CopyToAsync(fs, stoppingToken);
            }

            // 2. Validar integridad del archivo ZIP
            using (var archive = ZipFile.OpenRead(tempZip))
            {
                if (archive.Entries.Count == 0)
                    throw new InvalidOperationException("El paquete ZIP descargado no contiene archivos válidos.");
            }

            await SendCommandAckAsync(cmd.Id, "RUNNING", new { message = "Paquete descargado y validado. Despachando proceso de reemplazo y reinicio..." }, null, stoppingToken);

            // 3. Escribir script de actualización independiente en PowerShell
            string psContent = @"param(
    [string]$destDir,
    [string]$tempZip,
    [long]$commandId,
    [string]$ackUrl
)
$ErrorActionPreference = 'Continue'
Start-Sleep -Seconds 3

# 1. Detener servicio y procesos de la tienda
Stop-Service -Name 'NeoAgentSync' -Force -ErrorAction SilentlyContinue
Get-Process -Name 'MorpheusConfigurador' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$timeout = 15
while ((Get-Process -Name 'MorpheusSyncAgent' -ErrorAction SilentlyContinue) -and $timeout -gt 0) {
    Start-Sleep -Seconds 1
    $timeout--
}
Get-Process -Name 'MorpheusSyncAgent' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# 2. Respaldar configuración y estado crítico local
$backupDir = ""$env:TEMP\neo_update_backup""
if (Test-Path $backupDir) { Remove-Item $backupDir -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

if (Test-Path ""$destDir\appsettings.json"") { Copy-Item ""$destDir\appsettings.json"" ""$backupDir\appsettings.json"" -Force }
if (Test-Path ""$destDir\sync_state.json"") { Copy-Item ""$destDir\sync_state.json"" ""$backupDir\sync_state.json"" -Force }
if (Test-Path ""$destDir\morpheus_local.db"") { Copy-Item ""$destDir\morpheus_local.db"" ""$backupDir\morpheus_local.db"" -Force }

# 3. Extraer actualización en directorio temporal
$extractDir = ""$env:TEMP\neo_update_extract""
if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Path $extractDir -Force | Out-Null

Expand-Archive -Path $tempZip -DestinationPath $extractDir -Force

# 4. Copiar archivos sobre el directorio destino (preservando appsettings.json si ya existía)
Get-ChildItem -Path $extractDir -Recurse | ForEach-Object {
    if ($_.Name -ne 'appsettings.json') {
        $rel = $_.FullName.Substring($extractDir.Length).TrimStart('\', '/')
        $target = Join-Path $destDir $rel
        if ($_.PSIsContainer) {
            if (!(Test-Path $target)) { New-Item -ItemType Directory -Path $target -Force | Out-Null }
        } else {
            Copy-Item $_.FullName -Destination $target -Force
        }
    }
}

# 5. Restaurar respaldo de configuración y estado para garantizar 100% integridad
if (Test-Path ""$backupDir\appsettings.json"") { Copy-Item ""$backupDir\appsettings.json"" ""$destDir\appsettings.json"" -Force }
if (Test-Path ""$backupDir\sync_state.json"") { Copy-Item ""$backupDir\sync_state.json"" ""$destDir\sync_state.json"" -Force }
if (Test-Path ""$backupDir\morpheus_local.db"") { Copy-Item ""$backupDir\morpheus_local.db"" ""$destDir\morpheus_local.db"" -Force }

# 6. Iniciar nuevamente el servicio Windows
Start-Service -Name 'NeoAgentSync' -ErrorAction SilentlyContinue

# 7. Notificar éxito a Neo ERP
try {
    $body = @{
        status = 'COMPLETED'
        result_details = @{ message = 'Actualización remota aplicada exitosamente. Servicio reiniciado con nuevos binarios.' }
    } | ConvertTo-Json
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-RestMethod -Uri $ackUrl -Method POST -Body $body -ContentType 'application/json' -TimeoutSec 15
} catch {}

# 8. Limpiar temporales
Remove-Item $tempZip -Force -ErrorAction SilentlyContinue
Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $backupDir -Recurse -Force -ErrorAction SilentlyContinue
";
            await File.WriteAllTextAsync(scriptPath, psContent, Encoding.UTF8, stoppingToken);

            string baseApi = ResolveBaseApiUrl();
            string ackUrl = $"{baseApi}/store-agent/commands/{cmd.Id}/ack";

            // 4. Lanzar proceso desacoplado de PowerShell
            if (OperatingSystem.IsWindows())
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = $"-NoProfile -ExecutionPolicy Bypass -File \"{scriptPath}\" -destDir \"{baseDir}\" -tempZip \"{tempZip}\" -commandId {cmd.Id} -ackUrl \"{ackUrl}\"",
                    UseShellExecute = true,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                Process.Start(psi);
            }
            else
            {
                _logger.LogWarning("[CONTROL REMOTO] Entorno no-Windows: Simulando invocación de updater.");
            }

            // 5. Salir del servicio limpiamente después de un breve delay para liberar archivos .exe
            _ = Task.Run(async () =>
            {
                await Task.Delay(1500);
                Environment.Exit(0);
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[CONTROL REMOTO] Fallo durante la preparación de la actualización remota.");
            await SendCommandAckAsync(cmd.Id, "FAILED", null, $"Fallo de actualización: {ex.Message}", stoppingToken);
        }
    }
}
