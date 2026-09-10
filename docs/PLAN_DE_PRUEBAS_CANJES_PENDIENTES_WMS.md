# Plan de Pruebas: Monitor de Canjes y Artículos Pendientes por Cambio (Vendor Exchange Tracker)

**Módulo:** WMS / Almacenes e Inventarios  
**Agente Responsable:** Arturo WMS (`ARTURO_WMS`)  
**Fecha de Creación:** 2026-09-10  
**Versión:** 1.0  
**Estado:** Listo para Ejecución UAT  

---

## 1. Objetivo del Plan de Pruebas
Validar funcional y técnicamente la capacidad del Agente Digital **Arturo WMS** para auditar de forma autónoma y reactiva la bolsa de canjes en cuarentena (`inv.vendor_swaps`), calcular la antigüedad y el valor monetario inmovilizado ($), alertar oportunamente en el muelle de recepción cuando un proveedor con canjes pendientes arriba al almacén, y atender consultas ejecutivas en lenguaje natural vía WhatsApp.

---

## 2. Alcance y Componentes Involucrados
- **Base de Datos:** Tablas `inv.vendor_swaps`, `inv.vendor_swap_executions`, `inv.stock_moves` y `core.digital_worker_actions_log`.
- **Servicios Backend (Python/FastAPI):** `wms_skills.py` (función `audit_vendor_swaps`), `whatsapp_agent.py` (herramienta `query_pending_swaps`).
- **Canal Conversacional:** Handlers de WhatsApp Cloud API y simulador web.
- **Frontend (NEO CORE):** Tarjeta de Arturo WMS, toggle de habilidad, bitácora de auditoría en tiempo real.

---

## 3. Matriz de Casos de Prueba (Escenarios UAT)

| ID | Caso de Prueba / Escenario | Condición Previa / Entrada | Acción a Ejecutar | Resultado Esperado (Criterio de Éxito) | Severidad |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **CP-01** | **Detección de Canjes Pendientes y Cálculo de Antigüedad** | Existen registros en `inv.vendor_swaps` con estado `PENDING` (aislados hace 3, 10 y 20 días). | Se ejecuta el ciclo autónomo de Arturo WMS (`run_worker_cycle`). | El agente agrupa por proveedor, calcula días de antigüedad exactos y valoriza el capital inmovilizado en USD. Emite log `VENDOR_SWAPS_AUDIT`. | **Alta** |
| **CP-02** | **Tratamiento de Canjes Parciales** | Un canje de 100 unidades recibió 40 unidades (quedan 60 pendientes, estado `PARTIAL`). | Escaneo autónomo o consulta manual. | El agente **no** evalúa las 100 originales, sino estrictamente el **saldo pendiente restante (60 uds)** valorizado al costo actual. | **Alta** |
| **CP-03** | **Idempotencia y Exclusión de Canjes Cerrados** | Un canje pasa a estado `COMPLETED` (100% entregado) o `CANCELLED`. | Re-ejecución del ciclo de escaneo. | El agente ignora los registros completados; no genera alertas ni ruido en la bitácora para ese canje. | **Media** |
| **CP-04** | **Cruce Proactivo con Muelle / Recepción Inbound** | Hay una ODC programada o camión por recibir del proveedor *Alfonzo Rivas*, quien tiene 15 cajas pendientes por canjear. | Se registra el ingreso o recepción en almacén de ese proveedor. | Arturo WMS emite una alerta operativa prioritaria: *"Atención Recepción: El proveedor tiene un canje pendiente (#SWAP-XXX) de 15 cajas. Exigir la reposición mano a mano"*. | **Crítica** |
| **CP-05** | **Consulta por WhatsApp: Por Proveedor** | Supervisor autenticado escribe: *"Arturo, ¿qué canjes tenemos pendientes con Alfonzo Rivas?"* | Mensaje entrante procesado por `whatsapp_agent.py`. | Arturo responde con viñetas: N° de canje, producto, unidades pendientes, motivo de avería y días esperando al camión. | **Alta** |
| **CP-06** | **Consulta por WhatsApp: Resumen General de Cuarentena** | Supervisor escribe: *"¿Cuánta mercancía tenemos en cambio y cuánto dinero representa?"* | Mensaje entrante general. | Arturo calcula el total consolidado: *"Actualmente tenemos X productos en cuarentena distribuidos en Y proveedores, sumando un valor inmovilizado de $Z.ZZ"*. | **Media** |
| **CP-07** | **Visualización y Filtros en Consola NEO CORE** | Acciones ejecutadas por la habilidad. | Navegar a `/dashboard/digital-workers` > Bitácora de Acciones. | Se muestran las alertas generadas categorizadas con severidad `WARNING` o `CRITICAL` y su desglose JSON de detalle. | **Media** |

