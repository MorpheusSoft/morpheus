# Diccionario de Datos - Núcleo (Core)

El esquema `core` contiene las tablas transversales que son utilizadas por todos los módulos del ERP (Inventario, Ventas, RRHH, Finanzas).

## 1. Organización

### 1.1 Tabla: `core.companies` (Empresas)
Representa la entidad legal o razón social. El sistema es multi-empresa.

| Campo | Tipo | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | INT | PK, Auto-incr | Identificador único. |
| `name` | VARCHAR | Not Null | Razón Social (ej: "Mi Empresa S.A."). |
| `tax_id` | VARCHAR | Unique | Identificador Fiscal (ej: RFC, RIF, NIT). |
| `currency_id` | INT | FK -> `core.currencies.id` | Moneda base contable de la empresa. |
| `is_active` | BOOLEAN | Default TRUE | . |

### 1.2 Tabla: `core.facilities` (Sedes / Sucursales)
Lugares físicos o lógicos donde opera la empresa.

| Campo | Tipo | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | INT | PK, Auto-incr | Identificador de la sede. |
| `company_id` | INT | FK -> `core.companies.id` | Empresa a la que pertenece. |
| `name` | VARCHAR | Not Null | Nombre de la sucursal (ej: "Sucursal Centro"). |
| `code` | VARCHAR | Unique | Código corto (ej: "MTY-01"). |
| `address` | VARCHAR | Nullable | Dirección física. |
| `currency_id` | INT | FK -> `core.currencies.id` | Moneda de operación de esta sede (puede diferir de la empresa). |
| `is_active` | BOOLEAN | Default TRUE | . |

## 2. Configuración Global

### 2.1 Tabla: `core.currencies` (Monedas)
Catálogo de monedas manejadas por el sistema (ISO 4217).

| Campo | Tipo | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | INT | PK, Auto-incr | Identificador. |
| `code` | VARCHAR(3) | Unique, Not Null | Código ISO (ej: "USD", "MXN", "VES"). |
| `name` | VARCHAR | Not Null | Nombre (ej: "Dólar Americano"). |
| `symbol` | VARCHAR(5) | Not Null | Símbolo visual (ej: "$", "€", "Bs."). |
| `exchange_rate` | DECIMAL | Default 1.0 | Tasa de cambio referencial respecto a la moneda base del sistema. |
| `is_active` | BOOLEAN | Default TRUE | . |

### 2.2 Tabla: `core.users` (Usuarios)
Usuarios que acceden al sistema.

| Campo | Tipo | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | INT | PK, Auto-incr | Identificador. |
| `email` | VARCHAR | Unique, Not Null | Correo electrónico (Login). |
| `hashed_password` | VARCHAR | Not Null | Contraseña encriptada. |
| `full_name` | VARCHAR | Nullable | Nombre completo. |
| `is_active` | BOOLEAN | Default TRUE | Permite acceso. |
| `is_superuser` | BOOLEAN | Default FALSE | Acceso total. |

### 2.3 Tabla: `core.system_settings` (Parámetros y Configuración Global)
Tabla de configuración de fila única (Single Row) o de clave-valor que rige el comportamiento de todos los módulos del ERP en cuanto a divisas y matemáticas numéricas.

| Campo | Tipo | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | INT | PK, Auto-incr | Identificador. (Generalmente se usa la fila `id=1`). |
| `system_currency_id` | INT | FK -> `core.currencies.id`| Moneda Sistema. Moneda dura o base referencial general (opcional o de libre decisión). |
| `country_currency_id`| INT | FK -> `core.currencies.id`| Moneda del País (ej: Bolívares). Usada en todas las declaraciones de tributos, facturación formal y compras al margen de la ley. |
| `cost_base_for_price`| VARCHAR | Not Null | Costo predeterminado de los 4 posibles (`current`, `average`, `prev`, `replacement`) usado para formular precios. |
| `utility_calc_method`| VARCHAR | Not Null | Método de cálculo global. Opciones enum: `margin_on_sales` o `simple_percentage`. |
| `default_valuation_method`| VARCHAR | Not Null | Método de valorización contable predeterminado para el inventario (Ej: `weighted_average`, `fifo`). |

## 3. Terceros, Compradores y Entidades (Neo ERP)

