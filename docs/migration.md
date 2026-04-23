# Guía Oficial de Migración: Morpheus ERP

El proceso de migración de datos hacia Morpheus se realiza en `5 pasos` secuenciales para garantizar el correcto mapping de IDs, SKUs y relaciones de variantes, independientemente del sistema *legacy* o archivo de origen.

## Requisitos de Entorno
1. Entorno Virtual activo (`.venv/bin/activate`).
2. Tablas y relaciones creadas (`python initialize_db.py`).
3. Carpeta `data_import/` en la raíz del proyecto con todos los archivos `.csv` (codificación UTF-8 o UTF-8-SIG, delimitadores preferiblemente `;`).

---

## 1. Importación de Categorías (`import_categories.py`)
Crea el árbol jerárquico del catálogo. Trunca y genera la tabla `inv.categories`.

**Archivo esperado:** `data_import/categorias.csv`
**Estructura requerida (CSV):**
`Nivel1 ; Nivel2 ; Nivel3 ; ... ; NivelX` (Generará los parents iterativamente).

---

## 2. Importación de Proveedores (`import_suppliers.py`)
Puebla el maestro general de organizaciones B2B.

**Archivo esperado:** `data_import/proveedores.csv`
**Estructura requerida (CSV):**
`RIF (tax_id) ; Nombre o Razón Social`

---

## 3. Importación del Catálogo Maestro (`import_products.py`)
Este es el motor principal. Inserta el `Product` (padre), el `ProductVariant` (hijo), la matriz de precios base de la localidad central y, adicionalmente, inyecta el código legado del cliente a la tabla de Códigos de Barras como puente histórico.

Al correr, realiza un **TRUNCATE CASCADE** borrando el inventario antiguo y sus enlaces (proveedores/barcodes) de forma limpia. 
*El SKU oficial de la Variante pasa a generarse nativamente usando `PRD-{product.id}`.*

**Archivo esperado:** `data_import/productos_base.csv`
**Estructura requerida (CSV):**
`Código Legado de Sistema Anterior` ; `Descripción` ; `Categoría` ; `Costo` ; `Precio` ; `Impuesto (%)` ; `Moneda_ID (USD/VES)` ; `Marca` ; `URL Imagen`

---

## 4. Enriquecimiento de Códigos Legados y Proveedores (`import_meta_data.py`)
Conecta las mallas y enriquece las Variantes buscando su "Código Legado" previamente inyectado de forma puente.

Ejecuta dos inyecciones:
### A. Códigos Multi-Unidad Físicos
**Archivo esperado:** `data_import/codigos.csv`
**Estructura requerida (CSV):**
`Código Legado (Del archivo de productos)` ; `Código de Barras largo (EAN/UPC a escanear)`

### B. Proveedores vs. Productos
**Archivo esperado:** `data_import/opcionales.csv`
**Estructura requerida (CSV):**
`Código Legado (Del archivo de productos)` ; `RIF o ID Fiscal del Proveedor`

---

## 5. Inyección de Existencias Iniciales (`import_initial_stock.py`)
Crea auditorías instantáneas (Inventario Físico) de la carga bruta inicial sumando las ubicaciones.

**Archivo esperado:** `data_import/existencias.csv`
**Estructura requerida (CSV):**
`Almacén` ; `Sección/Estantería` ; `Código Legado o Barcode` ; `Stock (Cantidad Física)`
