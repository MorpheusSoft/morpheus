using MorpheusSyncAgent.Workers;

namespace MorpheusSyncAgent;

public class Program
{
    public static async Task Main(string[] args)
    {
        AppContext.SetSwitch("Switch.Microsoft.Data.SqlClient.UseManagedNetworkingOnWindows", true);

        string? runName = null;
        string? date = null;
        string? desc = null;
        string? fromStr = null;
        string? toStr = null;
        string? monthsStr = null;
        string? batchSizeStr = null;

        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "--run" && i + 1 < args.Length)
            {
                runName = args[i + 1];
                i++;
            }
            else if (args[i] == "--date" && i + 1 < args.Length)
            {
                date = args[i + 1];
                i++;
            }
            else if (args[i] == "--desc" && i + 1 < args.Length)
            {
                desc = args[i + 1];
                i++;
            }
            else if (args[i] == "--from" && i + 1 < args.Length)
            {
                fromStr = args[i + 1];
                i++;
            }
            else if (args[i] == "--to" && i + 1 < args.Length)
            {
                toStr = args[i + 1];
                i++;
            }
            else if (args[i] == "--months" && i + 1 < args.Length)
            {
                monthsStr = args[i + 1];
                i++;
            }
            else if (args[i] == "--batch-size" && i + 1 < args.Length)
            {
                batchSizeStr = args[i + 1];
                i++;
            }
        }

        var builder = Host.CreateApplicationBuilder(args);

        // Configuración para que funcione como Windows Service
        builder.Services.AddWindowsService(options =>
        {
            options.ServiceName = "NeoAgentSync";
        });

        // Configuración para que funcione como Daemon en Linux (Systemd)
        builder.Services.AddSystemd();

        // HttpClient para los extractores directos
        builder.Services.AddHttpClient();

        if (!string.IsNullOrEmpty(runName))
        {
            // Register workers as transient for direct resolution
            builder.Services.AddTransient<CategoryExtractorWorker>();
            builder.Services.AddTransient<InventoryBaselineWorker>();
            builder.Services.AddTransient<SuppliersExtractorWorker>();
            builder.Services.AddTransient<ProductMasterExtractorWorker>();
            builder.Services.AddTransient<ProductBarcodesExtractorWorker>();
            builder.Services.AddTransient<InventoryMovementsWorker>();
            builder.Services.AddTransient<SalesExtractorWorker>();
            builder.Services.AddTransient<SupplierProductsExtractorWorker>();
            builder.Services.AddTransient<HeartbeatWorker>();
            
            var host = builder.Build();
            
            try
            {
                if (runName.Equals("categories", StringComparison.OrdinalIgnoreCase))
                {
                    var worker = host.Services.GetRequiredService<CategoryExtractorWorker>();
                    await worker.RunOnceAsync();
                }
                else if (runName.Equals("baseline", StringComparison.OrdinalIgnoreCase))
                {
                    var worker = host.Services.GetRequiredService<InventoryBaselineWorker>();
                    await worker.RunOnceAsync(date, desc);
                }
                else if (runName.Equals("suppliers", StringComparison.OrdinalIgnoreCase))
                {
                    var worker = host.Services.GetRequiredService<SuppliersExtractorWorker>();
                    await worker.RunOnceAsync();
                }
                else if (runName.Equals("products", StringComparison.OrdinalIgnoreCase))
                {
                    var worker = host.Services.GetRequiredService<ProductMasterExtractorWorker>();
                    await worker.RunOnceAsync();
                }
                else if (runName.Equals("barcodes", StringComparison.OrdinalIgnoreCase))
                {
                    var worker = host.Services.GetRequiredService<ProductBarcodesExtractorWorker>();
                    await worker.RunOnceAsync();
                }
                else if (runName.Equals("movements", StringComparison.OrdinalIgnoreCase))
                {
                    var worker = host.Services.GetRequiredService<InventoryMovementsWorker>();
                    await worker.RunOnceAsync();
                }
                else if (runName.Equals("sales", StringComparison.OrdinalIgnoreCase))
                {
                    var worker = host.Services.GetRequiredService<SalesExtractorWorker>();
                    
                    int batch = 500;
                    if (!string.IsNullOrEmpty(batchSizeStr) && int.TryParse(batchSizeStr, out int b) && b > 0)
                    {
                        batch = b;
                    }

                    DateTime? fromDt = null;
                    DateTime? toDt = null;

                    if (!string.IsNullOrEmpty(fromStr) && DateTime.TryParse(fromStr, out DateTime f)) fromDt = f;
                    if (!string.IsNullOrEmpty(toStr) && DateTime.TryParse(toStr, out DateTime t)) toDt = t;
                    
                    if (!fromDt.HasValue && !string.IsNullOrEmpty(monthsStr) && int.TryParse(monthsStr, out int m) && m > 0)
                    {
                        fromDt = DateTime.Today.AddMonths(-m);
                        toDt = DateTime.Now;
                    }

                    if (fromDt.HasValue)
                    {
                        var targetTo = toDt ?? DateTime.Now;
                        await worker.RunHistoricalAsync(fromDt.Value, targetTo, batch);
                    }
                    else
                    {
                        // Por defecto si no se especifican fechas: últimos 3 meses
                        await worker.RunHistoricalAsync(DateTime.Today.AddMonths(-3), DateTime.Now, batch);
                    }
                }
                else if (runName.Equals("supplier-products", StringComparison.OrdinalIgnoreCase))
                {
                    var worker = host.Services.GetRequiredService<SupplierProductsExtractorWorker>();
                    await worker.RunOnceAsync();
                }
                else
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine($"[ERROR] Extractor desconocido: '{runName}'");
                    Console.ResetColor();
                }
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine($"\n[ERROR CRITICO DURANTE LA EJECUCION]:");
                Console.WriteLine(ex.Message);
                Console.WriteLine(ex.ToString());
                Console.ResetColor();
            }

            Environment.Exit(0);
        }
        else
        {
            // Registrar instancias Singleton para que HeartbeatWorker pueda invocarlas remotamente
            builder.Services.AddSingleton<SalesExtractorWorker>();
            builder.Services.AddSingleton<ProductMasterExtractorWorker>();
            builder.Services.AddSingleton<ProductBarcodesExtractorWorker>();
            builder.Services.AddSingleton<InventoryMovementsWorker>();
            builder.Services.AddSingleton<SupplierProductsExtractorWorker>();
            builder.Services.AddSingleton<SuppliersExtractorWorker>();
            builder.Services.AddSingleton<CategoryExtractorWorker>();
            builder.Services.AddSingleton<HeartbeatWorker>();

            builder.Services.AddHostedService(sp => sp.GetRequiredService<HeartbeatWorker>());
            builder.Services.AddHostedService(sp => sp.GetRequiredService<SalesExtractorWorker>());
            builder.Services.AddHostedService(sp => sp.GetRequiredService<ProductMasterExtractorWorker>());
            builder.Services.AddHostedService(sp => sp.GetRequiredService<ProductBarcodesExtractorWorker>());
            builder.Services.AddHostedService(sp => sp.GetRequiredService<InventoryMovementsWorker>());
            builder.Services.AddHostedService(sp => sp.GetRequiredService<SupplierProductsExtractorWorker>());
            builder.Services.AddHostedService(sp => sp.GetRequiredService<SuppliersExtractorWorker>());
            builder.Services.AddHostedService(sp => sp.GetRequiredService<CategoryExtractorWorker>());

            var host = builder.Build();
            host.Run();
        }
    }
}
