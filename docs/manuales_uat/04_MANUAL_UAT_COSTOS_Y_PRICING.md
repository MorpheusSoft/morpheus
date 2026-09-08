# 📘 Manual de Acompañamiento UAT: Módulo 4 - Costos, Motor de Precios y Promociones
## Protocolo Práctico de Pruebas Integrales de Usuario
**Proyecto:** Morpheus ERP / WMS  
**Entorno de Pruebas:** QA (`https://hub.qa.morpheussoft.net`)  
**Audiencia:** Gerencia de Finanzas, Jefes de Costos, Encargados de Tienda y Facilitador Morpheus  
**Punto de Entrada General:** Todos los casos inician autenticándose en el portal central **Neo Core**.

---

## 🧭 Flujo Universal de Acceso desde Neo Core

Todos los usuarios evaluadores deben seguir este procedimiento para acceder a los módulos:

```
┌────────────────────────────────┐       ┌────────────────────────┐       ┌────────────────────────┐
│ 1. Iniciar Sesión en Neo Core  │  ──>  │ 2. Abrir AppSwitcher   │  ──>  │ 3. Seleccionar Módulo  │
│ https://hub.qa.morpheussoft.net│       │  (Icono de 9 puntos ▦) │       │      (Neo Pricing)     │
└────────────────────────────────┘       └────────────────────────┘       └────────────────────────┘
```

1. Abre el navegador (Chrome o Edge) e ingresa a:  
   👉 **`https://hub.qa.morpheussoft.net`**
2. Inicia sesión con tus credenciales asignadas:
   * **Usuario:** `admin@morpheus.com` (o usuario financiero asignado)
   * **Contraseña:** *(Entregada por el facilitador en la sesión)*
3. Al ingresar al Dashboard Principal de **Neo Core**, haz clic en el **AppSwitcher (▦)** (esquina superior derecha).
4. Selecciona **"Neo Pricing"**. El sistema te llevará a la suite de costos y precios manteniendo tu sesión activa.

---

## 🧪 CASO 1: UAT-COS-01 — Recálculo de Costo Promedio Ponderado en Recepción

* **Rol Evaluador:** Contador de Costos / Analista Financiero.
* **Módulo:** Neo Core ➔ Neo Pricing (`/costos`).
* **Tiempo Estimado:** 15 minutos.

### 🎯 1. Objetivo de Negocio
Validar la exactitud matemática del Costo Promedio Ponderado (CPP) tras recibir compras de un mismo artículo a costos fluctuantes, garantizando una valoración contable del inventario transparente y acorde a las normas NIIF / IFRS.

### 📝 2. Datos de Prueba Sugeridos
* **Stock Inicial del Producto:** `100 unidades` a `$10.00 USD` (Valoración previa = $1,000.00).
* **Nueva Recepción de Compra:** `50 unidades` a `$13.00 USD` (Ingreso valorado = $650.00).
* **Stock Resultante:** `150 unidades`.
* **Fórmula Esperada:**
  $$\text{Nuevo Costo Promedio} = \frac{(100 \times 10.00) + (50 \times 13.00)}{150} = \frac{1000 + 650}{150} = \frac{1650}{150} = \$11.00\text{ USD}$$

### 🖱️ 3. Paso a Paso Guiado desde el Core

1. En **Neo Core**, haz clic en el **AppSwitcher (▦)** y selecciona **"Neo Pricing"**.
2. En el menú lateral, ve a **"Costos"** (`/costos`).
3. Busca el producto de prueba y anota su costo promedio actual y su último costo de compra.
4. En **Neo Logística** (o mediante la recepción de prueba), registra el ingreso de las 50 unidades a $13.00.
5. Regresa a **Neo Pricing ➔ Costos** y refresca la ficha del producto:
   * Verifica que el **Costo Promedio** indique con exactitud **`$11.00 USD`**.
   * Verifica que el **Último Costo de Compra** indique **`$13.00 USD`**.

### 👁️ 4. Resultado Esperado (Criterio de Éxito)
* ✅ El costo promedio se actualiza instantáneamente sin desfase temporal.
* ✅ No hay redondeos distorsionados; se conservan 2 a 4 decimales de precisión.

### ✍️ 5. Registro de Evaluación
* **Estado:** [ ] 🟢 Conforme (OK) &nbsp;&nbsp;&nbsp; [ ] 🟡 Con Observación &nbsp;&nbsp;&nbsp; [ ] 🔴 No Conforme
* **Observaciones:** ____________________________________________________________________
* **Firma Evaluador:** _______________________ &nbsp;&nbsp;&nbsp; **Fecha:** ____/____/2026

---

## 🧪 CASO 2: UAT-COS-02 — Sesión Masiva de Precios con Margen Objetivo

* **Rol Evaluador:** Gerente Comercial / Director de Operaciones.
* **Módulo:** Neo Core ➔ Neo Pricing (`/precios/new`).
* **Tiempo Estimado:** 20 minutos.

### 🎯 1. Objetivo de Negocio
Evaluar la herramienta de actualización masiva de precios de venta al público (PVP): simulación de impacto en ingresos, aplicación de márgenes comerciales deseados (Markup) por categoría o proveedor, y propagación inmediata o programada por sucursal.

### 📝 2. Datos de Prueba Sugeridos
* **Ámbito de Aplicación:** Sucursal *Patio Trigal* (o *Todas las Sucursales*).
* **Categoría o Filtro:** *Víveres* (o un conjunto de 5 productos).
* **Margen Comercial Deseado:** `30% de Utilidad`.
* **Regla de Redondeo:** Redondear a 2 decimales comerciales.

### 🖱️ 3. Paso a Paso Guiado desde el Core