---

## 4. Protocolo Paso a Paso para el Tester / Key User

### Paso 1: Preparación del Dataset en Base de Datos
Crear o verificar 3 registros de prueba en `inv.vendor_swaps`:
- **Registro A (Crítico > 15 días):** 20 unidades de *Harina PAN 1KG*, Proveedor: *Empresas Polar*, Fecha de aislamiento: hace 18 días, Estado: `PENDING`.
- **Registro B (Parcial > 7 días):** 50 unidades de *Galletas Oreo*, Proveedor: *Mondelēz*, canjeadas 20, pendientes 30, Fecha: hace 8 días, Estado: `PARTIAL`.
- **Registro C (Reciente < 3 días):** 10 unidades de *Salsa de Tomate*, Fecha: ayer, Estado: `PENDING`.

### Paso 2: Ejecución Manual desde la Consola Web
1. Iniciar sesión en **NEO CORE** (`https://hub.qa.morpheussoft.net` o entorno local).
2. Ir a **Seguridad y Acceso** > **Usuarios Digitales (IA)**.
3. Localizar la tarjeta de **Arturo WMS**.
4. Verificar que el switch de la habilidad **"Control de Devoluciones y Averías / Canjes"** esté activo.
5. Hacer clic en **"Ejecutar Ahora"**.
6. Abrir la **Bitácora** de Arturo y verificar:
   - Presencia de la acción `VENDOR_SWAPS_AUDIT`.
   - Severidad `CRITICAL` para el Registro A (18 días) y `WARNING` para el Registro B (8 días).

### Paso 3: Validación en el Simulador de WhatsApp
1. En la misma pantalla, hacer clic en el botón verde superior **"Simulador WhatsApp"**.
2. Ingresar el número de teléfono del supervisor verificado.
3. Probar las siguientes preguntas:
   - *"Arturo, ¿qué artículos tenemos pendientes por cambio con los proveedores?"*
   - *"¿Cuánto dinero tenemos retenido en canjes de Polar?"*
   - *"¿Hay canjes viejos de más de 15 días en cuarentena?"*
4. Confirmar que las respuestas contengan:
   - Nombre claro del producto y SKU.
   - Cantidad exacta pendiente de canje.
   - Días de antigüedad en el almacén.
   - Monto en dólares ($) del capital inmovilizado.

### Paso 4: Liquidación y Verificación de Cierre
1. En el módulo WMS de recepción, ejecutar la entrega mano a mano del Registro A completando las 20 unidades pendientes con un nuevo lote y fecha de vencimiento.
2. Volver al simulador de WhatsApp y preguntar: *"Arturo, ¿Polar tiene canjes pendientes?"*.
3. **Criterio de Aceptación:** El agente debe responder: *"✅ Empresas Polar no posee artículos pendientes por cambio en este momento."*

---

## 5. Criterios de Aceptación (Definición de Éxito)
- [ ] **Exactitud Matemática:** Saldo pendiente = `qty_quarantined - qty_swapped`.
- [ ] **Precisión Monetaria:** Multiplicación exacta por el costo de reposición o costo promedio en USD.
- [ ] **Calidad de Interacción:** Mensajes claros, ejecutivos, con viñetas legibles en móvil y sin IDs internos de base de datos.
- [ ] **Rendimiento:** Escaneo completado en menos de 2 segundos sin bloqueos en la base de datos transaccional.
