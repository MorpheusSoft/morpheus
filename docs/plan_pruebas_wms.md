# Plan de Pruebas y Certificación: Módulo Logística & WMS (`NEO Warehouse`)

Este documento define la **Matriz de Casos de Prueba Funcionales, Integrados (E2E) y Criterios de Aceptación (UAT)** para certificar al **100%** el módulo logístico **NEO Warehouse**, estructurado formalmente según las opciones del menú de navegación activo del sistema.

---

## 1. Matriz de Pruebas por Opción de Menú

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      NEO WAREHOUSE - TEST MATRIX                        │
├───────────────────────────────────┬─────────────────────────────────────┤
│ Operaciones Logísticas            │ Configuración & Auditoría           │
│ ├─ 1. Dashboard Muelle            │ ├─ 5. Control de Lotes (FEFO)       │
│ ├─ 2. Recepción (Inbound)         │ ├─ 6. Ajustes Físicos               │
│ ├─ 3. Transferencias & Reabast.   │ └─ 7. Asistente IA                  │
│ └─ 4. Mapa de Almacén             │                                     │
│ *(Despachos & Picking desactivado)*│                                     │
└───────────────────────────────────┴─────────────────────────────────────┘
```

---

### 🏠 1. Dashboard Muelle (`/`)
**Objetivo:** Verificar la integridad de los accesos directos, tarjetas operativas y resúmenes de inventario en tiempo real.

| ID Caso | Descripción del Caso | Pasos de Ejecución | Resultado Esperado | Criterio de Éxito |
| :--- | :--- | :--- | :--- | :---: |
| `TC-DASH-01` | Carga de Tarjetas de Acceso | Acceder a la ruta `/` | Se despliegan las tarjetas principales (Muelle, Transferencias, Mapa, Lotes, Ajustes). | PASS |
| `TC-DASH-02` | Navegación por Clic | Hacer clic en la tarjeta "Muelle de Recepción" | Redirección inmediata a `/receipts`. | PASS |
| `TC-DASH-03` | Resumen de Ocupación | Revisar los indicadores de métricas | Muestra el total de camiones pendientes por recibir. | PASS |

---

### 🚚 2. Recepción - Inbound (`/receipts`)
**Objetivo:** Garantizar el ingreso correcto de mercancías provenientes de Órdenes de Compra y Recepciones Directas.

| ID Caso | Descripción del Caso | Pasos de Ejecución | Resultado Esperado | Criterio de Éxito |
| :--- | :--- | :--- | :--- | :---: |
| `TC-INB-01` | Filtros de Muelle | Seleccionar Sucursal y Proveedor | Filtra dinámicamente las O/C correspondientes al muelle. | PASS |
| `TC-INB-02` | Recepción con Lote | Ingresar a una O/C, colocar Lote y Fecha de Vencimiento | Registra la entrada y genera el registro en `batches`. | PASS |
| `TC-INB-03` | Recepción Parcial | Recibir solo el 50% de la cantidad pedida | La orden cambia a estado `partial` (Backorder activo). | PASS |
| `TC-INB-04` | Recepción Directa | Hacer clic en "Recepción Directa (Sin ODC)", llenar renglones y guardar | Crea la recepción `REC-DIR-...` y suma al stock. | PASS |
| `TC-INB-05` | **Rechazo en Puerta (Devolución)** | Marcar devolución al chofer por daño/avería en muelle | Registra el rechazo, refleja la devolución en el Acta 80mm y NO suma al stock. | PASS |
| `TC-INB-06` | **Retención / Bloqueo de Lote** | Bloquear lote en `/lots` para inspección técnica | Cambia el estado a retenido impidiendo su picking/despacho. | PASS |

---

### 🔄 3. Reabastecimiento y Transferencias Inter-Sucursales (`/transfers`)
**Objetivo:** Validar la gestión de solicitudes, preparación en origen, guías en tránsito con almacén virtual, transferencias directas y recepción en destino con observaciones por producto.

| ID Caso | Descripción del Caso | Pasos de Ejecución | Resultado Esperado | Criterio de Éxito |
| :--- | :--- | :--- | :--- | :---: |
| `TC-TRF-01` | **Solicitud Multirrenglón** | Clic en "Solicitar Reabastecimiento", agregar múltiples productos por SKU/Nombre y enviar | Se crea la solicitud en estado `SOLICITADA (POR ACEPTAR)`. | PASS |
| `TC-TRF-02` | **Aprobación en Origen** | En la sucursal de origen, presionar el botón `Aceptar` | Pasa la orden a estado `EN PREPARACIÓN`. | PASS |
| `TC-TRF-03` | **Despacho y Tránsito Virtual** | Presionar el botón `Despachar` en origen | Descuenta del stock disponible de Origen, entra al Almacén Virtual de Tránsito (`TRANSIT_WH`) y pasa a `EN TRÁNSITO 🚚`. | PASS |
| `TC-TRF-04` | **Recepción con Novedades** | En la sucursal de destino, presionar `Recibir`, validar conteo físico e ingresar observaciones por producto y general | Carga el stock al disponible de Destino, sale de Tránsito y la orden pasa a `COMPLETADO 🟢`. | PASS |
| `TC-TRF-05` | **Transferencia Directa Multirrenglón** | Clic en "Transferencia Directa (Sin Solicitud)", seleccionar múltiples ítems y emitir | Nace inmediatamente en `EN TRÁNSITO 🚚`, aparece en movimientos en curso y permite ser recibida en destino. | PASS |
| `TC-TRF-06` | **Rechazo de Solicitud** | Presionar el botón `❌` (Rechazar) en estado `SOLICITADA` | Pasa a estado `RECHAZADO / CANCELADO` y se libera la solicitud. | PASS |
| `TC-TRF-07` | **Separación de Pestañas** | Verificar las pestañas "Solicitudes y Movimientos en Curso" e "Histórico de Guías" | La Pestaña 1 muestra solo órdenes activas (`SOLICITADA`, `EN PREPARACIÓN`, `EN TRÁNSITO`). La Pestaña 2 muestra exclusivamente `COMPLETADO` y `CANCELADO`. | PASS |
| `TC-TRF-08` | **Auditoría & Trazabilidad** | Hacer clic en el botón `👁️` (Ver Detalle) en cualquier orden | Muestra creador, despachador en origen (con fecha/hora), receptor en destino (con fecha/hora) y observaciones por renglón. | PASS |

---

### 🗺️ 4. Mapa de Almacén (`/locations`)
**Objetivo:** Evaluar la jerarquía de almacenamiento, bloqueo de pasillos y mapa térmico de ocupación volumétrica.

| ID Caso | Descripción del Caso | Pasos de Ejecución | Resultado Esperado | Criterio de Éxito |
| :--- | :--- | :--- | :--- | :---: |
| `TC-LOC-01` | Árbol de Almacenes | Cargar la pantalla `/locations` | Muestra la estructura Almacén > Zona > Estante. | PASS |
| `TC-LOC-02` | **Mapa Térmico** | Observar la columna de Saturación Volumétrica | Muestra la barra de % de llenado y etiqueta (`DESPEJADO`, `OCUPADO`, `SATURADO`). | PASS |
| `TC-LOC-03` | Bloqueo de Ubicación | Cambiar estado de ubicación a bloqueada | Impide seleccionar dicha ubicación para recepciones o salidas. | PASS |

---

### 🗓️ 5. Control de Lotes & FEFO (`/lots`)
**Objetivo:** Certificar la trazabilidad por número de lote y la sugerencia de salida por vencimiento (First Expired, First Out).

| ID Caso | Descripción del Caso | Pasos de Ejecución | Resultado Esperado | Criterio de Éxito |
| :--- | :--- | :--- | :--- | :---: |
| `TC-LOT-01` | Búsqueda de Lote | Escribir número de lote en la barra de búsqueda | Filtra inmediatamente el lote correspondiente. | PASS |
| `TC-LOT-02` | **Sugerencia FEFO** | Observar la tabla de lotes de un mismo producto | El lote que vence primero exhibe el badge verde **"FEFO RECOMENDADO"**. | PASS |
| `TC-LOT-03` | Semáforo Vencimiento | Probar con un lote a vencer en 15 días | Muestra el estado `POR VENCER (< 30 DÍAS)` en color amarillo. | PASS |

---

### ⚖️ 6. Ajustes Físicos & Mermas (`/adjustments`)
**Objetivo:** Validar la corrección de faltantes/sobrantes y el registro de mermas por rotura/daño.

| ID Caso | Descripción del Caso | Pasos de Ejecución | Resultado Esperado | Criterio de Éxito |
| :--- | :--- | :--- | :--- | :---: |
| `TC-ADJ-01` | Ajuste por Faltante | Seleccionar ubicación, producto y cantidad a ajustar (-) | Genera el movimiento de ajuste y descuenta del saldo. | PASS |
| `TC-ADJ-02` | Registro de Merma | Registrar mercancía rota seleccionando motivo "DAÑADO" | Afecta el inventario de merma y queda registrado en Kardex. | PASS |

---

### 🤖 7. Asistente IA Logístico (`/asistente-ia`)
**Objetivo:** Probar la interacción por lenguaje natural para consultas de stock y recomendaciones de espacio.

| ID Caso | Descripción del Caso | Pasos de Ejecución | Resultado Esperado | Criterio de Éxito |
| :--- | :--- | :--- | :--- | :---: |
| `TC-AI-01` | Consulta de Stock | Escribir "¿Dónde está ubicado el SKU 1002?" | El asistente responde con la ubicación y saldo disponible. | PASS |

---

## 2. Protocolo de Ejecución del Escenario Integrado (Prueba E2E WMS)

Para certificar el módulo al **100% en Producción/Staging**, el usuario evaluador debe seguir esta secuencia continua:

```mermaid
graph TD
    A[1. Recepción Inbound en Muelle] --> B[2. Putaway a Estante & FEFO]
    B --> C[3. Solicitud de Reabastecimiento]
    C --> D[4. Aceptación & Despacho a Tránsito]
    D --> E[5. Recepción Conforme en Destino con Notas]
    E --> F[6. Histórico & Auditoría]