### 3.1 Tabla: `core.suppliers` (Proveedores)
Maestro inteligente indispensable para reponer, pagar y facturar.

| Campo | Tipo | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | INT | PK, Auto-incr | Identificador del proveedor. |
| `company_id` | INT | FK -> `core.companies(id)`| Empresa (tenant) a la que pertenece. |
| `tax_id` | VARCHAR | Unique, Not Null | Identificador Fiscal (RFC, RIF, etc.). |
| `name` | VARCHAR | Not Null | Razón social o nombre comercial. |
| `commercial_email`| VARCHAR | Nullable | Correo destino para envío automatizado de ODC desde Neo. |
| `financial_email` | VARCHAR | Nullable | Correo destino reservado para comprobantes de retenciones y avisos de pago. |
| `lead_time_days`| INT | Default 0 | Tiempo promedio histórico (en días) que tarda el proveedor en traer la mercancía. |
| `is_active` | BOOLEAN | Default TRUE | Estado operativo. |

### 3.2 Tabla: `core.supplier_banks` (Cuentas Financieras de Terceros)
Agrupa todo destino transaccional para cruces directos operativos de tesorería y programación de pagos.

| Campo | Tipo | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | INT | PK, Auto-incr | Identificador de cuenta. |
| `supplier_id` | INT | FK -> `core.suppliers.id`| Proveedor dueño de base de la cuenta. |
| `bank_name` | VARCHAR | Not Null | Nombre de la entidad (Ej: Banesco, Mercantil, BofA). |
| `account_number`| VARCHAR | Not Null | Número, Clave, Interbancaria o IBAN. |
| `currency_id` | INT | FK -> `core.currencies.id`| Moneda dictada y obligatoria para este conducto de pago. |

### 3.3 Tabla: `pur.buyers` (Perfiles Analíticos y Segmentación de Compradores)
Divide responsabilidades y jurisdicciones para evitar que múltiples analistas generen compras o alertas duplicadas.

| Campo | Tipo | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | INT | PK, Auto-incr | Identificador. |
| `user_id` | INT | FK -> `core.users.id`| Usuario loggeado que se asume funcionalmente como perfil comprador. |
| `assigned_categories`| JSONB | Nullable | Matriz de IDs de categorías (Ej: [1,4]) para esconder el ruido visual. |
| `assigned_facilities`| JSONB | Nullable | Matriz de Instalaciones/Tiendas o CEDI en donde la vista de reposición se enfoca. |

## 4. Inventario y Módulo de Productos (Reglas Modelo Estrella Neo ERP)
Esta sección define las tablas teóricas proyectadas para cumplir con las nuevas reglas de negocio de productos (Variantes, Lotes, Impuestos y 4 costos por localidad), sin mezclarlos en la tabla maestra.

### 4.1 Tabla Teórica: `inv.products` (Producto Maestro / Plantilla)
Guarda **únicamente** la información estática del producto genérico. Todo costo, precio y stock se maneja en las Variantes ("SKUs").

| Campo | Tipo | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | INT | PK, Auto-incr | **Código Principal Autogenerado** e inmutable. |
| `category_id` | INT | FK -> `inv.categories`| Categoría a la que pertenece (Ej. "Licores", "Zapatos"). |
| `currency_id` | INT | FK -> `core.currencies(id)`| Moneda base a la que está asociado y valorizado el producto. |
| `name` | VARCHAR | Not Null | Denominación comercial genérica (Ej. "Zapato Nine 2525"). |
| `tax_amount` | DECIMAL | Default 0.0 | Monto especial impositivo asociado por categoría. |
| `shrinkage_percent`| DECIMAL | Default 0.0 | Porcentaje de merma o pérdida conocida del producto (`0 a 100%`). |
| `is_liquor` | BOOLEAN | Default FALSE | Marca fiscal para productos que son bebidas alcohólicas.|

### 4.2 Tabla Teórica: `inv.product_variants` (Variantes / SKU)
Rige el nivel real del inventario. Representa la combinación específica de atributos de un producto maestro.

| Campo | Tipo | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | INT | PK, Auto-incr | Identificador de la Variante (SKU). |
| `product_id` | INT | FK -> `inv.products` | Producto Maestro al que pertenece. |
| `attributes` | JSONB | Nullable | Diccionario de atributos (Ej. `{"Talla": "40", "Color": "Azul"}`). |

