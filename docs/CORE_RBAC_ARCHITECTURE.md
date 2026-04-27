# Morpheus NEO-ERP - Arquitectura de Seguridad Core (JSON RBAC)
*Fecha de Registro: Abril 2026*

Este documento sirve como bitácora y referencia arquitectónica para desarrollos futuros dentro del ecosistema Morpheus y sus aplicaciones (Inventory, Purchases, Logistics). Detalla la migración desde un sistema de roles planos a una matriz profunda basada en `JSONB` en PostgreSQL.

## 1. El Problema Original
Anteriormente, el sistema limitaba la gestión de seguridad a características planas y booleanas dentro de la tabla de perfiles (`roles`). Si requeríamos validar qué usuario tiene acceso a módulos granulares (ej: *Permitir ver los productos, pero impedir eliminar empresas*), obligaba a crear densas estructuras de tablas pivotales relacionales (muchos-a-muchos) que sobrecargaban las consultas SQL y enredaban la serialización en el backend FastAPI y Next.js.

## 2. La Solución Escogida (JSONB Matrix)
Para proveer un nivel de seguridad altamente corporativo, granulado, ágil, y sin necesidad de alterar la base de datos con cada nueva aplicación que el ERP gane en el futuro, se empleó una **Matriz de Estructura Libre en formato JSONB natively suportada por PostgreSQL**.

### 2.1 Estructura del JSON (Diccionario de Privilegios)
La columna nativa en la base de datos se denomina `permissions`. Se estructura en 3 niveles de profundidad obligatorios:
1. **Macro-módulo (App):** Ej. `neo_core`, `neo_purchases`.
2. **Características (Features/Entities):** Ej. `users`, `prices`.
3. **Poderes Estándares (Pilares):** Se consolidaron 4 acciones universales.

Ejemplo base estandarizado en sistema:
```json
{
  "neo_purchases": {
      "orders": { "read": false, "write": false, "delete": false, "approve": false },
      "prices": { "read": false, "write": false, "delete": false, "approve": false },
      "suppliers": { "read": false, "write": false, "delete": false, "approve": false }
  }
}
```

### 2.2 Pilares del Poder (Estándar para validación Backend y Frontend)
*   `read` (Lectura): Es la base del acceso. Si es `false`, oculta botones del SideBar de la UI e impide ejecutar listados GET en API. Si este permiso se retira, **todos los inferiores deben dar `false` por defecto**.
*   `write` (Escritura): Habilita mutaciones POST/PUT para editar y crear data.
*   `delete` (Eliminación): Habilita mutaciones DELETE. Considerado un permiso crítico.
*   `approve` (Aprobación): Uso vertical y semántico (Ej: firmar autorizaciones de compra de alto volumen o aprobar listas de precios).

## 3. Implementación Estructural Actual

### Base de Datos (`morpheus`)
- **Esquema:** `core`
- **Tabla:** `roles`
- **Cambio:** `ALTER TABLE core.roles ADD COLUMN permissions JSONB DEFAULT '{}'::jsonb;`
*Nota: Gracias al SQLAlchemy Dialect, en Python dict no requiere ser forzado con dumps. `SQLAlchemy` lo procesa como un objeto Dictionary ordinario.*

### Endpoints (FastAPI)
`backend/app/api/v1/endpoints/roles.py` gestiona el tráfico natural en el POST y PUT al inyectar limpiamente `permissions=role_in.permissions` desde el schema `Pydantic`.

### Front-End (Next.js)
El gestor del administrador reside en ruta protegida de React JS: `/dashboard/roles/page.tsx`.
Está programado con Smart Interlocking Rules (Reglas Inteligentes):
- Apagar el checkbox de `Ver` forzará limpieza (apagado) a `Escritura`, `Borrado` y `Aprobación`.
- Encender validaciones de escritura forzará al sistema a activar automáticamente el checkbox de lectura por coherencia.

---
**Nota para Desarrollos Futuros:** A medida que nuevas aplicaciones (*ej. NEO RRHH*) nazcan en el sistema, **solo** es necesario extender el diccionario base inicial en UI (el objeto constante `initialPermissions` cargado en Javascript) con sus features. El Backend y la Base de Datos recibirán dinámicamente y sin quejarse la nueva matriz guardándola instantáneamente.
