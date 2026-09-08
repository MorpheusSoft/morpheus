# 📘 Manual de Acompañamiento UAT: Módulo 1 - Inventarios, Stock y Auditorías WMS
## Protocolo Práctico de Pruebas Integrales de Usuario
**Proyecto:** Morpheus ERP / WMS  
**Entorno de Pruebas:** QA (`https://hub.qa.morpheussoft.net`)  
**Audiencia:** Auditores de Inventario, Jefes de Tienda, Encargados de Almacén y Facilitador Morpheus  
**Punto de Entrada General:** Todos los casos inician autenticándose en el portal central **Neo Core**.

---

> [!IMPORTANT]
> **Arquitectura de Producción (Cero Configuración Manual de Almacenes):**  
> En Morpheus, los almacenes y depósitos operativos de cada una de las 15 sucursales (**Almacén Principal**, **Piso de Ventas**, **Depósito General**) ya vienen **100% pre-configurados y creados automáticamente** para cada tienda.  
> Los operadores, gerentes y auditores **NO necesitan crear almacenes, pasillos ni ubicaciones manualmente**. Todo el entorno está listo para operar tal como en producción real.

---

## 🧭 Flujo Universal de Acceso desde Neo Core

Todos los evaluadores acceden a los módulos a través del portal central:

```
┌────────────────────────────────┐       ┌────────────────────────┐       ┌────────────────────────┐
│ 1. Iniciar Sesión en Neo Core  │  ──>  │ 2. Abrir AppSwitcher   │  ──>  │ 3. Seleccionar Módulo  │
│ https://hub.qa.morpheussoft.net│       │  (Icono de 9 puntos ▦) │       │   (Inventario o WMS)   │
└────────────────────────────────┘       └────────────────────────┘       └────────────────────────┘
```

1. Abre el navegador (Chrome o Edge) e ingresa a:  
   👉 **`https://hub.qa.morpheussoft.net`**
2. Inicia sesión con tus credenciales:
   * **Usuario:** `admin@morpheus.com` (o usuario auditor asignado)
   * **Contraseña:** *(Entregada por el facilitador en la sesión)*
3. En la esquina superior derecha, haz clic en el **AppSwitcher (▦)** y selecciona **"Neo Inventario"** o **"Neo Logística"**.

---

## 🧪 CASO 1: UAT-INV-01 — Consulta y Auditoría de Stock de Tienda en Tiempo Real

* **Rol Evaluador:** Auditor de Inventarios / Gerente de Tienda.
* **Módulo:** Neo Core ➔ Neo Inventario (`https://inventario.qa.morpheussoft.net/inventario`).
* **Tiempo Estimado:** 10 minutos.

### 🎯 1. Objetivo de Negocio
Validar que el personal de tienda puede auditar de inmediato las existencias físicas de su sucursal, verificar la concordancia con el ERP local (Stellar/VAD10), filtrar por departamentos, marcas o niveles de stock (agotados, con existencia) y consultar los precios y costos en bolívares y dólares.

### 🖱️ 2. Paso a Paso Guiado desde el Core

1. Desde **Neo Core**, haz clic en el **AppSwitcher (▦)** y selecciona **"Neo Inventario"**.
2. En la barra superior, confirma que esté seleccionada tu sucursal activa (ej. *01 - Patio Trigal* o *10 - Cumboto*).
3. En el menú lateral, haz clic en **"Existencias / Stock"** (`/inventario`).
4. Observa el catálogo con las existencias sincronizadas desde el punto de venta:
   * **Búsqueda Rápida:** Escribe en la barra de búsqueda el nombre de un artículo de alta rotación (ej. *Harina PAN* o código de barra).
   * **Filtro por Marca:** Selecciona una marca comercial (ej. *Polar*, *Nestlé*).
   * **Filtro de Estado:** Prueba el selector *"Solo con Existencia"* y *"Agotados / Quiebre"*.
5. Haz clic sobre cualquier producto para abrir su **Ficha de Inventario**:
   * Verifica la visualización de: *Stock Físico Disponible*, *Costo Promedio Ponderado*, *Precio de Venta al Público (PVP)* y *Almacén Asignado* (Almacén Principal de la Tienda).

