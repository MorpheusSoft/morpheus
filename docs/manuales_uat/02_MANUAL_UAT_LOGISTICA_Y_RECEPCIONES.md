# 📘 Manual de Acompañamiento UAT: Módulo 2 - Logística, Recepciones en Muelle y Transferencias
## Protocolo Práctico de Pruebas Integrales de Usuario
**Proyecto:** Morpheus ERP / WMS  
**Entorno de Pruebas:** QA (`https://hub.qa.morpheussoft.net`)  
**Audiencia:** Jefes de Almacén, Operadores de Muelle, Coordinadores de Despacho y Facilitador Morpheus  
**Punto de Entrada General:** Todos los casos inician autenticándose en el portal central **Neo Core**.

---

## 🧭 Flujo Universal de Acceso desde Neo Core

Todos los usuarios evaluadores deben seguir este procedimiento para acceder a los módulos:

```
┌────────────────────────────────┐       ┌────────────────────────┐       ┌────────────────────────┐
│ 1. Iniciar Sesión en Neo Core  │  ──>  │ 2. Abrir AppSwitcher   │  ──>  │ 3. Seleccionar Módulo  │
│ https://hub.qa.morpheussoft.net│       │  (Icono de 9 puntos ▦) │       │   (Neo Logística / WMS)│
└────────────────────────────────┘       └────────────────────────┘       └────────────────────────┘
```

1. Abre el navegador (Chrome o Edge) e ingresa a:  
   👉 **`https://hub.qa.morpheussoft.net`**
2. Inicia sesión con tus credenciales asignadas:
   * **Usuario:** `admin@morpheus.com` (o usuario logístico asignado)
   * **Contraseña:** *(Entregada por el facilitador en la sesión)*
3. Al ingresar al Dashboard Principal de **Neo Core**, ubica en la esquina superior derecha la cuadrícula de 9 puntos: **AppSwitcher (▦)**.
4. Haz clic sobre **"Neo Logística"** (o **"Neo Inventario"** según el caso). El sistema transferirá tu sesión sin requerir nuevo login.

---

## 🧪 CASO 1: UAT-LOG-01 — Recepción de Compras en Muelle (Dock Staging vs Almacén)

* **Rol Evaluador:** Jefe de Almacén / Receptor de Muelle.
* **Módulo:** Neo Core ➔ Neo Logística (`https://logistica.qa.morpheussoft.net/receipts`).
* **Tiempo Estimado:** 15 minutos.
* **Prerrequisito:** Disponer de una Orden de Compra autorizada (ej. `OC-0001` o crear una recepción directa).

### 🎯 1. Objetivo de Negocio
Validar la recepción física de mercancía proveniente de proveedores en el muelle de descarga (*Dock Staging*), comprobando cantidades pactadas vs entregadas, captura de número de factura del proveedor, registro de discrepancias por merma/avería y pase automático al inventario disponible.

### 📝 2. Datos de Prueba Sugeridos
* **Sucursal:** *Patio Trigal*
* **Proveedor:** Seleccionar cualquier proveedor activo (ej. *Distribuidora Polar*).
* **Nro. Factura / Guía del Proveedor:** `FACT-PROV-98741`
* **SKU a Recibir:** `PRD-1` (o producto con stock).
* **Cantidad Facturada:** `50 unidades`
* **Cantidad Física Recibida:** `48 unidades` (Registrar 2 unidades faltantes/averiadas para evaluar control de discrepancia).

### 🖱️ 3. Paso a Paso Guiado desde el Core

1. En **Neo Core**, haz clic en el **AppSwitcher (▦)** y selecciona **"Neo Logística"**.
2. En el menú lateral izquierdo, ve a **"Recepciones"** (`/receipts`).
3. Haz clic en el botón superior **"+ Nueva Recepción"** (o selecciona una Orden de Compra pendiente de la lista).
   * *Si es Recepción Directa:* Haz clic en **"Recepción Directa"** (`/receipts/direct`).