```

1. **Recepción Inbound:** Recibir 100 unidades del producto en `Recepción (Inbound)` registrando lote `LOT-TEST-01` con fecha de vencimiento.
2. **Ubicación & FEFO:** Ubicar las unidades en el estante `STOCK-A1` y verificar la sugerencia FEFO en `/lots`.
3. **Solicitud Inter-Sucursales:** En `/transfers`, crear una Solicitud de Reabastecimiento desde la tienda `CUMBOTO` hacia `PATIO TRIGAL` por 50 unidades (`SOLICITADA`).
4. **Preparación & Despacho:** La tienda `PATIO TRIGAL` presiona `Aceptar` (`EN PREPARACIÓN`) y luego `Despachar`. El stock sale de `PATIO TRIGAL` e ingresa al **Almacén Virtual de Tránsito** (`EN TRÁNSITO 🚚`).
5. **Recepción con Novedades:** La tienda `CUMBOTO` presiona `Recibir`, confirma 49 unidades recibidas con la nota *"1 unidad dañada en ruta"*, finalizando la orden (`COMPLETADO 🟢`).
6. **Auditoría & Histórico:** La orden se traslada a la pestaña **Histórico de Guías de Traslado**. Al presionar `👁️`, se verifica el registro completo de usuarios, fechas/horas y observaciones por renglón.