### 👁️ 3. Resultado Esperado (Criterio de Éxito)
* ✅ El catálogo carga de inmediato con las existencias reales transmitidas por el agente.
* ✅ Los filtros por departamento, marca y estado responden con rapidez.
* ✅ Cada producto se encuentra debidamente asociado al Almacén Principal de la tienda sin necesidad de configuración manual.

### ✍️ 4. Registro de Evaluación
* **Estado:** [ ] 🟢 Conforme (OK) &nbsp;&nbsp;&nbsp; [ ] 🟡 Con Observación &nbsp;&nbsp;&nbsp; [ ] 🔴 No Conforme
* **Observaciones:** ____________________________________________________________________
* **Firma Evaluador:** _______________________ &nbsp;&nbsp;&nbsp; **Fecha:** ____/____/2026

---

## 🧪 CASO 2: UAT-INV-02 — Toma Física en 3 Fases (Conteo Ciego, Cotejo con IA y Consolidación)

* **Rol Evaluador:** Auditor de Inventarios / Gerente de Operaciones.
* **Módulo:** Neo Core ➔ Neo Inventario (`/inventario/physical-counts`).
* **Tiempo Estimado:** 20 minutos.

### 🎯 1. Objetivo de Negocio
Comprobar el flujo de auditoría de inventario físico más exigente del mercado: **Conteo Ciego** (el auditor cuenta físicamente sin ver las existencias teóricas para evitar vicios o conteos complacientes), **Diagnóstico Asistido por Inteligencia Artificial** (prioriza discrepancias monetarias) y **Consolidación Automática** con ajuste en Kardex.

### 📝 2. Datos de Prueba Sugeridos
* **Sucursal:** *Patio Trigal* (o tu tienda de prueba).
* **Almacén:** *Almacén Principal* (Seleccionado automáticamente).
* **Alcance:** *Cíclico por Categoría* (ej. *Víveres*) o *General*.
* **SKU a Descuadrar a Propósito:** Seleccionar un SKU con existencia teórica (ej. 50 pzas) y digitar **`42`** en físico (diferencia de -8 unidades).

### 🖱️ 3. Paso a Paso Guiado desde el Core

1. Desde **Neo Core**, usa el **AppSwitcher (▦)** y ve a **"Neo Inventario"**.
2. En el menú lateral, haz clic en **"Tomas Físicas"** (`/inventario/physical-counts`).
3. Presiona el botón superior **"+ Nueva Toma Física"**:
   * **Sucursal:** Verifica tu tienda activa.
   * **Almacén:** *Almacén Principal* (Ya viene seleccionado por defecto).
   * **Alcance:** Selecciona *Cíclico* o *General*.
   * Presiona **"Crear Sesión de Conteo"**.

#### 🔒 Fase 1: Conteo Ciego (Registro del Auditor)
4. El sistema abre la planilla digital de conteo.
5. **Comprobación clave:** Verifica que las columnas **"Stock Teórico"** y **"Diferencia"** permanezcan **completamente ocultas**.
6. Digita las cantidades físicas contadas en los renglones correspondientes. En el SKU de prueba, escribe **`42`**.
7. Presiona el botón azul: **`🔒 Finalizar Conteo Ciego y Pasar a Análisis (Fase 2)`**.

#### 🤖 Fase 2: Cotejo de Diferencias y Asistente IA
8. Al cambiar a Fase 2, el sistema **desbloquea y revela** el stock del sistema y calcula la discrepancia:
   * Teórico: `50` | Físico: `42` | Diferencia: `-8` (Marcado en color rojo).
9. En la parte superior derecha, observa el indicador **IRA %** (*Inventory Record Accuracy* / Exactitud del Inventario).
10. Haz clic en el botón **"🧠 Re-analizar con Asistente IA"**:
    * Lee el diagnóstico generado por la IA (Gemini). Señala qué líneas representan el mayor impacto financiero y si amerita reconteo.
11. Prueba el botón **"🔄 Solicitar Reconteo (2da Vuelta)"** en la línea descuadrada. Modifica la cantidad a `45`.

