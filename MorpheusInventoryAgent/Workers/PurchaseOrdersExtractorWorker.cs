using System.Text;
using System.Text.Json;
using Dapper;
using Microsoft.Data.SqlClient;
using MorpheusSyncAgent.Models;
using MorpheusSyncAgent.Utils;

namespace MorpheusSyncAgent.Workers;

public class PurchaseOrdersExtractorWorker : BackgroundService
{
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<PurchaseOrdersExtractorWorker> _logger;

    public PurchaseOrdersExtractorWorker(
        IConfiguration configuration,
        IHttpClientFactory httpClientFactory,
        ILogger<PurchaseOrdersExtractorWorker> logger)
    {
        _configuration = configuration;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (SyncStateManager.IsSyncPaused())
                {
                    _logger.LogDebug("[PAUSA] Sincronización de ODC pausada por administración.");
                    await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
                    continue;
                }

                if (!SyncStateManager.IsPurchaseOrdersEnabled())
                {
                    _logger.LogDebug("[CONFIG] Extracción de ODC deshabilitada por interruptor central.");
                    await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken);
                    continue;
                }

                var config = ResolveConfig();

                if (config.Enabled)
                {
                    await ProcessExtractionAsync(config, allowExpired: false, stoppingToken: stoppingToken);
                    await Task.Delay(TimeSpan.FromMinutes(config.IntervalMinutes > 0 ? config.IntervalMinutes : 15), stoppingToken);
                }
                else
                {
                    // Si el extractor está deshabilitado temporalmente o por fin de transición
                    await Task.Delay(TimeSpan.FromMinutes(10), stoppingToken);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error en PurchaseOrdersExtractorWorker");
                await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken);
            }
        }
    }

    private DirectExtractorConfig ResolveConfig()
    {
        var config = _configuration.GetSection("DirectExtractors:PurchaseOrders").Get<DirectExtractorConfig>();
        if (config != null && !string.IsNullOrWhiteSpace(config.TargetApiUrl))
        {
            return config;
        }

        string baseApi = "https://api.grupocatania.com/api/v1";
        var referenceUrl = _configuration.GetValue<string>("DirectExtractors:Sales:TargetApiUrl")
                        ?? _configuration.GetValue<string>("DirectExtractors:Products:TargetApiUrl")
                        ?? _configuration.GetValue<string>("DefaultTargetApiUrl");

        if (!string.IsNullOrWhiteSpace(referenceUrl) && Uri.TryCreate(referenceUrl, UriKind.Absolute, out var uri))
        {
            baseApi = $"{uri.Scheme}://{uri.Authority}/api/v1";
        }

        return new DirectExtractorConfig
        {
            Enabled = config?.Enabled ?? true,
            IntervalMinutes = (config != null && config.IntervalMinutes > 0) ? config.IntervalMinutes : 15,
            TargetApiUrl = $"{baseApi.TrimEnd('/')}/import/purchase-orders-legacy"
        };
    }

    public async Task RunOnceAsync(bool allowExpired = false, CancellationToken stoppingToken = default)
    {
        var config = ResolveConfig();

        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine("=========================================================");
        Console.WriteLine("  NEO SYNC AGENT - ORDENES DE COMPRA PENDIENTES (ODC)");
        Console.WriteLine("=========================================================");
        Console.ResetColor();

        await ProcessExtractionAsync(config, allowExpired, stoppingToken);
        Console.WriteLine("=========================================================\n");
    }

    private async Task ProcessExtractionAsync(DirectExtractorConfig config, bool allowExpired = false, CancellationToken stoppingToken = default)
    {
        string connectionString = _configuration.GetConnectionString("LocalSqlServer") ?? string.Empty;
        int facilityId = _configuration.GetValue<int>("StoreFacilityId", 1);

        Console.WriteLine($"  Consultando ODC pendientes en SQL Server (Sucursal #{facilityId}, Vigencia: {(allowExpired ? "Todas (Incluye Vencidas)" : ">= Hoy Solo Vigentes")})...");

        string dateCondition = allowExpired
            ? "1=1"
            : "m.DU_FECHAVENCIMIENTO >= CAST(GETDATE() AS DATE)";

        string query = $@"
            SELECT 
                m.c_DOCUMENTO,
                m.d_FECHA,
                m.d_fecha_recepcion,
                m.DU_FECHAVENCIMIENTO,
                m.c_DESCRIPCION,
                m.c_status,
                m.c_CODPROVEEDOR,
                m.c_CODLOCALIDAD,
                m.C_CODMONEDA,
                m.n_FACTORCAMBIO,
                m.N_SUBTOTAL,
                m.N_IMPUESTO,
                m.N_TOTAL,
                m.c_OBSERVACION,
                t.c_LINEA,
                t.c_CODARTICULO,
                t.c_descripcion AS c_linea_descripcion,
                t.n_CANTIDAD,
                ISNULL(t.n_CANT_RECIBIDA, 0) AS n_CANT_RECIBIDA,
                t.n_COSTO,
                t.n_subtotal AS n_linea_subtotal,
                t.n_impuesto AS n_linea_impuesto,
                t.n_total AS n_linea_total,
                t.n_porcentajeimp,
                t.ns_cantidadempaque
            FROM MA_ODC m WITH (NOLOCK)
            JOIN TR_ODC t WITH (NOLOCK) ON m.c_DOCUMENTO = t.c_DOCUMENTO
            WHERE m.c_status = 'DPE'
              AND {dateCondition}
              AND (t.n_CANTIDAD - ISNULL(t.n_CANT_RECIBIDA, 0)) > 0
            ORDER BY m.d_FECHA DESC, m.c_DOCUMENTO, t.c_LINEA";

        using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync(stoppingToken);

        var rawRows = (await connection.QueryAsync(query)).ToList();

        if (!rawRows.Any())
        {
            Console.ForegroundColor = ConsoleColor.DarkGray;
            Console.WriteLine("  [--] No se encontraron órdenes de compra pendientes por recepción.");
            Console.ResetColor();
            var emptyState = SyncStateManager.LoadState();
            emptyState.LastPurchaseOrderSync = DateTime.Now;
            SyncStateManager.SaveState(emptyState);
            return;
        }

        // Agrupar filas planas en estructura cabecera -> líneas
        var ordersDict = new Dictionary<string, dynamic>();

        foreach (var row in rawRows)
        {
            string docNum = ((string)row.c_DOCUMENTO).Trim();
            if (!ordersDict.TryGetValue(docNum, out var orderDto))
            {
                orderDto = new
                {
                    c_DOCUMENTO = docNum,
                    d_FECHA = row.d_FECHA != null ? ((DateTime)row.d_FECHA).ToString("yyyy-MM-ddTHH:mm:ss") : null,
                    d_fecha_recepcion = row.d_fecha_recepcion != null ? ((DateTime)row.d_fecha_recepcion).ToString("yyyy-MM-ddTHH:mm:ss") : null,
                    DU_FECHAVENCIMIENTO = row.DU_FECHAVENCIMIENTO != null ? ((DateTime)row.DU_FECHAVENCIMIENTO).ToString("yyyy-MM-ddTHH:mm:ss") : null,
                    c_DESCRIPCION = (string)row.c_DESCRIPCION,
                    c_status = ((string)row.c_status)?.Trim(),
                    c_CODPROVEEDOR = ((string)row.c_CODPROVEEDOR)?.Trim(),
                    c_CODLOCALIDAD = ((string)row.c_CODLOCALIDAD)?.Trim(),
                    C_CODMONEDA = ((string)row.C_CODMONEDA)?.Trim(),
                    n_FACTORCAMBIO = (double)(row.n_FACTORCAMBIO ?? 1.0),
                    N_SUBTOTAL = (double)(row.N_SUBTOTAL ?? 0.0),
                    N_IMPUESTO = (double)(row.N_IMPUESTO ?? 0.0),
                    N_TOTAL = (double)(row.N_TOTAL ?? 0.0),
                    c_OBSERVACION = (string)row.c_OBSERVACION,
                    lines = new List<object>()
                };
                ordersDict[docNum] = orderDto;
            }

            var lineDto = new
            {
                c_LINEA = (int)(row.c_LINEA ?? 0),
                c_CODARTICULO = ((string)row.c_CODARTICULO)?.Trim(),
                c_descripcion = (string)row.c_linea_descripcion,
                n_CANTIDAD = (double)(row.n_CANTIDAD ?? 0.0),
                n_CANT_RECIBIDA = (double)(row.n_CANT_RECIBIDA ?? 0.0),
                n_COSTO = (double)(row.n_COSTO ?? 0.0),
                n_subtotal = (double)(row.n_linea_subtotal ?? 0.0),
                n_impuesto = (double)(row.n_linea_impuesto ?? 0.0),
                n_total = (double)(row.n_linea_total ?? 0.0),
                n_porcentajeimp = (double)(row.n_porcentajeimp ?? 16.0),
                ns_cantidadempaque = (double)(row.ns_cantidadempaque ?? 1.0)
            };

            ((List<object>)orderDto.lines).Add(lineDto);
        }

        var orderList = ordersDict.Values.ToList();
        Console.WriteLine($"  -> Transmitiendo {orderList.Count:N0} ODC activas ({rawRows.Count:N0} renglones pendientes) a Neo ERP...");

        var payload = new
        {
            facility_id = facilityId,
            orders = orderList
        };

        var json = JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = false });
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromMinutes(5);

        string targetUrl = config.TargetApiUrl;
        if (string.IsNullOrEmpty(targetUrl))
        {
            targetUrl = ResolveConfig().TargetApiUrl;
        }

        var queryParams = new List<string> { $"facility_id={facilityId}" };
        if (allowExpired) queryParams.Add("allow_expired=true");
        targetUrl += (targetUrl.Contains("?") ? "&" : "?") + string.Join("&", queryParams);

        var response = await client.PostAsync(targetUrl, content, stoppingToken);

        if (response.IsSuccessStatusCode)
        {
            var respStr = await response.Content.ReadAsStringAsync(stoppingToken);
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine($"  [OK] ODC procesadas exitosamente: {respStr}");
            Console.ResetColor();
            _logger.LogInformation("Successfully posted {Count} purchase orders.", orderList.Count);

            var syncState = SyncStateManager.LoadState();
            syncState.LastPurchaseOrderSync = DateTime.Now;
            SyncStateManager.SaveState(syncState);
        }
        else
        {
            var errorBody = await response.Content.ReadAsStringAsync(stoppingToken);
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine($"  [ERROR] Fallo al enviar ODC. HTTP {(int)response.StatusCode}: {errorBody}");
            Console.ResetColor();
            _logger.LogWarning("Failed to post purchase orders. Status code: {StatusCode}, Error: {Error}", response.StatusCode, errorBody);
            throw new HttpRequestException($"Fallo al enviar ODC a {targetUrl}. HTTP {(int)response.StatusCode}: {errorBody}");
        }
    }
}
