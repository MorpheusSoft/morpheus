# Plan de Implementación Consolidado: Neo ERP

Este documento define la ruta estricta de desarrollo técnico para integrar las reglas de negocio de Neo ERP detalladas en `business_rules_products.md`, `business_rules_purchases.md` y el diccionario principal `CORE_DATADICTIONARY.md`.

## FASE 1: Fundación de Base de Datos y Modelos (Backend)
Construcción de los esquemas relacionales (Prisma/SQLAlchemy) basados en el diseño en estrella y jerarquías físicas.

### 1.1 Módulo `Core` (Configuraciones y Terceros)
- **Settings (`core.system_settings`):** Crear modelo dictatorial de fila única para anclar la `system_currency_id` y las reglas matemáticas (`default_valuation_method`, `utility_calc_method`).
- **Compradores (`pur.buyers`):** Tabla enlazada a `Users`, con campos JSON (`assigned_categories`, `assigned_facilities`) para instaurar el filtro "Anti-Ruido Técnico".
- **Proveedores (`core.suppliers` y `core.supplier_banks`):** Extender con `lead_time_days`, `commercial_email` y correos financieros, incluyendo el anclaje de sus cuentas bancarias en diversas divisas.

### 1.2 Módulo `Inventory` (El Producto Multidimensional)
- **Maestro de Productos:** Adaptar `Product` agregando `currency_id` (para blindaje de costos) y `shrinkage_percent` (Merma Promedio).
- **Variantes & Empaques:**
  - `ProductVariant`: Base transaccional con JSON de atributos (Talla/Color).
  - **[NUEVO]** `ProductPackaging`: Esquema físico dimensional (Unidad -> Caja -> Bulto) con factores de conversión (`qty_per_unit`) y sus métricas obligatorias (`weight_kg`, `volume_m3`) para cálculo de fletes y espacio estiba CEDI.
- **Stock y Valorización Híbrida:**
  - `ProductFacilityPrice`: Maneja el Precio de Venta y la Utilidad Sugerida (`target_utility_pct`) según la sucursal.
  - `InventorySnapshot`: Cuadrante logístico con los 4 Costos Vivos (Promedio, Actual, Reposición, Anterior) por Variante + Tienda.
  - `StockMove` y `Batch`: Historial de operaciones (`historic_avg_cost` para auditar cómo evoluciona el promedio en el tiempo) y control matricial FIFO de caducidad.

### 1.3 Módulo `Purchasing` (Reposición Logística B2B)
- **Orden de Compra:** Modelos `PurchaseOrder` (cabeceras con `dest_facility_id` y `status`) y `PurchaseOrderLine` (renglón basado en el empaque logístico `pack_id`, convirtiendo internamente a la cantidad base).

---

## FASE 2: Lógica de Negocio y Servicios (Backend API)

### 2.1 Motores Constantes y Valorización
- **Recepción de Compras:** Al confirmar un ingreso logístico, rotar en `InventorySnapshot` el "Costo Actual" a "Anterior" y recalcular en caliente el "Promedio Ponderado Móvil".
- **Tracking PEPS Estricto:** Forzar deducción contable sobre el lote (`Batch`) más antiguo garantizando el costo real de aquel ingreso si el producto posee caducidad.

### 2.2 Algoritmo Preventivo de Compras (El Analista Silente)
- **Jobs Nocturnos (CRON):** `predictive_stock_job.js/py` iterando el inventario de cada Tienda. Si `Stock Real < (Run-Rate de ventas diario * Lead Time del Proveedor)`, instanciar automáticamente transacciones `PurchaseOrder` en estado `draft`.
- **Servicio Mailing Integrado (Zero Friction):** Conexión vía SDK comercial (SendGrid/SMTP) que procese el PDF de la ODC confirmada y la dispare con copia digital al correo `commercial_email` del proveedor transaccionando su estado a "Enviada".

---

## FASE 3: UI/UX Ficha del Producto (Frontend PrimeNG)
Transformaremos el componente de producto primitivo en un formulario ultra-nutrido a través de `p-tabView`, mitigando la parálisis visual:

1. **Tab 1 - Base y Finanzas:** Configuraciones estáticas, Nombre, Categoría, Moneda blindada, selector de Impuestos y un input numérico decisivo para el `% de Merma Standard`.
2. **Tab 2 - Empaques Físicos (Dimensional):** Matriz (p-table) para jerarquizar Padre-Hijo (Caja de 12, Bulto de 24) exigiendo en vivo el Peso en Kg y Volumen en M3.
3. **Tab 3 - Matriz de SKU (Variantes):** Generador inteligente de combinaciones paramétricas (Tallas/Colores) ligadas a los códigos EAN principales.
4. **Tab 4 - Rentabilidad por Tienda:** Tabla vital que cruza `sales_price` vs `[Costo Configurado en Sistema]` resultando en dos columnas protegidas (Calculadas en Vivo): **% Utilidad Normal** y **% Utilidad absorbiendo Merma**.
5. **Tab 5 - Auditoría y Lotes:** Switcheo de trazabilidad (Lotes Vencidos PEPS) y Componente solo-lectura listando las últimas facturas (`StockMove` con el tracking del Proveedor).

---

## FASE 4: UI/UX Módulo de Compras (Gestión y Asistente)

### 4.1 Ficha Focalizada del Comprador
- Al iniciar sesión, el Dashboard lee el rol `Buyer` (`assigned_categories`) y muta toda la pantalla para que el Comprador de Víveres no reciba, ni por error, indicadores de "Stock Bajo" de Ferretería (Zero Noise UX).

### 4.2 Bot de Quiebres y Repositor Pre-masticado
- Modal tipo "Canasta B2B" con los pre-borradores nocturnos. El comprador humano visualiza y engrandece la sugerencia con botones incrementales `+1 Bulto`. El UI/UX transforma mágicamente el "Bulto" a Unidades en la capa visual.
- Finaliza con un único CTA (Botón Primario): `"Aprobar y Enviar (Integración Proveedor)"`, sin obligar al usuario a descargar documentos localmente o interactuar con un cliente de correos ajeno.
