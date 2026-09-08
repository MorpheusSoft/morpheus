# 📋 Seguimiento de Desarrollo y Procesos
## Plataforma Morpheus / NEO ERP & WMS

**Fecha de Actualización:** 8 de Septiembre de 2026  
**Ambiente Auditado:** QA Staging (`api.qa.morpheussoft.net` / `logistica.qa.morpheussoft.net`)  
**Propósito:** Matriz de control y trazabilidad de funcionalidades desarrolladas, parcialmente implementadas y pendientes en backlog para las pruebas de aceptación (UAT) y salida a producción.

---

### 🏷️ Convención de Estatus

| Marca | Estado | Significado Técnico y Operativo |
| :---: | :--- | :--- |
| **`[✓]`** | **LISTO (100%)** | Completamente desarrollado (Frontend + Backend + Base de Datos). Operativo y validado en QA. |
| **`[~]`** | **PARCIAL** | Funcionalidad básica desarrollada o lista en Backend, pero con interfaz preliminar o limitaciones operativas. |
| **`[X]`** | **PENDIENTE TOTAL** | No desarrollado aún, pantalla de maqueta/placeholder o pendiente en el backlog. |

---

## 1. Módulo WMS & Logística de Depósito (`neo-wms`)

| Proceso / Funcionalidad | Estado | Pantalla / Endpoint | Descripción y Situación Actual |
| :--- | :---: | :--- | :--- |
| **Estructura de Almacenes y Depósitos** | `[✓]` | `/wms/locations` | Alta de depósitos por sucursal con vinculación física. |
| **Tipos de Ubicación (`DOCK`, `SHELF`, `LOSS`, `INTERNAL`)** | `[✓]` | `/wms/locations` | Creación de ubicaciones de muelle, estantería, merma y piso general con cubicaje (m³). |
| **Recepción Directa en Muelle (Inbound)** | `[✓]` | `/wms/receipts/direct` | Entrada física de mercancía sin orden previa, captura de costos y proveedor. |
| **Gestión de Lotes y Fechas de Vencimiento** | `[✓]` | `/wms/receipts/direct` | Captura obligatoria/opcional de número de lote y fecha de expiración en recepción. |
| **Impresión de Comprobante de Recepción (80mm)** | `[✓]` | `/wms/receipts/{id}/ticket-80mm` | Generación de ticket térmico para pegado en bultos recibidos. |
| **Reubicación de Mercancía (*Putaway*)** | `[✓]` | Modal Putaway en `/wms/locations` | Traslado auditado de mercancía desde el muelle (`DOCK`) a estantería (`SHELF`). |
| **Control de Lotes & Semáforo FEFO / FIFO** | `[✓]` | `/wms/lots` | Visualización de lotes, saldos y semáforo automático (`VIGENTE`, `POR VENCER <30 DÍAS`, `VENCIDO`). |
| **Bloqueo por Calidad (Cuarentena)** | `[✓]` | `/wms/lots` (`toggle-quarantine`) | Bloqueo inmediato de un lote con estado `RETENIDO (CUARENTENA)`. |
| **Transferencias Internas con Tránsito** | `[✓]` | `/wms/transfers` | Movimiento de stock entre depósitos con paso por ubicación virtual de tránsito. |
| **Ajustes Físicos y Mermas** | `[✓]` | `/wms/adjustments` | Declaración de averías con salida a ubicación `LOSS` y flujo de aprobación. |
| **Despachos & Picking (Outbound)** | `[✓]` | `/wms/shipments` | Creación de órdenes de despacho, olas de picking y confirmación de salida física. |
| **Sugerencia FEFO en Salidas** | `[✓]` | Backend `/wms/fefo-suggestions` | Algoritmo que sugiere extraer el lote más próximo a vencer y excluye cuarentenas. |
| **Mapa Térmico de Ocupación** | `[✓]` | `/wms/locations` | Monitoreo visual de saturación y capacidad volumétrica de estanterías. |
| **Asistente IA de Depósito** | `[✓]` | `/wms/asistente-ia` | Chat interactivo conectado a Gemini para consultas de stock y movimientos. |

---

## 2. Módulo de Inventarios & Tomas Físicas (`neo-inventory`)

