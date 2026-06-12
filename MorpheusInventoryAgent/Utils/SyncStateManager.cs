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

    public static SyncState LoadState()
    {
        try
        {
            if (File.Exists(StateFilePath))
            {
                var json = File.ReadAllText(StateFilePath);
                return JsonSerializer.Deserialize<SyncState>(json) ?? new SyncState();
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
            var json = JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(StateFilePath, json);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error saving state: {ex.Message}");
        }
    }
}
