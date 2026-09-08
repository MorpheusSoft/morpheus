# 📘 Manual de Acompañamiento UAT: Módulo 5 - Inteligencia Artificial, Dashboards Ejecutivos y Cierre
## Protocolo Práctico de Pruebas Integrales de Usuario
**Proyecto:** Morpheus ERP / WMS  
**Entorno de Pruebas:** QA (`https://hub.qa.morpheussoft.net`)  
**Audiencia:** Directores, Gerencia General, Sponsors del Cliente, Líderes de Área y Facilitador Morpheus  
**Punto de Entrada General:** Todos los casos inician autenticándose en el portal central **Neo Core**.

---

## 🧭 Flujo Universal de Acceso desde Neo Core

Todos los usuarios evaluadores deben seguir este procedimiento para acceder a los módulos:

```
┌────────────────────────────────┐       ┌────────────────────────┐       ┌────────────────────────┐
│ 1. Iniciar Sesión en Neo Core  │  ──>  │ 2. Abrir AppSwitcher   │  ──>  │ 3. Seleccionar Módulo  │
│ https://hub.qa.morpheussoft.net│       │  (Icono de 9 puntos ▦) │       │   (Dashboard / IA Core)│
└────────────────────────────────┘       └────────────────────────┘       └────────────────────────┘
```

1. Abre el navegador (Chrome o Edge) e ingresa a:  
   👉 **`https://hub.qa.morpheussoft.net`**
2. Inicia sesión con tus credenciales asignadas:
   * **Usuario:** `admin@morpheus.com` (o usuario ejecutivo asignado)
   * **Contraseña:** *(Entregada por el facilitador en la sesión)*
3. Al ingresar al Dashboard Principal de **Neo Core**, dispondrás de los tableros ejecutivos y el acceso a los asistentes de Inteligencia Artificial mediante el **AppSwitcher (▦)**.

---

## 🧪 CASO 1: UAT-IA-01 — Asistente IA de Auditoría WMS en Tomas Físicas

* **Rol Evaluador:** Auditor Líder / Gerente de Operaciones.
* **Módulo:** Neo Core ➔ Neo Inventario (`/physical-counts` ➔ Detalle de Toma en Fase 2).
* **Tiempo Estimado:** 15 minutos.

### 🎯 1. Objetivo de Negocio
Comprobar cómo el asistente de Inteligencia Artificial analiza automáticamente las discrepancias de conteo físico, calcula el índice de exactitud de registro (**IRA % - Inventory Record Accuracy**) y genera un diagnóstico en lenguaje natural recomendando si se debe solicitar reconteo selectivo o proceder a la consolidación contable.

### 🖱️ 2. Paso a Paso Guiado desde el Core

1. Desde **Neo Core**, usa el **AppSwitcher (▦)** y ve a **"Neo Inventario"**.
2. En el menú lateral, haz clic en **"Tomas Físicas"** (`/physical-counts`).
3. Abre una toma de inventario que se encuentre en Fase de Revisión/Análisis (o la ejecutada en el Módulo 1).
4. En el panel superior derecho, ubica la tarjeta:  
   👉 **`🤖 Diagnóstico Inteligente de Auditoría (IA)`**.
5. Presiona el botón: **`⚡ Analizar Discrepancias con IA`**.
6. Observa la respuesta estructurada que emite la IA:
   * **Exactitud de Registro (IRA):** Porcentaje de ítems sin variación (ej. `94.2%`).
   * **Impacto Financiero:** Monto total neto y absoluto de las diferencias en USD y VES.
   * **Diagnóstico Cualitativo:** *"Se detecta una discrepancia monetaria crítica en el SKU PRD-1 por -$80.00 USD. Se recomienda ejecutar reconteo ciego de 2da vuelta antes de consolidar."*

### 👁️ 3. Resultado Esperado (Criterio de Éxito)
* ✅ La IA prioriza los ítems de mayor impacto financiero en lugar de simples variaciones numéricas.
* ✅ Proporciona justificaciones comprensibles y accionables para la gerencia de operaciones.