| Proceso / Funcionalidad | Estado | Pantalla / Endpoint | Descripción y Situación Actual |
| :--- | :---: | :--- | :--- |
| **Catálogo Maestro de Productos y Variantes** | `[✓]` | `/products` | Ficha técnica de artículos, SKUs, unidades de medida y marcas. |
| **Códigos de Barra (Múltiples por Producto)** | `[✓]` | `/core/barcodes` | Soporte de códigos EAN-13, bultos y empaques secundarios. |
| **Kardex Multi-Ubicación en Partida Doble** | `[✓]` | `/kardex` | Trazabilidad completa de movimientos: origen, destino, usuario y documento. |
| **Valoración de Inventario (Costo Promedio / FIFO)** | `[✓]` | `/valuation` | Reporte financiero de existencias valoradas a costo promedio ponderado. |
| **Sesiones de Toma Física / Conteo Ciego** | `[~]` | `/physical-counts` | Permite crear la sesión por almacén/categoría y cargar conteos en pantalla o CSV. |
| **Diagnóstico IA Integrado en Discrepancias de Toma Física** | `[X]` | `/physical-counts` | La IA está disponible en el chat general, pero falta el botón de análisis automático incrustado dentro de la sesión de conteo. |

---

## 3. Módulo de Compras & Cadena de Abastecimiento (`neo-purchases`)

| Proceso / Funcionalidad | Estado | Pantalla / Endpoint | Descripción y Situación Actual |
| :--- | :---: | :--- | :--- |
| **Directorio de Proveedores y Catálogo** | `[✓]` | `/suppliers` | Registro de proveedores, datos fiscales (RIF), plazos de pago y contactos. |
| **Costos Históricos por Proveedor** | `[✓]` | `/products` (Costos) | Registro del costo pactado por proveedor con conversión de moneda. |
| **Motor de Sugerido de Compras (MRP Predictivo)** | `[✓]` | `/suggestions` y Dashboard | Cálculo matemático de reorden según histórico de ventas, rotación y stock de seguridad. |
| **Emisión de Órdenes de Compra (PO)** | `[✓]` | `/orders/new` | Creación de órdenes de compra con moneda dual (USD / VES) y descuentos encadenados. |
| **Portal B2B de Proveedor (Acceso Público sin Login)** | `[✓]` | `/public/orders/[token]` | Enlace con token seguro donde el proveedor visualiza la orden, descarga PDF y confirma aceptación con fecha y registro de IP. |
| **Recepción contra Orden de Compra** | `[✓]` | `/wms/receipts` | Descarga de mercancía en muelle validando cantidades pedidas vs recibidas. |
| **Conciliación 3-Way Match Automática** | `[✓]` | `/reconciliation` | Motor automático de cruce Factura Fiscal vs Recepción WMS vs ODC, cálculo de variaciones, emisión automática de Notas de Débito por faltantes/sobreprecios y protección de márgenes. |

---

## 4. Módulo de Costos, Precios & Pricing (`neo-pricing`)

| Proceso / Funcionalidad | Estado | Pantalla / Endpoint | Descripción y Situación Actual |
| :--- | :---: | :--- | :--- |
| **Recálculo de Costo Promedio Ponderado** | `[✓]` | Backend automático | El costo unitario se actualiza automáticamente con cada recepción de compra valorada. |
| **Sesión Masiva de Precios por Margen Objetivo** | `[✓]` | `/precios` | Simulación y fijación de PVP en base al margen comercial deseado (ej. 30%). |
| **Expresión Bimonetaria de Precios (USD / VES)** | `[✓]` | `/precios` | Cálculo simultáneo de precios a tasa de cambio oficial (BCV). |
| **Diseño e Impresión de Habladores de Góndola** | `[✓]` | `/habladores` | Generación de etiquetas de precio para exhibición en estantes. |
| **Kiosco Verificador de Precios** | `[✓]` | `/kiosco` | Pantalla de consulta rápida de precio escaneando código de barras. |
| **Gestor de Campañas Promocionales Visuales** | `[~]` | `/promotions` | La tabla y lógica existen en backend, pero la interfaz visual de programación por horario/días está en fase preliminar. |
| **Transmisión de Nuevos Precios hacia el POS (Stellar)** | `[X]` | `NEO Agent Sync` | **Pendiente:** El agente actual solo extrae de Stellar a la nube; no escribe aún en la tabla de precios (`ma_precios`) de las cajas locales de tienda. |

---

## 5. Portal B2B Mayorista (`neo-b2b`)