#### ✅ Fase 3: Consolidación y Generación de Ajustes
12. Cuando la auditoría esté validada, presiona el botón verde: **`✅ Consolidar & Generar Ajustes`**.
13. Confirma la acción en el cuadro de diálogo.

### 👁️ 4. Resultado Esperado (Criterio de Éxito)
* ✅ La toma física cambia a estado **`CONSOLIDADA`**.
* ✅ Se generan automáticamente los movimientos de compensación en el Kardex.
* ✅ Al consultar el inventario del SKU en `/inventario`, el saldo disponible refleja exactamente las **`45`** unidades físicas consolidadas.

### ✍️ 5. Registro de Evaluación
* **Estado:** [ ] 🟢 Conforme (OK) &nbsp;&nbsp;&nbsp; [ ] 🟡 Con Observación &nbsp;&nbsp;&nbsp; [ ] 🔴 No Conforme
* **Observaciones:** ____________________________________________________________________
* **Firma Evaluador:** _______________________ &nbsp;&nbsp;&nbsp; **Fecha:** ____/____/2026

---

## 🧪 CASO 3: UAT-INV-03 — Control de Lotes, Fechas de Vencimiento y Cuarentena

* **Rol Evaluador:** Supervisor de Almacén / Control de Calidad.
* **Módulo:** Neo Core ➔ Neo Logística (`https://logistica.qa.morpheussoft.net/wms`).
* **Tiempo Estimado:** 15 minutos.

### 🎯 1. Objetivo de Negocio
Garantizar la trazabilidad de productos perecederos (alimentos, bebidas, farmacia), validar que el sistema advierta de vencimientos próximos bajo esquema FEFO (*First Expired, First Out*) y comprobar que un lote puesto en **Cuarentena** queda inmediatamente bloqueado para despachos o ventas.

### 🖱️ 2. Paso a Paso Guiado desde el Core

1. Desde **Neo Core**, abre el **AppSwitcher (▦)** y haz clic en **"Neo Logística"**.
2. En el menú lateral izquierdo, haz clic en **"Control de Lotes (FEFO)"** (`/wms/lots`).
3. En el listado de lotes, ubica un lote de prueba o filtra por un producto perecedero.
4. **Validación Visual de Semáforo:**
   * Lotes con vencimiento mayor a 60 días: Badge Verde.
   * Lotes por vencer (< 30 días): Badge Amarillo de alerta.
   * Lotes vencidos: Badge Rojo.
5. **Prueba de Bloqueo por Cuarentena:**
   * En la fila del lote seleccionado (ej. `LOTE-UAT-2026`), haz clic en **"Retener / Bloquear Lote (Cuarentena)"**.
   * Ingresa el motivo: *"Inspección por rotura de empaque secundario"*.
   * Confirma la retención. El estado cambiará a `RETENIDO / CUARENTENA`.
6. **Comprobación de Seguridad Operativa:**
   * Intenta ir a **"Transferencias"** (`/transfers`) y seleccionar dicho producto.
   * El sistema no permitirá asignar el lote retenido para preparación de salida.
7. Regresa a `/wms/lots` y presiona **"Liberar Lote"** para devolverlo a estado disponible.

### 👁️ 3. Resultado Esperado (Criterio de Éxito)
* ✅ El sistema muestra con exactitud la fecha de expiración y el saldo por lote.
* ✅ Ningún lote en cuarentena puede ser despachado, vendido ni transferido mientras esté bloqueado.

### ✍️ 4. Registro de Evaluación
* **Estado:** [ ] 🟢 Conforme (OK) &nbsp;&nbsp;&nbsp; [ ] 🟡 Con Observación &nbsp;&nbsp;&nbsp; [ ] 🔴 No Conforme
* **Observaciones:** ____________________________________________________________________
* **Firma Evaluador:** _______________________ &nbsp;&nbsp;&nbsp; **Fecha:** ____/____/2026

---

## 🧪 CASO 4: UAT-INV-04 — Registro y Aprobación de Ajustes Directos (Cargo / Descargo RBAC)

* **Rol Evaluador:** Almacenista (Operador) y Gerente de Tienda (Aprobador).
* **Módulo:** Neo Core ➔ Neo Logística (WMS).
* **Tiempo Estimado:** 15 minutos.
* **Prelación:** Requiere usuarios con dos roles distintos para validar la separación de funciones.

