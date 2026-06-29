using System.Text;
using System.Text.Json;
using Dapper;
using Microsoft.Data.SqlClient;
using MorpheusSyncAgent.Models;
using MorpheusSyncAgent.Utils;

namespace MorpheusSyncAgent.Workers;

public class InventoryBaselineWorker : BackgroundService
{
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<InventoryBaselineWorker> _logger;

    public InventoryBaselineWorker(IConfiguration configuration, IHttpClientFactory httpClientFactory, ILogger<InventoryBaselineWorker> logger)
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
                var config = _configuration.GetSection("DirectExtractors:InventoryBaseline").Get<DirectExtractorConfig>();
                
                // Only run once if enabled and not done yet
                if (config != null && config.Enabled && !syncState.BaselineInventoryDone)
                {
                    await ProcessExtractionAsync(config, syncState, null, null, stoppingToken);
                }
                
                await Task.Delay(TimeSpan.FromMinutes(config?.IntervalMinutes ?? 60), stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in InventoryBaselineWorker");
                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            }
        }
    }

    public async Task RunOnceAsync(string? date = null, string? desc = null, CancellationToken stoppingToken = default)
    {
        var syncState = SyncStateManager.LoadState();
        var config = _configuration.GetSection("DirectExtractors:InventoryBaseline").Get<DirectExtractorConfig>();
        if (config == null)
        {
            config = new DirectExtractorConfig
            {
                Enabled = true,
                TargetApiUrl = _configuration.GetValue<string>("DefaultTargetApiUrl", "http://localhost/api") + "/inventory-baseline"
            };
        }

        await ProcessExtractionAsync(config, syncState, date, desc, stoppingToken);
    }

    private async Task ProcessExtractionAsync(DirectExtractorConfig config, SyncState syncState, string? dateOverride = null, string? descOverride = null, CancellationToken stoppingToken = default)
    {
        string connectionString = _configuration.GetConnectionString("LocalSqlServer") ?? string.Empty;
        var cutoffStr = dateOverride ?? _configuration.GetValue<string>("DirectExtractors:InventoryBaseline:BaselineCutoffDate", "2026-06-07");
        DateTime cutoffDate = DateTime.Parse(cutoffStr);
        
        string query = @"
            select c_deposito, c_codArticulo, sum(case when c_tipoMov='Descargo' then n_cantidad*-1 else n_cantidad end) Cantidad
            from tr_inventario t
            inner join ma_inventario m on t.c_concepto = m.c_concepto and t.c_documento=m.c_documento
            where m.c_status!='ANU' and f_fecha <= @Cutoff
            group by c_deposito, c_codArticulo";

        using var connection = new SqlConnection(connectionString);
        var baseline = await connection.QueryAsync(query, new { Cutoff = cutoffDate.Date });

        if (!baseline.Any()) return;

        var json = JsonSerializer.Serialize(baseline);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromMinutes(15);
        client.Timeout = TimeSpan.FromMinutes(5); // It might be a large request
        var response = await client.PostAsync(config.TargetApiUrl, content, stoppingToken);

        if (response.IsSuccessStatusCode)
        {
            _logger.LogInformation("Successfully extracted and posted {Count} baseline inventory records.", baseline.Count());
            syncState.BaselineInventoryDone = true;
            SyncStateManager.SaveState(syncState);
        }
        else
        {
            _logger.LogWarning("Failed to post inventory baseline. Status code: {StatusCode}", response.StatusCode);
        }
    }
}
