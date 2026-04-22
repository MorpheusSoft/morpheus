# Propuesta: Arquitectura de Múltiples Frontends (Morpheus ERP)

Basado en la estructura modular de la base de datos (esquemas `core`, `inv`, `pur`, `ship`) y las necesidades de un ERP escalable, aquí presento una propuesta detallada para dividir los módulos en **diferentes frontends según el área**.

## 1. Estrategia Técnica: Monorepo (Angular Workspace)

En lugar de tener múltiples repositorios aislados o un solo proyecto gigante (`frontend/src/app` actual donde cargamos `catalog`, `inventory`, `sales`, etc. juntos), la mejor práctica para aplicaciones corporativas (ERP) es usar un **Angular Workspace (Monorepo)**. En un único proyecto se alojan múltiples **Aplicaciones (Apps)** que consumen **Librerías Compartidas (Shared Libs)**.

## 2. División de Aplicaciones por Área (Frontends Independientes)

Cada una de estas aplicaciones tendrá su propio punto de entrada (URL/dominio separado, ej: `wms.morpheus.com` o `morpheus.com/wms`) y **solo** contendrá el código que esa área necesita.

### 📱 App 1: Admin / Core (`morpheus-admin`)
El panel de control central del ERP.
*   **Usuarios Objetivo:** Administradores de TI, Gerencia, Analistas de Negocio.
*   **Responsabilidades:**
    *   Gestión "Core": Sedes (Facilities), Compañías, Monedas.
    *   Gestión de Usuarios, Roles, Permisos y Seguridad.
    *   Dashboards gerenciales consolidados de todos los módulos.
    *   Auditorías del sistema y logs (Configuraciones maestras).

### 📦 App 2: Sistema de Gestión de Almacenes (`morpheus-wms`)
La herramienta operativa para el esquema `inv`.
*   **Usuarios Objetivo:** Jefes de almacén, Montacarguistas, Analistas de Inventario.
*   **Responsabilidades:**
    *   **Catálogo (Maestros):** Gestión exhaustiva de Productos, Categorías, y Variantes (SKUs).
    *   **Bodegas:** Configuración de Almacenes y Ubicaciones (Racks, Pasillos).
    *   **Operación:** Movimientos de Stock (Ajustes positivos/negativos), Recepciones físicas, y Despachos.
    *   **Auditoría:** Procesos de Conteo Ciego e inventarios anuales/cíclicos.

### 🛒 App 3: Compras y Abastecimiento (`morpheus-pur`)
La interfaz para el esquema `pur`.
*   **Usuarios Objetivo:** Compradores, Departamento Financiero y Jefaturas de Abastecimiento.
*   **Responsabilidades:**
    *   Catálogo y Evaluación de Proveedores.
    *   Procesamiento de Requisiciones de Compra (solicitudes internas de las sucursales).
    *   Emisión de Órdenes de Compra (POs) y control de presupuestos.
    *   Aprobaciones y flujos de trabajo (Workflows).

### 🚚 App 4: Despacho y Logística (`morpheus-ship`)
La interfaz logística de última milla referenciando el esquema `ship`.
*   **Usuarios Objetivo:** Despachadores, Jefes de Logística, Operadores de Flotilla.
*   **Responsabilidades:**
    *   Configuración de Transportistas (Carriers) y Vehículos.
    *   Gestión de Rutas y zonas geográficas.
    *   Manifiestos de Carga (Agrupar múltiples Pickings de salida en un solo camión).
    *   Trazabilidad y estados de entrega (Tracking).

### 💰 App 5: Ventas y Facturación Web (`morpheus-sales`)
Mientras que los vendedores de campo usan la aplicación móvil en Flutter (`mobile_app`), se requiere una visión administrativa o mostrador web.
*   **Usuarios Objetivo:** Vendedores de mostrador, Call center, Cajeros POS.
*   **Responsabilidades:**
    *   Punto de Venta Web (POS) rápido.
    *   Generación de Cotizaciones complejas web.
    *   Emisión de Facturas e Historial de Clientes B2B.

---

## 3. Arquitectura de Librerías Compartidas (Shared Libraries)

