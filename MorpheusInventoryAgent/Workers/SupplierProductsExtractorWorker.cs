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

    private async Task ProcessExtractionAsync(DirectExtractorConfig config, CancellationToken stoppingToken)
    {
        string connectionString = _configuration.GetConnectionString("LocalSqlServer") ?? string.Empty;
        var syncState = SyncStateManager.LoadState();
        var lastSync = syncState.LastSupplierProductSync;
        
        string query = @"
            select x.c_codigo, x.c_codprovee as c_CodProveedor, 
                   case when x.n_costo=0 then p.n_CostoAct else x.n_costo end as costo, 
                   1 as compMin, 'EMPAQUE' as empaque, p.n_CantiBul
            from (
                select ROW_NUMBER() over(Partition by c_codprovee, c_codigo order by d_fecha desc) ln, 
                       c_codigo, c_codprovee, n_costo, d_fecha
                from MA_PRODXPROV
                where d_fecha > @LastSync
            ) x
            inner join MA_PRODUCTOS p on x.c_codigo=p.c_Codigo
            where ln=1
            order by d_fecha desc";

        using var connection = new SqlConnection(connectionString);
        var supplierProducts = await connection.QueryAsync(query, new { LastSync = lastSync });

        if (!supplierProducts.Any())
        {
            return;
        }

        var json = JsonSerializer.Serialize(supplierProducts);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromMinutes(15);
        var response = await client.PostAsync(config.TargetApiUrl, content, stoppingToken);

        if (response.IsSuccessStatusCode)
        {
            _logger.LogInformation("Successfully extracted and posted {Count} supplier products.", supplierProducts.Count());
            syncState.LastSupplierProductSync = DateTime.Now;
            SyncStateManager.SaveState(syncState);
        }
        else
        {
            _logger.LogWarning("Failed to post supplier products. Status code: {StatusCode}", response.StatusCode);
        }
    }
}
