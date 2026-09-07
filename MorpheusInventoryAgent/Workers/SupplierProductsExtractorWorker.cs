using System.Text;
using System.Text.Json;
using Dapper;
using Microsoft.Data.SqlClient;
using MorpheusSyncAgent.Models;
using MorpheusSyncAgent.Utils;

namespace MorpheusSyncAgent.Workers;

public class SupplierProductsExtractorWorker : BackgroundService
{
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<SupplierProductsExtractorWorker> _logger;

    public SupplierProductsExtractorWorker(IConfiguration configuration, IHttpClientFactory httpClientFactory, ILogger<SupplierProductsExtractorWorker> logger)
    {
        _configuration = configuration;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Esperar 5 minutos al iniciar para garantizar que el Extractor de Productos Maestros
        // corra primero y cree los productos antes de intentar atarlos a los proveedores.
        await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var config = _configuration.GetSection("DirectExtractors:SupplierProducts").Get<DirectExtractorConfig>();
                
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
                _logger.LogError(ex, "Error in SupplierProductsExtractorWorker");
                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            }
        }
    }

    public async Task RunOnceAsync(CancellationToken stoppingToken = default)
    {
        var config = _configuration.GetSection("DirectExtractors:SupplierProducts").Get<DirectExtractorConfig>();
        if (config == null)
        {
            config = new DirectExtractorConfig
            {
                Enabled = true,
                TargetApiUrl = _configuration.GetValue<string>("DefaultTargetApiUrl", "http://localhost/api") + "/import/supplier-products-legacy"
            };
        }

        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine("=========================================================");
        Console.WriteLine("  MORPHEUS SYNC AGENT - COSTOS Y ARTICULOS POR PROVEEDOR");
        Console.WriteLine("=========================================================");
        Console.ResetColor();

        await ProcessExtractionAsync(config, stoppingToken);
        Console.WriteLine("=========================================================\n");
    }

    private async Task ProcessExtractionAsync(DirectExtractorConfig config, CancellationToken stoppingToken = default)
    {
        string connectionString = _configuration.GetConnectionString("LocalSqlServer") ?? string.Empty;
        var syncState = SyncStateManager.LoadState();
        var lastSync = syncState.LastSupplierProductSync;
        
        string query = @"
            select x.c_codigo as c_Codigo, x.c_codprovee as c_CodProveedor, 
                   case when x.n_costo=0 then p.n_CostoAct else x.n_costo end as costo, 
                   1 as compMin, 'EMPAQUE' as empaque, p.n_CantiBul
            from (
                select ROW_NUMBER() over(Partition by c_codprovee, c_codigo order by d_fecha desc) ln, 
                       c_codigo, c_codprovee, n_costo, d_fecha
                from MA_PRODXPROV WITH (NOLOCK)
                where d_fecha > @LastSync
            ) x
            inner join MA_PRODUCTOS p WITH (NOLOCK) on x.c_codigo=p.c_Codigo
            where ln=1
            order by d_fecha desc";

        Console.WriteLine($"  Consultando cruces de costos en SQL Server (posteriores a {lastSync:yyyy-MM-dd})...");
        using var connection = new SqlConnection(connectionString);
        var supplierProducts = (await connection.QueryAsync(query, new { LastSync = lastSync })).ToList();

        if (!supplierProducts.Any())
        {
            Console.ForegroundColor = ConsoleColor.DarkGray;
            Console.WriteLine("  [--] No se encontraron nuevos cruces producto-proveedor.");
            Console.ResetColor();
            return;
        }

        Console.WriteLine($"  -> Transmitiendo {supplierProducts.Count:N0} relaciones proveedor-producto a la nube QA...");
        var json = JsonSerializer.Serialize(supplierProducts);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromMinutes(15);
        var response = await client.PostAsync(config.TargetApiUrl, content, stoppingToken);

        if (response.IsSuccessStatusCode)
        {
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine($"  [OK] {supplierProducts.Count:N0} relaciones proveedor-producto sincronizadas exitosamente.");
            Console.ResetColor();
            _logger.LogInformation("Successfully extracted and posted {Count} supplier products.", supplierProducts.Count);
            syncState.LastSupplierProductSync = DateTime.Now;
            SyncStateManager.SaveState(syncState);
        }
        else
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine($"  [ERROR] Fallo al enviar cruces. Código HTTP: {response.StatusCode}");
            Console.ResetColor();
            _logger.LogWarning("Failed to post supplier products. Status code: {StatusCode}", response.StatusCode);
        }
    }
}
