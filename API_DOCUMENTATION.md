# Documentación de la API del Backend

Este documento lista todos los endpoints disponibles del sistema ERP de Inventario.

**URL Base**: `/api/v1`

## Autenticación
`Nota: La mayoría de los endpoints requieren un token de acceso en el header: Authorization: Bearer <token>`

| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `POST` | `/login/access-token` | Autentica a un usuario y retorna un token de acceso JWT. |

---

## Catálogo (Datos Maestros)
*Endpoints para gestionar estructuras de datos básicas.*

| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `POST` | `/categories/` | Crear una nueva categoría de producto. |
| `GET` | `/categories/` | Listar todas las categorías de producto. |
| `GET` | `/categories/{id}` | Obtener una categoría por ID. |
| `PUT` | `/categories/{id}` | Actualizar categoría (Nombre, Padre, Estado). |
| `DELETE` | `/categories/{id}` | Eliminar categoría (Solo si no tiene productos ni hijos). |
| `GET` | `/warehouses/` | Listar todos los almacenes. |
| `GET` | `/locations/` | Listar todas las ubicaciones (estantes, bins, virtuales, etc.). Soporta filtros por `warehouse_id`, `usage` (INTERNAL/EXTERNAL), y `type` (SHELF, LOSS, etc.). |

---

## Productos
*Endpoints para gestionar el catálogo de productos.*

| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `POST` | `/products/` | Crear una nueva Plantilla de Producto. Si `has_variants` es Falso, valida una variante por defecto automáticamente. |
| `GET` | `/products/` | Listar todos los productos. |
| `POST` | `/products/{id}/variants` | Agregar un SKU específico (Variante) a una Plantilla de Producto existente. |

---

## Operaciones de Stock (Núcleo)
*Endpoints para gestionar las operaciones diarias del almacén (Recepciones, Despachos, Transferencias).*

| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/picking-types/` | Listar tipos de operación disponibles (ej: Recepciones, Despachos, Transferencias Internas). |
| `POST` | `/pickings/` | Crear un nuevo Picking de Stock (Borrador). Actúa como un documento cabecera para los movimientos. |
| `GET` | `/pickings/` | Listar pickings recientes. |
| `GET` | `/pickings/{id}` | Obtener detalles de un picking específico. |
| `POST` | `/pickings/{id}/moves` | Agregar una línea de movimiento de stock a un Picking en borrador. |
| `POST` | `/pickings/{id}/validate` | **Acción**: Valida el picking, actualiza los niveles de inventario (Doble Partida), y establece el estado a DONE. |

### Consultas Rápidas de Stock
| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/stock/{product_id}` | Obtener el stock total disponible para un producto (Suma de todas las ubicaciones INTERNAS). |
| `GET` | `/stock/{product_id}/{location_id}` | Obtener la cantidad de stock de un producto en una ubicación específica. |

---

## Ajustes de Inventario (Auditoría Física)
*Endpoints para realizar conteos físicos y ajustes.*

| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `POST` | `/inventory/sessions/` | Crear una nueva Sesión de Conteo de Inventario (Planificación). |
| `GET` | `/inventory/sessions/{id}` | Obtener detalles y líneas de la sesión. |
| `POST` | `/inventory/sessions/{id}/start` | Marcar la sesión como IN_PROGRESS (Empezar conteo). |
| `POST` | `/inventory/sessions/{id}/lines` | Agregar un registro de conteo (Se toma una captura del Stock en este momento). |
| `PUT` | `/inventory/lines/{line_id}` | Actualizar un registro de conteo (ej: corrección). |
| `POST` | `/inventory/sessions/{id}/validate` | **Acción**: Cierra la sesión. Compara automáticamente Contado vs Teórico y genera Movimientos de Ajuste (Stock <-> Pérdida) para corregir el inventario. |

---

## Reportes
*Analítica y datos históricos.*

| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/reports/stock` | **Reporte de Stock**: Retorna una lista detallada del stock actual agrupado por Producto y Ubicación, incluyendo valorizaciones (Costo Promedio / Costo de Reposición). |
| `GET` | `/reports/kardex/{product_id}` | **Kardex**: Retorna el historial completo de movimientos para un producto específico. |
