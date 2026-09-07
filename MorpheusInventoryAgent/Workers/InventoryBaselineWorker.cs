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

        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine("=========================================================");
        Console.WriteLine("  MORPHEUS SYNC AGENT - INVENTARIO INICIAL (BASELINE)");
        Console.WriteLine("=========================================================");
        Console.ResetColor();

        await ProcessExtractionAsync(config, syncState, date, desc, stoppingToken);
        Console.WriteLine("=========================================================\n");
    }

    private async Task ProcessExtractionAsync(DirectExtractorConfig config, SyncState syncState, string? dateOverride = null, string? descOverride = null, CancellationToken stoppingToken = default)
    {
        string connectionString = _configuration.GetConnectionString("LocalSqlServer") ?? string.Empty;
        var cutoffStr = dateOverride ?? _configuration.GetValue<string>("DirectExtractors:InventoryBaseline:BaselineCutoffDate", "2026-06-07");
        
        DateTime cutoff;
        bool isNow = string.IsNullOrWhiteSpace(cutoffStr)
                  || string.Equals(cutoffStr.Trim(), "now", StringComparison.OrdinalIgnoreCase)
                  || string.Equals(cutoffStr.Trim(), "today", StringComparison.OrdinalIgnoreCase)
                  || string.Equals(cutoffStr.Trim(), "hoy", StringComparison.OrdinalIgnoreCase);

        if (isNow)
        {
            cutoff = DateTime.Now;
            Console.WriteLine($"  Modo: INVENTARIO VIVO al momento actual ({cutoff:yyyy-MM-dd HH:mm:ss})");
            _logger.LogInformation("Extrayendo inventario baseline VIVO al momento actual ({Cutoff})...", cutoff.ToString("yyyy-MM-dd HH:mm:ss"));
        }
        else if (DateTime.TryParse(cutoffStr, out DateTime parsed))
        {
            // Si el usuario indicó una fecha sin hora (ej: 2026-06-07), se toma hasta la última hora del día (23:59:59)
            cutoff = parsed.TimeOfDay == TimeSpan.Zero 
                ? parsed.Date.AddDays(1).AddSeconds(-1) 
                : parsed;
            Console.WriteLine($"  Modo: FECHA DE CORTE (Fin del día {cutoff:yyyy-MM-dd HH:mm:ss})");
            _logger.LogInformation("Extrayendo inventario baseline al cierre de fecha ({Cutoff})...", cutoff.ToString("yyyy-MM-dd HH:mm:ss"));
        }
        else
        {
            cutoff = DateTime.Now;
            Console.WriteLine($"  [ALERTA] Formato de fecha '{cutoffStr}' no reconocido. Usando momento actual ({cutoff:yyyy-MM-dd HH:mm:ss})");
            _logger.LogWarning("Formato de fecha inválido '{CutoffStr}', usando momento actual ({Cutoff}).", cutoffStr, cutoff.ToString("yyyy-MM-dd HH:mm:ss"));
        }
        
        Console.WriteLine("  Consultando existencias consolidadas en SQL Server (puede tomar unos segundos)...");

        string query = @"
            select c_deposito, c_codArticulo, sum(case when c_tipoMov='Descargo' then n_cantidad*-1 else n_cantidad end) Cantidad
            from tr_inventario t WITH (NOLOCK)
            inner join ma_inventario m WITH (NOLOCK) on t.c_concepto = m.c_concepto and t.c_documento=m.c_documento
            where m.c_status!='ANU' and f_fecha <= @Cutoff
            group by c_deposito, c_codArticulo";

        using var connection = new SqlConnection(connectionString);
        var baseline = (await connection.QueryAsync(query, new { Cutoff = cutoff }, commandTimeout: 600)).ToList();

        if (!baseline.Any())
        {
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine($"  [ALERTA] No se encontraron movimientos de inventario antes de {cutoff:yyyy-MM-dd HH:mm:ss}.");
            Console.ResetColor();
            _logger.LogWarning("No se encontraron movimientos de inventario antes de {Cutoff}.", cutoff.ToString("yyyy-MM-dd HH:mm:ss"));
            return;
        }

        Console.WriteLine($"  -> Encontrados {baseline.Count:N0} artículos con saldo. Transmitiendo a la nube QA...");

        var json = JsonSerializer.Serialize(baseline);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromMinutes(15);
        var response = await client.PostAsync(config.TargetApiUrl, content, stoppingToken);

        if (response.IsSuccessStatusCode)
        {
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine($"  [OK] {baseline.Count:N0} artículos sembrados exitosamente como Inventario Inicial.");
            Console.ResetColor();
            _logger.LogInformation("Successfully extracted and posted {Count} baseline inventory records.", baseline.Count);
            syncState.BaselineInventoryDone = true;
            if (syncState.LastMovementSync.Year == 2000)
            {
                syncState.LastMovementSync = cutoff;
            }
            if (syncState.LastSalesSync.Year == 2000)
            {
                syncState.LastSalesSync = cutoff;
            }
            SyncStateManager.SaveState(syncState);
        }
        else
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine($"  [ERROR] Fallo al enviar inventario baseline. Código HTTP: {response.StatusCode}");
            Console.ResetColor();
            _logger.LogWarning("Failed to post inventory baseline. Status code: {StatusCode}", response.StatusCode);
        }
    }
}
