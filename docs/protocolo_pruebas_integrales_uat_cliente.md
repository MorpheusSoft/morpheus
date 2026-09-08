# 📋 Protocolo de Pruebas Integrales de Aceptación de Usuario (UAT)
## Proyecto Morpheus WMS / ERP

**Fecha de Preparación:** Agosto 2026  
**Objetivo:** Guía estructurada de ejecución y validación por módulos para el inicio de pruebas de aceptación de usuario (UAT) con el equipo cliente.

---

## 🎯 Metodología de Ejecución

Cada caso de prueba debe ser ejecutado por el usuario clave o el auditor asignado, registrando:
- 🟢 **Conforme (OK):** El sistema respondió exactamente según el resultado esperado.
- 🟡 **Conforme con Observación:** Funciona pero requiere ajuste menor de UI o parámetro.
- 🔴 **No Conforme (Bloqueante):** Error o discrepancia que interrumpe el flujo operativo.

---

## 📦 MÓDULO 1: GESTIÓN DE INVENTARIOS Y ALMACENES (WMS & SALDOS)

### Caso UAT-INV-01: Consulta y Auditoría de Stock de Tienda en Tiempo Real
* **Objetivo:** Validar la consulta inmediata de existencias reales sincronizadas desde el POS para la sucursal activa, filtros por departamento/marca y verificación de precios bimonetarios y costos.
* **Prerrequisitos:** Tienda seleccionada (Almacén Principal pre-configurado de fábrica).
* **Pasos a Ejecutar:**
  1. Ingresar a `Neo Inventario -> Existencias / Stock`.
  2. Seleccionar la Sucursal activa (Ej. *Sucursal Patio Trigal* o *Cumboto*).
  3. Filtrar por departamento o marca comercial (Ej. *Polar*, *Nestlé*).
  4. Abrir la ficha de un producto y verificar: Stock Físico Disponible, Costo Promedio Ponderado, PVP y Almacén Principal asignado.
* **Resultado Esperado:** Visualización instantánea del catálogo y saldos sincronizados sin requerir configuración manual de almacenes o ubicaciones.
* **Estado:** [ ] 🟢 OK  |  [ ] 🟡 Obs  |  [ ] 🔴 Error

---

### Caso UAT-INV-02: Toma Física en 3 Fases (Conteo Ciego, Cotejo con IA y Consolidación)
* **Objetivo:** Validar la toma de inventario físico masivo / cíclico garantizando la imparcialidad del operador y el análisis predictivo de la IA.
* **Prerrequisitos:** Productos con existencias teóricas en el snapshot.
* **Pasos a Ejecutar:**
  1. Ir a `WMS -> Tomas Físicas -> + Nueva Toma Física`.
  2. Seleccionar Sucursal, Almacén (Obligatorio) y Alcance (*General* o *Cíclico con Categoría Jerárquica*).
  3. **Fase 1 (Conteo Ciego):** Transcribir la cantidad física contada por SKU y Nro. de Planilla (`PL-014`). Verificar que las columnas de *Stock Teórico* y *Diferencias* permanezcan ocultas.
  4. Presionar `🔒 Finalizar Conteo Ciego y Pasar a Análisis (Fase 2)`.
  5. **Fase 2 (Análisis de Cotejo & IA):** Revisar la recomendación del *Asistente IA de Auditoría WMS* y el indicador **IRA %**. Probar el botón 🔄 *Solicitar Reconteo (2da Vuelta)* en líneas con descuadre rojo.
  6. **Fase 3 (Consolidación):** Presionar `✅ Consolidar & Generar Ajustes`.
* **Resultado Esperado:**
  - En Toma General, los ítems no contados bajan a 0.
  - En Toma Cíclica, los productos fuera del alcance no sufren ninguna alteración.
  - Se generan los movimientos compensatorios `StockMove` en el Kardex.
* **Estado:** [ ] 🟢 OK  |  [ ] 🟡 Obs  |  [ ] 🔴 Error

---

### Caso UAT-INV-03: Control de Lotes, Fechas de Vencimiento y Cuarentena
* **Objetivo:** Verificar la trazabilidad de productos perecederos o bajo lote.
* **Prerrequisitos:** Producto configurado con control de lotes.
* **Pasos a Ejecutar:**
  1. Registrar una recepción de producto con Número de Lote (Ej. `LOT-2026-08`) y Fecha de Vencimiento.
  2. Consultar el saldo por lote en la vista de inventarios.
  3. Activar el estado de **Cuarentena** (`is_quarantined = True`) para el lote.
  4. Intentar realizar una salida o picking de dicho lote.
