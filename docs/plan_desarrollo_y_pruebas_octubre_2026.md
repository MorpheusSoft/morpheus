# Plan Detallado de Desarrollo (al 100%), Pruebas y Certificación

Este documento establece el plan operativo diario para completar el 100% del desarrollo de los módulos del sistema **Morpheus** en las próximas 6 semanas, seguido del plan de Pruebas, Certificación de Usuario (UAT) y Ensayos Generales en las semanas 7 y 8.

---

## 1. Plan de Desarrollo Detallado por Módulo y Días (Semanas 1 a 6)

### 📦 Módulo 1: Logística y WMS (`neo-wms`) — Semana 1 (10 al 14 de Agosto)
**Objetivo:** Completar flujo de salidas/despachos (Picking/Packing/Shipment) y flujo de Cuarentena de Lotes.

* **Lunes 10/Aug:** 
  * *Backend:* Endpoints de despachos (`/api/v1/wms/shipments`) y olas de picking (`/api/v1/wms/picking-waves`).
  * *Entregable:* API funcional para generar documentos de salida de mercancía.
* **Martes 11/Aug:** 
  * *Frontend:* Construcción de pantalla de Orden de Despacho y Lista de Picking por Ubicación en `neo-wms/src/app/shipments`.
* **Miércoles 12/Aug:** 
  * *Frontend:* Implementación del flujo de Empaque (Packing) e impresión de guías de empaque/embarque.
* **Jueves 13/Aug:** 
  * *Backend/Frontend:* Lógica de inspección de calidad y bloqueo automático de lotes en cuarentena (`is_quarantined`).
* **Viernes 14/Aug:** 
  * *QA Interno:* Pruebas de integración del flujo completo de Salidas WMS (Recepción muelle -> Ubicación -> Picking -> Despacho).

---

### 🛒 Módulo 2: Compras y Conciliación (`neo-purchases`) — Semana 2 (17 al 21 de Agosto)
**Objetivo:** Implementar la Conciliación 3-Way Match y automatizar sugerencias de compra.

* **Lunes 17/Aug:** 
  * *Backend:* Schemas y endpoints para Conciliación de Compras (`/api/v1/purchase_orders/{id}/conciliate`).
* **Martes 18/Aug:** 
  * *Frontend:* Pantalla de Conciliación en `neo-purchases/src/app/orders/[id]/conciliate` (Compara Factura Proveedor vs Orden vs Recepción WMS).
* **Miércoles 19/Aug:** 
  * *Backend/Frontend:* Definición de margen de tolerancia en diferencias de costos y cantidades (aprobación gerencial si excede la regla).
* **Jueves 20/Aug:** 
  * *Backend/Frontend:* Refinamiento del Bot MRP (`neo-purchases/settings/bot`) para visualización de sugerencias de compra basadas en `safety_stock` y `run_rate`.
* **Viernes 21/Aug:** 
  * *QA Interno:* Pruebas de recepción parcial con cierre o backorder de la orden de compra.

---

### 🌐 Módulo 3: Portal B2B y Pedidos (`neo-b2b`) — Semana 3 (24 al 28 de Agosto)
**Objetivo:** Carrito de compras B2B con reserva de stock en tiempo real y reglas de crédito.

* **Lunes 24/Aug:** 
  * *Backend:* Endpoints del Carrito B2B y reserva temporal de stock (`InventorySnapshot.reserved_qty`).
* **Martes 25/Aug:** 
  * *Frontend:* Catálogo interactivo de productos B2B con vista de precios según el grupo/categoría del cliente.
* **Miércoles 26/Aug:** 
  * *Frontend:* Proceso de Checkout B2B (dirección de envío, método de pago y confirmación).
* **Jueves 27/Aug:** 
  * *Backend/Frontend:* Validación de límite de crédito del cliente B2B previo a la generación de la orden de venta.
* **Viernes 28/Aug:** 
  * *QA Interno:* Verificación de que una orden B2B reserve inventario en WMS inmediatamente.

---

### 🏷️ Módulo 4: Costos y Precios (`neo-pricing`) — Semana 4 (31 de Agosto al 4 de Septiembre)
**Objetivo:** Parser IA de listas de costos de proveedores, cálculo de márgenes y ofertas.

* **Lunes 31/Aug:** 
  * *Backend:* Ingesta y parsing automatizado de archivos PDF/CSV de costos de proveedores utilizando la API de Gemini.
* **Martes 01/Sep:** 
  * *Frontend:* Pantalla de procesamiento masivo en `neo-pricing/costos/new` para revisar ítems detectados por IA.
* **Miércoles 02/Sep:** 
  * *Backend/Frontend:* Reglas de margen mínimo y alerta visual si el precio propuesto no cubre la utilidad esperada (`target_utility_pct`).
* **Jueves 03/Sep:** 
  * *Backend/Frontend:* Programador de campañas de descuento y promociones temporales por sucursal.
* **Viernes 04/Sep:** 
  * *QA Interno:* Prueba de actualización masiva de 1,000 SKUs e impresión de habladores resultantes.

---

### 📊 Módulo 5: Inventario Core y Analítica (`neo-inventory`) — Semana 5 (7 al 11 de Septiembre)
**Objetivo:** Alertas de stock en tiempo real, Clasificación ABC y consistencia contable.

