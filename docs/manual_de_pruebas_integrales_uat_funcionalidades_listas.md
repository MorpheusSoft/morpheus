# 📘 Manual Integral de Pruebas de Usuario (UAT)
## Plataforma Morpheus / NEO ERP & WMS — Funcionalidades 100% Listas `[✓]`

**Versión:** 1.0 — Secuencia de Datos Limpios (Zero-Data / Fresh Start)  
**Fecha:** Septiembre de 2026  
**Ambiente de Validación:** QA Staging (`https://hub.qa.morpheussoft.net`)  
**Audiencia:** Jefes de Almacén, Analistas de Compras, Contralores de Inventario, Gerencia de Operaciones y Equipo de Auditoría  
**Documento de Referencia:** [`docs/seguimiento_de_desarrollo_y_proceso.md`](file:///home/lzambrano/Desarrollo/Morpheus/docs/seguimiento_de_desarrollo_y_proceso.md) (29 funcionalidades operativas auditadas)

---

## 🧭 1. Reglas de Juego y Acceso Universal

### 📌 Premisa Fundamental: "Base de Datos Limpia"
Este manual fue concebido bajo el principio de **secuencia acumulativa de datos**. Al iniciar con una base de datos limpia, **cada prueba genera de forma natural los registros que consumirá la prueba siguiente**. Se deben ejecutar en el orden estricto presentado para garantizar que no existan dependencias faltantes.

### 🔑 Flujo Único de Autenticación (Single Sign-On)
Todas las aplicaciones de la plataforma (Compras, WMS, Inventarios, Precios) comparten la misma sesión centralizada a través de **Neo Core Hub**.

```
┌──────────────────────────────────────┐
│       1. Iniciar Sesión en Hub       │
│    https://hub.qa.morpheussoft.net   │
│  Usuario: admin@morpheus.com         │
│  Clave: admin123                     │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│      2. Verificar Sucursal Activa    │
│      Selector: [ PATIO TRIGAL ▼ ]    │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│     3. Conmutar con AppSwitcher (▦)  │
│   (Compras / WMS / Inventario / Costos)│
└──────────────────────────────────────┘
```

---

## ⛓️ 2. Diagrama de Secuencia y Cadena de Valor

```mermaid
graph TD
    subgraph FASE 1: Infraestructura y Maestros
        A["1. Crear Almacenes y Depósitos"] --> B["2. Mapear Ubicaciones DOCK, SHELF, LOSS"]
        B --> C["3. Alta de Proveedor Comercial"]
        C --> D["4. Alta de Producto Maestro + Código de Barras"]
    end

    subgraph FASE 2: Compras y Abastecimiento
        D --> E["5. Análisis de Sugerido de Compras (MRP)"]
        E --> F["6. Emisión de Orden de Compra Bimonetaria"]
        F --> G["7. Aceptación Digital en Portal Proveedor B2B"]
    end

    subgraph FASE 3: Recepción Física e Inbound WMS
        G --> H["8. Recepción en Muelle DOCK con Lotes y Vencimientos"]
        H --> I["9. Impresión de Ticket Térmico 80mm de Bultos"]
        H --> J["10. Recepción Directa sin ODC"]
    end

    subgraph FASE 4: Almacenamiento, Calidad y FEFO
        H --> K["11. Control de Lotes y Semáforo FEFO"]
        K --> L["12. Bloqueo de Lote en Cuarentena Preventiva"]
        K --> M["13. Reubicación Putaway de DOCK a SHELF"]
        M --> N["14. Verificación de Mapa Térmico y Capacidad"]
    end

    subgraph FASE 5: Conciliación 3-Way Match y Auditoría Fiscal
        H --> O["15. Cruce 3-Way Match: ODC vs WMS vs Factura"]
        O --> P["16. Generación de Nota de Débito Automática"]
        P --> Q["17. Protección Automática de Margen Comercial (PVP)"]
        Q --> R["18. Consulta de Auditoría Fiscal en Detalle de Orden"]
    end

    subgraph FASE 6: Costos, Pricing y Tienda
        Q --> S["19. Auditoría de Recálculo de Costo Promedio"]
        S --> T["20. Sesión Masiva de Precios por Margen Objetivo"]
        T --> U["21. Emisión e Impresión de Habladores de Góndola"]
        U --> V["22. Verificación en Kiosco de Consulta al Cliente"]
    end

    subgraph FASE 7: Operaciones Internas y Salidas
        M --> W["23. Picking y Despacho con Sugerencia FEFO"]
        M --> X["24. Transferencia entre Almacenes con Tránsito"]
        M --> Y["25. Ajuste Físico y Declaración de Merma a LOSS"]
        W & X & Y --> Z["26. Auditoría de Kardex en Partida Doble"]
        Z --> AA["27. Reporte de Valoración Financiera de Inventario"]
    end

    subgraph FASE 8: Inteligencia Artificial y Clientes B2B
        Z --> AB["28. Consultas en Asistente IA de Depósito"]
        T --> AC["29. Pedido Comercial en Catálogo B2B"]
    end
```

---

## 📦 3. Catálogo de Datos de Prueba Unificados

Para mantener coherencia matemática durante toda la jornada de pruebas, utilizaremos estos datos estándar:

| Entidad | Campo | Valor de Prueba |
| :--- | :--- | :--- |
| **Sucursal** | Nombre | `Patio Trigal` (ID: 1) |
| **Almacenes** | Principal / Averías | `Almacén Principal` (`WH-MAIN`) / `Almacén Mermas` (`WH-LOSS`) |
| **Ubicaciones** | Muelle / Estante / Pérdida | `DOCK-01` (Muelle) / `PAS-01-EST-A1` (Estante) / `MERMA-01` (Averías) |
| **Proveedor** | Razón Social / RIF | `Distribuidora Alimentos Polar C.A.` / `J-00041372-1` |
| **Producto** | Descripción / SKU / EAN | `Harina PAN Tradicional 1kg` / `HRN-PAN-01` / `7591031001015` |
| **Lote 1 (Crítico)** | Número / Vencimiento | `LOT-POLAR-2026-A` / **20 días a futuro** (Semáforo Alerta) |
| **Lote 2 (Vigente)** | Número / Vencimiento | `LOT-POLAR-2026-B` / **12 meses a futuro** (Semáforo Verde) |
| **Condición Comercial** | Costo ODC / Facturado | ODC: **$1.10** / Factura: **$1.15** (Discrepancia para Nota de Débito) |

---

# 🚀 4. Guía Detallada de Ejecución de Pruebas Caso por Caso

---

### 🏛️ FASE 1: Infraestructura y Datos Maestros

#### 🧪 CASO 01: Creación de Almacenes y Depósitos
* **Módulo:** Neo Logística / WMS ➔ `/wms/locations` (o Neo Core ➔ `/core/warehouses`).
* **Objetivo:** Dar de alta los recintos físicos donde operará la sucursal de prueba.
* **Paso a Paso:**
  1. Ingresa a **Neo Core** (`https://hub.qa.morpheussoft.net`) y conéctate como `admin@morpheus.com`.
  2. Mediante el menú lateral o el AppSwitcher (▦), ve a **Neo Logística / WMS** ➔ **"Ubicaciones"** (`/wms/locations`).
  3. En la barra superior, haz clic en **"+ Nuevo Almacén"**:
     - **Nombre:** `Almacén Principal Patio Trigal`
     - **Código:** `WH-MAIN`
     - **Es Scrap/Merma:** `No`
     - Presiona **"Crear Almacén"**.
  4. Repite la acción para crear el almacén de averías:
     - **Nombre:** `Almacén Averías y Devoluciones`
     - **Código:** `WH-LOSS`
     - **Es Scrap/Merma:** `Sí`
     - Presiona **"Crear Almacén"**.
* **Resultado Esperado `[✓]`:** Ambos almacenes aparecen listados en el selector de depósitos con sus etiquetas identificativas.

---

#### 🧪 CASO 02: Configuración de Ubicaciones Físicas (`DOCK`, `SHELF`, `LOSS`)
* **Módulo:** Neo Logística / WMS ➔ `/wms/locations`.
* **Objetivo:** Modelar la zona de descarga (muelle), pasillo de almacenamiento y zona de pérdida con su cubicaje.
* **Paso a Paso:**
  1. En `/wms/locations`, selecciona el almacén `WH-MAIN`.
  2. Haz clic en **"+ Nueva Ubicación"** y crea el Muelle de Recepción:
     - **Nombre / Código:** `DOCK-01`
     - **Tipo:** `DOCK` (Muelle de Entrada)
     - **Uso:** `INTERNAL`
     - **Capacidad Volumétrica:** `50` m³
     - Presiona **"Guardar"**.
  3. Haz clic en **"+ Nueva Ubicación"** y crea la estantería de pasillo:
     - **Nombre / Código:** `PAS-01-EST-A1`
     - **Tipo:** `SHELF` (Estante)
     - **Uso:** `INTERNAL`
     - **Capacidad Volumétrica:** `20` m³
     - Presiona **"Guardar"**.
  4. Cambia al almacén `WH-LOSS`, haz clic en **"+ Nueva Ubicación"** y crea la zona de descarte:
     - **Nombre / Código:** `MERMA-01`
     - **Tipo:** `LOSS` (Zona de Pérdidas / Merma)
     - **Uso:** `INTERNAL`
     - Presiona **"Guardar"**.
* **Resultado Esperado `[✓]`:** En el árbol de ubicaciones se reflejan las zonas con sus iconos distintivos (`DOCK`, `SHELF`, `LOSS`) y capacidades asignadas.

---

#### 🧪 CASO 03: Alta de Proveedor Comercial y Datos Fiscales
* **Módulo:** Neo Compras ➔ `/suppliers`.
* **Objetivo:** Registrar al distribuidor con sus términos fiscales y tiempos de despacho.
* **Paso a Paso:**
  1. Abre el AppSwitcher (▦) y selecciona **Neo Compras** (`https://compras.qa.morpheussoft.net/compras/suppliers`).
  2. Haz clic en el botón superior **"+ Nuevo Proveedor"**:
     - **Razón Social:** `Distribuidora Alimentos Polar C.A.`
     - **RIF:** `J-00041372-1`
     - **Teléfono Comercial:** `0241-8000000`
     - **Correo Comercial:** `ventas@polar.com`
     - **Tiempo de Entrega (Lead Time):** `3` días
     - **Días de Crédito:** `15` días
  3. Haz clic en **"Guardar Proveedor"**.
* **Resultado Esperado `[✓]`:** El proveedor queda registrado y activo en el directorio con RIF visible y condiciones de crédito configuradas.

---

#### 🧪 CASO 04: Catálogo Maestro de Productos y Códigos de Barra
* **Módulo:** Neo Inventario ➔ `/products` (o Neo Compras ➔ `/products`).
* **Objetivo:** Crear la ficha del artículo base con su unidad de medida y código EAN-13 oficial.
* **Paso a Paso:**
  1. Ve a **Neo Inventario** ➔ **"Productos"** (`/products`).
  2. Haz clic en **"+ Nuevo Producto"**:
     - **Nombre:** `Harina PAN Tradicional 1kg`
     - **Marca:** `PAN`
     - **Categoría:** `Alimentos Secos`
     - **Unidad de Medida:** `PZA` (Pieza)
     - **Origen:** `Nacional`
     - **Costo de Reposición Inicial:** `$1.10`
     - **Precio de Venta Base (PVP):** `$1.45`
  3. En la sección de Códigos de Barra, ingresa:
     - **Código de Barras (EAN-13):** `7591031001015`
     - **Tipo:** `Pieza Individual`
  4. Presiona **"Guardar Producto"**.
* **Resultado Esperado `[✓]`:** El producto aparece en el catálogo maestro con SKU autogenerado (ej. `PRD-X`), código de barras asociado y costo base.

---

### 🛒 FASE 2: Compras y Abastecimiento

#### 🧪 CASO 05: Sugerido de Compras Inteligente (MRP Predictivo)
* **Módulo:** Neo Compras ➔ `/suggestions`.
* **Objetivo:** Verificar que el motor de sugerido evalúa consumos, stock de seguridad y punto de reorden.
* **Paso a Paso:**
  1. En Neo Compras, ingresa al menú **"Sugeridos MRP"** (`/suggestions`).
  2. Selecciona la sucursal `Patio Trigal`.
  3. Observa la tabla de sugerencias. Como el producto `Harina PAN Tradicional 1kg` tiene stock en cero (0), el algoritmo de reabastecimiento lo lista automáticamente con prioridad **ALTA / CRÍTICA**.
  4. Verifica que el sistema muestra:
     - Stock Actual: `0`
     - Consumo Diario Estimado.
     - Cantidad Sugerida a Comprar (ej. `100` unidades).
     - Proveedor sugerido: `Distribuidora Alimentos Polar C.A.`.
  5. Haz clic en la casilla de selección del producto y presiona **"Convertir en Orden de Compra"**.
* **Resultado Esperado `[✓]`:** El sistema transfiere la sugerencia directamente a la pantalla de emisión de orden con cantidades y proveedor prellenados.

---

#### 🧪 CASO 06: Emisión de Orden de Compra (ODC) Bimonetaria
* **Módulo:** Neo Compras ➔ `/orders/new`.
* **Objetivo:** Emitir una orden formal con condiciones bimonetarias (USD / Bs.), plazos y descuentos.
* **Paso a Paso:**
  1. En la pantalla de emisión de orden:
     - **Proveedor:** `Distribuidora Alimentos Polar C.A.`
     - **Fecha de Entrega Estimada:** 3 días posteriores a hoy.
     - **Moneda:** `USD` (con contravalor en Bs. según tasa BCV).
  2. En la línea del producto:
     - Producto: `Harina PAN Tradicional 1kg`
     - Cantidad Solicitada: `100` piezas
     - Costo Pactado: `$1.10` por unidad
     - Descuento Comercial: `5%`
  3. Verifica la liquidación matemática:
     - Subtotal Bruto: `$110.00`
     - Descuento: `-$5.50`
     - Base Imponible: `$104.50`
     - IVA (16% si aplica) y Total Neto.
  4. Haz clic en **"Emitir y Aprobar Orden de Compra"**.
* **Resultado Esperado `[✓]`:** La orden se genera con número correlativo (ej. `OC-00001`), estado `ISSUED` o `CONFIRMED` y genera un **Token B2B de acceso público**.

---

#### 🧪 CASO 07: Portal B2B del Proveedor (Acceso Público sin Login)
* **Módulo:** Navegador en Modo Incógnito ➔ `https://compras.qa.morpheussoft.net/compras/public/orders/[TOKEN]`.
* **Objetivo:** Comprobar que el proveedor puede consultar la orden, descargar el PDF formal y confirmar su compromiso de entrega sin requerir usuario en el sistema.
* **Paso a Paso:**
  1. En el detalle de la orden recién creada (`/orders/[id]`), copia el **Enlace B2B del Proveedor**.
  2. Abre una ventana de navegación privada o incógnito y pega el enlace.
  3. Verifica que la pantalla pública carga sin pedir login y muestra:
     - Logotipo empresarial y datos del proveedor.
     - Detalle de productos, cantidades y costo pactado ($1.10).
  4. Presiona el botón **"Descargar Orden (PDF)"** y valida la descarga del documento formal.
  5. En el formulario inferior de aceptación:
     - Ingresa la fecha de despacho prometida.
     - Haz clic en **"Confirmar Aceptación de la Orden"**.
* **Resultado Esperado `[✓]`:** La pantalla muestra mensaje de confirmación exitosa con sello de fecha, hora e IP. Al regresar a Neo Compras, la orden cambia automáticamente de estado a **`CONFIRMED`**.

---

### 🚚 FASE 3: Recepción Física e Inbound WMS

#### 🧪 CASO 08: Recepción contra ODC en Muelle con Lotes y Vencimientos
* **Módulo:** Neo Logística / WMS ➔ `/wms/receipts`.
* **Objetivo:** Registrar la entrada física de mercancía en el muelle `DOCK-01`, desglosando dos lotes con fechas distintas (uno crítico y uno vigente).
* **Paso a Paso:**
  1. Conéctate a **Neo Logística / WMS** y entra a **"Recepciones"** (`/wms/receipts`).
  2. Haz clic en **"+ Nueva Recepción contra ODC"** y selecciona la orden `OC-00001`.
  3. Ubicación de Destino: Selecciona `DOCK-01` (Muelle).
  4. En el desglose de recepción de `Harina PAN Tradicional 1kg`, simularemos que el proveedor despachó **95 unidades** en lugar de las 100 pactadas (para probar faltante posterior en 3-Way Match):
     - **Línea 1:**
       - Cantidad: `30` unidades
       - Número de Lote: `LOT-POLAR-2026-A`
       - Fecha de Vencimiento: **Fecha de hoy + 20 días** (ej. `28/09/2026`)
     - **Línea 2:**
       - Cantidad: `65` unidades
       - Número de Lote: `LOT-POLAR-2026-B`
       - Fecha de Vencimiento: **Fecha de hoy + 365 días** (ej. `08/09/2027`)
  5. Total recibido: `95` unidades (5 unidades faltantes respecto a la ODC).
  6. Presiona **"Confirmar Recepción Física en Muelle"**.
* **Resultado Esperado `[✓]`:** La recepción se procesa con éxito, cambia a estado `COMPLETED` o `RECEIVED`, ingresando el stock al muelle `DOCK-01` con la traza de ambos lotes.

---

#### 🧪 CASO 09: Impresión de Ticket Térmico de Recepción (80mm)
* **Módulo:** Neo Logística / WMS ➔ `/wms/receipts/{id}/ticket-80mm`.
* **Objetivo:** Generar el ticket de recepción física para control visual y pegado en estibas/bultos.
* **Paso a Paso:**
  1. En el resumen de la recepción confirmada, presiona el botón **"Imprimir Ticket (80mm)"**.
  2. Se abrirá la vista optimizada de impresión para impresora térmica.
  3. Verifica que el comprobante incluye:
     - Nombre de la empresa y sucursal `Patio Trigal`.
     - Número de recepción y ODC asociada.
     - Detalle de los lotes: `LOT-POLAR-2026-A` (30 un.) y `LOT-POLAR-2026-B` (65 un.).
     - Código de barras para escaneo rápido.
* **Resultado Esperado `[✓]`:** Formato listo para impresión en bobina térmica de 80mm con trazabilidad de lotes.

---

#### 🧪 CASO 10: Recepción Directa en Muelle sin Orden de Compra
* **Módulo:** Neo Logística / WMS ➔ `/wms/receipts/direct`.
* **Objetivo:** Validar la capacidad de recibir mercancía urgente, devoluciones o compras locales sin orden previa.
* **Paso a Paso:**
  1. En el menú de WMS, haz clic en **"Recepción Directa"** (`/wms/receipts/direct`).
  2. Proveedor: `Distribuidora Alimentos Polar C.A.`.
  3. Ubicación: `DOCK-01`.
  4. Agrega un ítem: `Harina PAN Tradicional 1kg`, Cantidad: `5` unidades, Lote: `LOT-DIRECT-01`, Vencimiento: 6 meses.
  5. Presiona **"Procesar Entrada Directa"**.
* **Resultado Esperado `[✓]`:** Se registra el movimiento de entrada inmediata aumentando las existencias físicas en el muelle.

---

### 🏷️ FASE 4: Almacenamiento, Calidad y FEFO

#### 🧪 CASO 11: Control de Lotes y Semáforo FEFO en Tiempo Real
* **Módulo:** Neo Logística / WMS ➔ `/wms/lots`.
* **Objetivo:** Auditar la clasificación automática de lotes según su fecha de expiración.
* **Paso a Paso:**
  1. Ingresa a la pantalla de **"Control de Lotes"** (`/wms/lots`).
  2. Observa la tabla de saldos por lote del producto `Harina PAN Tradicional 1kg`:
     - **`LOT-POLAR-2026-A` (30 un.):** Muestra semáforo **AMARILLO / ROJO** (`POR VENCER <30 DÍAS` o `CRÍTICO`).
     - **`LOT-POLAR-2026-B` (65 un.):** Muestra semáforo **VERDE** (`VIGENTE`).
  3. Verifica que el orden predeterminado prioriza la salida por **FEFO** (*First Expired, First Out*).
* **Resultado Esperado `[✓]`:** El sistema categoriza visual y cronológicamente los lotes sin requerir intervención manual.

---

#### 🧪 CASO 12: Bloqueo de Calidad / Cuarentena Preventiva
* **Módulo:** Neo Logística / WMS ➔ `/wms/lots`.
* **Objetivo:** Aislar un lote defectuoso o sospechoso para impedir que sea reubicado o despachado.
* **Paso a Paso:**
  1. En la fila del lote `LOT-POLAR-2026-A`, haz clic en el botón o interruptor **"Cuarentena"** (`toggle-quarantine`).
  2. Aparece un modal solicitando motivo: escribe `Sospecha de humedad en empaque / Auditoría de calidad`.
  3. Confirma la acción.
* **Resultado Esperado `[✓]`:** El lote pasa a estado **`RETENIDO (CUARENTENA)`** con un distintivo rojo. Queda automáticamente inhabilitado para picking, ventas o traslados.

---

#### 🧪 CASO 13: Reubicación de Mercancía (*Putaway*) de Muelle a Estantería
* **Módulo:** Neo Logística / WMS ➔ `/wms/locations` (Modal Putaway).
* **Objetivo:** Trasladar la mercancía aprobada desde el muelle de descarga (`DOCK-01`) hacia su posición definitiva (`PAS-01-EST-A1`).
* **Paso a Paso:**
  1. En `/wms/locations`, abre el **Modal de Reubicación (Putaway)**.
  2. Ubicación Origen: `DOCK-01`.
  3. Ubicación Destino: `PAS-01-EST-A1`.
  4. Selecciona el producto `Harina PAN Tradicional 1kg`, Lote: `LOT-POLAR-2026-B` (65 unidades).
  5. Cantidad a Mover: `65`.
  6. Presiona **"Confirmar Reubicación"**.
* **Resultado Esperado `[✓]`:** El saldo en `DOCK-01` disminuye y se incrementa en `PAS-01-EST-A1`. Se genera el correspondiente movimiento de reubicación en Kardex.

---

#### 🧪 CASO 14: Monitoreo de Capacidad y Mapa Térmico de Ocupación
* **Módulo:** Neo Logística / WMS ➔ `/wms/locations`.
* **Objetivo:** Visualizar la saturación volumétrica del almacén.
* **Paso a Paso:**
  1. En la vista de ubicaciones, activa la pestaña o modo **"Mapa de Ocupación / Capacidad"**.
  2. Localiza la ubicación `PAS-01-EST-A1`.
  3. Verifica la barra de saturación en porcentaje (%) calculada en base al volumen de las 65 unidades de Harina PAN almacenadas frente a los 20 m³ de capacidad total.
* **Resultado Esperado `[✓]`:** La estantería muestra su nivel de llenado visual con código de colores según nivel de ocupación.

---

### ⚖️ FASE 5: Conciliación 3-Way Match Automática & Auditoría Fiscal

#### 🧪 CASO 15: Conciliación de Factura Fiscal contra ODC y Almacén
* **Módulo:** Neo Compras ➔ `/reconciliation`.
* **Objetivo:** Auditar y cruzar la factura física del proveedor contra la recepción de muelle y la orden original.
* **Paso a Paso:**
  1. Ingresa a **Neo Compras** ➔ **"Conciliación 3-Way Match"** (`/reconciliation`).
  2. En la pestaña **"Pendientes de Conciliar"**, localiza la orden `OC-00001` (Proveedor: Alimentos Polar).
  3. Haz clic en el botón **"Conciliar Factura"**.
  4. Se abre la **Matriz de Conciliación 3-Way Match**:
     - **Columna ODC:** Pedido: `100` un. | Costo: `$1.10`.
     - **Columna WMS (Recepción):** Recibido: `95` un.
     - **Columna Factura Proveedor:** Simularemos que la factura fiscal llegó cobrando **100 unidades** a **$1.15** c/u:
       - Número de Factura: `FACT-POLAR-9988`
       - Cantidad Facturada: `100`
       - Costo Unitario Facturado: `$1.15`
  5. Observa el panel de discrepancias:
     - ⚠️ **Discrepancia en Cantidad ($\Delta Q$):** Faltante de 5 unidades cobradas pero no recibidas ($5 \times \$1.15 = \$5.75$).
     - ⚠️ **Discrepancia en Precio ($\Delta C$):** Sobreprecio de $0.05 por unidad en 95 unidades ($95 \times \$0.05 = \$4.75$).
* **Resultado Esperado `[✓]`:** El sistema bloquea el botón de "Match Exacto" por variaciones injustificadas y habilita la opción de **Aprobación con Nota de Débito**.

---

#### 🧪 CASO 16: Emisión Automática de Nota de Débito y Deducción CxP
* **Módulo:** Neo Compras ➔ Modal de Conciliación en `/reconciliation`.
* **Objetivo:** Generar el ajuste contable automático por el faltante y sobreprecio total ($5.75 + $4.75 = $10.50).
* **Paso a Paso:**
  1. En el modal de conciliación, selecciona la acción: **"Aprobar con Emisión de Nota de Débito"**.
  2. Verifica que el sistema calcula el deducible retenido:
     - Monto Bruto Facturado: `$115.00`
     - **Monto Nota de Débito:** `-$10.50`
     - **Neto Real a Pagar (CxP):** `$104.50`
  3. Presiona **"Procesar y Emitir Nota de Débito"**.
  4. En pantalla se genera el comprobante oficial con correlativo `ND-20260908-XXXX`.
  5. Haz clic en **"Imprimir Comprobante Fiscal de Nota de Débito"** para validar su vista de impresión.
* **Resultado Esperado `[✓]`:** La orden pasa a estado `CONCILIATED_WITH_DEBIT_NOTE`, el comprobante de Nota de Débito queda emitido y la cuenta por pagar se liquida exactamente por el monto neto de mercancía recibida a costo pactado.

---

#### 🧪 CASO 17: Protección Automática de Margen Comercial (PVP)
* **Módulo:** Neo Compras ➔ `/reconciliation` y Neo Pricing ➔ `/precios`.
* **Objetivo:** Proteger la rentabilidad del negocio ajustando el PVP si el incremento de costo fuera aceptado o impactara reposición.
* **Paso a Paso:**
  1. Durante el procesamiento de conciliación con nuevo costo unitario, el sistema solicita:  
     *"¿Desea actualizar el PVP para proteger el 30% de margen comercial?"*.
  2. El sistema calcula y propone: Nuevo PVP sugerido = `$1.64` (en lugar de $1.45).
  3. Confirma la actualización del PVP.
* **Resultado Esperado `[✓]`:** El catálogo de precios actualiza de inmediato el precio de venta al público garantizando que el margen bruto de ganancia no se reduzca.

---

#### 🧪 CASO 18: Auditoría Fiscal en Detalle de la Orden
* **Módulo:** Neo Compras ➔ `/orders/[id]`.
* **Objetivo:** Comprobar la trazabilidad documental completa en la ficha de la orden de compra.
* **Paso a Paso:**
  1. En el listado de órdenes (`/orders`), selecciona la pestaña **"Conciliadas"**.
  2. Haz clic sobre la orden `OC-00001`.
  3. En la ficha de detalle, ubica el panel destacado **"Auditoría Fiscal (3-Way Match Conciliada)"**:
     - Estado: `CONCILIATED_WITH_DEBIT_NOTE`
     - Factura Proveedor: `FACT-POLAR-9988`
     - Número de Nota de Débito: `ND-20260908-XXXX`
     - Monto Deducido: `$10.50`
     - Neto CxP Liquidado: `$104.50`
* **Resultado Esperado `[✓]`:** Registro transparente y auditado para el departamento contable y fiscal.

---

### 💲 FASE 6: Costos, Pricing y Habladores

#### 🧪 CASO 19: Auditoría de Recálculo de Costo Promedio Ponderado
* **Módulo:** Neo Inventario ➔ `/valuation` (o Backend `/inventory/valuation`).
* **Objetivo:** Validar que las entradas recibidas a diferentes costos recalculan el costo promedio financiero con rigor matemático.
* **Paso a Paso:**
  1. Ingresa a **Neo Inventario** ➔ **"Valoración de Inventario"** (`/valuation`).
  2. Filtra por el producto `Harina PAN Tradicional 1kg`.
  3. Verifica que el **Costo Unitario Promedio** refleja fielmente la fórmula:
     $$\text{Costo Promedio} = \frac{(\text{Stock Anterior} \times \text{Costo Anterior}) + (\text{Cantidad Recibida} \times \text{Costo Recibido})}{\text{Stock Total}}$$
* **Resultado Esperado `[✓]`:** El costo promedio se actualiza automáticamente con cada recepción valorada.

---

#### 🧪 CASO 20: Sesión Masiva de Precios por Margen Objetivo
* **Módulo:** Neo Precios & Costos ➔ `/precios`.
* **Objetivo:** Simular y aplicar precios de venta en base a un margen comercial fijo (ej. 30%) con expresión bimonetaria oficial.
* **Paso a Paso:**
  1. Abre el AppSwitcher (▦) y conéctate a **Neo Precios** (`https://costos.qa.morpheussoft.net/costos/precios`).
  2. Selecciona la categoría `Alimentos Secos`.
  3. En la barra de herramientas, define el **Margen Comercial Objetivo:** `30%`.
  4. Presiona **"Simular Nuevos Precios"**.
  5. Revisa la columna de precio propuesto tanto en dólares ($) como en bolívares (Bs.) calculados según la tasa oficial del BCV vigente.
  6. Haz clic en **"Aplicar y Publicar Precios"**.
* **Resultado Esperado `[✓]`:** Todos los productos de la categoría quedan actualizados con sus nuevos precios bimonetarios respetando el margen de ganancia.

---

#### 🧪 CASO 21: Emisión e Impresión de Habladores de Góndola
* **Módulo:** Neo Precios & Costos ➔ `/habladores`.
* **Objetivo:** Generar etiquetas físicas de precio para exhibición en los estantes de la tienda.
* **Paso a Paso:**
  1. En Neo Precios, ve a **"Habladores de Góndola"** (`/habladores`).
  2. Selecciona el producto `Harina PAN Tradicional 1kg`.
  3. Escoge la plantilla de diseño: `Formato Estándar Góndola (10cm x 4cm)`.
  4. Presiona **"Vista Previa e Imprimir"**.
  5. Comprueba que la etiqueta incluye:
     - Nombre del artículo: `Harina PAN Tradicional 1kg`.
     - Precio en USD ($) destacado.
     - Precio en Bs. conforme a normativa legal.
     - Código de barras legible `7591031001015`.
* **Resultado Esperado `[✓]`:** Hablador renderizado con diseño profesional listo para corte e inserción en el fleje de góndola.

---

#### 🧪 CASO 22: Kiosco Verificador de Precios al Consumidor
* **Módulo:** Neo Precios & Costos ➔ `/kiosco/consultor` (o `/kiosco`).
* **Objetivo:** Emular el terminal de autoservicio donde el cliente de tienda consulta el precio escaneando el código de barras.
* **Paso a Paso:**
  1. Abre la pantalla de **"Kiosco Verificador"** (`/kiosco/consultor`).
  2. En el campo de lectura de código de barras, escribe o escanea con lector óptico: `7591031001015`.
  3. Presiona Enter.
* **Resultado Esperado `[✓]`:** En menos de 0.5 segundos aparece en pantalla la imagen del producto, su descripción, el PVP en dólares y el total en bolívares a tasa oficial.

---

### 📤 FASE 7: Operaciones Internas, Salidas y Kardex

#### 🧪 CASO 23: Picking y Despacho con Algoritmo FEFO Automático
* **Módulo:** Neo Logística / WMS ➔ `/wms/shipments`.
* **Objetivo:** Validar que al generar una orden de despacho, el sistema sugiere automáticamente el lote con fecha más próxima a expirar y **salta cualquier lote en cuarentena**.
* **Paso a Paso:**
  1. En Neo Logística, ingresa a **"Despachos / Picking"** (`/wms/shipments`).
  2. Haz clic en **"+ Nueva Orden de Despacho"**:
     - Destino: Cliente Mostrador o Sucursal Externa.
     - Producto: `Harina PAN Tradicional 1kg`.
     - Cantidad: `10` unidades.
  3. Haz clic en **"Generar Sugerencia de Picking (FEFO)"**.
  4. Observa qué lote recomienda el sistema:
     - Recordar que `LOT-POLAR-2026-A` vence antes, pero **está bloqueado en Cuarentena**.
     - Por lo tanto, el algoritmo inteligente salta el lote bloqueado y asigna unidades de **`LOT-POLAR-2026-B`**.
  5. Confirma la ola de picking y presiona **"Completar Despacho Físico"**.
* **Resultado Esperado `[✓]`:** El sistema respeta la cuarentena de calidad, garantiza rotación FEFO sobre lotes aptos y rebaja 10 unidades del inventario disponible.

---

#### 🧪 CASO 24: Transferencia Interna entre Almacenes con Tránsito Virtual
* **Módulo:** Neo Logística / WMS ➔ `/wms/transfers`.
* **Objetivo:** Mover existencias entre dos almacenes con custodia durante el trayecto.
* **Paso a Paso:**
  1. En Neo Logística, entra a **"Transferencias"** (`/wms/transfers`).
  2. Haz clic en **"+ Nueva Transferencia"**:
     - Almacén Origen: `Almacén Principal` (`WH-MAIN`).
     - Almacén Destino: `Almacén Secundario` (o Almacén Tienda).
     - Producto: `Harina PAN Tradicional 1kg`, Cantidad: `5` unidades.
  3. Haz clic en **"Despachar / Enviar a Tránsito"**.
  4. Verifica que el stock ya no está en `WH-MAIN` pero tampoco en el destino final, sino en la ubicación virtual `TRANSIT`.
  5. Presiona **"Confirmar Recepción en Destino"**.
* **Resultado Esperado `[✓]`:** La transferencia concluye con éxito; el stock pasa a estar disponible en el almacén de destino con trazabilidad completa de los dos pasos.

---

#### 🧪 CASO 25: Ajuste Físico y Declaración de Merma a Ubicación `LOSS`
* **Módulo:** Neo Logística / WMS ➔ `/wms/adjustments`.
* **Objetivo:** Declarar una avería o merma física y trasladarla a la ubicación de pérdidas para posterior desincorporación.
* **Paso a Paso:**
  1. En Neo Logística, entra a **"Ajustes de Inventario"** (`/wms/adjustments`).
  2. Haz clic en **"+ Nuevo Ajuste / Merma"**:
     - Tipo de Ajuste: `SALIDA POR AVERÍA / MERMA`.
     - Ubicación Origen: `PAS-01-EST-A1`.
     - Ubicación Destino: `MERMA-01` (Almacén `WH-LOSS`).
     - Producto: `Harina PAN Tradicional 1kg`.
     - Cantidad: `2` unidades.
     - Motivo: `Empaque roto durante manipulación en pasillo`.
  3. Haz clic en **"Procesar Ajuste"**.
* **Resultado Esperado `[✓]`:** Las 2 unidades se descuentan del stock vendible de estantería y quedan asentadas en la zona de merma con su motivo registrado.

---

#### 🧪 CASO 26: Auditoría del Kardex Multi-Ubicación en Partida Doble
* **Módulo:** Neo Inventario ➔ `/kardex`.
* **Objetivo:** Comprobar que todos y cada uno de los movimientos ejecutados se registraron con balance contable perfecto (Debe/Haber físico).
* **Paso a Paso:**
  1. Ingresa a **Neo Inventario** ➔ **"Kardex"** (`/kardex`).
  2. Filtra por el producto `Harina PAN Tradicional 1kg`.
  3. Audita la secuencia cronológica de movimientos:
     - Entrada por Recepción ODC: `+95` un. (Origen: Proveedor ➔ Destino: `DOCK-01`).
     - Entrada Directa: `+5` un.
     - Reubicación Putaway: Salida de `DOCK-01`, Entrada a `PAS-01-EST-A1` (`65` un.).
     - Despacho Picking: `-10` un.
     - Transferencia: `-5` un.
     - Merma/Avería: `-2` un.
  4. Verifica que cada fila registra: Fecha/Hora exacta, Usuario responsable, Tipo de Documento y Saldo Final Resultante.
* **Resultado Esperado `[✓]`:** Kardex 100% auditable con partida doble y sin desfases ni descuadres de saldo.

---

#### 🧪 CASO 27: Reporte de Valoración Financiera de Inventario
* **Módulo:** Neo Inventario ➔ `/valuation`.
* **Objetivo:** Extraer el balance monetario oficial de inventario para cierre contable.
* **Paso a Paso:**
  1. En Neo Inventario, ingresa a **"Valoración"** (`/valuation`).
  2. Consulta el resumen de existencias valoradas:
     - Unidades físicas totales en existencia.
     - Costo Unitario Promedio Ponderado.
     - Total Valor Monetario en USD ($).
     - Total Valor Monetario en Bolívares (Bs.).
  3. Presiona **"Exportar a Excel / CSV"**.
* **Resultado Esperado `[✓]`:** Descarga exitosa del libro de inventario valorado con consistencia entre stock físico y valor contable.

---

### 🤖 FASE 8: Inteligencia Artificial y Experiencia B2B

#### 🧪 CASO 28: Asistente Inteligente de Depósito con IA Gemini
* **Módulo:** Neo Logística / WMS ➔ `/wms/asistente-ia`.
* **Objetivo:** Interactuar con el almacén mediante lenguaje natural para consultas operativas rápidas.
* **Paso a Paso:**
  1. En Neo Logística, entra a **"Asistente IA"** (`/wms/asistente-ia`).
  2. En la barra de chat, escribe las siguientes consultas:
     - *"¿Cuántas unidades de Harina PAN tenemos en el estante A1?"*
     - *"¿Tenemos algún lote en cuarentena o con fecha de vencimiento próxima?"*
  3. Observa la respuesta generada por el modelo de IA conectado a la base de datos de WMS.
* **Resultado Esperado `[✓]`:** La IA responde con datos exactos en tiempo real, identificando el lote en cuarentena y el saldo en estantería.

---

#### 🧪 CASO 29: Catálogo Digital y Colocación de Pedido en Portal B2B
* **Módulo:** Portal B2B Mayorista (o módulo B2B).
* **Objetivo:** Verificar la experiencia de compra de un cliente comercial externo.
* **Paso a Paso:**
  1. Ingresa al portal comercial B2B.
  2. Navega en la categoría `Alimentos Secos` y ubica `Harina PAN Tradicional 1kg`.
  3. Agrega `10` piezas al carrito de compra.
  4. Ve al Carrito, revisa el desglose con precio bimonetario y presiona **"Enviar Pedido B2B"**.
* **Resultado Esperado `[✓]`:** El pedido queda registrado con éxito para revisión por el equipo comercial de la distribuidora.

---

## 📊 5. Matriz de Evaluación y Acta de Conformidad UAT

| # | Caso de Prueba | Funcionalidad Evaluada | Módulo | Resultado | Observaciones / Auditor |
| :-: | :--- | :--- | :--- | :---: | :--- |
| **01** | Creación de Almacenes | `[✓]` Estructura de Almacenes | WMS | `[ ] Aprobado` | |
| **02** | Configuración Ubicaciones | `[✓]` Tipos DOCK, SHELF, LOSS | WMS | `[ ] Aprobado` | |
| **03** | Directorio de Proveedores | `[✓]` Directorio y Catálogo | Compras | `[ ] Aprobado` | |
| **04** | Catálogo de Productos | `[✓]` Maestro y Códigos Barra | Inventario | `[ ] Aprobado` | |
| **05** | Sugerido MRP | `[✓]` Motor MRP Predictivo | Compras | `[ ] Aprobado` | |
| **06** | Emisión Orden de Compra | `[✓]` Emisión ODC Bimonetaria | Compras | `[ ] Aprobado` | |
| **07** | Portal Proveedor B2B | `[✓]` Confirmación con Token | Compras | `[ ] Aprobado` | |
| **08** | Recepción Inbound WMS | `[✓]` Recepción contra ODC | WMS | `[ ] Aprobado` | |
| **09** | Ticket Térmico 80mm | `[✓]` Comprobante Bultos 80mm | WMS | `[ ] Aprobado` | |
| **10** | Recepción Directa | `[✓]` Entrada Directa Muelle | WMS | `[ ] Aprobado` | |
| **11** | Control FEFO Lotes | `[✓]` Semáforo Lotes FEFO | WMS | `[ ] Aprobado` | |
| **12** | Calidad / Cuarentena | `[✓]` Bloqueo de Lote | WMS | `[ ] Aprobado` | |
| **13** | Putaway (Reubicación) | `[✓]` Traslado DOCK a SHELF | WMS | `[ ] Aprobado` | |
| **14** | Mapa Térmico | `[✓]` Capacidad Volumétrica | WMS | `[ ] Aprobado` | |
| **15** | Cruce 3-Way Match | `[✓]` Conciliación Automática | Compras | `[ ] Aprobado` | |
| **16** | Nota de Débito CxP | `[✓]` Deducción Faltante/Sobreprecio | Compras | `[ ] Aprobado` | |
| **17** | Protección de Margen | `[✓]` Ajuste Dinámico PVP | Compras | `[ ] Aprobado` | |
| **18** | Auditoría en Orden | `[✓]` Panel Fiscal de ODC | Compras | `[ ] Aprobado` | |
| **19** | Recálculo de Costo | `[✓]` Costo Promedio Ponderado | Pricing | `[ ] Aprobado` | |
| **20** | Sesión Masiva Precios | `[✓]` Pricing Margen Objetivo | Pricing | `[ ] Aprobado` | |
| **21** | Habladores de Góndola | `[✓]` Impresión con Códigos | Pricing | `[ ] Aprobado` | |
| **22** | Kiosco de Consulta | `[✓]` Verificador al Cliente | Pricing | `[ ] Aprobado` | |
| **23** | Picking FEFO | `[✓]` Salidas FEFO sin Cuarentena | WMS | `[ ] Aprobado` | |
| **24** | Transferencias Internas | `[✓]` Movimientos con Tránsito | WMS | `[ ] Aprobado` | |
| **25** | Ajustes y Mermas | `[✓]` Descarte a Zona LOSS | WMS | `[ ] Aprobado` | |
| **26** | Kardex Partida Doble | `[✓]` Auditoría de Movimientos | Inventario | `[ ] Aprobado` | |
| **27** | Valoración Inventario | `[✓]` Reporte Financiero | Inventario | `[ ] Aprobado` | |
| **28** | Asistente IA WMS | `[✓]` Consultas Lenguaje Natural | WMS | `[ ] Aprobado` | |
| **29** | Catálogo Digital B2B | `[✓]` Colocación Pedido B2B | B2B | `[ ] Aprobado` | |

---

### ✍️ Firma de Conformidad

* **Líder de Pruebas / Facilitador Morpheus:** __________________________________  
* **Jefe de Almacén y Logística:** __________________________________  
* **Gerencia de Compras y Operaciones:** __________________________________  
* **Fecha de Culminación de Pruebas:** _____ / _____ / 2026
