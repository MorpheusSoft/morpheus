# Bitácora de Sesión: Estabilización, Seguridad y Rendimiento
**Fecha:** 28 de Abril de 2026
**Módulos Afectados:** Neo-Purchases, Neo-WMS, Neo-Core, Neo-Inventory

## Resumen de Problemas Resueltos y Mejoras Implementadas

### 1. Migración de Capa de Seguridad (Solución de Errores 401)
* **Problema:** Al interactuar con el sistema (Crear ODCs, visualizar Dashboard, módulo de Recepciones WMS), el servidor devolvía un error `401 Unauthorized`. Esto ocurría porque se estaban utilizando llamadas `axios` puras hacia `http://localhost:8000`, saltándose el interceptor de autenticación.
* **Solución:** Se realizó un escaneo profundo en `neo-purchases` y `neo-wms` reemplazando todas las llamadas crudas de `axios` por la instancia segura `api` desde `@/lib/api`. Se ajustaron las URLs absolutas a rutas relativas (ej. `/purchase-orders/`).

### 2. Estabilización de Respuestas Paginadas (TypeError: forEach/filter is not a function)
* **Problema:** El backend enviaba respuestas paginadas bajo el esquema `{ data: [...], total: ... }`, pero el frontend esperaba arreglos planos o la clave `items`. Esto causaba el colapso de componentes como el Dropdown de Proveedores y la vista de Nueva Orden.
* **Solución:** Se implementó una destructuración resiliente en todas las peticiones `api.get` usando la cadena de respaldo: `(res.data.data || res.data.items || (Array.isArray(res.data) ? res.data : []))` para extraer de forma segura los arreglos de productos, proveedores, centros logísticos y categorías.

### 3. Solución al "Logout Loop" en el Entorno QA
* **Problema:** Al presionar "Cerrar Sesión" en QA, el sistema redirigía al inicio y volvía a loguear automáticamente al usuario. Esto se debía a que las cookies de sesión se establecían bajo un dominio comodín (`.morpheussoft.net`) pero al intentar eliminarlas, no se especificaba el dominio, por lo que el navegador ignoraba la orden de borrado.
* **Solución:** Se modificó la acción de servidor `logoutAction` en `neo-core` y todos los interceptores de Axios en los 4 módulos para que incluyan el parámetro `domain: isProd ? '.morpheussoft.net' : undefined` al forzar el vencimiento (`Max-Age=0`) de la cookie `access_token`.

### 4. Perfiles Dinámicos en los Sidebars
* **Problema:** El menú lateral (`AppSidebar.tsx`) mostraba el texto hardcodeado "Administrador" y las iniciales "LZ" en todos los módulos.
* **Solución:** Se agregó un hook que consume `/users/me` para inyectar dinámicamente el `{userName}`, `{userInitials}` y el `{userRole}` según el token activo de la sesión. 

### 5. Optimización de Memoria y Paginación UI (Virtual Scrolling)
* **Problema:** El despliegue inicial de "Todos los Proveedores" en el Simulador MRP y listas largas en Dropdowns colapsaban y congelaban el navegador por exceso de nodos en el DOM. Además, el buscador local de PrimeReact dejaba de encontrar entidades porque la API restringía la carga a 100 registros.
* **Solución:** 
    1. Se aumentó el límite de extracción de la API a 5.000 registros (`?limit=5000`) para garantizar que el menú Dropdown tuviera el catálogo completo.
    2. Se activó el `paginator` en el `DataTable` de proyecciones MRP.
    3. Se habilitó el Scroll Virtual (`virtualScrollerOptions={{ itemSize: 38 }}`) en los Dropdowns de proveedores y productos para evitar el colapso del DOM, mejorando el rendimiento dramáticamente.

---
**Nota para el futuro:** Si se añaden nuevas funcionalidades, asegúrese de usar siempre `api.get/post` y recordar que el backend por defecto devolverá objetos paginados `{ data, total }` si el endpoint de FastAPI incluye `skip` y `limit`.
