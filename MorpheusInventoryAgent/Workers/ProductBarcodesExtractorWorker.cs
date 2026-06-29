using System.Text;
using System.Text.Json;
using Dapper;
using Microsoft.Data.SqlClient;
using MorpheusSyncAgent.Models;

namespace MorpheusSyncAgent.Workers;

public class ProductBarcodesExtractorWorker : BackgroundService
{
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<ProductBarcodesExtractorWorker> _logger;

    public ProductBarcodesExtractorWorker(IConfiguration configuration, IHttpClientFactory httpClientFactory, ILogger<ProductBarcodesExtractorWorker> logger)
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
                var config = _configuration.GetSection("DirectExtractors:ProductBarcodes").Get<DirectExtractorConfig>();
                
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
                _logger.LogError(ex, "Error in ProductBarcodesExtractorWorker");
                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            }
        }
    }

    public async Task RunOnceAsync(CancellationToken stoppingToken = default)
    {
        var config = _configuration.GetSection("DirectExtractors:ProductBarcodes").Get<DirectExtractorConfig>();
        if (config == null)
        {
            config = new DirectExtractorConfig
            {
                Enabled = true,
                TargetApiUrl = _configuration.GetValue<string>("DefaultTargetApiUrl", "http://localhost/api") + "/import/products-barcodes-legacy",
                ExportMode = ExportMode.OnlyWithStock
            };
        }

        await ProcessExtractionAsync(config, stoppingToken);
    }

    private async Task ProcessExtractionAsync(DirectExtractorConfig config, CancellationToken stoppingToken = default)
    {
        string connectionString = _configuration.GetConnectionString("LocalSqlServer") ?? string.Empty;
        
        string query = config.ExportMode switch
        {
            ExportMode.OnlyWithStock => "select p.c_Codigo, c.c_Codigo as c_CodAlterno, c.n_Cantidad from MA_PRODUCTOS p inner join MA_CODIGOS c on p.c_Codigo=c.c_CodNasa inner join (select c_codarticulo, sum(n_cantidad) cant from MA_DEPOPROD group by c_codarticulo) i on p.c_Codigo=i.c_codarticulo where i.cant>0",
            ExportMode.StockZeroAndAbove => "select p.c_Codigo, c.c_Codigo as c_CodAlterno, c.n_Cantidad from MA_PRODUCTOS p inner join MA_CODIGOS c on p.c_Codigo=c.c_CodNasa inner join (select c_codarticulo, sum(n_cantidad) cant from MA_DEPOPROD group by c_codarticulo) i on p.c_Codigo=i.c_codarticulo where i.cant>=0",
            ExportMode.AllMaster => "select p.c_Codigo, c.c_Codigo as c_CodAlterno, c.n_Cantidad from MA_PRODUCTOS p inner join MA_CODIGOS c on p.c_Codigo=c.c_CodNasa",
            _ => throw new NotImplementedException()
        };

        using var connection = new SqlConnection(connectionString);
        var barcodes = await connection.QueryAsync(query);

        var json = JsonSerializer.Serialize(barcodes);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromMinutes(15);
        var response = await client.PostAsync(config.TargetApiUrl, content, stoppingToken);

        if (response.IsSuccessStatusCode)
        {
            _logger.LogInformation("Successfully extracted and posted {Count} barcodes.", barcodes.Count());
        }
        else
        {
            _logger.LogWarning("Failed to post barcodes. Status code: {StatusCode}", response.StatusCode);
        }
    }
}
