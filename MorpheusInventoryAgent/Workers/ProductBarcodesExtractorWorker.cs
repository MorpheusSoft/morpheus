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

        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine("=========================================================");
        Console.WriteLine("  MORPHEUS SYNC AGENT - CODIGOS DE BARRA");
        Console.WriteLine("=========================================================");
        Console.ResetColor();

        await ProcessExtractionAsync(config, stoppingToken);
        Console.WriteLine("=========================================================\n");
    }

    private async Task ProcessExtractionAsync(DirectExtractorConfig config, CancellationToken stoppingToken = default)
    {
        string connectionString = _configuration.GetConnectionString("LocalSqlServer") ?? string.Empty;
        
        string query = config.ExportMode switch
        {
            ExportMode.OnlyWithStock => "select p.c_Codigo, c.c_Codigo as c_CodAlterno, c.n_Cantidad from MA_PRODUCTOS p WITH (NOLOCK) inner join MA_CODIGOS c WITH (NOLOCK) on p.c_Codigo=c.c_CodNasa inner join (select c_codarticulo, sum(n_cantidad) cant from MA_DEPOPROD WITH (NOLOCK) group by c_codarticulo) i on p.c_Codigo=i.c_codarticulo where i.cant>0 and ISNULL(p.n_tipopeso, 0) NOT IN (3, 4, 5)",
            ExportMode.StockZeroAndAbove => "select p.c_Codigo, c.c_Codigo as c_CodAlterno, c.n_Cantidad from MA_PRODUCTOS p WITH (NOLOCK) inner join MA_CODIGOS c WITH (NOLOCK) on p.c_Codigo=c.c_CodNasa inner join (select c_codarticulo, sum(n_cantidad) cant from MA_DEPOPROD WITH (NOLOCK) group by c_codarticulo) i on p.c_Codigo=i.c_codarticulo where i.cant>=0 and ISNULL(p.n_tipopeso, 0) NOT IN (3, 4, 5)",
            ExportMode.AllMaster => "select p.c_Codigo, c.c_Codigo as c_CodAlterno, c.n_Cantidad from MA_PRODUCTOS p WITH (NOLOCK) inner join MA_CODIGOS c WITH (NOLOCK) on p.c_Codigo=c.c_CodNasa where ISNULL(p.n_tipopeso, 0) NOT IN (3, 4, 5)",
            _ => throw new NotImplementedException()
        };

        Console.WriteLine("  Consultando códigos de barra en SQL Server...");
        using var connection = new SqlConnection(connectionString);
        var barcodes = (await connection.QueryAsync(query)).ToList();

        if (!barcodes.Any())
        {
            Console.ForegroundColor = ConsoleColor.DarkGray;
            Console.WriteLine("  [--] No se encontraron códigos de barra para sincronizar.");
            Console.ResetColor();
            return;
        }

        Console.WriteLine($"  -> Transmitiendo {barcodes.Count:N0} códigos de barra a la nube QA...");
        var json = JsonSerializer.Serialize(barcodes);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromMinutes(15);
        var response = await client.PostAsync(config.TargetApiUrl, content, stoppingToken);

        if (response.IsSuccessStatusCode)
        {
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine($"  [OK] {barcodes.Count:N0} códigos de barra sincronizados exitosamente.");
            Console.ResetColor();
            _logger.LogInformation("Successfully extracted and posted {Count} barcodes.", barcodes.Count);
        }
        else
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine($"  [ERROR] Fallo al enviar códigos de barra. Código HTTP: {response.StatusCode}");
            Console.ResetColor();
            _logger.LogWarning("Failed to post barcodes. Status code: {StatusCode}", response.StatusCode);
        }
    }
}