### 4.3 Tabla Teórica: `inv.product_codes` (Códigos Auxiliares)
Asigna códigos de barras al SKU (Variante) específico.

| Campo | Tipo | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | INT | PK, Auto-incr | Identificador del registro. |
| `variant_id` | INT | FK -> `inv.product_variants`| Relación indisoluble a la variante específica. |
| `code` | VARCHAR | Unique, Not Null | Código de cajón o escaneable (ej. EAN 750100234567). |
| `code_type` | VARCHAR | Nullable | Opcional: Tipo de código (UPC, Interno, Proveedor). |

### 4.4 Tabla Teórica: `inv.batches` (Lotes y Vencimientos)
Para productos perecederos o regulados. Una variante puede tener múltiples lotes.

| Campo | Tipo | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | INT | PK, Auto-incr | Identificador del lote. |
| `variant_id` | INT | FK -> `inv.product_variants`| Variante a la que pertenece este lote. |
| `batch_number`| VARCHAR | Not Null | Código alfanumérico impreso en el lote exterior. |
| `expiry_date` | DATE | Nullable | Fecha de caducidad. |

### 4.5 Tabla Teórica: `inv.product_prices` (Múltiples Precios de Venta)
Gestiona que cada Sucursal (Localidad) cobre un valor distinto por el mismo SKU.

*Implementación de Utilidad y Merma (Cálculo Dinámico)*
No es necesario almacenar rígidamente la utilidad (valor total o %), sino calcularla en tiempo de ejecución o de guardado interactuando con los costos (`inv.inventory_snapshot`):
- **% Utilidad Normal:** Se obtiene calculando `( (Precio Base - Costo Actual) / Precio Base ) * 100` o sobre el costo según estándar contable del cliente.
- **% Utilidad con Merma:** Se ajusta el costo asumiendo la merma extraída del producto: `Costo Ajustado = Costo Actual / (1 - (shrinkage_percent / 100))`. Conducir el cálculo anterior empleando este nuevo "Costo Ajustado".

| Campo | Tipo | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `variant_id` | INT | PK, FK -> `inv.product_variants`| Variante/SKU específico. |
| `facility_id` | INT | PK, FK -> `core.facilities`| Sucursal/Localidad en cuestión. |
| `sales_price` | DECIMAL | Not Null | Precio Base (Sin impuestos) para esta sucursal. |
| `target_utility_pct`| DECIMAL | Nullable | Porcentaje de utilidad esperado sugerido (Opcional, de referencia). |

### 4.6 Tabla Teórica: `inv.inventory_snapshot` (Foto Constante del Inventario)
Contiene la intersección de *Variante + Localidad + (Lote Opcional)*. Actualizada automáticamente con los ingresos para mantener listos los **4 Costos Clave** y el subtotal de existencias.

| Campo | Tipo | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `variant_id` | INT | PK, FK -> `inv.product_variants`| Variante o SKU específico. |
| `facility_id` | INT | PK, FK -> `core.facilities`| Localidad a la que conciernen estos costos y stock. |
| `batch_id` | INT | FK -> `inv.batches` | *(Opcional)* Si la mercancía está separada por lote. |
| `stock_qty` | DECIMAL | Default 0.0 | Cantidad real actual almacenada. |
| `avg_cost` | DECIMAL | Default 0.0 | **Costo Promedio**: Matemático ponderado actual. |
| `current_cost`| DECIMAL | Default 0.0 | **Costo Actual**: Dictado por la última factura recibida. |
| `prev_cost` | DECIMAL | Default 0.0 | **Costo Anterior**: Reserva contable del costo previo a la última entrada. |
| `safety_stock`| DECIMAL | Default 0.0 | **Stock de Seguridad**: Clavija (colchón) de inventario intocable. Variable MRP. |
| `run_rate`    | DECIMAL | Default 0.0 | **Consumo Diario (Venta/Uso)**: Velócimetro de salida del producto. Variable MRP. |

### 4.7 Tabla Teórica: `inv.stock_moves` (Hechos Históricos)
Centro de la estrella. Tabla inmutable del historial cronológico de entradas y salidas que nutre al Snapshot.

