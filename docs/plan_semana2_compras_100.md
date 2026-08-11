# Plan Operativo de Desarrollo y Certificación al 100%: Módulo 2 - Compras y Conciliación (`neo-purchases`)

Este documento define la planificación técnica día a día para elevar el **Módulo 2: Compras y Conciliación (neo-purchases)** del **75% al 100% de completación**.

---

## 1. Análisis de Estado Actual y Faltantes para el 100%

| Opción de Menú | Ruta Frontend | Endpoints Backend | Avance | Funcionalidad Implementada | Requisito Pendiente para el 100% |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **1. Órdenes de Compra** | `/orders`<br>`/orders/create` | `/purchase-orders/`<br>`/purchase-orders/{id}` | **80%** | Creación de O/C Borrador, selección de proveedor, renglones de productos y costos. | Workflow de **Aprobación Multinivel** (`draft` -> `pending_approval` -> `approved` -> `sent`) e impresión PDF de O/C. |
| **2. Conciliación (3-Way Matching)** | `/reconciliation` | `/purchase-orders/reconciliation`<br>`/purchase-orders/reconcile` | **40%** | Vista básica de cotejo entre factura y recepción. | **Matriz de Coincidencia de 3 Vías:** Comparación automática ODC vs Recepción Muelle (WMS) vs Factura Proveedor con tolerancia de costo/cantidad. |
| **3. Evaluación de Proveedores (KRA)** | `/suppliers` | `/suppliers/kpi` | **60%** | Registro de proveedores, datos fiscales y contacto. | **Scorecard de Cumplimiento:** Medición de Fill Rate (%), tiempo de entrega promedio (Lead Time) y tasa de devoluciones. |
| **4. Compradores & Reglas de Gastos** | `/buyers` | `/buyers/limits` | **70%** | Listado de compradores asignados. | Reglas de límites de aprobación financiera ($) por comprador antes de requerir firma gerencial. |
| **5. Asistente IA de Compras** | `/asistente-ia` | `/purchases/ai-assistant` | **65%** | Chat básico sobre estado de órdenes. | Sugerencia inteligente de reabastecimiento basada en sugerido de compra (Stock Min/Max y Punto de Reorden). |

---

## 2. Cronograma de Desarrollo Día a Día (Semana 2: 17 al 21 de Agosto)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│              SEMANA 2: MÓDULO DE COMPRAS Y CONCILIACIÓN (100%)                │
├───────────────┬───────────────────────────────────────────────────────────────┤
│ Día 1 (Lun)   │ Workflow de Aprobaciones Jerárquicas & Generación de PDF      │
│ Día 2 (Mar)   │ Módulo de Conciliación 3-Way Matching (ODC vs WMS vs Factura) │
│ Día 3 (Mié)   │ Gestión de Variaciones de Costo y Generación de Notas Débito  │
│ Día 4 (Jue)   │ Scorecard KRA de Cumplimiento & Evaluación de Proveedores     │
│ Día 5 (Vie)   │ Sugerido Inteligente de Reabastecimiento & QA Interno         │
└───────────────┴───────────────────────────────────────────────────────────────┘
```

### 📅 Día 1 (Lunes): Workflow de Aprobación Jerárquica & Emisión de PDF
* **Backend (`purchase_orders.py`):**
  * `POST /api/v1/purchase-orders/{id}/submit-approval`: Pasa orden a `pending_approval`.
  * `POST /api/v1/purchase-orders/{id}/approve`: Valida límites del comprador y aprueba la orden (`approved`).
  * `GET /api/v1/purchase-orders/{id}/pdf`: Generación de documento PDF de la O/C lista para enviar al proveedor.
* **Frontend (`neo-purchases`):**
  * Botones de estado (`Enviar a Aprobación`, `Aprobar`, `Imprimir PDF`) en la vista detalle de O/C.

### 📅 Día 2 (Martes): Módulo de Conciliación 3-Way Matching
* **Backend (`purchase_orders.py`):**
  * `GET /api/v1/purchase-orders/reconciliation/pending`: Lista órdenes recibidas en muelle WMS pendientes por conciliar con la factura fiscal.
  * `POST /api/v1/purchase-orders/reconcile`: Compara renglón por renglón la trinidad (Cantidad ODC, Cantidad Recibida WMS, Cantidad/Costo Factura).
* **Frontend (`neo-purchases`):**
  * Creación de la pantalla `/reconciliation` con tabla comparativa de tres columnas con semáforos de tolerancia (Verde = Coincidencia exacta, Amarillo = Variación < 2%, Rojo = Discrepancia mayor).

### 📅 Día 3 (Miércoles): Notas de Débito/Crédito y Pase a Cuentas por Pagar (AP)
* **Backend (`purchase_orders.py`):**
  * `POST /api/v1/purchase-orders/reconciliation/adjust`: Generación automática de ajustes por discrepancias de precio/cantidad enviando la orden conciliada a estado `reconciled` lista para pago.
* **Frontend (`neo-purchases`):**
  * Modal de emisión de notas de débito y confirmación de pase a Cuentas por Pagar (AP).

### 📅 Día 4 (Jueves): Scorecard KRA y Evaluación de Proveedores
* **Backend (`suppliers.py`):**
  * `GET /api/v1/suppliers/{id}/kpi`: Calcula métricas de desempeño del proveedor (% Fill Rate, tiempo de entrega en días y tasa de productos dañados/rechazados).
* **Frontend (`neo-purchases`):**
  * Pestaña "Desempeño y KRA" en la ficha del proveedor en `/suppliers` con gráficos de cumplimiento.

### 📅 Día 5 (Viernes): Sugerido Inteligente de Reabastecimiento y Certificación
* **Backend (`purchase_orders.py`):**
  * `GET /api/v1/purchase-orders/reorder-suggestions`: Algoritmo de punto de reorden basado en Stock Mínimo/Máximo y consumo promedio diario.
* **Frontend (`neo-purchases`):**
  * Generación rápida de borrador de O/C a partir del sugerido de compra.
* **QA & Certificación:**
  * Pruebas automatizadas `python3 -m py_compile` y `npx tsc --noEmit`.

---

## 3. Matriz de Pruebas y Certificación de Compras

| ID Caso | Nombre del Caso | Descripción de la Prueba | Resultado Esperado |
| :--- | :--- | :--- | :--- |
| `TC-PUR-01` | Flujo de Aprobación | Crear O/C > $5,000 con usuario Comprador Jr | La orden pasa a `pending_approval` requiriendo firma del Gerente. |
| `TC-PUR-02` | 3-Way Matching OK | Conciliar ODC-001 recibida en WMS con Factura exacta | Conciliación aprobada al 100% y estado `reconciled`. |
| `TC-PUR-03` | Discrepancia de Costo | Cargar factura con costo unitario mayor al autorizado | El sistema resalta la fila en rojo y genera sugerencia de Nota de Débito. |
| `TC-PUR-04` | KRA Proveedor | Consultar ficha de proveedor con recepciones tardías | El Scorecard muestra reducción del % de cumplimiento. |