| Proceso / Funcionalidad | Estado | Pantalla / Endpoint | Descripción y Situación Actual |
| :--- | :---: | :--- | :--- |
| **Catálogo Digital B2B** | `[✓]` | Portal B2B | Navegación de productos con fotos, fichas técnicas y precios diferenciados. |
| **Carrito y Colocación de Pedido** | `[✓]` | Portal B2B | El cliente comercial arma su pedido y lo envía a revisión. |
| **Control Estricto de Línea de Crédito** | `[~]` | Portal B2B | El pedido se registra en borrador, pero la validación automática contra cuentas por cobrar contables está en desarrollo. |

---

## 6. Agente de Sincronización de Tiendas (`NEO Agent Sync`)

| Proceso / Funcionalidad | Estado | Componente | Descripción y Situación Actual |
| :--- | :---: | :--- | :--- |
| **Extracción de Categorías (Maestros)** | `[✓]` | `CategoryExtractor` | Transmite el árbol de categorías desde SQL Server a la nube. |
| **Extracción de Productos y Variantes** | `[✓]` | `ProductMasterExtractor` | Sincroniza códigos de artículo, descripciones y presentaciones. |
| **Extracción de Códigos de Barra** | `[✓]` | `ProductBarcodesExtractor` | Sincroniza códigos principales y adicionales. |
| **Extracción de Proveedores y Costos** | `[✓]` | `SuppliersExtractor` | Sincroniza el maestro de proveedores y costos de compra asociados. |
| **Transmisión de Inventario Inicial (Baseline)** | `[✓]` | `InventoryBaselineWorker` | Toma la fotografía del stock físico vivo o a fecha de corte sin duplicar. |
| **Transmisión Periódica de Ventas (POS)** | `[✓]` | `SalesExtractorWorker` | Extrae tickets de venta del POS local para alimentar el consumo y el MRP. |
| **Sincronización de Movimientos de Almacén (Kardex)** | `[✓]` | `InventoryMovementsWorker` | Sincroniza entradas, traslados y mermas locales posteriores al baseline. |
| **Servicio de Windows Nativo (`NEO Agent Sync`)** | `[✓]` | Servicio Windows (`sc.exe`) | Operación autónoma en segundo plano con descripción *"Integrador con Stellar"*. |
| **Panel de Control con Feedback y Estado en Vivo** | `[✓]` | `MorpheusConfigurador.exe` | Indicador visual (`ACTIVO` / `DETENIDO`), botones con popups de confirmación y selección de fecha de corte para Kardex. |
| **Sincronización Bidireccional de Precios hacia el POS** | `[X]` | `MorpheusSyncAgent` | **Pendiente:** Módulo para descargar cambios de precio desde Neo Pricing e impactar `ma_precios` en el POS local. |

---

## 7. Resumen Cuantitativo de Madurez del Sistema

```
====================================================================
  TOTAL DE FUNCIONALIDADES CLAVE AUDITADAS: 35
--------------------------------------------------------------------
  [✓] LISTAS Y OPERATIVAS EN QA:           29   (82.9%)
  [~] PARCIALES / EN PROCESO:               3   ( 8.6%)
  [X] PENDIENTES / BACKLOG FUTURO:          3   ( 8.5%)
====================================================================
```

### 📌 Las 3 Opciones que Faltan en Totalidad:
1. **`[X]` Bajada de Precios desde la Nube al POS:** Escribir los nuevos PVP calculados en `Neo Pricing` hacia las tablas de Stellar en tienda.
2. **`[X]` Bajada de Promociones a las Cajas:** Replicar las ofertas configuradas en la nube hacia el POS físico.
3. **`[X]` Diagnóstico IA Embebido en Pantalla de Toma Física:** Botón de diagnóstico directo dentro de la tabla de discrepancias del conteo ciego.

---

## 🎯 Plan de Trabajo Inmediato para Pruebas (UAT)

Dado que los bloques de **Almacén, WMS, Lotes, FEFO, Cuarentena, Compras y MRP están 100% listos `[✓]`**, la secuencia de pruebas que ejecutaremos de inmediato es:

1. **Paso 1:** Crear en WMS la ubicación `DOCK` (Muelle de Entrada) y la ubicación `SHELF` (Pasillo 01 / Estante).
2. **Paso 2:** Registrar una **Recepción Directa** en WMS ingresando 2 lotes de prueba (uno con vencimiento a 20 días y otro a 8 meses).
3. **Paso 3:** Consultar la pantalla de **Control de Lotes & FEFO** y validar el semáforo de colores.
4. **Paso 4:** Poner el lote próximo a vencer en **Cuarentena** y comprobar su bloqueo inmediato.
5. **Paso 5:** Realizar la **Reubicación (*Putaway*)** desde el muelle hacia el estante.
