using System.Text;
using System.Text.Json;
using Dapper;
using Microsoft.Data.SqlClient;
using MorpheusSyncAgent.Models;
using MorpheusSyncAgent.Utils;

namespace MorpheusSyncAgent.Workers;

public class SuppliersExtractorWorker : BackgroundService
{
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<SuppliersExtractorWorker> _logger;

    public SuppliersExtractorWorker(IConfiguration configuration, IHttpClientFactory httpClientFactory, ILogger<SuppliersExtractorWorker> logger)
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
                var config = _configuration.GetSection("DirectExtractors:Suppliers").Get<DirectExtractorConfig>();
                
                if (config != null && config.Enabled)
                {
                    await ProcessExtractionAsync(config, stoppingToken);
                }
                
                await Task.Delay(TimeSpan.FromMinutes(config?.IntervalMinutes ?? 1440), stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in SuppliersExtractorWorker");
                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            }
        }
    }

    public async Task RunOnceAsync(CancellationToken stoppingToken = default)
    {
        var config = _configuration.GetSection("DirectExtractors:Suppliers").Get<DirectExtractorConfig>();
        if (config == null)
        {
            config = new DirectExtractorConfig
            {
                Enabled = true,
                TargetApiUrl = _configuration.GetValue<string>("DefaultTargetApiUrl", "http://localhost/api") + "/import/suppliers-legacy"
            };
        }

        await ProcessExtractionAsync(config, stoppingToken);
    }

    private async Task ProcessExtractionAsync(DirectExtractorConfig config, CancellationToken stoppingToken = default)
    {
        string connectionString = _configuration.GetConnectionString("LocalSqlServer") ?? string.Empty;
        
        string query = @"SELECT c_codproveed AS codigo, c_razon AS razon_social, c_descripcio AS nombre_comercial, c_rif AS rif, c_direccion AS direccion, c_telefono AS telefono, c_email AS email, 'ACTIVO' AS estatus FROM MA_PROVEEDORES WHERE n_activo = 1";

        using var connection = new SqlConnection(connectionString);
        var suppliers = await connection.QueryAsync(query);

        if (!suppliers.Any()) return;

        var json = JsonSerializer.Serialize(suppliers);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromMinutes(5);
        var response = await client.PostAsync(config.TargetApiUrl, content, stoppingToken);

        if (response.IsSuccessStatusCode)
        {
            _logger.LogInformation("Successfully extracted and posted {Count} suppliers.", suppliers.Count());
        }
        else
        {
            _logger.LogWarning("Failed to post suppliers. Status code: {StatusCode}", response.StatusCode);
        }
    }
}
