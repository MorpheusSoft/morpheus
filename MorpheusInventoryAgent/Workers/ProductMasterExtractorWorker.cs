using System.Text;
using System.Text.Json;
using Dapper;
using Microsoft.Data.SqlClient;
using MorpheusSyncAgent.Models;
using MorpheusSyncAgent.Utils;

namespace MorpheusSyncAgent.Workers;

public class ProductMasterExtractorWorker : BackgroundService
{
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<ProductMasterExtractorWorker> _logger;

    public ProductMasterExtractorWorker(IConfiguration configuration, IHttpClientFactory httpClientFactory, ILogger<ProductMasterExtractorWorker> logger)
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
                var config = _configuration.GetSection("DirectExtractors:Products").Get<DirectExtractorConfig>();
                
                if (config != null && config.Enabled)
                {
                    await ProcessExtractionAsync(config, stoppingToken);
                    await Task.Delay(TimeSpan.FromMinutes(config.IntervalMinutes), stoppingToken);
                }
                else
                {
                    await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in ProductMasterExtractorWorker");
                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            }
        }
    }

    private async Task ProcessExtractionAsync(DirectExtractorConfig config, CancellationToken stoppingToken)
    {
        string connectionString = _configuration.GetConnectionString("LocalSqlServer") ?? string.Empty;
        var syncState = SyncStateManager.LoadState();
        var lastSync = syncState.LastProductSync;
        
        string baseSelect = "select p.c_Codigo, c_Descri, c_Departamento, n_CostoAct, n_precio1, n_Impuesto1, case when c_CodMoneda='0000000001' then 'VES' else 'USD' end moneda, c_Marca, null imagen from MA_PRODUCTOS p";
        string dateFilter = " (p.Update_Date > @LastSync OR p.Add_Date > @LastSync)";
        
        string query = config.ExportMode switch
        {
            ExportMode.OnlyWithStock => $"{baseSelect} inner join (select c_codarticulo, sum(n_cantidad) cant from MA_DEPOPROD group by c_codarticulo) i on p.c_Codigo=i.c_codarticulo where i.cant>0 AND {dateFilter} order by 1",
            ExportMode.StockZeroAndAbove => $"{baseSelect} inner join (select c_codarticulo, sum(n_cantidad) cant from MA_DEPOPROD group by c_codarticulo) i on p.c_Codigo=i.c_codarticulo where i.cant>=0 AND {dateFilter} order by 1",
            ExportMode.AllMaster => $"{baseSelect} where {dateFilter} order by 1",
            _ => throw new NotImplementedException()
        };

        using var connection = new SqlConnection(connectionString);
        var products = await connection.QueryAsync(query, new { LastSync = lastSync });

        var json = JsonSerializer.Serialize(products);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromMinutes(15);
        var response = await client.PostAsync(config.TargetApiUrl, content, stoppingToken);

        if (response.IsSuccessStatusCode)
        {
            _logger.LogInformation("Successfully extracted and posted {Count} products.", products.Count());
            syncState.LastProductSync = DateTime.Now;
            SyncStateManager.SaveState(syncState);
        }
        else
        {
            _logger.LogWarning("Failed to post products. Status code: {StatusCode}", response.StatusCode);
        }
    }
}