### ✍️ 4. Registro de Evaluación
* **Estado:** [ ] 🟢 Conforme (OK) &nbsp;&nbsp;&nbsp; [ ] 🟡 Con Observación &nbsp;&nbsp;&nbsp; [ ] 🔴 No Conforme
* **Observaciones:** ____________________________________________________________________
* **Firma Evaluador:** _______________________ &nbsp;&nbsp;&nbsp; **Fecha:** ____/____/2026

---

## 🧪 CASO 2: UAT-IA-02 — Agente Digital de Abastecimiento ("Chat con la Data")

* **Rol Evaluador:** Gerente de Compras / Director de Cadena de Suministro.
* **Módulos:** Neo Core / Neo Compras (`/asistente-ia`).
* **Tiempo Estimado:** 15 minutos.

### 🎯 1. Objetivo de Negocio
Validar la capacidad de consultar los datos de la empresa en lenguaje natural mediante Inteligencia Artificial generativa conectada directamente a la base de datos de Morpheus (Gemini + SQL), sin requerir que los directores pidan reportes complejos al departamento de TI.

### 🖱️ 2. Paso a Paso Guiado desde el Core

1. En **Neo Compras** (o en **Neo Core**), haz clic en el menú lateral en **"Asistente IA"** (`/asistente-ia`).
2. Se desplegará la interfaz de chat conversacional del Agente de Abastecimiento.
3. Escribe las siguientes preguntas de prueba en el chat:
   * **Pregunta 1:** *"¿Cuáles son los 5 productos con menor inventario en la tienda Patio Trigal?"*
   * **Pregunta 2:** *"¿Qué órdenes de compra están pendientes por recibir en muelle esta semana?"*
   * **Pregunta 3:** *"¿Cuál ha sido el proveedor con mayor volumen de compras en el último mes?"*
4. Evalúa las respuestas del asistente:
   * Observa que el agente genera tablas de datos estructuradas con cifras en USD.
   * Observa que explica el contexto y resalta alertas de quiebre de stock.

### 👁️ 3. Resultado Esperado (Criterio de Éxito)
* ✅ Respuestas en menos de 5 segundos con datos verídicos tomados de la base de datos en vivo.
* ✅ Formato ejecutivo legible, con tablas, totales y viñetas explicativas.

### ✍️ 4. Registro de Evaluación
* **Estado:** [ ] 🟢 Conforme (OK) &nbsp;&nbsp;&nbsp; [ ] 🟡 Con Observación &nbsp;&nbsp;&nbsp; [ ] 🔴 No Conforme
* **Observaciones:** ____________________________________________________________________
* **Firma Evaluador:** _______________________ &nbsp;&nbsp;&nbsp; **Fecha:** ____/____/2026

---

## 🧪 CASO 3: UAT-IA-03 — Dashboard Ejecutivo CEO y Valoración Consolidada

* **Rol Evaluador:** Sponsor del Proyecto / Gerente General / Directiva.
* **Módulo:** Neo Core ➔ Dashboard Principal (`https://hub.qa.morpheussoft.net/dashboard`).
* **Tiempo Estimado:** 15 minutos.

### 🎯 1. Objetivo de Negocio
Comprobar el centro de mando unificado de Morpheus ERP: consolidación en tiempo real de todas las sucursales de la empresa, valoración total del inventario a costo y precio de venta, margen bruto consolidado y estado operativo de las tiendas.

### 🖱️ 2. Paso a Paso Guiado desde el Core

1. Ingresa a la página principal de **Neo Core** (`https://hub.qa.morpheussoft.net/dashboard`).
2. Examina los 4 indicadores clave (KPI Cards) de la fila superior:
   * **Valoración Total del Inventario:** A costo promedio ponderado ($ USD y Bs).
   * **Potencial de Ingresos (PVP):** Proyección de ingresos si se vende el inventario actual.
   * **Margen Promedio Global:** Porcentaje de rentabilidad de la mercancía en piso.
   * **SKUs Activos:** Total de artículos en catálogo.
