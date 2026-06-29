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
        await ProcessExtractionAsync(config, syncState, stoppingToken);
    }

    private async Task ProcessExtractionAsync(DirectExtractorConfig config, SyncState syncState, CancellationToken stoppingToken = default)
    {
        string connectionString = _configuration.GetConnectionString("LocalSqlServer") ?? string.Empty;
        
        // Initialize watermark with cutoff date (end of day) if this is the first run
        if (syncState.LastSalesSync.Year == 2000)
        {
            var cutoffStr = _configuration.GetValue<string>("DirectExtractors:InventoryBaseline:BaselineCutoffDate", "2026-06-07");
            syncState.LastSalesSync = DateTime.Parse(cutoffStr).Date.AddDays(1).AddTicks(-1); // 23:59:59.9999999
            SyncStateManager.SaveState(syncState);
        }
        
        var lastSync = syncState.LastSalesSync;
        var upperBound = lastSync.AddHours(1);
        if (upperBound > DateTime.Now)
        {
            upperBound = DateTime.Now;
        }

        int facilityId = _configuration.GetValue<int>("StoreFacilityId", 1);
        string depositCode = _configuration.GetValue<string>("SalesDepositCode", "01");
        
        string query = @"
            select @FacilityId as facility_id, @DepositCode as deposit_code, c_Numero, f_Fecha + convert(time,h_Hora) as f_Fecha, Cod_Principal, Cantidad, Precio, Subtotal, Impuesto, Total  
            from VAD20.dbo.MA_TRANSACCION
            where f_Fecha >= CAST(@LastSync as date) AND f_Fecha <= CAST(@UpperBound as date)
            AND (f_Fecha + convert(time,h_Hora)) > @LastSync
            AND (f_Fecha + convert(time,h_Hora)) <= @UpperBound
            OPTION (RECOMPILE)";

        using var connection = new SqlConnection(connectionString);
        var sales = await connection.QueryAsync(query, new { FacilityId = facilityId, DepositCode = depositCode, LastSync = lastSync, UpperBound = upperBound }, commandTimeout: 180);

        if (!sales.Any())
        {
            syncState.LastSalesSync = upperBound;
            SyncStateManager.SaveState(syncState);
            return;
        }

        var json = JsonSerializer.Serialize(sales);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromMinutes(15);
        var response = await client.PostAsync(config.TargetApiUrl, content, stoppingToken);

        if (response.IsSuccessStatusCode)
        {
            _logger.LogInformation("Successfully extracted and posted {Count} sales transactions.", sales.Count());
            syncState.LastSalesSync = upperBound;
            SyncStateManager.SaveState(syncState);
        }
        else
        {
            _logger.LogWarning("Failed to post sales transactions. Status code: {StatusCode}", response.StatusCode);
        }
    }
}
