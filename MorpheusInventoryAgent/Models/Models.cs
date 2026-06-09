namespace MorpheusSyncAgent.Models;

public class OutboxMessage
{
    public int Id { get; set; }
    public string DestinationTable { get; set; } = string.Empty;
    public string PrimaryKeys { get; set; } = string.Empty;
    public string Status { get; set; } = "PENDIENTE";
    public int RetryCount { get; set; } = 0;
    public string Payload { get; set; } = string.Empty;
    public string PreSyncQuery { get; set; } = string.Empty;
    public string EndpointUrl { get; set; } = string.Empty;
    public string HttpMethod { get; set; } = "POST";
    public string AuthHeaders { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class LocalTaskConfig
{
    public string TaskId { get; set; } = string.Empty;
    public string TaskName { get; set; } = string.Empty;
    public string Server { get; set; } = string.Empty;
    public string Frequency { get; set; } = string.Empty;
    public string SqlStatement { get; set; } = string.Empty;
    public string DestinationTable { get; set; } = string.Empty;
    public string PrimaryKeys { get; set; } = string.Empty;
    public int Status { get; set; }
    public string DbName { get; set; } = string.Empty;
    public string DeleteStatement { get; set; } = string.Empty;
    
    public string EndpointUrl { get; set; } = string.Empty;
    public string HttpMethod { get; set; } = "POST";
    public string AuthHeaders { get; set; } = string.Empty;
    public int BatchSize { get; set; } = 1000;
}