Para evitar duplicar código (por ejemplo, el diseño en PrimeNG o el sistema de Login), el workspace tendrá las siguientes librerías que serán consumidas por los frontends:

*   `@morpheus/ui`: Componentes visuales genéricos (Botones, Tablas PrimeNG configuradas estándar, Layouts de menú base, hojas de estilo `index.css`).
*   `@morpheus/auth`: Toda la lógica de interceptores HTTP, JWT, Guardias de seguridad y la pantalla de Login central.
*   `@morpheus/models`: Clases abstractas, Enumeradores y modelos TypeScript que representan tu BD (ej: `ProductVariant`, `StockPicking`, etc.).
*   `@morpheus/core-services`: Servicios de Angular para interactuar directamente con la API (ej: `ApiService`, `ErrorHandlingService`).

## 4. Navegación entre Aplicaciones (App Switcher)

Para mantener la simplicidad y evitar que el usuario tenga que memorizar URLs, el cambio entre módulos se realizará a través de un **"App Switcher" (Lanzador de Aplicaciones)** ubicado en la Barra Superior (Header), similar a la cuadrícula de Google (Google Workspace) o Microsoft 365.

*   **¿Cómo funciona?** Al hacer clic en el ícono de "Cuadrícula" en la esquina superior derecha, se desplegará un menú visual con las aplicaciones disponibles (ej: 📦 Inventario, 🛒 Compras, 💰 Ventas).
*   **Transparencia:** Al seleccionar una nueva app, el sistema redirige silenciosamente a la URL del nuevo frontend (ej: de `admin.` a `wms.`), utilizando *Single Sign-On (SSO)* para que la sesión del usuario se mantenga intacta sin pedir login de nuevo.

## 5. Gestión de Accesos y Permisos (Seguridad)

La seguridad se maneja centralmente desde el Backend y se refleja en los Frontends de la siguiente forma:

1.  **Autenticación Única (SSO + JWT):** Habrá una sola pantalla de Login global. Al ingresar, el Backend devuelve un Token (JWT) que contiene la identidad del usuario y una lista encriptada de sus **Roles**.
2.  **Filtrado del App Switcher:** Si un operario de almacén inicia sesión, el App Switcher **solo** le mostrará el ícono del sistema de "Inventario" (WMS). Las aplicaciones de "Compras" o "Ventas" estarán ocultas y sus URLs bloqueadas.
3.  **Permisos Granulares por Área (RBAC):** 
    *   Dentro de cada app (ej: WMS), el Backend dictamina qué puede hacer el usuario.
    *   Se usarán *Directivas de Angular* personalizadas (ej: `*hasPermission="'create_product'"`) para mostrar u ocultar botones (ej: ocultar el botón "Eliminar Producto" si no es jefe).
    *   Cada petición al backend es re-validada en el servidor para asegurar que un usuario malintencionado no pueda realizar acciones no permitidas forzando el frontend.

---

## 6. Ventajas de este Modelo

1. **Seguridad Absoluta**: Un operario de bodega entra a `wms.morpheus.com` y físicamente el código fuente que se le descarga en su navegador no contiene NADA del módulo financiero o de administrador. Es imposible que acceda a módulos no autorizados manipulando el frontend.
2. **Tiempos de Carga Rápidos (Performance)**: Al estar separadas, el tamaño inicial de descarga (bundle) es minúsculo en comparación a cargar todo el ERP, lo que hace sentir la aplicación más veloz.
3. **Escalabilidad de Trabajo**: Si entra un nuevo equipo de desarrolladores a trabajar solo en "compras", interactúan con la aplicación `morpheus-pur` minimizando colisiones en el código con el equipo de inventarios.

## User Review Required

> [!IMPORTANT]
> **Plan de Acción Propuesto:** Hemos definido la división por aplicaciones, el diseño visual unificado, el App Switcher unificado y la estrategia de seguridad centralizada. Si está totalmente de acuerdo con la visión arquitectónica plasmada aquí, el siguiente paso técnico es **ejecutar la creación del Angular Workspace**.

¿Gusta que procedamos con la ejecución técnica para generar la estructura del Monorepo con estas aplicaciones vacías e implementar la librería de UI compartida?
