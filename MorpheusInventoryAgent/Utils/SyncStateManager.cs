using System.Text.Json;

namespace MorpheusSyncAgent.Utils;

public class SyncState
{
    public DateTime LastProductSync { get; set; } = new DateTime(2000, 1, 1);
    public DateTime LastBarcodeSync { get; set; } = new DateTime(2000, 1, 1);
    public bool BaselineInventoryDone { get; set; } = false;
    public DateTime LastMovementSync { get; set; } = new DateTime(2000, 1, 1);
    public DateTime LastSalesSync { get; set; } = new DateTime(2000, 1, 1);
    public DateTime LastSupplierProductSync { get; set; } = new DateTime(2000, 1, 1);
}

public static class SyncStateManager
{
    private static readonly string StateFilePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "sync_state.json");
    private static readonly object _lock = new object();

    private static SyncState LoadStateInternal()
    {
        if (File.Exists(StateFilePath))
        {
            var json = File.ReadAllText(StateFilePath);
            return JsonSerializer.Deserialize<SyncState>(json) ?? new SyncState();
        }
        return new SyncState();
    }

    public static SyncState LoadState()
    {
        try
        {
            lock (_lock)
            {
                return LoadStateInternal();
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error loading state: {ex.Message}");
        }
        return new SyncState();
    }

    public static void SaveState(SyncState state)
    {
        try
        {
            lock (_lock)
            {
                // Cargar el estado más reciente del disco para no pisar
                // lo que otro hilo haya guardado mientras este hilo procesaba.
                var currentState = LoadStateInternal();
                
                // Actualizar inteligentemente solo los campos que avanzaron
                if (state.LastProductSync > currentState.LastProductSync) currentState.LastProductSync = state.LastProductSync;
                if (state.LastBarcodeSync > currentState.LastBarcodeSync) currentState.LastBarcodeSync = state.LastBarcodeSync;
                if (state.BaselineInventoryDone) currentState.BaselineInventoryDone = true;
                if (state.LastMovementSync > currentState.LastMovementSync) currentState.LastMovementSync = state.LastMovementSync;
                if (state.LastSalesSync > currentState.LastSalesSync) currentState.LastSalesSync = state.LastSalesSync;
                if (state.LastSupplierProductSync > currentState.LastSupplierProductSync) currentState.LastSupplierProductSync = state.LastSupplierProductSync;
                
                var json = JsonSerializer.Serialize(currentState, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(StateFilePath, json);
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error saving state: {ex.Message}");
        }
    }
}
