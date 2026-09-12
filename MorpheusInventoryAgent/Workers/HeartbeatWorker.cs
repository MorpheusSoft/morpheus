using System.Diagnostics;
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

            string query = @"
                SELECT 
                    MAX(f_Fecha + CONVERT(TIME, f_Hora)) AS last_sale,
                    COUNT(CASE WHEN f_Fecha = CAST(GETDATE() AS DATE) THEN 1 END) AS count_today,
                    ISNULL(SUM(CASE WHEN f_Fecha = CAST(GETDATE() AS DATE) THEN Total ELSE 0 END), 0) AS amount_today
                FROM VAD20.dbo.MA_PAGOS WITH (NOLOCK);
            ";

            var result = await connection.QueryFirstOrDefaultAsync(query);
            if (result != null)
            {
                if (result.last_sale != null) lastStellarSale = (DateTime)result.last_sale;
                salesTodayCount = Convert.ToInt32(result.count_today ?? 0);
                salesTodayAmount = Convert.ToDecimal(result.amount_today ?? 0);
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
            AgentVersion = "2.1.0-neo",
            MachineName = Environment.MachineName,
            SqlServerStatus = sqlStatus,
            LastStellarSaleTime = lastStellarSale,
            LastSyncedSaleTime = lastSynced,
            SalesTodayCount = salesTodayCount,
            SalesTodayAmount = salesTodayAmount,
            PendingQueueCount = 0,
            LagMinutes = lagMinutes,
            Status = overallStatus,
            ErrorDetails = errorDetails
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
                    await SendCommandAckAsync(cmd.Id, "COMPLETED", new { message = "Catálogos maestros sincronizados exitosamente (Categorías, Proveedores, Productos, Códigos de barra)." }, null, stoppingToken);
                    break;

                case "SYNC_HISTORICAL":
                    var histSalesWorker = _serviceProvider.GetRequiredService<SalesExtractorWorker>();
                    DateTime from = DateTime.Today.AddMonths(-3);
                    DateTime to = DateTime.Now;
                    int batchSize = 500;

                    if (cmd.Parameters.ValueKind == JsonValueKind.Object)
                    {
                        if (cmd.Parameters.TryGetProperty("from", out var f) && DateTime.TryParse(f.GetString(), out var pf)) from = pf;
                        if (cmd.Parameters.TryGetProperty("to", out var t) && DateTime.TryParse(t.GetString(), out var pt)) to = pt;
                        if (cmd.Parameters.TryGetProperty("batch_size", out var b)) batchSize = b.GetInt32();
                    }

                    await histSalesWorker.RunHistoricalAsync(from, to, batchSize, stoppingToken);
                    await SendCommandAckAsync(cmd.Id, "COMPLETED", new { message = $"Carga histórica completada ({from:yyyy-MM-dd} a {to:yyyy-MM-dd})." }, null, stoppingToken);
                    break;

                case "CONFIG_UPDATE":
                    await SendCommandAckAsync(cmd.Id, "COMPLETED", new { message = "Configuración remota aplicada en memoria local." }, null, stoppingToken);
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

                default:
                    await SendCommandAckAsync(cmd.Id, "FAILED", null, $"Comando desconocido: '{cmdType}'", stoppingToken);
                    break;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[CONTROL REMOTO] Error ejecutando comando #{Id}", cmd.Id);
            await SendCommandAckAsync(cmd.Id, "FAILED", null, ex.Message, stoppingToken);
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
}
