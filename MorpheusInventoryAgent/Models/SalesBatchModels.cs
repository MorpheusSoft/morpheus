using System.Text.Json.Serialization;

namespace MorpheusSyncAgent.Models;

public class SalesBatchLineDto
{
    [JsonPropertyName("sku_code")]
    public string SkuCode { get; set; } = string.Empty;

    [JsonPropertyName("quantity")]
    public decimal Quantity { get; set; }

    [JsonPropertyName("unit_price")]
    public decimal UnitPrice { get; set; }

    [JsonPropertyName("subtotal")]
    public decimal Subtotal { get; set; }

    [JsonPropertyName("tax_amount")]
    public decimal TaxAmount { get; set; }

    [JsonPropertyName("total")]
    public decimal Total { get; set; }

    [JsonPropertyName("deposit_code")]
    public string DepositCode { get; set; } = "01";

    [JsonPropertyName("description")]
    public string? Description { get; set; }
}

public class SalesBatchDocumentDto
{
    [JsonPropertyName("facility_id")]
    public int FacilityId { get; set; } = 1;

    [JsonPropertyName("facility_code")]
    public string? FacilityCode { get; set; }

    [JsonPropertyName("register_code")]
    public string RegisterCode { get; set; } = "01";

    [JsonPropertyName("document_number")]
    public string DocumentNumber { get; set; } = string.Empty;

    [JsonPropertyName("doc_type")]
    public string DocType { get; set; } = "FAC";

    [JsonPropertyName("doc_date")]
    public string DocDate { get; set; } = string.Empty;

    [JsonPropertyName("customer_tax_id")]
    public string CustomerTaxId { get; set; } = "J-000000000";

    [JsonPropertyName("customer_name")]
    public string CustomerName { get; set; } = "Cliente Contado";

    [JsonPropertyName("subtotal")]
    public decimal Subtotal { get; set; }

    [JsonPropertyName("tax_amount")]
    public decimal TaxAmount { get; set; }

    [JsonPropertyName("total_amount")]
    public decimal TotalAmount { get; set; }

    [JsonPropertyName("fiscal_number")]
    public string? FiscalNumber { get; set; }

    [JsonPropertyName("fiscal_serial")]
    public string? FiscalSerial { get; set; }

    [JsonPropertyName("lines")]
    public List<SalesBatchLineDto> Lines { get; set; } = new();
}

public class SalesBatchPayloadDto
{
    [JsonPropertyName("is_historical")]
    public bool IsHistorical { get; set; }

    [JsonPropertyName("documents")]
    public List<SalesBatchDocumentDto> Documents { get; set; } = new();
}

public class StoreSyncTelemetryDto
{
    [JsonPropertyName("facility_id")]
    public int FacilityId { get; set; } = 1;

    [JsonPropertyName("register_code")]
    public string RegisterCode { get; set; } = "01";

    [JsonPropertyName("agent_version")]
    public string AgentVersion { get; set; } = "2.0.0-neo";

    [JsonPropertyName("machine_name")]
    public string MachineName { get; set; } = string.Empty;

    [JsonPropertyName("sql_server_status")]
    public string SqlServerStatus { get; set; } = "CONNECTED";

    [JsonPropertyName("last_stellar_sale_time")]
    public DateTime? LastStellarSaleTime { get; set; }

    [JsonPropertyName("last_synced_sale_time")]
    public DateTime? LastSyncedSaleTime { get; set; }

    [JsonPropertyName("sales_today_count")]
    public int SalesTodayCount { get; set; }

    [JsonPropertyName("sales_today_amount")]
    public decimal SalesTodayAmount { get; set; }

    [JsonPropertyName("pending_queue_count")]
    public int PendingQueueCount { get; set; }

    [JsonPropertyName("lag_minutes")]
    public int LagMinutes { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = "HEALTHY";

    [JsonPropertyName("error_details")]
    public string? ErrorDetails { get; set; }
}

public class HistorySyncState
{
    public DateTime StartDate { get; set; }
    public DateTime TargetDate { get; set; }
    public DateTime CurrentCheckpoint { get; set; }
    public int TotalDocumentsSynced { get; set; }
    public bool IsCompleted { get; set; }
}

public class RemoteAgentConfigDto
{
    [JsonPropertyName("version")]
    public int Version { get; set; } = 1;

    [JsonPropertyName("sales_interval_minutes")]
    public int SalesIntervalMinutes { get; set; } = 5;

    [JsonPropertyName("sales_batch_size")]
    public int SalesBatchSize { get; set; } = 500;

    [JsonPropertyName("heartbeat_interval_seconds")]
    public int HeartbeatIntervalSeconds { get; set; } = 60;

    [JsonPropertyName("sales_enabled")]
    public bool SalesEnabled { get; set; } = true;

    [JsonPropertyName("products_enabled")]
    public bool ProductsEnabled { get; set; } = true;

    [JsonPropertyName("barcodes_enabled")]
    public bool BarcodesEnabled { get; set; } = true;

    [JsonPropertyName("categories_enabled")]
    public bool CategoriesEnabled { get; set; } = true;

    [JsonPropertyName("suppliers_enabled")]
    public bool SuppliersEnabled { get; set; } = true;

    [JsonPropertyName("supplier_products_enabled")]
    public bool SupplierProductsEnabled { get; set; } = true;

    [JsonPropertyName("movements_enabled")]
    public bool MovementsEnabled { get; set; } = true;
}

public class StoreAgentCommandDto
{
    [JsonPropertyName("id")]
    public long Id { get; set; }

    [JsonPropertyName("command_type")]
    public string CommandType { get; set; } = string.Empty;

    [JsonPropertyName("parameters")]
    public System.Text.Json.JsonElement Parameters { get; set; }
}

public class HeartbeatResponseDto
{
    [JsonPropertyName("status")]
    public string Status { get; set; } = "OK";

    [JsonPropertyName("server_time")]
    public string ServerTime { get; set; } = string.Empty;

    [JsonPropertyName("received_facility_id")]
    public int ReceivedFacilityId { get; set; }

    [JsonPropertyName("config")]
    public RemoteAgentConfigDto? Config { get; set; }

    [JsonPropertyName("commands")]
    public List<StoreAgentCommandDto>? Commands { get; set; }
}

public class CommandAckDto
{
    [JsonPropertyName("status")]
    public string Status { get; set; } = "COMPLETED";

    [JsonPropertyName("result_details")]
    public object? ResultDetails { get; set; }

    [JsonPropertyName("error_message")]
    public string? ErrorMessage { get; set; }
}