* **Resultado Esperado:** El sistema restringe la salida del lote en cuarentena y muestra la fecha de expiración en los reportes de inventario.
* **Estado:** [ ] 🟢 OK  |  [ ] 🟡 Obs  |  [ ] 🔴 Error

---

### Caso UAT-INV-04: Registro y Aprobación de Ajustes Directos (Cargo / Descargo)
* **Objetivo:** Validar el registro de cargos y descargos puntuales por merma, rotura o consumo interno con control de roles (RBAC).
* **Prerrequisitos:** Usuario con permiso de Registro y Aprobación.
* **Pasos a Ejecutar:**
  1. Ir a `WMS -> Ajustes de Inventario -> + Nuevo Ajuste Directo`.
  2. Seleccionar Motivo de Ajuste (Ej. *Merma por Transporte*, *Consumo Interno*).
  3. Indicar Tipo de Movimiento (*Descargo -* o *Cargo +*), SKU y Cantidad.
  4. Guardar en estado Borrador/Pendiente.
  5. Iniciar sesión con un usuario **sin permiso de aprobación** y verificar que el botón `Aprobar` esté restringido.
  6. Iniciar sesión con un usuario **Supervisor/Gerente** y presionar `Aprobar Ajuste`.
* **Resultado Esperado:** El ajuste se aplica con la fecha del instante de la aprobación, registrando el usuario autorizador (`approved_by_name`) e impactando el Kardex.
* **Estado:** [ ] 🟢 OK  |  [ ] 🟡 Obs  |  [ ] 🔴 Error

---

## 🚛 MÓDULO 2: LOGÍSTICA Y RECEPCIONES (PICKING & STOCK MOVES)

### Caso UAT-LOG-01: Recepción de Compras en Muelle (Dock Staging vs Directo)
* **Objetivo:** Probar el flujo de recepción de mercancía física contra una Orden de Compra autorizada.
* **Prerrequisitos:** Orden de Compra en estado `confirmed` o `sent`.
* **Pasos a Ejecutar:**
  1. Ir a `Logística -> Recepciones -> + Nueva Recepción`.
  2. Seleccionar la Orden de Compra origen.
  3. Si el Almacén requiere Muelle (*Dock Staging*), verificar que la ubicación de destino inicial sea la zona de recepción/muelle.
  4. Ingresar la cantidad recibida real y los datos del documento/factura de entrega del proveedor.
  5. Confirmar recepción.
* **Resultado Esperado:** El documento pasa a estado `DONE`, el stock ingresa a la zona de muelle/almacén y la Orden de Compra actualiza sus cantidades recibidas (`received_qty`).
* **Estado:** [ ] 🟢 OK  |  [ ] 🟡 Obs  |  [ ] 🔴 Error

---

### Caso UAT-LOG-02: Transferencia entre Almacenes y Sucursales
* **Objetivo:** Validar el traslado seguro de stock entre recintos.
* **Prerrequisitos:** Stock suficiente en el Almacén Origen.
* **Pasos a Ejecutar:**
  1. Ir a `Logística -> Transferencias -> + Nueva Transferencia`.
  2. Seleccionar Almacén Origen (Ej. *Almacén Central*) y Almacén Destino (Ej. *Sucursal Trigal*).
  3. Agregar los renglones de productos y cantidades demandadas.
  4. Procesar la salida en origen y la entrada en destino.
* **Resultado Esperado:** Descuento inmediato del saldo en Origen e incremento en Destino con trazabilidad completa de `StockMove`.
* **Estado:** [ ] 🟢 OK  |  [ ] 🟡 Obs  |  [ ] 🔴 Error

---

### Caso UAT-LOG-03: Generación e Impresión de Etiquetas de Código de Barras
* **Objetivo:** Verificar la emisión de etiquetas para rotulación de estantes y productos.
* **Pasos a Ejecutar:**
  1. Ir a `WMS -> Impresión de Etiquetas`.
  2. Seleccionar la plantilla de impresión (Ej. *Etiqueta EAN-13 Producto* o *Etiqueta Ubicación Pasillo*).
  3. Indicar la cantidad de copias a generar.
  4. Presionar `Imprimir / Generar PDF`.
* **Resultado Esperado:** Emisión del documento PDF o comando de impresión con código de barras legible para escáneres Handheld/Móviles.
* **Estado:** [ ] 🟢 OK  |  [ ] 🟡 Obs  |  [ ] 🔴 Error

---

## 🛒 MÓDULO 3: COMPRAS Y REABASTECIMIENTO (PURCHASING & MRP)