3. Utiliza el selector de **Sucursal** en la barra superior para alternar entre:
   * *Consolidado General (Todas las Sucursales)*
   * *Sucursal 01 - Patio Trigal*
   * *Sucursal 10 - Cumboto*
4. Valida que los gráficos de barras y distribución de inventario por categoría se filtren de inmediato según la sucursal elegida.
5. Presiona el botón **"Exportar Reporte Ejecutivo (PDF / Excel)"** para comprobar la generación del informe formal de fin de mes.

### 👁️ 3. Resultado Esperado (Criterio de Éxito)
* ✅ Los tableros presentan cifras consistentes y cuadradas con los módulos de WMS y Precios.
* ✅ La alternancia entre sucursales es instantánea y no requiere recargar la página completa.

### ✍️ 4. Registro de Evaluación
* **Estado:** [ ] 🟢 Conforme (OK) &nbsp;&nbsp;&nbsp; [ ] 🟡 Con Observación &nbsp;&nbsp;&nbsp; [ ] 🔴 No Conforme
* **Observaciones:** ____________________________________________________________________
* **Firma Evaluador:** _______________________ &nbsp;&nbsp;&nbsp; **Fecha:** ____/____/2026

---

## 🏁 SESIÓN DE CIERRE: Matriz de Decisión Go-Live y Acta de Aceptación

Una vez concluidos los 5 módulos de pruebas integrales, el comité evaluador (Cliente + Morpheus) se reúne para revisar la bitácora de incidencias y tomar la decisión final de salida a producción.

### 📊 Balance Final de Ejecución

| Módulo Evaluado | Casos Totales | 🟢 Conformes | 🟡 Con Observación | 🔴 No Conformes |
| :--- | :---: | :---: | :---: | :---: |
| **M1: Inventarios y Tomas Físicas (WMS)** | 4 | | | |
| **M2: Logística y Recepciones** | 3 | | | |
| **M3: Compras y Motor MRP** | 4 | | | |
| **M4: Costos y Motor de Precios** | 4 | | | |
| **M5: Inteligencia Artificial y Dashboards** | 3 | | | |
| **TOTALES CONSOLIDADOS:** | **18** | | | |

---

### 🚦 Criterio de Decisión para Salida en Vivo (Go / No-Go)

* [ ] **GO (Aprobado para Salida a Producción):** Se cumplieron los casos de negocio críticos y no existen incidencias bloqueantes pendientes.
* [ ] **GO CONDICIONADO:** Aprobado para iniciar despliegue en tiendas piloto mientras se afinan observaciones menores acordadas en bitácora.
* [ ] **NO GO:** Se reprograma la salida en vivo para solventar incidencias críticas detectadas.

---

### ✍️ Acta Formal de Aceptación de Pruebas Integrales (UAT)

Los abajo firmantes, en representación de sus respectivas organizaciones, certifican que han presenciado y evaluado la ejecución del **Protocolo de Pruebas Integrales de Usuario (UAT)** de la plataforma **Morpheus ERP / WMS**, dejando constancia de la conformidad de los resultados obtenidos.

\
**Por el Equipo Cliente:**

_______________________________________  
**Líder de Proyecto / Gerencia General**  
Nombre:  
Fecha: ____ / ____ / 2026  

\
_______________________________________  
**Líder de Operaciones y WMS**  
Nombre:  
Fecha: ____ / ____ / 2026  

\
_______________________________________  
**Líder de Compras y Abastecimiento**  
Nombre:  
Fecha: ____ / ____ / 2026  

\
\
**Por el Equipo Implementador Morpheus:**

_______________________________________  
**Lindbergh Zambrano / Líder Técnico Morpheus**  
Fecha: ____ / ____ / 2026  