* **Lunes 07/Sep:** 
  * *Backend:* Algoritmo de clasificación ABC automático por rotación y valor retenido.
* **Martes 08/Sep:** 
  * *Frontend:* Dashboard de alertas de inventario (Stock mínimo, vencimiento próximo de lotes, mercancía sin movimiento).
* **Miércoles 09/Sep:** 
  * *Backend/Frontend:* Reporte de Valoración de Inventario exportable a Excel/PDF (Costo Promedio vs Costo Reposición).
* **Jueves 10/Sep:** 
  * *Backend:* Auditoría de trazabilidad completa (Log de cambios por usuario en cada movimiento de Kardex).
* **Viernes 11/Sep:** 
  * *QA Interno:* Verificación de consistencia entre la suma de Kardex y los Saldos de Snapshots.

---

### 🔒 Módulo 6: Integración General & Feature Freeze — Semana 6 (14 al 18 de Septiembre)
**Objetivo:** Estabilización técnica, optimización de base de datos y congelamiento de código.

* **Lunes 14/Sep:** Optimización e indexación de base de datos PostgreSQL en tablas pesadas (`stock_moves`, `kardex`).
* **Martes 15/Sep:** Conexión fina de eventos entre micro-frontends (Navegación fluida entre Compras, WMS y Precios).
* **Miércoles 16/Sep:** Corrección de linter, estilos visuales responsive y pulido de la UX.
* **Jueves 17/Sep:** Pruebas de estrés y carga del backend en servidor de Staging.
* **Viernes 18/Sep:** 🛑 **FEATURE FREEZE OFICIAL.** Queda prohibido añadir nuevas funcionalidades. El código se congela para iniciar el ciclo de certificación.

---

## 2. Plan de Pruebas y Certificación (Semanas 7 y 8)

### 🧪 Nivel 1: Pruebas Funcionales Punta a Punta (E2E) (Sep 21 - Sep 23)
Se ejecutarán escenarios completos de negocio en ambiente de Staging:

1. **Escenario E2E 01 - Cadena de Abastecimiento:**
   * Crear Orden de Compra -> Enviar a Proveedor -> Aceptar por portal público -> Recibir en Muelle WMS -> Ubicar en Rack -> Conciliar Factura en Compras -> Actualizar Costo de Reposición.
2. **Escenario E2E 02 - Cadena de Venta y Despacho:**
   * Cliente B2B ingresa pedido -> Se reserva inventario en WMS -> Almacén genera lista de Picking -> Se realiza el Packing -> Despacho y salida de mercancía -> Actualización en tiempo real del Kardex.
3. **Escenario E2E 03 - Control Físico de Inventario:**
   * Iniciar Sesión de Conteo -> Registrar inventario físico contado -> Generar reporte de diferencias -> Aplicar ajuste automático de stock.

---

### ⚡ Nivel 2: Pruebas de Rendimiento, Seguridad y Multimoneda (Sep 24 - Sep 25)
* **Carga Simultánea:** Probar el sistema con 50 operadores simulados simultáneamente (Tomas físicas en WMS + Consultas en Kiosco + Registro B2B).
* **Matriz de Permisos:** Comprobar que los roles (Almacenista, Comprador, Cajero, Admin) tengan sus restricciones activas (ej. Almacenista no puede ver precios de venta ni márgenes).
* **Redondeo y Moneda:** Validar la precisión decimal (`Numeric(19,4)`) en conversiones USD / VES según la tasa de cambio del día.

---

### 📋 Nivel 3: Pruebas de Aceptación de Usuario (UAT) y Certificación (Sep 28 - Sep 30)
Los líderes operativos probarán el sistema con casos de la vida real y firmarán las **Actas de Certificación**:

| Rol de Certificación | Responsable | Criterio de Aceptación | Estado |
| :--- | :--- | :--- | :--- |
| **Certificación Logística** | Líder de Almacén | Recepción, ubicación, picking y conteos físicos sin errores. | ⏳ Pendiente Sep 28 |
| **Certificación Compras** | Líder de Compras | Creación de O/C, portal proveedor y conciliación probada. | ⏳ Pendiente Sep 29 |
| **Certificación Precios** | Líder Comercial | Carga masiva de costos, habladores impresos correctamente. | ⏳ Pendiente Sep 29 |
| **Certificación General** | Gerencia General | Firma del **Acta de Conformidad para Lanzamiento**. | ⏳ Pendiente Sep 30 |

---

### 🚀 Nivel 4: Ensayo General (Dry-Run) y Carga a Producción (Oct 01 - Oct 04)

* **Jueves 01/Oct (Ensayo General):** Simulación de 1 día de operación completa en ambiente Staging con todos los usuarios clave.
* **Viernes 02/Oct (Carga Inicial):** Migración de datos maestros definitivos a servidor de Producción (Catálogo, Proveedores, Ubicaciones).
* **Sábado 03/Oct y Domingo 04/Oct (Toma Física Inicial):** Conteo de inventario de apertura e inyección de Saldos Iniciales valorizados en `neo-inventory`.
* **Lunes 05/Oct:** 🟢 **GO-LIVE EN PRODUCCIÓN (100% OPERATIVO).**
