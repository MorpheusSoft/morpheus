# Configuración del Servidor VPS de Producción

Este documento mantiene el registro de la configuración técnica del servidor VPS (Ubuntu/Linux) para Morpheus ERP, útil para realizar pases a producción rápidamente.

## Usuario y Servidor
- **Usuario SSH:** `lzambrano`
- **Host:** `vmi3245958`
- **Ruta del Proyecto:** `/home/lzambrano/Morpheus`

## Ecosistema PM2 (Next.js y FastAPI)

El servidor utiliza PM2 para gestionar tanto los frontends (Módulos Neo) como el backend de Python.

| ID | Nombre de Proceso | Tipo | Puerto (Interno) | Descripción |
|---|---|---|---|---|
| 0 | `hub-core` | Next.js | Frontend | Neo Core (Módulo Principal) |
| 1 | `compras` | Next.js | Frontend | Neo Purchases |
| 2 | `inventario` | Next.js | Frontend | Neo Inventory |
| 3 | `logistica` | Next.js | Frontend | Neo WMS (Logística) |
| 5 | `neo-api` | Python/Uvicorn | 8000 | Backend FastAPI de Morpheus |

> **Nota de Red (Nginx):** El backend (Puerto 8000) está expuesto públicamente en el subdominio: `https://api.qa.morpheussoft.net`

## Comando de Actualización Estándar

Para subir actualizaciones al entorno productivo:

```bash
# 1. Navegar a la carpeta del proyecto
cd ~/Morpheus

# 2. Descargar últimos cambios de GitHub
git pull origin main

# 3. Reiniciar el Backend (Si los cambios son en Python / api)
pm2 restart neo-api

# 4. Reiniciar los frontends (Opcional, si hubo cambios en Next.js)
pm2 restart hub-core compras inventario logistica
```

## Notas del Entorno Virtual de Python
El proceso `neo-api` se está ejecutando directamente utilizando el binario del entorno virtual local del proyecto:
`.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000`
