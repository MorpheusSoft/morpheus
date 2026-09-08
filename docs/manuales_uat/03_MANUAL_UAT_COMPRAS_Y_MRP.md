# 📘 Manual de Acompañamiento UAT: Módulo 3 - Compras, Motor MRP y Portal de Proveedores
## Protocolo Práctico de Pruebas Integrales de Usuario
**Proyecto:** Morpheus ERP / WMS  
**Entorno de Pruebas:** QA (`https://hub.qa.morpheussoft.net`)  
**Audiencia:** Jefes y Analistas de Compras, Gerencia de Administración y Facilitador Morpheus  
**Punto de Entrada General:** Todos los casos inician autenticándose en el portal central **Neo Core**.

---

## 🧭 Flujo Universal de Acceso desde Neo Core

Todos los usuarios evaluadores deben seguir este procedimiento para acceder a los módulos:

```
┌────────────────────────────────┐       ┌────────────────────────┐       ┌────────────────────────┐
│ 1. Iniciar Sesión en Neo Core  │  ──>  │ 2. Abrir AppSwitcher   │  ──>  │ 3. Seleccionar Módulo  │
│ https://hub.qa.morpheussoft.net│       │  (Icono de 9 puntos ▦) │       │      (Neo Compras)     │
└────────────────────────────────┘       └────────────────────────┘       └────────────────────────┘
```

1. Abre el navegador (Chrome o Edge) e ingresa a:  
   👉 **`https://hub.qa.morpheussoft.net`**
2. Inicia sesión con tus credenciales asignadas:
   * **Usuario:** `admin@morpheus.com` (o usuario comprador asignado)
   * **Contraseña:** *(Entregada por el facilitador en la sesión)*
3. Al ingresar al Dashboard Principal de **Neo Core**, haz clic en el **AppSwitcher (▦)** (esquina superior derecha).
4. Selecciona **"Neo Compras"**. El sistema te dirigirá a la suite de compras conservando tu autenticación.

---

## 🧪 CASO 1: UAT-COM-01 — Emisión de Orden de Compra y Descuentos Comerciales Complejos

* **Rol Evaluador:** Comprador / Jefe de Compras.
* **Módulo:** Neo Core ➔ Neo Compras (`/orders/new`).
* **Tiempo Estimado:** 15 minutos.

### 🎯 1. Objetivo de Negocio
Validar la creación de una Orden de Compra formal con condiciones comerciales del mercado venezolano: bimonetaria (USD o VES con tasa de cambio congelada), cálculo de impuestos y descuentos comerciales encadenados (ej. `10% + 5%` financiero por pronto pago).

### 📝 2. Datos de Prueba Sugeridos
* **Proveedor:** Seleccionar un proveedor (ej. *Cervecería Polar* o *Alimentos Heinz*).
* **Moneda:** `USD` (o `VES`).
* **Formato de Descuento:** Cascada / Encadenado `10+5`.
* **Producto:** Seleccionar 1 o 2 SKU de alta rotación (ej. *Harina PAN* o *Pasta*).
* **Cantidad y Precio:** 100 bultos a $10.00 c/u (Total base: $1,000.00).

### 🖱️ 3. Paso a Paso Guiado desde el Core

1. En **Neo Core**, haz clic en el **AppSwitcher (▦)** y selecciona **"Neo Compras"**.
2. En el menú lateral, ve a **"Órdenes de Compra"** (`/orders`).
3. Presiona el botón superior **"+ Nueva Orden de Compra"** (`/orders/new`).
4. Selecciona los datos principales:
   * **Proveedor:** Selecciona el proveedor del menú desplegable.
   * **Moneda:** Selecciona `USD` (y valida que cargue la tasa de cambio de referencia del día).
   * **Términos de Pago:** *Crédito 15 Días*.
5. Agrega los renglones del pedido:
   * SKU: `PRD-1` | Cantidad: `100` | Costo Unitario: `$10.00`.
   * En la casilla de descuento encadenado, digita: **`10+5`**.
6. Observa el resumen financiero en vivo:
   * Subtotal bruto: `$1,000.00`
   * Primer descuento (10%): `-$100.00` (Base = $900.00).
   * Segundo descuento (5% sobre $900): `-$45.00` (Base = $855.00).
   * Total Descuento Efectivo: `$145.00` (14.5% total).
   * Impuesto IVA (16% sobre $855): `$136.80`.
   * Total a Pagar: **`$991.80`**.
