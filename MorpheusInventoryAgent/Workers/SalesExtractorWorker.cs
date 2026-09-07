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
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var syncState = SyncStateManager.LoadState();
                var config = _configuration.GetSection("DirectExtractors:Sales").Get<DirectExtractorConfig>();
                
                // Ensure baseline is done before syncing sales since they deduct inventory
                if (config != null && config.Enabled && syncState.BaselineInventoryDone)
                {
                    await ProcessExtractionAsync(config, syncState, stoppingToken);
                    
                    // Reload state to get updated LastSalesSync
                    syncState = SyncStateManager.LoadState();
                    if (DateTime.Now - syncState.LastSalesSync > TimeSpan.FromHours(1))
                    {
                        // Catching up: only wait 5 seconds before next chunk
                        await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
                    }
                    else
                    {
                        await Task.Delay(TimeSpan.FromMinutes(config.IntervalMinutes), stoppingToken);
                    }
                }
                else
                {
                    await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in SalesExtractorWorker");
                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            }
        }
    }

    public async Task RunOnceAsync(CancellationToken stoppingToken = default)
    {
        var config = _configuration.GetSection("DirectExtractors:Sales").Get<DirectExtractorConfig>();
        if (config == null)
        {
            config = new DirectExtractorConfig
            {
                Enabled = true,
                TargetApiUrl = _configuration.GetValue<string>("DefaultTargetApiUrl", "http://localhost/api") + "/import/sales-legacy"
            };
        }

        var syncState = SyncStateManager.LoadState();
        EnsureWatermarkInitialized(syncState);

        var start = syncState.LastSalesSync;
        var now = DateTime.Now;

        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine("=========================================================");
        Console.WriteLine("  MORPHEUS SYNC AGENT - SINCRONIZACION DE VENTAS (POS)");
        Console.WriteLine("=========================================================");
        Console.ResetColor();
        Console.WriteLine($"  Desde: {start:yyyy-MM-dd HH:mm:ss}");
        Console.WriteLine($"  Hasta: {now:yyyy-MM-dd HH:mm:ss}");
        Console.WriteLine("---------------------------------------------------------");

        if (start >= now.AddMinutes(-2))
        {
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("  [OK] Las ventas ya se encuentran sincronizadas al momento actual.");
            Console.ResetColor();
            Console.WriteLine("=========================================================\n");
            return;
        }

        int totalSales = 0;
        int totalBatches = 0;

        while (!stoppingToken.IsCancellationRequested)
        {
            syncState = SyncStateManager.LoadState();
            var currentSync = syncState.LastSalesSync;
            if (currentSync >= now.AddMinutes(-2))
            {
                break;
            }

            TimeSpan remaining = now - currentSync;
            TimeSpan step = remaining > TimeSpan.FromDays(1) 
                ? TimeSpan.FromDays(1) 
                : (remaining > TimeSpan.FromHours(4) ? TimeSpan.FromHours(4) : remaining);

            var upperBound = currentSync.Add(step);
            if (upperBound > now) upperBound = now;

            var (success, count) = await ProcessSalesBatchAsync(config, currentSync, upperBound, stoppingToken);
            if (!success)
            {
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine($"  [ALERTA] Error enviando lote ({currentSync:yyyy-MM-dd HH:mm} -> {upperBound:yyyy-MM-dd HH:mm}). Reintentando en 3s...");
                Console.ResetColor();
                await Task.Delay(3000, stoppingToken);
                continue;
            }

            syncState.LastSalesSync = upperBound;
            SyncStateManager.SaveState(syncState);

            if (count > 0)
            {
                totalSales += count;
                totalBatches++;
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine($"  [OK] {currentSync:yyyy-MM-dd HH:mm} a {upperBound:yyyy-MM-dd HH:mm} -> {count:N0} ventas enviadas. (Total: {totalSales:N0})");
                Console.ResetColor();
            }
            else
            {
                Console.ForegroundColor = ConsoleColor.DarkGray;
                Console.WriteLine($"  [--] {currentSync:yyyy-MM-dd HH:mm} a {upperBound:yyyy-MM-dd HH:mm} -> Sin movimientos.");
                Console.ResetColor();
            }
        }

        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine("---------------------------------------------------------");
        Console.WriteLine($"  RESUMEN: {totalSales:N0} ventas sincronizadas exitosamente en {totalBatches} lotes.");
        Console.WriteLine("=========================================================\n");
    }

    private void EnsureWatermarkInitialized(SyncState syncState)
    {
        if (syncState.LastSalesSync.Year == 2000)
        {
            var cutoffStr = _configuration.GetValue<string>("DirectExtractors:InventoryBaseline:BaselineCutoffDate", "2026-06-07");
            if (string.IsNullOrWhiteSpace(cutoffStr) ||
                string.Equals(cutoffStr.Trim(), "now", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(cutoffStr.Trim(), "today", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(cutoffStr.Trim(), "hoy", StringComparison.OrdinalIgnoreCase))
            {
                syncState.LastSalesSync = DateTime.Now;
            }
            else if (DateTime.TryParse(cutoffStr, out DateTime parsed))
            {
                syncState.LastSalesSync = parsed.TimeOfDay == TimeSpan.Zero
                    ? parsed.Date.AddDays(1).AddSeconds(-1)
                    : parsed;
            }
            else
            {
                syncState.LastSalesSync = DateTime.Now;
            }
            SyncStateManager.SaveState(syncState);
        }
    }

    private async Task ProcessExtractionAsync(DirectExtractorConfig config, SyncState syncState, CancellationToken stoppingToken = default)
    {
        EnsureWatermarkInitialized(syncState);
        var lastSync = syncState.LastSalesSync;
        var upperBound = lastSync.AddHours(1);
        if (upperBound > DateTime.Now)
        {
            upperBound = DateTime.Now;
        }

        var (success, count) = await ProcessSalesBatchAsync(config, lastSync, upperBound, stoppingToken);
        if (success)
        {
            syncState.LastSalesSync = upperBound;
            SyncStateManager.SaveState(syncState);
        }
    }

    private async Task<(bool success, int count)> ProcessSalesBatchAsync(DirectExtractorConfig config, DateTime lastSync, DateTime upperBound, CancellationToken stoppingToken)
    {
        string connectionString = _configuration.GetConnectionString("LocalSqlServer") ?? string.Empty;
        int facilityId = _configuration.GetValue<int>("StoreFacilityId", 1);
        string depositCode = _configuration.GetValue<string>("SalesDepositCode", "01");
        
        string query = @"
            select @FacilityId as facility_id, @DepositCode as deposit_code, c_Numero, f_Fecha + convert(time,h_Hora) as f_Fecha, Cod_Principal, Cantidad, Precio, Subtotal, Impuesto, Total  
            from VAD20.dbo.MA_TRANSACCION WITH (NOLOCK)
            where f_Fecha >= CAST(@LastSync as date) AND f_Fecha <= CAST(@UpperBound as date)
            AND (f_Fecha + convert(time,h_Hora)) > @LastSync
            AND (f_Fecha + convert(time,h_Hora)) <= @UpperBound
            OPTION (RECOMPILE)";

        try
        {
            using var connection = new SqlConnection(connectionString);
            var sales = (await connection.QueryAsync(query, new { FacilityId = facilityId, DepositCode = depositCode, LastSync = lastSync, UpperBound = upperBound }, commandTimeout: 180)).ToList();

            if (!sales.Any())
            {
                return (true, 0);
            }

            var json = JsonSerializer.Serialize(sales);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromMinutes(15);
            var response = await client.PostAsync(config.TargetApiUrl, content, stoppingToken);

            if (response.IsSuccessStatusCode)
            {
                _logger.LogInformation("Successfully extracted and posted {Count} sales transactions.", sales.Count);
                return (true, sales.Count);
            }
            else
            {
                _logger.LogWarning("Failed to post sales transactions. Status code: {StatusCode}", response.StatusCode);
                return (false, 0);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing sales batch");
            return (false, 0);
        }
    }
}
