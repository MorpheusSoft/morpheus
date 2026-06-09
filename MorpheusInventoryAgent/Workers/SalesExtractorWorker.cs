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
                    await Task.Delay(TimeSpan.FromMinutes(config.IntervalMinutes), stoppingToken);
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

    private async Task ProcessExtractionAsync(DirectExtractorConfig config, SyncState syncState, CancellationToken stoppingToken)
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
        int facilityId = _configuration.GetValue<int>("StoreFacilityId", 1);
        
        string query = @"
            select @FacilityId as facility_id, c_Numero, f_Fecha + convert(time,h_Hora) as f_Fecha, Cod_Principal, Cantidad, Precio, Subtotal, Impuesto, Total  
            from VAD20.dbo.MA_TRANSACCION
            where (f_Fecha + convert(time,h_Hora)) > @LastSync";

        using var connection = new SqlConnection(connectionString);
        var sales = await connection.QueryAsync(query, new { FacilityId = facilityId, LastSync = lastSync });

        if (!sales.Any()) return;

        var json = JsonSerializer.Serialize(sales);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        var client = _httpClientFactory.CreateClient();
        var response = await client.PostAsync(config.TargetApiUrl, content, stoppingToken);

        if (response.IsSuccessStatusCode)
        {
            _logger.LogInformation("Successfully extracted and posted {Count} sales transactions.", sales.Count());
            syncState.LastSalesSync = DateTime.Now;
            SyncStateManager.SaveState(syncState);
        }
        else
        {
            _logger.LogWarning("Failed to post sales transactions. Status code: {StatusCode}", response.StatusCode);
        }
    }
}