7. Presiona **"Emitir y Enviar Orden de Compra"**.

### 👁️ 4. Resultado Esperado (Criterio de Éxito)
* ✅ Los cálculos matemáticos de descuento encadenado e impuesto son 100% exactos al centavo.
* ✅ La Orden de Compra se crea con estado **`SENT` (Enviada)** y se le asigna un token criptográfico único para el proveedor.

### ✍️ 5. Registro de Evaluación
* **Estado:** [ ] 🟢 Conforme (OK) &nbsp;&nbsp;&nbsp; [ ] 🟡 Con Observación &nbsp;&nbsp;&nbsp; [ ] 🔴 No Conforme
* **Observaciones:** ____________________________________________________________________
* **Firma Evaluador:** _______________________ &nbsp;&nbsp;&nbsp; **Fecha:** ____/____/2026

---

## 🧪 CASO 2: UAT-COM-02 — Portal Público Interactivo del Proveedor (Token Seguro)

* **Rol Evaluador:** Proveedor Externo (Simulado en navegador o modo incógnito).
* **Módulo:** Portal Público de Órdenes (`https://compras.qa.morpheussoft.net/public/orders/{token}`).
* **Tiempo Estimado:** 10 minutos.

### 🎯 1. Objetivo de Negocio
Comprobar la experiencia del proveedor al recibir una orden de compra: interacción directa a través de un enlace seguro con token (sin usuario ni contraseña requeridos), telemetría de lectura (doble check azul de visto) y aceptación/confirmación formal de despacho en un solo clic.

### 🖱️ 2. Paso a Paso Guiado

1. En la lista de Órdenes de Compra de **Neo Compras**, haz clic sobre la orden emitida en el Caso 1.
2. En la barra superior del detalle, presiona el botón:  
   👉 **`🔗 Copiar Enlace para Proveedor`**.
3. Abre una nueva ventana en **Modo Incógnito** (o en tu teléfono móvil) y pega la URL.
4. Como proveedor, evalúa la pantalla:
   * Verifica que se visualice el membrete corporativo, número de orden, detalle de ítems, cantidades y condiciones de pago pactadas.
   * Revisa que el botón de descarga en **PDF formal** funcione.
5. Haz clic en el botón verde inferior: **`🤝 Aceptar y Confirmar Pedido`**.
   * *El sistema solicita confirmar fecha estimada de entrega (ej. mañana).*
   * Confirma la entrega.
6. Ahora regresa a tu ventana normal de **Neo Compras** y recarga la orden:
   * Verifica que el estatus cambió automáticamente a **`CONFIRMED` (Confirmada por Proveedor)**.
   * En el historial de auditoría se aprecia: *"Visto por el proveedor el [Fecha/Hora]"* y *"Confirmado desde IP [xxx.xxx]"*.

### 👁️ 3. Resultado Esperado (Criterio de Éxito)
* ✅ El proveedor puede interactuar sin barreras técnicas (cero registros ni contraseñas).
* ✅ Morpheus registra trazabilidad legal y telemetría de lectura en tiempo real.

### ✍️ 4. Registro de Evaluación
* **Estado:** [ ] 🟢 Conforme (OK) &nbsp;&nbsp;&nbsp; [ ] 🟡 Con Observación &nbsp;&nbsp;&nbsp; [ ] 🔴 No Conforme
* **Observaciones:** ____________________________________________________________________
* **Firma Evaluador:** _______________________ &nbsp;&nbsp;&nbsp; **Fecha:** ____/____/2026

---

## 🧪 CASO 3: UAT-COM-03 — Conciliación de Facturas de Proveedor (3-Way Matching)

* **Rol Evaluador:** Analista de Cuentas por Pagar / Jefe de Compras.
* **Módulo:** Neo Core ➔ Neo Compras (`/reconciliation`).
* **Tiempo Estimado:** 15 minutos.

### 🎯 1. Objetivo de Negocio
Validar el cuadre de 3 vías (*Three-Way Match*): Orden de Compra pactada vs Nota de Entrega de Muelle vs Factura Fiscal emitida por el proveedor, bloqueando sobrepagos o pagos de artículos averiados.

### 🖱️ 2. Paso a Paso Guiado desde el Core