1. Desde **Neo Core**, usa el **AppSwitcher (▦)** y selecciona **"Neo Pricing"**.
2. En el menú lateral, haz clic en **"Sesiones de Precios"** (`/precios`).
3. Presiona el botón superior **"+ Nueva Sesión de Precios"** (`/precios/new`).
4. Configura los parámetros de la sesión:
   * **Nombre:** `Ajuste Quincenal - Margen 30%`.
   * **Sucursal Objetivo:** *Patio Trigal*.
   * **Regla Base:** Selecciona *Margen sobre Costo Promedio*.
   * **Porcentaje:** Digita **`30`** (%).
5. Presiona **"Cargar Productos y Simular"**:
   * El sistema genera una tabla interactiva con: *Costo*, *PVP Actual*, *PVP Simulado*, *Variación %* y *Margen Resultante*.
6. Modifica manualmente el precio de uno de los ítems en la tabla (ej. de $14.30 a $14.99). Valida que el sistema recalcule su margen en tiempo real.
7. Presiona el botón: **`🚀 Aplicar Sesión de Precios Definitiva`**.

### 👁️ 4. Resultado Esperado (Criterio de Éxito)
* ✅ Los nuevos precios de venta quedan establecidos de inmediato en la sucursal seleccionada.
* ✅ Se conserva el historial de la sesión para fines de auditoría comercial.

### ✍️ 5. Registro de Evaluación
* **Estado:** [ ] 🟢 Conforme (OK) &nbsp;&nbsp;&nbsp; [ ] 🟡 Con Observación &nbsp;&nbsp;&nbsp; [ ] 🔴 No Conforme
* **Observaciones:** ____________________________________________________________________
* **Firma Evaluador:** _______________________ &nbsp;&nbsp;&nbsp; **Fecha:** ____/____/2026

---

## 🧪 CASO 3: UAT-COS-03 — Campañas de Promociones Temporales por Sucursal

* **Rol Evaluador:** Gerente de Mercadeo / Jefe de Tienda.
* **Módulo:** Neo Core ➔ Neo Pricing (`/precios/ofertas`).
* **Tiempo Estimado:** 15 minutos.

### 🎯 1. Objetivo de Negocio
Comprobar la configuración y activación de promociones por tiempo limitado: descuentos automáticos con vigencia estricta por fecha y hora, sin riesgo de que los precios de oferta queden activos después de concluida la campaña.

### 🖱️ 2. Paso a Paso Guiado desde el Core

1. En **Neo Pricing**, ve a la sección **"Promociones y Ofertas"** (`/precios/ofertas`).
2. Haz clic en **"+ Nueva Campaña Promocional"**.
3. Completa los datos de la promoción:
   * **Nombre:** `Flash Sale Fin de Semana`.
   * **Tipo:** *Descuento Porcentual Directo* (ej. 15%).
   * **Vigencia:** Define la fecha de inicio (hoy) y fin (domingo).
   * **Sucursal:** *Patio Trigal*.
4. Añade los productos participantes del catálogo.
5. Presiona **"Guardar y Activar Campaña"**.
6. Verifica en la consulta de precios de la tienda que el producto muestre su precio tachado original y el nuevo precio de oferta vigente.

### 👁️ 3. Resultado Esperado (Criterio de Éxito)
* ✅ El precio de oferta se aplica de forma transparente mientras la fecha actual esté dentro del rango.
* ✅ Al expirar la fecha límite, el sistema retorna automáticamente al PVP ordinario sin intervención manual.

### ✍️ 4. Registro de Evaluación
* **Estado:** [ ] 🟢 Conforme (OK) &nbsp;&nbsp;&nbsp; [ ] 🟡 Con Observación &nbsp;&nbsp;&nbsp; [ ] 🔴 No Conforme
* **Observaciones:** ____________________________________________________________________
* **Firma Evaluador:** _______________________ &nbsp;&nbsp;&nbsp; **Fecha:** ____/____/2026

---

## 🧪 CASO 4: UAT-COS-04 — Generación e Impresión de Habladores de Góndola

* **Rol Evaluador:** Encargado de Tienda / Supervisor de Piso.
* **Módulo:** Neo Core ➔ Neo Pricing (`/habladores`).
* **Tiempo Estimado:** 10 minutos.

### 🎯 1. Objetivo de Negocio
Validar la emisión ágil de habladores (*shelf talkers*) y etiquetas de precio para anaquel, mostrando precio en USD y bolívares (VES), descripción, código de barras y plantilla corporativa.

### 🖱️ 2. Paso a Paso Guiado desde el Core

1. En **Neo Pricing**, ve a **"Habladores"** (`/habladores`).
2. Selecciona la sesión de precios aprobada o filtra productos individuales.
3. Elige la plantilla de diseño deseada:
   * *Hablador Mediano de Oferta (con % de descuento destacado)*.
   * *Etiqueta de Góndola Estándar (con precio bimonetario USD / VES)*.
4. Presiona **"Generar Pliego de Impresión"** (`/habladores/imprimir`).
5. Comprueba en el documento renderizado la nitidez del código de barras y el formato de precios.

### 👁️ 3. Resultado Esperado (Criterio de Éxito)
* ✅ Formato listo para impresión masiva en papel membretado o cartulina.
* ✅ Visualización clara de los dos precios (USD y VES a la tasa oficial del día).

### ✍️ 4. Registro de Evaluación
* **Estado:** [ ] 🟢 Conforme (OK) &nbsp;&nbsp;&nbsp; [ ] 🟡 Con Observación &nbsp;&nbsp;&nbsp; [ ] 🔴 No Conforme
* **Observaciones:** ____________________________________________________________________
* **Firma Evaluador:** _______________________ &nbsp;&nbsp;&nbsp; **Fecha:** ____/____/2026
