using System.Text;
using System.Text.Json;
using Dapper;
using Microsoft.Data.SqlClient;
using MorpheusSyncAgent.Models;
using MorpheusSyncAgent.Utils;

namespace MorpheusSyncAgent.Workers;

public class InventoryMovementsWorker : BackgroundService
{
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<InventoryMovementsWorker> _logger;

    public InventoryMovementsWorker(IConfiguration configuration, IHttpClientFactory httpClientFactory, ILogger<InventoryMovementsWorker> logger)
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
                var config = _configuration.GetSection("DirectExtractors:InventoryMovements").Get<DirectExtractorConfig>();
                
                // Ensure baseline is done before syncing movements!
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
                _logger.LogError(ex, "Error in InventoryMovementsWorker");
                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            }
        }
    }

    private async Task ProcessExtractionAsync(DirectExtractorConfig config, SyncState syncState, CancellationToken stoppingToken)
    {
        string connectionString = _configuration.GetConnectionString("LocalSqlServer") ?? string.Empty;
        
        // Initialize watermark with cutoff date if this is the first run
        if (syncState.LastMovementSync.Year == 2000)
        {
            var cutoffStr = _configuration.GetValue<string>("DirectExtractors:InventoryBaseline:BaselineCutoffDate", "2026-06-07");
            syncState.LastMovementSync = DateTime.Parse(cutoffStr).Date;
            SyncStateManager.SaveState(syncState);
        }
        
        var lastSync = syncState.LastMovementSync;
        
        string query = @"
            select m.c_documento, t.c_concepto, c_tipoMov, f_fecha, c_deposito, c_codArticulo, t.n_cantidad, t.n_costo, t.n_subtotal
            from tr_inventario t
            inner join ma_inventario m on t.c_concepto = m.c_concepto and t.c_documento=m.c_documento
            where m.c_status != 'ANU' and t.c_concepto not in ('VEN','DEV') 
              and f_fecha >= @LastSyncDate";

        using var connection = new SqlConnection(connectionString);
        var movements = await connection.QueryAsync(query, new { LastSyncDate = lastSync.Date });

        if (!movements.Any()) return;

        var json = JsonSerializer.Serialize(movements);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromMinutes(15);
        var response = await client.PostAsync(config.TargetApiUrl, content, stoppingToken);

        if (response.IsSuccessStatusCode)
        {
            _logger.LogInformation("Successfully extracted and posted {Count} inventory movements.", movements.Count());
            syncState.LastMovementSync = DateTime.Now.Date;
            SyncStateManager.SaveState(syncState);
        }
        else
        {
            _logger.LogWarning("Failed to post inventory movements. Status code: {StatusCode}", response.StatusCode);
        }
    }
}