4. Completa la cabecera de la recepción:
   * **Proveedor:** Selecciona el proveedor del despacho.
   * **Documento / Factura Proveedor:** Digita `FACT-PROV-98741`.
   * **Almacén / Destino:** *Almacén Principal - Zona Muelle (Dock Staging)*.
5. Carga o valida los renglones de producto:
   * Verifica la cantidad solicitada (ej. `50`).
   * En la columna **Cantidad Recibida**, digita **`48`**.
   * En la casilla de notas u observaciones indica: *"2 unidades faltantes en bulto sellado"*.
6. Presiona el botón verde: **`✅ Confirmar y Validar Recepción`**.
7. *(Opcional)* Si el producto maneja lote, digita el número de lote (ej. `LOTE-2026-A`) y fecha de vencimiento.

### 👁️ 4. Resultado Esperado (Criterio de Éxito)
* ✅ La recepción pasa inmediatamente a estado **`DONE` (Procesada)**.
* ✅ El inventario de la tienda incrementa en exactamente 48 unidades.
* ✅ Se genera el movimiento de Kardex asociado con referencia al documento del proveedor.
* ✅ En la Orden de Compra original, el estatus refleja recepción parcial (`received_qty = 48` de `50`).

### ✍️ 5. Registro de Evaluación
* **Estado:** [ ] 🟢 Conforme (OK) &nbsp;&nbsp;&nbsp; [ ] 🟡 Con Observación &nbsp;&nbsp;&nbsp; [ ] 🔴 No Conforme
* **Observaciones:** ____________________________________________________________________
* **Firma Evaluador:** _______________________ &nbsp;&nbsp;&nbsp; **Fecha:** ____/____/2026

---

## 🧪 CASO 2: UAT-LOG-02 — Transferencias Inter-Sucursales y Tránsito

* **Rol Evaluador:** Coordinador de Logística / Despachador / Receptor de Tienda Destino.
* **Módulos:** Neo Core ➔ Neo Logística (`/transfers` y `/shipments`).
* **Tiempo Estimado:** 20 minutos.
* **Prerrequisito:** Existencia de inventario en la sucursal de origen.

### 🎯 1. Objetivo de Negocio
Comprobar el ciclo completo de abastecimiento interno entre sucursales: Solicitud de Traslado, Despacho en Origen (salida de stock hacia estado *En Tránsito*) y Recepción Conforme en Destino (ingreso al stock local), eliminando pérdidas y garantizando trazabilidad física.

### 📝 2. Datos de Prueba Sugeridos
* **Sucursal Origen:** *Patio Trigal* (ID 1)
* **Sucursal Destino:** *Cumboto* (ID 10)
* **Producto a Transferir:** Seleccionar un SKU con inventario disponible (ej. 20 unidades).
* **Cantidad a Trasladar:** `10 unidades`.

### 🖱️ 3. Paso a Paso Guiado desde el Core

#### Fase 1: Creación de la Solicitud de Traslado
1. En **Neo Core**, abre el **AppSwitcher (▦)** y selecciona **"Neo Logística"**.
2. En el menú lateral, ve a **"Transferencias"** (`/transfers`).
3. Presiona el botón **"+ Nueva Transferencia"**.
4. Diligencia los datos:
   * **Almacén / Sucursal Origen:** *Patio Trigal - Almacén Principal*.
   * **Almacén / Sucursal Destino:** *Cumboto - Almacén Principal*.
   * **Concepto:** *Reabastecimiento Fin de Semana*.
5. Agrega el producto a transferir y define la cantidad: `10`.
6. Presiona **"Crear Solicitud de Transferencia"** (Queda en estado `DRAFT` o `READY`).

#### Fase 2: Despacho desde Sucursal Origen
7. En el menú lateral, ve a **"Despachos"** (`/shipments`) o entra al detalle de la transferencia recién creada.
8. Presiona **"Despachar Mercancía"**:
   * *El sistema descuenta inmediatamente las 10 unidades del Almacén de Patio Trigal y coloca la carga en estatus `EN TRÁNSITO`.*
   * Verifica que en el Kardex de Patio Trigal aparezca la salida correspondiente.