### 🎯 1. Objetivo de Negocio
Validar que los operadores pueden registrar mermas o roturas puntuales ocurridas en piso, pero que el inventario **no se descuenta del Kardex** hasta que un supervisor con rol autorizado ingrese y apruebe el ajuste con su firma digital.

### 📝 2. Datos de Prueba Sugeridos
* **Tipo:** Descargo (-)
* **Motivo:** *Merma por Avería Interna*
* **SKU:** Seleccionar cualquier producto de alta rotación.
* **Cantidad:** `2` unidades.

### 🖱️ 3. Paso a Paso Guiado desde el Core

#### Paso 1: Creación del Ajuste en Borrador (Como Almacenista)
1. Inicia sesión en **Neo Core** con un usuario con rol de **Almacén / Operador**.
2. Abre el **AppSwitcher (▦)** y haz clic en **"Neo Logística"**.
3. En el menú lateral, selecciona **"Ajustes Físicos"** (`/wms/adjustments`).
4. Presiona el botón superior **"+ Nuevo Ajuste Directo"**:
   * **Tipo de Movimiento:** Selecciona `Descargo (-)`.
   * **Motivo de Ajuste:** Selecciona `Merma por Avería`.
   * **Producto (SKU):** Busca por nombre o código tu producto de prueba.
   * **Cantidad:** Escribe `2`.
   * **Observación:** *"2 botellas rotas durante acomodo en anaquel"*.
5. Presiona **"Guardar como Pendiente / Borrador"**.
6. **Validación RBAC 1:** Verifica que en el listado el botón **"Aprobar"** aparezca bloqueado o deshabilitado para este usuario operativo.
7. Consulta el inventario del producto: el stock aún **NO ha cambiado** (sigue intacto).

#### Paso 2: Aprobación Gerencial (Como Supervisor / Admin)
8. Cierra sesión y entra a **Neo Core** con un usuario con rol **Supervisor / Gerente**.
9. Mediante el **AppSwitcher (▦)** dirígete a **"Neo Logística"** ➔ **"Ajustes Físicos"**.
10. Ubica el ajuste recién creado en estado `PENDIENTE`.
11. Ahora el botón verde **"✅ Aprobar Ajuste"** estará habilitado. Haz clic sobre él.
12. Confirma la aprobación.

### 👁️ 4. Resultado Esperado (Criterio de Éxito)
* ✅ El estado del ajuste cambia a `APROBADO`.
* ✅ Queda registrado el nombre del autorizador (`approved_by_name`) y la marca de tiempo exacta.
* ✅ El Kardex descuenta inmediatamente las 2 unidades por motivo de merma.

### ✍️ 5. Registro de Evaluación
* **Estado:** [ ] 🟢 Conforme (OK) &nbsp;&nbsp;&nbsp; [ ] 🟡 Con Observación &nbsp;&nbsp;&nbsp; [ ] 🔴 No Conforme
* **Observaciones:** ____________________________________________________________________
* **Firma Evaluador:** _______________________ &nbsp;&nbsp;&nbsp; **Fecha:** ____/____/2026

---

## 📋 Resumen de Cierre de la Sesión del Módulo 1

| Caso de Prueba | Nombre del Flujo | Conformidad | Firma Key User |
| :--- | :--- | :---: | :--- |
| `UAT-INV-01` | Consulta y Auditoría de Stock en Tiempo Real | [ ] OK &nbsp; [ ] Obs &nbsp; [ ] Error | _____________________ |
| `UAT-INV-02` | Toma Física 3 Fases (Ciego, IA, Kardex) | [ ] OK &nbsp; [ ] Obs &nbsp; [ ] Error | _____________________ |
| `UAT-INV-03` | Lotes, Vencimientos y Cuarentena | [ ] OK &nbsp; [ ] Obs &nbsp; [ ] Error | _____________________ |
| `UAT-INV-04` | Ajustes Directos y Aprobación RBAC | [ ] OK &nbsp; [ ] Obs &nbsp; [ ] Error | _____________________ |
