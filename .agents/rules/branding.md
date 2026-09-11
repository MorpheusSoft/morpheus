# Directrices de Marca y Nomenclatura del Proyecto: Neo ERP

## 1. Nombre Oficial del Sistema
- El nombre oficial del ERP es **Neo** (o **Neo ERP**).
- Cada subsistema o módulo se denomina con el prefijo **Neo**:
  - **Neo Core** (Hub central, accesos, usuarios digitales y configuración)
  - **Neo WMS** / **Neo Logística** (Almacén, recepciones, despachos, transferencias y mapa de almacén)
  - **Neo Inventario** (Catálogo maestro de productos, existencias, lotes y ajustes)
  - **Neo Compras** (Órdenes de compra, recepción de facturas y gestión de proveedores)
  - **Neo Pricing** / **Costos y Precios** (Estructuras de costos, márgenes, simulaciones y habladores)
  - **Neo POS** (Punto de venta y facturación en tienda)
  - **Neo B2B** (Portal mayorista de pedidos para clientes)

## 2. Reglas de Presentación para Desarrollos Futuros
- **Interfaces de Usuario (UI):** Títulos de página (`<title>`), encabezados de módulos (`<h1>`, `<h2>`), barras de navegación, modales, alertas y botones deben usar siempre **Neo** y jamás "Morpheus".
- **Reportes y Documentos:** Todos los encabezados de reportes (PDF, Excel, HTML), comprobantes de recepción, actas de discrepancia y tickets térmicos (80mm) deben llevar el membrete y pie de página de **Neo ERP**.
- **Agentes y Asistentes IA:** En los system prompts y saludos iniciales, los asistentes digitales se presentarán como parte del ecosistema de IA de **Neo ERP** (ej: *"Soy tu Asistente IA de Neo ERP"*).

## 3. Restricciones Técnicas y Protección de Infraestructura
- **No renombrar** cadenas de conexión de base de datos (`morpheus_db`), usuarios del motor (`morpheus_admin`), variables de entorno de red ni el repositorio de código fuente (`MorpheusSoft/morpheus`).
- Se mantienen las rutas del sistema de archivos, claves de `localStorage` existentes (`morpheus_auth_token`, etc.) y dominios de servidor (`*.qa.morpheussoft.net`) para no alterar la operatividad de los servidores de desarrollo, QA y producción.
