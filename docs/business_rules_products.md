# Reglas de Negocio: Ficha de Productos (Neo ERP)

Este documento centraliza las reglas de negocio, requerimientos y dependencias necesarias para el desarrollo del módulo de creación y edición de productos (Ficha de Producto).

## 1. Códigos del Producto
- **Código Principal Autogenerado:** El sistema debe autogenerar un código secuencial y principal para cada nuevo producto. Una vez creado de forma inicial, este código es **inmutable** (no se puede modificar).
- **Códigos Asociados (Personalizados):** Si el usuario requiere manejar códigos personalizados (EAN, UPC, códigos de proveedor o internos), el sistema debe permitir crear múltiples códigos secundarios. Todo código secundario o nuevo creado se asociará sistemáticamente al código principal del producto.

## 2. Productos Multivariantes (Matriz de Atributos)
- **Requisito:** Evitar la creación redundante e ineficiente de un "Producto Maestro" diferente para cada variación de talla, color, etc.
- **Acción:** Un producto principal (ej. Zapato "Nine" modelo "2525") actuará como **Plantilla Contenedora**. Debajo de él se jerarquizarán "Variantes" (SKUs) donde cada una posea atributos específicos (Ej. Talla 40, Color Azul). Cada Variante puede tener asignado un código de barras único e independiente para la caja física que se cobra.

## 3. Control de Lotes y Fechas de Vencimiento
- **Requisito:** Trazabilidad estricta y desglosada para productos perecederos (ej. alimentos o medicinas).
- **Acción:** Si el producto está configurado para "Manejo de Lotes", cada ingreso de mercancía exigirá un Número de Lote y Fecha de Vencimiento obligatorios. Logísticamente, el inventario se ramificará indicando cuántas unidades corresponden a cada lote y vencimiento. A nivel de escaneo frontal, generalmente todos esos lotes compartirán el mismo código de barras de caja, pero en sistema la trazabilidad interna de bodega debe ser atómica por lote.

## 4. Precios, Impuestos y Descuentos Visuales
El formulario debe desglosar y mostrar claramente la matemática comercial:
- **Vista de Precio Base:** Precio antes de impuestos.
- **Vista de Impuesto:** Monto específico del impuesto aplicable según categoría (Licor).
- **Vista de Precio Final:** Suma matemática visible y en vivo (*Precio Base + Impuesto*).
- **Descuentos Activos:** Mostrar su repercusión inmediata si la variable está activa.

## 5. Gestión de Precios por Localidad
- **Requisito:** El sistema no debe limitarse a un precio de venta único global.
- **Acción:** El formulario y la base de datos deben asignar y gestionar múltiples precios de venta base para el mismo producto, independientes entre la **Localidad** (sucursales, regiones, tiendas).

## 6. Gestión y Análisis de Costos (4 Costos Clave)
Debe manejarse de forma paralela la evolución de cuatro costos por producto + localidad:
1. **Costo de Reposición:** El último costo de una Orden de Compra/Lista de Proveedor.
2. **Costo Actual:** El costo real extraído de la última mercancía facturada e ingresada.
3. **Costo Anterior:** Retiene en memoria el "Costo Actual" justo antes del ingreso logístico más reciente.
4. **Costo Promedio (Ponderado):** Matemáticamente calcula y cruza el valor del nuevo inventario (\(Costo Actual \times Cantidad Nueva\)) promediado con el inventario almacenado (\(Costo Anterior \times Stocks Viejos\)).

## 7. Trazabilidad: Historial de Costos de Compra
- **Acción:** Dentro de la ficha del producto deben consultarse los últimos costos facturados y el descuento asociado.

## 8. Dependencia: Maestro de Proveedores
- **Acción:** Es obligatorio poseer un Maestro de Proveedores. Todo el histórico de los puntos anteriores depende y cruza lógicamente con un Proveedor para la trazabilidad exacta.

## 9. Moneda, Utilidad y Merma
- **Asignación de Moneda:** Todo producto debe estar obligatoriamente asociado a una moneda específica en su creación (ej. para blindar costos y precios base).
- **Análisis de Utilidad:** El sistema debe ser capaz de calcular y mostrar el porcentaje de utilidad (margen) del producto. Este cálculo surge dinámicamente de la relación entre su costo (Ej. Costo Actual o Promedio) y su precio de venta configurado.
- **Consideración de Merma:** Para los productos que poseen mermas conocidas e inevitables (pérdidas orgánicas, de evaporación, despunte, etc.), la ficha del producto debe permitir estipular dicho porcentaje de merma. El sistema utilizará este dato para mostrar la utilidad real/efectiva, recosteando en caliente las unidades para evidenciar cómo la pérdida del inventario impacta el margen final.
- **Gestión de Licores:** Se debe marcar si un producto es de naturaleza Alcohólica (`is_liquor`). Esta marca puede especificarse en la Ficha del Producto o pre-configurarse a nivel de Categoría base. Es vital esta exclusión para el control de impuestos especiales, retenciones y auditorías formales.

