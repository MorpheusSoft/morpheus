
using MorpheusSyncAgent.Workers;

namespace MorpheusSyncAgent;

public class Program
{
    public static void Main(string[] args)
    {
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

        // Registrar los Workers (Hilos de fondo) exclusivos para Morpheus/Stellar
        builder.Services.AddHostedService<ProductMasterExtractorWorker>();
        builder.Services.AddHostedService<ProductBarcodesExtractorWorker>();
        builder.Services.AddHostedService<InventoryBaselineWorker>();
        builder.Services.AddHostedService<InventoryMovementsWorker>();
        builder.Services.AddHostedService<SalesExtractorWorker>();
        builder.Services.AddHostedService<SupplierProductsExtractorWorker>();

        var host = builder.Build();
        host.Run();
    }
}
