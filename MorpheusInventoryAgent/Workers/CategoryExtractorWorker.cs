using System.Text;
using System.Text.Json;
using Dapper;
using Microsoft.Data.SqlClient;
using MorpheusSyncAgent.Models;

namespace MorpheusSyncAgent.Workers;

public class CategoryExtractorWorker : BackgroundService
{
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<CategoryExtractorWorker> _logger;

    public CategoryExtractorWorker(IConfiguration configuration, IHttpClientFactory httpClientFactory, ILogger<CategoryExtractorWorker> logger)
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
                var config = _configuration.GetSection("DirectExtractors:Categories").Get<DirectExtractorConfig>();
                
                if (config != null && config.Enabled)
                {
                    await ProcessExtractionAsync(config, stoppingToken);
                }
                
                await Task.Delay(TimeSpan.FromMinutes(config?.IntervalMinutes ?? 1440), stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in CategoryExtractorWorker");
                await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
            }
        }
    }

    public async Task RunOnceAsync(CancellationToken stoppingToken = default)
    {
        var config = _configuration.GetSection("DirectExtractors:Categories").Get<DirectExtractorConfig>();
        if (config == null)
        {
            config = new DirectExtractorConfig
            {
                Enabled = true,
                TargetApiUrl = _configuration.GetValue<string>("DefaultTargetApiUrl", "https://api.qa.morpheussoft.net/api") + "/v1/import/categories-legacy"
            };
        }

        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine("=========================================================");
        Console.WriteLine("  MORPHEUS SYNC AGENT - ÁRBOL DE CATEGORÍAS JERÁRQUICAS");
        Console.WriteLine("=========================================================");
        Console.ResetColor();

        await ProcessExtractionAsync(config, stoppingToken);
        Console.WriteLine("=========================================================\n");
    }

    private async Task ProcessExtractionAsync(DirectExtractorConfig config, CancellationToken stoppingToken = default)
    {
        string connectionString = _configuration.GetConnectionString("LocalSqlServer") ?? string.Empty;
        
        try
        {
            using var connection = new SqlConnection(connectionString);
            await connection.OpenAsync(stoppingToken);

            // 1. Departamentos (Nivel 1 - Raíz)
            Console.WriteLine("  1. Consultando MA_DEPARTAMENTOS (Nivel 1 - Raíz)...");
            string deptQuery = @"
                SELECT 
                    CAST(c_CODIGO AS VARCHAR(50)) AS c_Codigo, 
                    CAST(c_DESCRIPCIO AS VARCHAR(150)) AS c_Descripcio 
                FROM MA_DEPARTAMENTOS WITH (NOLOCK)
                WHERE c_CODIGO IS NOT NULL AND RTRIM(LTRIM(CAST(c_CODIGO AS VARCHAR(50)))) <> ''";
            var departments = (await connection.QueryAsync<LegacyDepartmentDto>(deptQuery)).ToList();

            // 2. Grupos (Nivel 2 - Hijos de Depto)
            Console.WriteLine("  2. Consultando MA_GRUPOS (Nivel 2 - Intermedio)...");
            var grpCols = (await connection.QueryAsync<string>(
                "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MA_GRUPOS'")).ToList();
            
            string grpDepCol = "c_departamento";
            if (!grpCols.Any(c => string.Equals(c, "c_departamento", StringComparison.OrdinalIgnoreCase)))
            {
                var match = grpCols.FirstOrDefault(c => c.Contains("departamento", StringComparison.OrdinalIgnoreCase)) ?? "departamento";
                grpDepCol = match;
            }

            string grpQuery = $@"
                SELECT 
                    CAST(c_CODIGO AS VARCHAR(50)) AS c_Codigo, 
                    CAST(c_DESCRIPCIO AS VARCHAR(150)) AS c_Descripcio, 
                    CAST({grpDepCol} AS VARCHAR(50)) AS c_Departamento 
                FROM MA_GRUPOS WITH (NOLOCK)
                WHERE c_CODIGO IS NOT NULL AND RTRIM(LTRIM(CAST(c_CODIGO AS VARCHAR(50)))) <> ''";
            var groups = (await connection.QueryAsync<LegacyGroupDto>(grpQuery)).ToList();

            // 3. Subgrupos (Nivel 3 - Hijos de Grupo)
            Console.WriteLine("  3. Consultando MA_SUBGRUPOS (Nivel 3 - Detalle / Producto)...");
            var subCols = (await connection.QueryAsync<string>(
                "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MA_SUBGRUPOS'")).ToList();
            
            string subDepCol = "c_in_departamento";
            string subGrpCol = "c_in_grupo";
            if (!subCols.Any(c => string.Equals(c, "c_in_departamento", StringComparison.OrdinalIgnoreCase)))
            {
                var match = subCols.FirstOrDefault(c => c.Contains("departamento", StringComparison.OrdinalIgnoreCase));
                if (match != null) subDepCol = match;
            }
            if (!subCols.Any(c => string.Equals(c, "c_in_grupo", StringComparison.OrdinalIgnoreCase)))
            {
                var match = subCols.FirstOrDefault(c => c.Contains("grupo", StringComparison.OrdinalIgnoreCase));
                if (match != null) subGrpCol = match;
            }

            string subQuery = $@"
                SELECT 
                    CAST(c_CODIGO AS VARCHAR(50)) AS c_Codigo, 
                    CAST(c_DESCRIPCIO AS VARCHAR(150)) AS c_Descripcio, 
                    CAST({subDepCol} AS VARCHAR(50)) AS c_in_departamento, 
                    CAST({subGrpCol} AS VARCHAR(50)) AS c_in_grupo 
                FROM MA_SUBGRUPOS WITH (NOLOCK)
                WHERE c_CODIGO IS NOT NULL AND RTRIM(LTRIM(CAST(c_CODIGO AS VARCHAR(50)))) <> ''";
            var subgroups = (await connection.QueryAsync<LegacySubGroupDto>(subQuery)).ToList();

            Console.WriteLine($"  -> Extraídas: {departments.Count:N0} Departamentos, {groups.Count:N0} Grupos, {subgroups.Count:N0} Subgrupos.");
            Console.WriteLine($"  -> Transmitiendo estructura jerárquica a la nube QA ({config.TargetApiUrl})...");

            var payload = new LegacyCategoriesPayloadDto
            {
                departments = departments,
                groups = groups,
                subgroups = subgroups
            };

            var json = JsonSerializer.Serialize(payload);
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromMinutes(5);
            var response = await client.PostAsync(config.TargetApiUrl, content, stoppingToken);

            if (response.IsSuccessStatusCode)
            {
                var respContent = await response.Content.ReadAsStringAsync(stoppingToken);
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine($"  [OK] ¡Árbol de categorías jerárquicas sincronizado exitosamente!");
                Console.WriteLine($"  Detalle de respuesta: {respContent}");
                Console.ResetColor();
                _logger.LogInformation("Successfully extracted and posted categories hierarchy.");
            }
            else
            {
                var errorBody = await response.Content.ReadAsStringAsync(stoppingToken);
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine($"  [ERROR] Fallo al sincronizar categorías. Código HTTP: {response.StatusCode}");
                Console.WriteLine($"  Detalle del error: {errorBody}");
                Console.ResetColor();
                _logger.LogError("Failed to post categories. Status: {StatusCode}, Details: {Details}", response.StatusCode, errorBody);
            }
        }
        catch (Exception ex)
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine($"  [ERROR CRÍTICO] Excepción durante la extracción de categorías: {ex.Message}");
            Console.ResetColor();
            _logger.LogError(ex, "Critical failure during category extraction");
        }
    }
}

public class LegacyDepartmentDto
{
    public string c_Codigo { get; set; } = string.Empty;
    public string c_Descripcio { get; set; } = string.Empty;
}

public class LegacyGroupDto
{
    public string c_Codigo { get; set; } = string.Empty;
    public string c_Descripcio { get; set; } = string.Empty;
    public string c_Departamento { get; set; } = string.Empty;
}

public class LegacySubGroupDto
{
    public string c_Codigo { get; set; } = string.Empty;
    public string c_Descripcio { get; set; } = string.Empty;
    public string c_in_departamento { get; set; } = string.Empty;
    public string c_in_grupo { get; set; } = string.Empty;
}

public class LegacyCategoriesPayloadDto
{
    public List<LegacyDepartmentDto> departments { get; set; } = new();
    public List<LegacyGroupDto> groups { get; set; } = new();
    public List<LegacySubGroupDto> subgroups { get; set; } = new();
}
