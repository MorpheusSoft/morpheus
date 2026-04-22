# Arquitectura Bimonetaria Transaccional - Neo ERP
## Documento Oficial de Reglas de Negocio (Business Rules)

### 1. El Paradigma de la Moneda Base vs. Transaccional
Todo el sistema ERP operará inquebrantablemente con un **Ledger (Libro Mayor) en Moneda Base (Duro / USD)**. Todo costo de inventario, valuación patrimonial y promedios móviles (`WAVG`, `FIFO`) en el motor de almacén (WMS) deben ser calculados y guardados de raíz en la Moneda Funcional Base. 

A nivel de interfaces de usuario (UI), Documentos Legales (ODC, Facturas) y Cuentas por Cobrar/Pagar, se utilizará una **Moneda Transaccional** que permite negociaciones, estimaciones geométricas de descuento, cobros y pagos en divisas locales (Ej. Bolívares - VES), pero siempre respaldados por una tasa de anclaje referencial obligatoria.

### 2. Tatuaje Cambiario en Documentos (Historical Anchoring)
Todo modelo SQLAlchemy/PostgreSQL diseñado para representar un documento comercial, financiero o logístico (Ej. `PurchaseOrder`, `Invoice`, `Receipt`) **TIENE ESTRICTAMENTE PROHIBIDO** hacer `JOIN` cruzado contra la tabla maestra de histórico de divisas para calcular sus totales de forma dinámica.
Cada tabla de documentación de este tipo debe incluir intrínsecamente y obligatoriamente las siguientes columnas:
```sql
currency_id INT REFERENCES core.currencies(id) NOT NULL
exchange_rate NUMERIC(18,6) NOT NULL
```
- La columna `exchange_rate` **JAMÁS debe registrar la cifra inerte y trivial de (1.00)** en economías fluctuantes. Incluso si el documento fue cotizado, negociado y cerrado 100% en Dólares (`currency_id = 1`), el Backend **tiene la obligación moral y contable de inyectar la Tasa Referencial de la Moneda Secundaria Local (Ej. VES)** vigente con la que fue aprobado el documento (Ej. `36.50` ó `340.65`). Esto será el único rescate y sello notarial posible en la Leyenda Contable para trazabilidad a largo plazo de los auditores.

### 3. Espejo Financiero Obligatorio (UI Dual Display)
El estándar UX/UI militar y premium de Neo ERP dicta que **jamás debe haber ambigüedad de lectura** ni obligación a utilizar calculadoras externas. Toda cabecera o bloque de totales financieros en React (FrontEnd) **debe recalcular geométricamente y renderizar en su periferia el espejo dual** a la moneda opuesta.

**Las Matemáticas del Frontend:**
- Si `currencyId === Moneda Local (VES)`: El Subtotal principal de pantalla es en Bolívares. El "Subtexto Espejo" expresará la división: `Gran Total / exchangeRate => (Valor Universal en USD)`.
- Si `currencyId === Moneda Base (USD)`: El Subtotal principal de pantalla es en Dólares Puros. El "Subtexto Espejo" expresará el producto local inflacionario: `Gran Total * exchangeRate => (Valor Bursátil en VES)`.
- El Subtexto Espejo **siempre debe acompañarse en tipografía reducida de la Tasa Aplicada (Ej. "Tasa Referencial: 36.50")** justificando la operación ante Contraloría.

### 4. Tolerancia Táctica a "Nulls" y Protecciones (Fallback Layer)
Ningún cálculo Pydantic u ORM SQLAlchemy puede paralizar el sistema por la ausencia de metadatos estáticos en el Banco Central Interno.
Las APIs de despachos de Divisas y Tasas de Flujo (Ej. `/api/v1/currencies/exchange-rates/latest`) implementarán protección algebraica (`COALESCE` o sentencias lógicas booleanas). Si un request exige el histórico de la propia `Moneda Base`, que matemáticamente jamás cambia en la vida real y el query de la base de datos es un espacio nulo vacío, el Gateway `FastAPI` tiene que devolver estrictamente `Decimal("1.0")`, impidiendo catástrofes de `NaN` (Not-a-Number) en la grilla y memoria de React.

### 5. Flexibilidad de Reglas Logísticas en Bonificaciones (Regalías WMS)
Durante las negociaciones Bimonetarias que resultan en Adiciones sin Repercusión de Costos para Proveedores (Donde el Costo Unitario se congela en `$0.00`):
- El componente `Interface` que administra inyecciones de regalía o "Bonificación Gratuita de Inventario" **DEBE OFRECER LA MANIOBRABILIDAD LOGÍSTICA DE IGNORAR EL EMPAQUE OBLIGATORIO DEL MAESTRO DE PRODUCTO.** Esto sucede para no fracturar los cálculos del Almacén cuando reciban Piezas Individuales en lugar de Camiones Enteros.
- Para lograr esta limpieza, el Motor Frontend inyecta `pack_id = null`, `qty_per_pack = 1` y muta dinámicamente la Nomenclatura Pydantic forzando a `"UND. BASE (X1)"`, librándose del problema sistémico (`NaN Unds`) que sucede al re-esculpir embalajes indefinidos con `undefined * float()`.

---
## Implementaciones Obligatorias
Queda rigurosamente dictaminado que cualquier Módulo que intente implementarse en Neo ERP (Nómina, CRM, WMS o Sistema de Cobranza Directa) acatará las Reglas de Arquitectura establecidas aquí, requiriendo su revisión estricta en los Pull Requests antes de tocar la rama matriz.