1. Desde **Neo Core**, usa el **AppSwitcher (▦)** y ve a **"Neo Compras"**.
2. En el menú lateral, haz clic en **"Conciliación / 3-Way Match"** (`/reconciliation`).
3. Selecciona la recepción ejecutada en el Módulo 2 (Caso UAT-LOG-01 donde se recibieron 48 pzas de 50).
4. El sistema presenta el cuadro comparativo en 3 columnas:
   * **Columna 1 (Orden de Compra):** Solicitadas `50` a `$10.00`.
   * **Columna 2 (Recepción de Muelle):** Recibidas `48` unidades conformes.
   * **Columna 3 (Factura del Proveedor):** Carga los datos de la factura:
     - Nro. Control / Factura: `FACT-PROV-98741`.
     - Si el proveedor facturó 50 unidades: El sistema marca la discrepancia en **ROJO** (*"2 unidades facturadas pero no recibidas: -$20.00"*).
     - Si el proveedor facturó 48 unidades: El sistema marca en **VERDE** (*"Conciliación Exacta"*).
5. Presiona **"Aprobar Conciliación para Pago"** (genera la provisión en cuentas por pagar por el monto neto validado de 48 pzas).

### 👁️ 3. Resultado Esperado (Criterio de Éxito)
* ✅ Se protege el flujo de caja impidiendo pagar mercancía faltante o dañada.
* ✅ Cero discrepancias invisibles entre Compras, Almacén y Finanzas.

### ✍️ 4. Registro de Evaluación
* **Estado:** [ ] 🟢 Conforme (OK) &nbsp;&nbsp;&nbsp; [ ] 🟡 Con Observación &nbsp;&nbsp;&nbsp; [ ] 🔴 No Conforme
* **Observaciones:** ____________________________________________________________________
* **Firma Evaluador:** _______________________ &nbsp;&nbsp;&nbsp; **Fecha:** ____/____/2026

---

## 🧪 CASO 4: UAT-COM-04 — Sugerencias de Reabastecimiento Asistidas por IA (Motor MRP)

* **Rol Evaluador:** Gerente de Compras / Planificador de Demanda.
* **Módulo:** Neo Core ➔ Neo Compras (`/suggestions`).
* **Tiempo Estimado:** 15 minutos.

### 🎯 1. Objetivo de Negocio
Validar el motor analítico de reabastecimiento (MRP): calcula automáticamente qué comprar, a quién y en qué cantidad, considerando los históricos reales de ventas sincronizados desde los POS de tienda, el inventario físico actual y el tiempo de reposición (*Lead Time*).

### 🖱️ 2. Paso a Paso Guiado desde el Core

1. Desde **Neo Core**, usa el **AppSwitcher (▦)** y ve a **"Neo Compras"**.
2. En el menú lateral, haz clic en **"Sugeridos de Compra / MRP"** (`/suggestions`).
3. En los filtros de la parte superior:
   * **Sucursal a Evaluar:** *Patio Trigal* (o *Cumboto*).
   * **Días de Cobertura Deseada:** `15 días` (o `30 días`).
   * Presiona el botón: **`⚡ Ejecutar Simulación MRP con IA`**.
4. Revisa la tabla de sugerencias generada:
   * Observa las columnas: *Stock Actual*, *Consumo Promedio Diario*, *Días de Inventario Restante*, *Punto de Reorden* y *Cantidad Sugerida a Comprar*.
5. Selecciona 2 o 3 renglones sugeridos marcando su casilla de verificación.
6. Presiona el botón superior: **`📦 Convertir en Órdenes de Compra`**.
   * *El sistema agrupa automáticamente los productos por proveedor y crea los borradores de orden listos para negociación.*

### 👁️ 3. Resultado Esperado (Criterio de Éxito)
* ✅ La sugerencia se basa fielmente en las ventas históricas sincronizadas con el agente.
* ✅ La conversión de sugerencia a orden ahorra horas de transcripción manual a los compradores.

### ✍️ 4. Registro de Evaluación
* **Estado:** [ ] 🟢 Conforme (OK) &nbsp;&nbsp;&nbsp; [ ] 🟡 Con Observación &nbsp;&nbsp;&nbsp; [ ] 🔴 No Conforme
* **Observaciones:** ____________________________________________________________________
* **Firma Evaluador:** _______________________ &nbsp;&nbsp;&nbsp; **Fecha:** ____/____/2026
