# Plan de Adelanto Semana 1: Módulo de Logística y WMS (`neo-wms`) al 100%

Este documento establece el plan operativo y técnico detallado para auditar, completar y certificar al **100%** el módulo de **Warehouse Management System (WMS)** durante la primera semana de trabajo.

---

## 1. Inventario de Menús, Rutas y Porcentaje de Completación

A continuación se detalla el análisis de cada pantalla, proceso y endpoint backend dentro de `neo-wms`:

```
Dashboard Muelle       [▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░] 80%
Recepción (Inbound)    [▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░] 85%
Transferencias         [▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░] 75%
Mapa de Almacén        [▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░] 80%
Control Lotes (FEFO)   [▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░] 70%
Ajustes Físicos        [▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░] 75%
Asistente IA Logístico [▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░] 60%
```

| Opción de Menú | Ruta Frontend | Endpoints Backend | Avance | Lo que está listo | Lo que falta para el 100% |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **1. Dashboard Muelle** | `/` | `/wms/stats`<br>`/wms/pending` | **80%** | Métricas de recepción del día, accesos rápidos, ocupación general. | Alertas dinámicas de congestión en muelle y refresco automático por WebSockets. |
| **2. Recepciones & Cuarentena** | `/receipts`<br>`/receipts/direct`<br>`/receipts/[id]` | `/wms/receipts/{order_id}`<br>`/wms/quarantine` | **100%** | Recepción O/C, recepciones directas, inspección de calidad y liberación/descarte de cuarentena. | ✅ **COMPLETADO DÍA 3** |
| **3. Despachos & Picking** | `/shipments` | `/wms/shipments`<br>`/wms/picking-waves` | **100%** | Orden de salida, olas de picking por ubicación, ejecución de picking y descuento de snapshot. | ✅ **COMPLETADO DÍA 1** |
| **4. Transferencias y Reubicación**| `/transfers` | `/wms/transfers`<br>`/wms/putaway` | **75%** | Reubicación interna entre ubicaciones y traslados entre almacenes. | Confirmaciones cruzadas con confirmación de transporte. |
| **5. Mapa Térmico de Almacén** | `/locations` | `/wms/locations`<br>`/wms/locations/occupancy` | **100%** | Árbol jerárquico, cálculo de % de llenado volumétrico, mapa térmico y alertas de saturación. | ✅ **COMPLETADO DÍA 4** |
| **6. Control de Lotes (FEFO)**| `/lots` | `/wms/lots`<br>`/wms/fefo-suggestions` | **100%** | Vista de lotes, vencimiento, cálculo de días restantes y recomendación automática FEFO. | ✅ **COMPLETADO DÍA 2** |
| **6. Ajustes Físicos** | `/adjustments` | `/wms/adjustments`<br>`/stock/adjust` | **75%** | Registro de mermas, dañados y ajustes por ubicación. | Regla de aprobación gerencial obligatoria cuando el monto del ajuste supera un umbral ($). |
| **7. Asistente IA Logístico** | `/asistente-ia` | `/wms/ai-assistant` | **60%** | Chat interactivo de consulta sobre stock y ubicaciones. | Integración con acciones ejecutables directas (ej. crear orden de reubicación por comandos de texto/voz). |

---

## 2. Plan Operativo Día a Día para Completar WMS al 100%

### 🗓️ Lunes (Día 1): Módulo de Salidas y Despachos (La Brecha Principal)
* **Proceso a Culminar:** Habilitar el flujo de salidas de mercancía para ventas y transferencias externas.
* **Actividades Backend:**
  * Crear endpoints en `/api/v1/wms/shipments` y `/api/v1/wms/picking-waves`.
  * Generar lógica de reserva de stock en ubicación al crear una lista de picking.
* **Actividades Frontend:**
  * Crear la vista de Salidas/Despachos en `neo-wms/src/app/shipments/page.tsx`.
  * Diseñar la interfaz de Lista de Picking por zona/estante.

### 🗓️ Martes (Día 2): Algoritmo FEFO en Selección de Lotes
* **Proceso a Culminar:** Garantizar que el sistema siempre sugiera despachar el lote más próximo a vencer.
* **Actividades Backend:**
  * Crear helper `get_fefo_batch(variant_id, location_id)` en `stock_service.py`.
* **Actividades Frontend:**
  * Conectar sugerencia de lote FEFO en la vista de Picking y Transferencias.
  * Añadir badge de advertencia si el operador intenta seleccionar un lote diferente al sugerido por FEFO.

### 🗓️ Miércoles (Día 3): Flujo de Cuarentena e Inspección en Muelle
* **Proceso a Culminar:** Aislar automáticamente productos dañados o pendientes de inspección técnica.
* **Actividades Backend:**
  * Implementar traslado automático a ubicación especial de `CUARENTENA` al marcar `damaged_qty > 0` o `is_quarantined = true` durante la recepción.
* **Actividades Frontend:**
  * Añadir pestaña de "Inspección de Calidad" en `/receipts` para aprobar o rechazar lotes retenidos.

### 🗓️ Jueves (Día 4): Mapa Térmico y Límites Volumétricos
* **Proceso a Culminar:** Visualización clara de la saturación física del almacén.
* **Actividades Backend:**
  * Endpoint `/api/v1/wms/locations/occupancy` que calcula el % de volumen ocupado vs capacidad máxima (`capacity_volume`).
* **Actividades Frontend:**
  * En `/locations`, agregar barras de progreso térmicas (Verde < 70%, Amarillo 70-90%, Rojo > 90%) por estante.

### 🗓️ Viernes (Día 5): Pruebas E2E y Certificación del Módulo Logístico
* **Proceso a Culminar:** Certificación del módulo `neo-wms` al **100% de operatividad**.
* **Pruebas a Ejecutar:**
  1. Recepción de mercancía en muelle con lote y fecha de vencimiento.
  2. Traslado automático de ítem defectuoso a zona de Cuarentena.
  3. Reubicación interna (Putaway) de la mercancía aprobada a rack definitivo.
  4. Generación de Lista de Picking con sugerencia automática FEFO.
  5. Ajuste de merma por rotura con actualización inmediata de Kardex.
* **Resultado:** Firma de conformidad del módulo WMS listo para producción.
