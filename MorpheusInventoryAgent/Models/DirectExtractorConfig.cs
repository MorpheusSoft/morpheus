namespace MorpheusSyncAgent.Models;

public enum ExportMode
{
    OnlyWithStock,
    StockZeroAndAbove,
    AllMaster
}

public class DirectExtractorConfig
{
    public bool Enabled { get; set; }
    public int IntervalMinutes { get; set; }
    public string TargetApiUrl { get; set; } = string.Empty;
    public ExportMode ExportMode { get; set; }
}
