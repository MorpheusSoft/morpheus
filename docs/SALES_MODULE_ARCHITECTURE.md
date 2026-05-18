# Morpheus NEO-ERP - Arquitectura del Módulo de Ventas (Sales)
*Fecha de Registro: Mayo 2026*

Este documento sirve como bitácora y referencia arquitectónica para el desarrollo del Módulo de Ventas dentro del ecosistema Morpheus. Detalla el diseño del "Documento Comercial Universal" y la integración con el POS, Inteligencia Artificial y el motor de inventarios de doble partida.

## 1. El Problema Original y la Visión
Históricamente, los ERPs manejan ventas creando tablas desconectadas para Presupuestos (`budget_lines`), Pedidos (`order_lines`) y Facturas (`invoice_lines`). Esto genera redundancia masiva y dificulta la trazabilidad de métricas clave (Ej: Tasa de conversión de Presupuesto a Factura, o análisis de Backorders).

**La Solución:** Una estructura basada en **Documentos Inmutables Evolutivos**. Se utiliza una sola tabla maestra comercial que evoluciona mediante su estado o enlazando nuevos documentos hacia atrás (usando `parent_id`).

## 2. Estructura de Datos Comercial (`sales`)

### 2.1 `sales.documents` (Cabecera Universal Inmutable)
Contiene la información financiera y legal de la transacción.

| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | BIGINT | PK (Uso interno de BD). |
| `document_number`| VARCHAR | Correlativo de negocio único (Ej: PRE-001, FAC-001). |
| `fiscal_number` | VARCHAR | Número de control fiscal legal. |
| `fiscal_serial` | VARCHAR | Serial de la Impresora Fiscal o Equipo. |
| `fiscal_serie` | VARCHAR | Serie de la factura (Ej. Forma Libre Serie A). |
| `type` | ENUM | `BUDGET`, `ORDER`, `DELIVERY_NOTE`, `INVOICE`, `CREDIT_NOTE`, `DEBIT_NOTE`. |
| `state` | VARCHAR | Estado de la vida del documento (`DRAFT`, `CONFIRMED`, `PAID`). |
| `parent_id` | BIGINT | Trazabilidad. FK hacia esta misma tabla (Factura -> Pedido -> Presupuesto). |
| `customer_id` | INT | FK al Maestro de Clientes. |
| `customer_name_snap`| VARCHAR | Razón Social guardada en el momento de la venta (Para POS). |
| `customer_tax_snap` | VARCHAR | RIF/Cédula capturado en el momento de la venta (Para POS). |
| `customer_addr_snap`| TEXT | Dirección capturada en el momento de la venta (Para POS). |
| `facility_id` | INT | Sucursal o Tienda origen. |
| `currency_id` | INT | Moneda. |
| `exchange_rate` | DECIMAL | Tasa de cambio al momento de emitir el documento. |

### 2.2 `sales.document_lines` (Renglones de Venta)
| Campo | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | BIGINT | PK |
| `document_id` | BIGINT | FK a la cabecera. |
| `origin_line_id`| BIGINT | FK hacia esta misma tabla (Saber qué línea de la orden originó esta línea de factura para Backorders). |
| `variant_id` | INT | Producto (SKU) o Servicio. |
| `quantity` | DECIMAL | Cantidad comercial. |
| `unit_price`, `tax_pct`| DECIMAL | Valores financieros. |

## 3. Reglas de Negocio e Integraciones

### 3.1 Integración con Inventario (`inv`)
La tabla de ventas no maneja directamente el descuento de unidades en almacén. Delega esta responsabilidad al Motor de Movimientos:
- Al confirmar un documento que afecta stock (`ORDER`, `INVOICE`, `DELIVERY_NOTE`), el backend dispara automáticamente un `inv.stock_pickings` (Salida o Entrada) y sus respectivos `inv.stock_moves`.
- **Servicios:** Si el `variant_id` vendido tiene `product_type = 'SERVICE'`, el sistema **ignora** la logística y no intenta rebajar stock, pero sí lo suma financieramente a la factura.

### 3.2 Integración con Cuentas por Cobrar (`fin.receivables`)
Una venta no es sinónimo de dinero en caja. Las deudas se manejan aisladas:
- Un documento `type = 'INVOICE'` genera una entrada en `fin.receivables` (`total_debt`, `balance_due`, `due_date`).
- Los pagos posteriores del cliente no alteran la factura; alteran el `balance_due` en finanzas.

### 3.3 Lógica POS y "Cliente Genérico"
Para operaciones de alto volumen (Retail):
1. El POS siempre buscará el RIF/Cédula del cliente en el backend.
2. Si existe, usa su `customer_id`.
3. Si no existe y es una venta rápida, usa el ID del "Cliente Genérico" (Ej: ID 1).
4. El POS envía el RIF, Nombre y Dirección capturados, los cuales se guardan en los campos "Snapshot" (`customer_tax_snap`, etc.) de la factura para mantener validez legal y el Libro de Ventas sin ensuciar la tabla `customers`.

### 3.4 Modelo Estrella Virtual (Inteligencia Artificial)
Para optimizar las consultas del Copiloto de IA sin romper la normalización (3NF), el sistema expone vistas SQL (`CREATE VIEW v_fact_sales`) que pre-unen las ventas financieras (`sales.documents`) con los costos logísticos (`inv.stock_moves`), entregando un esquema estrella perfecto a los modelos de lenguaje (LLMs).