### Caso UAT-COM-01: Ciclo de Vida de la Orden de Compra y Descuentos Complejos
* **Objetivo:** Probar la emisión de órdenes de compra con condiciones comerciales avanzadas.
* **Pasos a Ejecutar:**
  1. Ir a `Compras -> Órdenes de Compra -> + Nueva Orden`.
  2. Seleccionar Proveedor, Moneda (USD/Bs) y Formato de Descuento (Ej. `10+5` o `%`).
  3. Cargar los productos, cantidades y precios unitarios acordados.
  4. Guardar y enviar a aprobación.
* **Resultado Esperado:** Cálculo exacto del subtotal, impuestos, descuento encadenado y total general.
* **Estado:** [ ] 🟢 OK  |  [ ] 🟡 Obs  |  [ ] 🔴 Error

---

### Caso UAT-COM-02: Portal Público Interactiva del Proveedor (Token Seguro)
* **Objetivo:** Probar la interacción directa con el proveedor sin requerir login en la plataforma.
* **Pasos a Ejecutar:**
  1. Generar la URL de portal público de una Orden de Compra en estado `Sent`.
  2. Abrir el enlace seguro en una pestaña de incógnito/navegador externo.
  3. Como proveedor, revisar el detalle de la orden y hacer clic en `Confirmar / Aceptar Pedido`.
  4. Regresar al sistema Morpheus y consultar la Orden de Compra.
* **Resultado Esperado:** La orden cambia a estado `confirmed`, registrando la fecha de lectura (`seen_by_supplier_at`) y la IP de aceptación del proveedor.
* **Estado:** [ ] 🟢 OK  |  [ ] 🟡 Obs  |  [ ] 🔴 Error

---

### Caso UAT-COM-03: Conciliación de Facturas de Proveedores (3-Way Matching)
* **Objetivo:** Validar el cuadre de 3 vías entre Orden de Compra, Recepción Física y Factura del Proveedor.
* **Pasos a Ejecutar:**
  1. Seleccionar una Orden de Compra recibida.
  2. Ingresar a la sección `Conciliación / Factura`.
  3. Cargar el Nro. de Factura, Fecha de Facturación e importes facturados por el proveedor.
  4. Si existe discrepancia de precio o cantidad, verificar la alerta del sistema.
* **Resultado Esperado:** Validación exitosa cuando las cifras coinciden; generación de alerta o ajuste de costo en caso de variaciones.
* **Estado:** [ ] 🟢 OK  |  [ ] 🟡 Obs  |  [ ] 🔴 Error

---

### Caso UAT-COM-04: Sugerencias de Reabastecimiento Asistidas por IA (Motor MRP)
* **Objetivo:** Probar la generación de sugerencias de compra basadas en históricos de venta y tiempos de entrega (*Lead Time*).
* **Pasos a Ejecutar:**
  1. Ir a `Compras -> Asistente MRP / Reabastecimiento`.
  2. Ejecutar la simulación de reabastecimiento para la sucursal seleccionada.
  3. Revisar la lista de productos sugeridos con su punto de reorden y consumo promedio.
  4. Presionar `Convertir Sugerencia en Orden de Compra`.
* **Resultado Esperado:** Creación automática de los borradores de Orden de Compra agrupados por proveedor habitual.
* **Estado:** [ ] 🟢 OK  |  [ ] 🟡 Obs  |  [ ] 🔴 Error

---

## 💲 MÓDULO 4: COSTOS, PRECIOS Y PROMOCIONES (PRICING ENGINE)

### Caso UAT-COS-01: Recálculo de Costo Promedio Ponderado en Recepción
* **Objetivo:** Verificar la valoración precisa del inventario al recibir lotes de compra a diferentes precios.
* **Prerrequisitos:** Producto con existencias y costo promedio inicial.
* **Pasos a Ejecutar:**
  1. Registrar el costo promedio actual de un SKU (Ej. $10.00$ USD con $100$ pzas).
  2. Recibir una nueva compra de $50$ pzas a $13.00$ USD.
  3. Verificar en el catálogo y en la ficha del producto el nuevo costo promedio recalculado:
     $$\text{Costo Promedio} = \frac{(100 \times 10.00) + (50 \times 13.00)}{150} = \$11.00\text{ USD}$$
* **Resultado Esperado:** El sistema actualiza automáticamente el costo promedio ponderado en `ProductVariant` e `InventorySnapshot`.
* **Estado:** [ ] 🟢 OK  |  [ ] 🟡 Obs  |  [ ] 🔴 Error

---