#### Fase 3: Recepción en Sucursal Destino
9. Simula el rol de la sucursal destino: En la barra superior, cambia la sucursal a *Cumboto* (o filtra por almacén destino).
10. Abre la transferencia pendiente de recepción.
11. Presiona **"Confirmar Recepción en Destino"**:
    * Valida que las 10 unidades hayan llegado completas.
    * Presiona **"Aceptar y Finalizar"**.

### 👁️ 4. Resultado Esperado (Criterio de Éxito)
* ✅ El stock de *Patio Trigal* disminuyó en 10 unidades de forma irreversible.
* ✅ El stock de *Cumboto* aumentó en 10 unidades de forma inmediata.
* ✅ El estado final de la transferencia queda marcado como **`DONE`**.
* ✅ En ningún momento hubo duplicación o desaparición de inventario durante el tránsito.

### ✍️ 5. Registro de Evaluación
* **Estado:** [ ] 🟢 Conforme (OK) &nbsp;&nbsp;&nbsp; [ ] 🟡 Con Observación &nbsp;&nbsp;&nbsp; [ ] 🔴 No Conforme
* **Observaciones:** ____________________________________________________________________
* **Firma Evaluador:** _______________________ &nbsp;&nbsp;&nbsp; **Fecha:** ____/____/2026

---

## 🧪 CASO 3: UAT-LOG-03 — Generación e Impresión de Etiquetas y Códigos de Barras

* **Rol Evaluador:** Encargado de Almacén / Auditor de Piso.
* **Módulo:** Neo Core ➔ Neo Inventario (`https://inventario.qa.morpheussoft.net/labels`).
* **Tiempo Estimado:** 10 minutos.

### 🎯 1. Objetivo de Negocio
Comprobar la generación rápida de etiquetas adhesivas con código de barras estándar (EAN-13, SKU, Código de Tienda y Ubicación) listas para ser leídas por terminales móviles (PDA) o escáneres láser de punto de venta.

### 🖱️ 2. Paso a Paso Guiado desde el Core

1. Desde **Neo Core**, usa el **AppSwitcher (▦)** y haz clic en **"Neo Inventario"**.
2. En el menú lateral, haz clic en **"Etiquetas"** (`/labels`).
3. Selecciona el tipo de etiqueta a emitir:
   * **Modo A (Producto):** Selecciona un producto del catálogo (ej. *Harina PAN 1kg* o código alterno).
   * **Modo B (Ubicación de Almacén):** Selecciona un pasillo o estante (ej. `PASILLO-01` / `ESTANTE-A1`).
4. Especifica los parámetros:
   * **Formato de Salida:** PDF Estándar / Térmica 80mm / Hoja A4 con grilla.
   * **Cantidad de Etiquetas:** `4 copias`.
   * **Campos a incluir:** Marcar casillas de *Código de Barras*, *Descripción*, *Precio de Venta* y *Marca*.
5. Presiona el botón azul: **`🖨️ Generar Vista Previa / Imprimir`**.
6. Se abrirá la ventana de impresión o descarga de archivo PDF listo con los códigos renderizados con nitidez vectorial.

### 👁️ 3. Resultado Esperado (Criterio de Éxito)
* ✅ El código de barras generado es 100% legible con cualquier lector óptico o cámara móvil.
* ✅ La etiqueta muestra la información completa del artículo (incluyendo marca comercial, SKU y precio).

### ✍️ 4. Registro de Evaluación
* **Estado:** [ ] 🟢 Conforme (OK) &nbsp;&nbsp;&nbsp; [ ] 🟡 Con Observación &nbsp;&nbsp;&nbsp; [ ] 🔴 No Conforme
* **Observaciones:** ____________________________________________________________________
* **Firma Evaluador:** _______________________ &nbsp;&nbsp;&nbsp; **Fecha:** ____/____/2026
