# Análisis de los Módulos del Sistema Morpheus

El sistema gestiona el flujo completo de la cadena de suministro, integrando de forma cohesiva los módulos de Compras, Logística, Inventario y Costos/Precios. A continuación se detalla la arquitectura, modelos y el flujo de proceso de cada uno de ellos, basándonos en la estructura interna de la base de datos y la API.

---

## 1. Módulo de Compras (Purchasing)
**Objetivo:** Gestionar la adquisición de productos a proveedores, la negociación financiera, la interacción directa con el proveedor y la conciliación final.

### Estructura y Flujo:
- **Órdenes de Compra:** Gestionadas mediante `PurchaseOrder` y `PurchaseOrderLine`. Atraviesan un ciclo de vida definido (`draft`, `approved`, `sent`, `viewed`, `confirmed`, `received`). Soportan múltiples monedas y tasas de cambio para compras internacionales.
- **Interacción con Proveedores:** El sistema incluye un esquema seguro sin inicio de sesión (mediante `secure_token` y `public_token`). Los proveedores pueden visualizar y aceptar órdenes registrando trazabilidad de lectura (`seen_by_supplier_at`) y la IP desde donde aceptaron (`supplier_ip_accepted`).
- **Negociación Logística y Financiera:** Las líneas y la orden general permiten esquemas de descuentos complejos en formato string (Ej. `10+5`) para escalar a futuro, y permiten autorizar entregas parciales (`allow_partial_deliveries`).
- **Conciliación (3-Way Match):** En las fases de recepción y auditoría, el sistema contrasta los datos de la factura (`invoice_number`, `invoice_date`) con las cantidades e importes realmente facturados (`billed_qty`, `billed_unit_cost`) versus lo recibido.
- **Automatización (MRP Bot):** Existe un proceso interno (`MRPBotLog`) diseñado para calcular requerimientos de reabastecimiento e inyectar órdenes de forma automática o sugerida basado en históricos.

---

## 2. Módulo de Logística (WMS / Movements)
**Objetivo:** Controlar y trazar todos los movimientos físicos de la mercancía, recepciones de compras y transferencias entre almacenes.

### Estructura y Flujo:
- **Agrupadores Operativos (`StockPicking`):** Representan un documento logístico (recepción, envío, transferencia) basado en tipos de operación (`StockPickingType`) que configuran secuencias de origen y destino por defecto.
- **Movimientos de Detalle (`StockMove`):** Representan el traslado de una cantidad de un SKU específico de una ubicación origen a otra destino. Mantienen estados (Borrador, Hecho) y diferencian entre cantidad esperada/demandada (`quantity_demand`) y ejecutada (`quantity_done`).
- **Recepción en Muelles (Dock Staging):** Los almacenes soportan configuraciones (`requires_dock_staging`) donde la mercancía que ingresa debe llegar primero a una zona de muelle (`default_dock_location_id`) antes de ser ubicada definitivamente en los racks.
- **Trazabilidad:** Cada movimiento congela el costo unitario, el lote y el proveedor asociado, garantizando que el historial de inventario pueda auditarse financieramente y rastrearse a nivel de lote/vencimiento.

---

## 3. Módulo de Inventario
**Objetivo:** Gestionar el control físico del stock real, la estructura de almacenamiento y las auditorías de recuento físico.

### Estructura y Flujo:
- **Estructura Jerárquica:** Organizado en Instalaciones > Almacenes (`Warehouse`) > Ubicaciones (`Location`). Las ubicaciones pueden anidarse (Pasillo > Estante) y controlan capacidades volumétricas e interbloqueos.
- **Maestro de Artículos:** Soportan categorías jerárquicas, productos (`Product`) y variantes o SKUs (`ProductVariant`). Manejan empaques equivalentes (`ProductPackaging`) para medir peso y volumen, vital para logística, y controlan códigos de barra dinámicos.
- **Control de Lotes y Trazabilidad (`Batch`):** Soporta número de lote, fecha de fabricación, fecha de vencimiento y estado de cuarentena (`is_quarantined`).
- **Saldos en Tiempo Real (`InventorySnapshot`):** Esta tabla funciona como una vista materializada para conocer el inventario actual (`stock_qty`) por variante, instalación y lote. Facilita las consultas rápidas y almacena datos de punto de reorden (`safety_stock`, `run_rate`).
- **Inventario Físico (Auditoría):** Las sesiones (`InventorySession`) permiten auditorías por recuento (Global, Almacén, Ubicación, Categoría). Las líneas comparan la cantidad teórica del sistema (`theoretical_qty`) con la contada por el operador (`counted_qty`), calculando la diferencia a nivel de base de datos para generar los ajustes correspondientes.

---

## 4. Módulo de Costo y Precio (Pricing Engine)
**Objetivo:** Gestionar la valoración financiera del inventario y las estrategias de cálculo de precios de venta finales.

### Estructura y Flujo:
- **Valoración de Costos:** Se configura por variante (`costing_method`), típicamente usando `AVERAGE` (Costo Promedio Ponderado) o Estándar. El sistema rastrea de forma simultánea el costo promedio, último costo de compra y costo de reposición.
- **Precios Diferenciados (`ProductFacilityPrice`):** Permite establecer precios y promociones separados por cada sucursal/instalación. Se pueden calcular base a un porcentaje de margen/utilidad esperado (`target_utility_pct`) sobre el costo.
- **Sesiones de Actualización de Precios (`PricingSession`):** Un motor masivo para simular y aplicar cambios de costo o precio. Soportan la entrada de datos manual, importaciones CSV o la ingesta asistida por IA (procesamiento de listas de PDF de proveedores). Las líneas proponen un costo/precio nuevo y mantienen el anterior para aprobación antes de impactar el sistema.
- **Promociones Dinámicas (`PromotionCampaign`):** Un motor de descuentos por periodos específicos que aplican reducciones porcentuales o de monto fijo a grupos de productos, inyectando temporalmente el `promo_price` en los recintos.

---

> [!NOTE] 
> Todo el diseño base está preparado para soportar entornos multimoneda de forma nativa. Existen identificadores de moneda en productos, variantes, listas de precios de proveedores y órdenes de compra, lo que refleja que el costo se convierte dinámicamente frente a las tasas de cambio o se mantiene fijo en moneda fuerte.
