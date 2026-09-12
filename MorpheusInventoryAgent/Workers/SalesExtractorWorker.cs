using System.Text;
using System.Text.Json;
using Dapper;
using Microsoft.Data.SqlClient;
using MorpheusSyncAgent.Models;
using MorpheusSyncAgent.Utils;

namespace MorpheusSyncAgent.Workers;

public class SalesExtractorWorker : BackgroundService
{
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<SalesExtractorWorker> _logger;

    public SalesExtractorWorker(IConfiguration configuration, IHttpClientFactory httpClientFactory, ILogger<SalesExtractorWorker> logger)
    {
        _configuration = configuration;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Iniciando servicio continuo de sincronización de ventas (POS)...");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var syncState = SyncStateManager.LoadState();
                var config = _configuration.GetSection("DirectExtractors:Sales").Get<DirectExtractorConfig>() ?? new DirectExtractorConfig
                {
                    Enabled = true,
                    IntervalMinutes = 5,
                    BatchSize = 500
                };

                if (config.Enabled && syncState.BaselineInventoryDone)
                {
                    await ProcessContinuousSyncAsync(config, syncState, stoppingToken);

                    // Re-leer para verificar desfase
                    syncState = SyncStateManager.LoadState();
                    if (DateTime.Now - syncState.LastSalesSync > TimeSpan.FromHours(1))
                    {
                        await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
                    }
                    else
                    {
                        await Task.Delay(TimeSpan.FromMinutes(config.IntervalMinutes), stoppingToken);
                    }
                }
                else
                {
                    await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error en bucle continuo de SalesExtractorWorker");
                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            }
        }
    }

    public async Task RunHistoricalAsync(DateTime fromDate, DateTime toDate, int batchSize = 500, CancellationToken stoppingToken = default)
    {
        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine("==================================================================");
        Console.WriteLine("  NEO AGENT SYNC - MIGRACION DE VENTAS HISTORICAS (HERRAMIENTA TI)");
        Console.WriteLine("==================================================================");
        Console.ResetColor();
        Console.WriteLine($"  Desde:      {fromDate:yyyy-MM-dd HH:mm:ss}");
        Console.WriteLine($"  Hasta:      {toDate:yyyy-MM-dd HH:mm:ss}");
        Console.WriteLine($"  Lote HTTP:  {batchSize} tickets completos por llamada");
        Console.WriteLine("------------------------------------------------------------------");

        var historyState = SyncStateManager.LoadHistoryState();
        DateTime currentCheckpoint = fromDate;

        if (historyState.StartDate == fromDate && historyState.TargetDate == toDate && historyState.CurrentCheckpoint > fromDate)
        {
            currentCheckpoint = historyState.CurrentCheckpoint;
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine($"  [REANUDACION] Continuando desde checkpoint previo: {currentCheckpoint:yyyy-MM-dd HH:mm:ss}");
            Console.ResetColor();
        }
        else
        {
            historyState.StartDate = fromDate;
            historyState.TargetDate = toDate;
            historyState.CurrentCheckpoint = fromDate;
            historyState.TotalDocumentsSynced = 0;
            historyState.IsCompleted = false;
            SyncStateManager.SaveHistoryState(historyState);
        }

        int totalSynced = historyState.TotalDocumentsSynced;

        while (currentCheckpoint < toDate && !stoppingToken.IsCancellationRequested)
        {
            DateTime windowEnd = currentCheckpoint.AddDays(1);
            if (windowEnd > toDate) windowEnd = toDate;

            Console.WriteLine($"\n[>] Extrayendo ventas: {currentCheckpoint:yyyy-MM-dd HH:mm} -> {windowEnd:yyyy-MM-dd HH:mm}...");

            var documents = await FetchSalesDocumentsAsync(currentCheckpoint, windowEnd);

            if (documents.Count == 0)
            {
                Console.ForegroundColor = ConsoleColor.DarkGray;
                Console.WriteLine($"    [--] Sin ventas en este intervalo.");
                Console.ResetColor();
            }
            else
            {
                Console.WriteLine($"    [*] Extraídas {documents.Count:N0} facturas completas. Transmitiendo en lotes de {batchSize}...");

                // Paginación por batchSize
                for (int i = 0; i < documents.Count; i += batchSize)
                {
                    var chunk = documents.Skip(i).Take(batchSize).ToList();
                    bool success = await SendSalesBatchAsync(chunk, isHistorical: false, stoppingToken);

                    if (!success)
                    {
                        Console.ForegroundColor = ConsoleColor.Red;
                        Console.WriteLine($"    [ERROR] Fallo enviando lote ({i + 1} al {i + chunk.Count}). Reintentando en 5s...");
                        Console.ResetColor();
                        await Task.Delay(5000, stoppingToken);
                        i -= batchSize; // reintentar este lote
                        continue;
                    }

                    totalSynced += chunk.Count;
                    Console.ForegroundColor = ConsoleColor.Green;
                    Console.WriteLine($"    [OK] Lote ({i + 1} - {i + chunk.Count} de {documents.Count}) enviado. Acumulado: {totalSynced:N0} facturas.");
                    Console.ResetColor();
                }
            }

            currentCheckpoint = windowEnd;
            historyState.CurrentCheckpoint = currentCheckpoint;
            historyState.TotalDocumentsSynced = totalSynced;
            SyncStateManager.SaveHistoryState(historyState);
        }

        historyState.IsCompleted = true;
        SyncStateManager.SaveHistoryState(historyState);

        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine("\n==================================================================");
        Console.WriteLine($"  RESUMEN HISTORICO: {totalSynced:N0} facturas migradas exitosamente.");
        Console.WriteLine("==================================================================\n");
    }

    public async Task<int> TriggerImmediateSyncAsync(CancellationToken stoppingToken = default)
    {
        _logger.LogInformation("[CONTROL REMOTO] Ejecutando sincronización de ventas inmediata bajo demanda...");
        var syncState = SyncStateManager.LoadState();
        var config = _configuration.GetSection("DirectExtractors:Sales").Get<DirectExtractorConfig>() ?? new DirectExtractorConfig
        {
            Enabled = true,
            IntervalMinutes = 5,
            BatchSize = 500
        };

        EnsureWatermarkInitialized(syncState);

        DateTime fromDate = syncState.LastSalesSync > new DateTime(2000, 1, 1)
            ? syncState.LastSalesSync.AddMinutes(-5)
            : syncState.LastSalesSync;

        DateTime toDate = DateTime.Now;

        var documents = await FetchSalesDocumentsAsync(fromDate, toDate);
        if (documents.Count == 0)
        {
            syncState.LastSalesSync = toDate;
            SyncStateManager.SaveState(syncState);
            _logger.LogInformation("[CONTROL REMOTO] Sincronización inmediata: no hay ventas pendientes en este rango.");
            return 0;
        }

        int batchSize = config.BatchSize > 0 ? config.BatchSize : 500;
        int sentCount = 0;

        for (int i = 0; i < documents.Count; i += batchSize)
        {
            var chunk = documents.Skip(i).Take(batchSize).ToList();
            bool success = await SendSalesBatchAsync(chunk, isHistorical: false, stoppingToken);
            if (!success)
            {
                throw new Exception("Fallo en transmisión de lote de ventas hacia el servidor central.");
            }
            sentCount += chunk.Count;
        }

        syncState.LastSalesSync = toDate;
        SyncStateManager.SaveState(syncState);
        _logger.LogInformation("[CONTROL REMOTO] Sincronización inmediata completada: {Count} facturas enviadas.", sentCount);
        return sentCount;
    }

    private async Task ProcessContinuousSyncAsync(DirectExtractorConfig config, SyncState syncState, CancellationToken stoppingToken)
    {
        EnsureWatermarkInitialized(syncState);
        
        // Lookback buffer de 5 minutos para cubrir transacciones en vuelo
        DateTime fromDate = syncState.LastSalesSync > new DateTime(2000, 1, 1)
            ? syncState.LastSalesSync.AddMinutes(-5)
            : syncState.LastSalesSync;

        DateTime toDate = DateTime.Now;

        var documents = await FetchSalesDocumentsAsync(fromDate, toDate);
        if (documents.Count == 0)
        {
            syncState.LastSalesSync = toDate;
            SyncStateManager.SaveState(syncState);
            return;
        }

        int batchSize = config.BatchSize > 0 ? config.BatchSize : 500;
        _logger.LogInformation("Ventas continuas detectadas: {Count} facturas para enviar.", documents.Count);

        for (int i = 0; i < documents.Count; i += batchSize)
        {
            var chunk = documents.Skip(i).Take(batchSize).ToList();
            bool success = await SendSalesBatchAsync(chunk, isHistorical: false, stoppingToken);
            if (!success)
            {
                _logger.LogWarning("Error enviando lote continuo de ventas. Se reintentará en el próximo ciclo.");
                return;
            }
        }

        syncState.LastSalesSync = toDate;
        SyncStateManager.SaveState(syncState);
        _logger.LogInformation("Sincronización continua de ventas al día ({ToDate:yyyy-MM-dd HH:mm:ss}).", toDate);
    }

    private async Task<List<SalesBatchDocumentDto>> FetchSalesDocumentsAsync(DateTime fromDate, DateTime toDate)
    {
        string connectionString = _configuration.GetConnectionString("LocalSqlServer") ?? string.Empty;
        int facilityId = _configuration.GetValue<int>("StoreFacilityId", 1);
        string facilityCode = _configuration.GetValue<string>("StoreFacilityCode", "");

        string query = @"
            SELECT 
                @FacilityId AS facility_id,
                @FacilityCode AS facility_code,
                f.c_Caja AS register_code,
                f.c_Numero AS document_number,
                f.c_Concepto AS doc_type,
                (f.f_Fecha + CONVERT(TIME, f.f_Hora)) AS doc_date,
                ISNULL(f.c_Rif, 'J-000000000') AS customer_tax_id,
                ISNULL(f.c_Nombre, 'Cliente Contado') AS customer_name,
                f.Subtotal AS subtotal,
                f.Impuesto AS tax_amount,
                f.Total AS total_amount,
                df.cu_DocumentoFiscal AS fiscal_number,
                df.cu_SerialImpresora AS fiscal_serial,
                t.Cod_Principal AS sku_code,
                t.Cantidad AS quantity,
                t.Precio AS unit_price,
                t.Subtotal AS line_subtotal,
                t.Impuesto AS line_tax,
                t.Total AS line_total,
                t.c_deposito AS deposit_code
            FROM VAD20.dbo.MA_PAGOS f WITH (NOLOCK)
            INNER JOIN VAD20.dbo.MA_TRANSACCION t WITH (NOLOCK)
                ON f.c_Caja = t.c_Caja 
               AND f.c_Sucursal = t.c_Localidad 
               AND f.c_Numero = t.c_Numero
            LEFT JOIN VAD20.dbo.MA_DOCUMENTOS_FISCAL df WITH (NOLOCK)
                ON df.cu_Localidad = f.c_Sucursal 
               AND df.cu_DocumentoTipo = f.c_Concepto 
               AND df.cu_DocumentoStellar = f.c_Numero
            WHERE (f.f_Fecha + CONVERT(TIME, f.f_Hora)) > @FromDate 
              AND (f.f_Fecha + CONVERT(TIME, f.f_Hora)) <= @ToDate
            ORDER BY (f.f_Fecha + CONVERT(TIME, f.f_Hora)) ASC, f.c_Numero;
        ";

        using var connection = new SqlConnection(connectionString);
        var rows = (await connection.QueryAsync(query, new { FacilityId = facilityId, FacilityCode = facilityCode, FromDate = fromDate, ToDate = toDate }, commandTimeout: 300)).ToList();

        var documentsMap = new Dictionary<string, SalesBatchDocumentDto>();

        foreach (var r in rows)
        {
            string reg = (r.register_code ?? "01").ToString().Trim();
            string num = r.document_number.ToString().Trim();
            string docKey = $"{reg}_{num}";

            if (!documentsMap.TryGetValue(docKey, out var doc))
            {
                doc = new SalesBatchDocumentDto
                {
                    FacilityId = facilityId,
                    FacilityCode = facilityCode,
                    RegisterCode = reg,
                    DocumentNumber = num,
                    DocType = (r.doc_type ?? "FAC").ToString().Trim(),
                    DocDate = ((DateTime)r.doc_date).ToString("yyyy-MM-dd HH:mm:ss"),
                    CustomerTaxId = (r.customer_tax_id ?? "J-000000000").ToString().Trim(),
                    CustomerName = (r.customer_name ?? "Cliente Contado").ToString().Trim(),
                    Subtotal = Convert.ToDecimal(r.subtotal),
                    TaxAmount = Convert.ToDecimal(r.tax_amount),
                    TotalAmount = Convert.ToDecimal(r.total_amount),
                    FiscalNumber = r.fiscal_number?.ToString(),
                    FiscalSerial = r.fiscal_serial?.ToString(),
                    Lines = new List<SalesBatchLineDto>()
                };
                documentsMap[docKey] = doc;
            }

            doc.Lines.Add(new SalesBatchLineDto
            {
                SkuCode = r.sku_code.ToString().Trim(),
                Quantity = Convert.ToDecimal(r.quantity),
                UnitPrice = Convert.ToDecimal(r.unit_price),
                Subtotal = Convert.ToDecimal(r.line_subtotal),
                TaxAmount = Convert.ToDecimal(r.line_tax),
                Total = Convert.ToDecimal(r.line_total),
                DepositCode = (r.deposit_code ?? "01").ToString().Trim()
            });
        }

        return documentsMap.Values.ToList();
    }

    private async Task<bool> SendSalesBatchAsync(List<SalesBatchDocumentDto> documents, bool isHistorical, CancellationToken stoppingToken)
    {
        var targetUrl = ResolveTargetUrl();

        var payload = new SalesBatchPayloadDto
        {
            IsHistorical = isHistorical,
            Documents = documents
        };

        var json = JsonSerializer.Serialize(payload);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromMinutes(10);

        try
        {
            var response = await client.PostAsync(targetUrl, content, stoppingToken);
            if (response.IsSuccessStatusCode)
            {
                return true;
            }
            else
            {
                var errorBody = await response.Content.ReadAsStringAsync(stoppingToken);
                _logger.LogWarning("Fallo en POST a {Url}. Status: {StatusCode}, Error: {Body}", targetUrl, response.StatusCode, errorBody);
                return false;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Excepción enviando lote de ventas a {Url}", targetUrl);
            return false;
        }
    }

    private string ResolveTargetUrl()
    {
        var configuredUrl = _configuration.GetValue<string>("DirectExtractors:Sales:TargetApiUrl");
        if (string.IsNullOrWhiteSpace(configuredUrl))
        {
            var baseApi = _configuration.GetValue<string>("DefaultTargetApiUrl", "http://localhost:8000/api/v1");
            return $"{baseApi.TrimEnd('/')}/import/sales-batch";
        }

        // Si la URL apunta al endpoint viejo /sales-legacy, la enrutamos automáticamente al nuevo /sales-batch
        if (configuredUrl.EndsWith("/sales-legacy", StringComparison.OrdinalIgnoreCase))
        {
            return configuredUrl.Substring(0, configuredUrl.Length - "/sales-legacy".Length) + "/sales-batch";
        }

        return configuredUrl;
    }

    private void EnsureWatermarkInitialized(SyncState syncState)
    {
        if (syncState.LastSalesSync.Year == 2000)
        {
            var cutoffStr = _configuration.GetValue<string>("DirectExtractors:InventoryBaseline:BaselineCutoffDate", "2026-06-07");
            if (DateTime.TryParse(cutoffStr, out DateTime parsed))
            {
                syncState.LastSalesSync = parsed.Date.AddDays(1).AddSeconds(-1);
            }
            else
            {
                syncState.LastSalesSync = DateTime.Now;
            }
            SyncStateManager.SaveState(syncState);
        }
    }
}
