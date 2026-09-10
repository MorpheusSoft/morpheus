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

    public async Task RunOnceAsync(CancellationToken stoppingToken = default)
    {
        var config = _configuration.GetSection("DirectExtractors:Products").Get<DirectExtractorConfig>();
        if (config == null)
        {
            config = new DirectExtractorConfig
            {
                Enabled = true,
                TargetApiUrl = _configuration.GetValue<string>("DefaultTargetApiUrl", "http://localhost/api") + "/import/products-legacy",
                ExportMode = ExportMode.OnlyWithStock
            };
        }

        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine("=========================================================");
        Console.WriteLine("  MORPHEUS SYNC AGENT - MAESTRO DE PRODUCTOS");
        Console.WriteLine("=========================================================");
        Console.ResetColor();

        await ProcessExtractionAsync(config, stoppingToken);
        Console.WriteLine("=========================================================\n");
    }

    private async Task ProcessExtractionAsync(DirectExtractorConfig config, CancellationToken stoppingToken = default)
    {
        string connectionString = _configuration.GetConnectionString("LocalSqlServer") ?? string.Empty;
        var syncState = SyncStateManager.LoadState();
        var lastSync = syncState.LastProductSync;
        
        string baseSelect = "select p.c_Codigo, c_Descri, c_Departamento, n_CostoAct, n_precio1, n_Impuesto1, case when c_CodMoneda='0000000001' then 'VES' else 'USD' end moneda, c_Marca, null imagen, ISNULL(p.n_tipopeso, 0) as n_tipopeso from MA_PRODUCTOS p WITH (NOLOCK)";
        string dateFilter = " (p.Update_Date > @LastSync OR p.Add_Date > @LastSync)";
        string typeFilter = " ISNULL(p.n_tipopeso, 0) NOT IN (3, 4, 5)";
        
        string query = config.ExportMode switch
        {
            ExportMode.OnlyWithStock => $"{baseSelect} inner join (select c_codarticulo, sum(n_cantidad) cant from MA_DEPOPROD WITH (NOLOCK) group by c_codarticulo) i on p.c_Codigo=i.c_codarticulo where i.cant>0 AND {dateFilter} AND {typeFilter} order by 1",
            ExportMode.StockZeroAndAbove => $"{baseSelect} inner join (select c_codarticulo, sum(n_cantidad) cant from MA_DEPOPROD WITH (NOLOCK) group by c_codarticulo) i on p.c_Codigo=i.c_codarticulo where i.cant>=0 AND {dateFilter} AND {typeFilter} order by 1",
            ExportMode.AllMaster => $"{baseSelect} where {dateFilter} AND {typeFilter} order by 1",
            _ => throw new NotImplementedException()
        };

        Console.WriteLine($"  Consultando catálogo en SQL Server (Modo: {config.ExportMode}, Filtro: > {lastSync:yyyy-MM-dd})...");
        using var connection = new SqlConnection(connectionString);
        var products = (await connection.QueryAsync(query, new { LastSync = lastSync })).ToList();

        if (!products.Any())
        {
            Console.ForegroundColor = ConsoleColor.DarkGray;
            Console.WriteLine("  [--] No se encontraron productos modificados para sincronizar.");
            Console.ResetColor();
            return;
        }

        Console.WriteLine($"  -> Transmitiendo {products.Count:N0} productos a la nube QA...");
        var json = JsonSerializer.Serialize(products);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromMinutes(15);
        var response = await client.PostAsync(config.TargetApiUrl, content, stoppingToken);

        if (response.IsSuccessStatusCode)
        {
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine($"  [OK] {products.Count:N0} productos sincronizados exitosamente.");
            Console.ResetColor();
            _logger.LogInformation("Successfully extracted and posted {Count} products.", products.Count);
            syncState.LastProductSync = DateTime.Now;
            SyncStateManager.SaveState(syncState);
        }
        else
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine($"  [ERROR] Fallo al enviar productos. Código HTTP: {response.StatusCode}");
            Console.ResetColor();
            _logger.LogWarning("Failed to post products. Status code: {StatusCode}", response.StatusCode);
        }
    }
}
