
using MorpheusSyncAgent.Workers;

namespace MorpheusSyncAgent;

public class Program
{
    public static async Task Main(string[] args)
    {
        string? runName = null;
        string? date = null;
        string? desc = null;

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
        }

        var builder = Host.CreateApplicationBuilder(args);

        // Configuración para que funcione como Windows Service
        builder.Services.AddWindowsService(options =>
        {
            options.ServiceName = "MorpheusSyncAgent";
        });

        // Configuración para que funcione como Daemon en Linux (Systemd)
        builder.Services.AddSystemd();

        // HttpClient para los extractores directos
        builder.Services.AddHttpClient();

        if (!string.IsNullOrEmpty(runName))
        {
            // Register workers as transient for direct resolution
            builder.Services.AddTransient<InventoryBaselineWorker>();
            builder.Services.AddTransient<SuppliersExtractorWorker>();
            builder.Services.AddTransient<ProductMasterExtractorWorker>();
            builder.Services.AddTransient<ProductBarcodesExtractorWorker>();
            builder.Services.AddTransient<InventoryMovementsWorker>();
            builder.Services.AddTransient<SalesExtractorWorker>();
            builder.Services.AddTransient<SupplierProductsExtractorWorker>();
            
            var host = builder.Build();
            
            if (runName.Equals("baseline", StringComparison.OrdinalIgnoreCase))
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
                await worker.RunOnceAsync();
            }
            else if (runName.Equals("supplier-products", StringComparison.OrdinalIgnoreCase))
            {
                var worker = host.Services.GetRequiredService<SupplierProductsExtractorWorker>();
                await worker.RunOnceAsync();
            }
            else
            {
                Console.WriteLine($"Unknown extractor: {runName}");
            }
            
            Environment.Exit(0);
        }
        else
        {
            // Registrar los Workers (Hilos de fondo) exclusivos para Morpheus/Stellar
            builder.Services.AddHostedService<ProductMasterExtractorWorker>();
            builder.Services.AddHostedService<ProductBarcodesExtractorWorker>();
            // Removed: builder.Services.AddHostedService<InventoryBaselineWorker>();
            builder.Services.AddHostedService<InventoryMovementsWorker>();
            builder.Services.AddHostedService<SalesExtractorWorker>();
            builder.Services.AddHostedService<SupplierProductsExtractorWorker>();
            builder.Services.AddHostedService<SuppliersExtractorWorker>();

            var host = builder.Build();
            host.Run();
        }
    }
}