| Campo | Tipo | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | BIGINT| PK, Auto-incr | ID de transacción. |
| `variant_id` | INT | FK -> `inv.product_variants`| SKU o Variante física ingresada/extraída. |
| `batch_id` | INT | FK -> `inv.batches` | *(Opcional)* Lote movilizado. |
| `facility_id` | INT | FK -> `core.facilities`| Bodega donde ingresa. |
| `supplier_id` | INT | FK -> `core.suppliers` | **El Proveedor** al cual se asocia el ingreso histórico. |
| `qty_done` | DECIMAL | Not Null | Unidades físicas afectadas. |
| `unit_cost` | DECIMAL | Not Null | Costo Unitario contable de la factura de este proveedor. |
| `historic_avg_cost`| DECIMAL| Not Null | Histórico: Captura cómo quedó el Costo Promedio Ponderado en este exacto instante (Tracking de Kardex). |
| `date` | TIMESTAMP| Default NOW() | Fecha transaccional en el tiempo. |

### 4.8 Tabla Teórica: `inv.product_packagings` (Empaques, Volúmenes y Pesos Múltiples)
Estructura jerárquica de la unidad base (Ej. Unidad -> Caja -> Bulto). Crucial para el almacenaje físico, fletes y pedidos logísticos consolidados en ODC. Permite comprar "1 Bulto" y que el sistema costee "288 Unidades".

| Campo | Tipo | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | INT | PK, Auto-incr | Identificador del empaque. |
| `product_id` | INT | FK -> `inv.products.id` | Producto maestro al que pertenece. |
| `name` | VARCHAR | Not Null | Denominación del empaque (Ej. "Caja de 12", "Bulto Cocosette 24x12"). |
| `qty_per_unit` | DECIMAL | Not Null | Factor de conversión: Cuántas Unidades Base reales contiene directamente. |
| `weight_kg` | DECIMAL | Default 0 | Peso métrico en Kilogramos para validación de cargas vehiculares y fletes. |
| `volume_m3` | DECIMAL | Default 0 | Volumen ocupado en Metros Cúbicos para capacidad de estibas o volumetría CEDI. |

## 5. Módulo de Compras (Gestión y Reposición Proactiva)

### 5.1 Tabla Teórica: `pur.purchase_orders` (Cabecera de ODC)
| Campo | Tipo | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | INT | PK, Auto-incr | Número primario de ODC. |
| `reference` | VARCHAR | Unique | Correlativo de negocio impreso (ODC-00102). |
| `supplier_id` | INT | FK -> `core.suppliers.id`| A quién le compramos legalmente. |
| `buyer_id` | INT | FK -> `pur.buyers.id` | Comprador analista responsable operativo de esta negociación. |
| `dest_facility_id`| INT | FK -> `core.facilities`| Destino final logístico (Almacén Central / CEDI o Tienda Periférica). |
| `status` | VARCHAR | Default 'draft'| Progreso en la vida del documento (`draft`, `approved`, `sent`, `confirmed`, `received`). |
| `total_amount`| DECIMAL | Not Null | Sumatoria financiera base global calculada de la compra. |

### 5.2 Tabla Teórica: `pur.purchase_order_lines` (Renglones Surgidos o Agregados)
| Campo | Tipo | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `id` | BIGINT| PK, Auto-incr | Renglón. |
| `order_id` | INT | FK -> `pur.purchase_orders`| Cabecera conectada formalmente. |
| `variant_id` | INT | FK -> `inv.product_variants`| Inventario específico comercial (SKU). |
| `pack_id` | INT | FK -> `inv.product_packagings`| Presentación métrica vendida por el proveedor (Ej: Se pidieron *Cajas* cerradas). |
| `qty_ordered` | DECIMAL | Not Null | Cantidad del Empaque Solicitada físicamente en el correo PDF. |
| `expected_base_qty`| DECIMAL | Not Null | Conversión transparente dictaminada: Cantidad calculada en Unidades Base a recibir en inventario para afectar Kardex. |
| `unit_cost` | DECIMAL | Not Null | Costo unitario pactado proyectado en esta compra particular. |

---
**Nota**: Este diccionario refleja la estructura transaccional adaptada a las nuevas reglas operativas de Neo ERP. Las secciones 3, 4 y 5 representan el diseño conceptual B2B y Reposición antes de ser construidas físicamente en PostgreSQL y en los modelos Prisma/TypeORM del backend.