## 10. Configuraciones Globales que Afectan al Sistema y Producto
El proyecto debe contar con un área de Configuración de Sistema transversal aplicable a todos los módulos. Particularmente para el manejo de inventario y precios, rigen las siguientes configuraciones obligatorias:
- **Moneda del Sistema vs. Moneda del País:** Se deben manejar dos entidades clave de moneda:
  - *Moneda del Sistema:* Es la moneda base o dura (opcional) que se utiliza para estabilizar costos y finanzas a nivel corporativo si se requiere.
  - *Moneda del País (Ej. Bolívares):* Otorga la obligatoriedad tributaria y fiscal. Todos los documentos de compra/proveedores, impuestos y registros formales deben expresarse en esta moneda local interactuando mediante las tasas de cambio.
- **Elección del Costo Base para Precios:** Al momento de calcular el precio de un producto, la configuración global debe dictar explícitamente **cual de los 4 costos del histórico** (Costo Actual, Promedio, Anterior o Reposición) será utilizado como la variable X (Costo predeterminado) en el cálculo.
- **Métodos de Cálculo de Utilidades:** El motor debe definir de forma sistemática un estándar para todo el entorno de la aplicación entre dos métodos de cálculo matemático para el margen de ganancias:
  1. **Método del Margen sobre Venta:** Se calcula la porción de utilidad basándose en el precio final. Su fórmula base es `(Precio Venta - Costo) / Precio Venta`.
  2. **Método de Porcentaje Simple (Mark-up):** Determina cuánto se incrementa por encima del costo. Su fórmula es `(Precio Venta - Costo) / Costo` o en inverso, el Precio sugerido se basa en `Costo * (1 + Utilidad)`.

## 11. Estrategia de Valorización de Inventario (Modelo Híbrido)
Para garantizar la legalidad contable y la protección comercial (especialmente en entornos inflacionarios o multimoneda), el sistema emplea una estrategia de valorización híbrida de los costos:
- **Núcleo Contable (Promedio Ponderado / WAC):** Es el método predeterminado del sistema para valorizar contablemente el inventario total. Se recalcula de forma móvil con cada nueva entrada de mercancía.
- **Trazabilidad Física Estricta (FIFO/PEPS):** Se exige la salida de los lotes más antiguos primero para aquellos productos perecederos (medicinas/alimentos), descontando el inventario basándose en el costo original en el que ingresó ese lote específico.
- **Valorización Gerencial y Política de Precios:** Sin importar la exigencia contable tributaria (Promedio o FIFO), el sistema utilizará el **Costo de Reposición** o el **Costo Actual** como base primordial para sugerir y proteger el Precio de Venta público, eludiendo la descapitalización al recomprar.
- **Kardex Perfilado e Inteligente:** El historial de movimientos debe registrar y plasmar cómo evolucionó el Promedio Ponderado en cada transacción (línea por línea). Adicionalmente, se dispondrá de un *Simulador de Costos en Caliente* que advierta al usuario (durante una recepción de compra) cómo se verá afectado su margen de utilidad global si ingresa la mercancía al nuevo costo provisto por el proveedor.

## 12. Presentaciones, Empaques y Control Físico (Dimensional)
Para soportar la logística analítica de reposición (módulo de compras, CEDI y cálculos de flete), la ficha del producto no debe cohibirse operativamente a una sola "Unidad Base". Neo exige el uso orgánico de la jerarquía de conversiones y atributos geofísicos:
- **Gestión Multi-Empaque:** Un mismo producto (ej. "Cocosette") posee una unidad mínima nativa de venta al detal (1 Und), pero logísticamente el proveedor transacciona en **Empaques Secundarios** (Ej: Caja de 12 Unds) o transfiere en **Empaques Terciarios** corporativos (Ej: Bulto/Paleta de 24 Cajas, es decir, 288 Unds combinadas). La ficha permitirá crear en cascada *"N" Empaques Adicionales* adjuntos al esqueleto del producto principal.
- **Transparencia Transaccional en Compras:** Al dictaminar o sugerir estadísticamente una Orden de Compra frente al proveedor, el analista de Neo podrá invocar explícitamente "50 Bultos", y el core desglosará internamente en sus bases de datos que logísticamente la mercadería representa "14,400 Unidades" asegurando el costeo atómico exacto en Kardex, previniendo así errores forzados por el uso paralelo de calculadoras.
- **Métricas Físicas en Almacenaje (Peso y Volumen):** Cada empaque creado pedirá (o sugerirá fuertemente) plasmar la información del Peso global ocupado (`Kg` o `Gr`) y su Volumen en el espacio (`Metros Cúbicos`). Es fuertemente recomendado ya que:
  1. Permite certificar si las cantidades arrojadas en una Orden de Reposición central caben lógicamente dentro de la unidad de transporte en la flotilla (Control de carga límite y cálculo presupuestario de viáticos).
  2. Determina algorítmicamente la holgura en el área de recepción y la capacidad límite en las estibas/racks del **Centro de Distribución (CEDI)**, previniendo colapsos estáticos por envíos superiores a la capacidad del local.