### Caso UAT-COS-02: Sesiones de Ajuste Masivo de Precios con Margen Objetivo
* **Objetivo:** Probar el motor de simulación de precios por sucursal basado en márgenes de utilidad deseados.
* **Pasos a Ejecutar:**
  1. Ir a `Costos y Precios -> Sesiones de Precios -> + Nueva Sesión`.
  2. Cargar una lista de productos o categoría.
  3. Indicar el `% Margen de Utilidad Deseado` (Ej. $30\%$).
  4. Simular los nuevos precios de venta sugeridos.
  5. Aprobar la sesión de precios.
* **Resultado Esperado:** Actualización en lote de las listas de precio por sucursal (`ProductFacilityPrice`).
* **Estado:** [ ] 🟢 OK  |  [ ] 🟡 Obs  |  [ ] 🔴 Error

---

### Caso UAT-COS-03: Campañas de Promociones Temporales por Sucursal
* **Objetivo:** Validar la aplicación automática de precios de oferta por vigencia.
* **Pasos a Ejecutar:**
  1. Ir a `Costos y Precios -> Promociones -> + Nueva Campaña`.
  2. Configurar la campaña (Ej. *Descuento 15% Fin de Semana*), definiendo fecha de inicio y fin.
  3. Asignar los productos participantes y la sucursal de aplicación.
  4. Consultar el precio vigente durante el periodo promocional y posterior al vencimiento.
* **Resultado Esperado:** Aplicación automática del `promo_price` solo durante el rango de fechas válido.
* **Estado:** [ ] 🟢 OK  |  [ ] 🟡 Obs  |  [ ] 🔴 Error

---

## 🤖 MÓDULO 5: INTELIGENCIA ARTIFICIAL & TABLEROS EJECUTIVOS

### Caso UAT-IA-01: Asistente IA de Auditoría WMS en Tomas Físicas
* **Objetivo:** Validar la evaluación predictiva de descuadres durante el conteo físico.
* **Pasos a Ejecutar:**
  1. En una Toma Física en Fase de Análisis (`REVIEW`), presionar `Re-analizar con IA`.
  2. Verificar el resumen de precisión de inventario (**IRA %**).
  3. Evaluar la recomendación redactada por la IA sobre líneas críticas.
* **Resultado Esperado:** La IA identifica correctamente las desviaciones monetarias altas y sugiere acciones correctivas.
* **Estado:** [ ] 🟢 OK  |  [ ] 🟡 Obs  |  [ ] 🔴 Error

---

### Caso UAT-IA-02: Agente Conversacional de Abastecimiento (Chat con la Data)
* **Objetivo:** Probar la interacción en lenguaje natural con la base de datos operativa.
* **Pasos a Ejecutar:**
  1. Abrir el chat del Agente Digital de Abastecimiento.
  2. Consultar en español: *"¿Cuáles son los 5 productos con menor stock en la Sucursal Patio Trigal?"*
  3. Consultar: *"¿Qué órdenes de compra están pendientes por recibir esta semana?"*
* **Resultado Esperado:** La IA interpreta la consulta SQL interna y responde con datos precisos y tablas ejecutivas estructuradas.
* **Estado:** [ ] 🟢 OK  |  [ ] 🟡 Obs  |  [ ] 🔴 Error

---

### Caso UAT-IA-03: Tablero Ejecutivo CEO y Valoración de Inventario
* **Objetivo:** Verificar la integridad de los reportes gerenciales para toma de decisiones.
* **Pasos a Ejecutar:**
  1. Ingresar al `Dashboard CEO`.
  2. Revisar los KPIs de Valoración Total de Inventario (a Costo Promedio y Reposición), Rotación de Stock y Cobertura en Días.
  3. Filtrar por sucursal y exportar los resultados a Excel/PDF.
* **Resultado Esperado:** Cifras 100% consolidadas e integradas en tiempo real con las operaciones diarias.
* **Estado:** [ ] 🟢 OK  |  [ ] 🟡 Obs  |  [ ] 🔴 Error

---

## ✍️ Hoja de Firmas de Aceptación de UAT

| Rol | Nombre del Responsable | Firma | Fecha |
| :--- | :--- | :--- | :--- |
| **Líder de Proyecto Cliente:** | ________________________ | ________________ | ___/___/2026 |
| **Líder Logístico / WMS:** | ________________________ | ________________ | ___/___/2026 |
| **Líder de Compras / Supply:** | ________________________ | ________________ | ___/___/2026 |
| **Líder de Implementación Morpheus:** | ________________________ | ________________ | ___/___/2026 |
