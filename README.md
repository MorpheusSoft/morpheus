# Inventory ERP System

Sistema de gestión de inventario y ERP.

## Requisitos Previos

- Python 3.12+
- Node.js 18+
- PostgreSQL
- `python3-venv` (para crear entornos virtuales)

## Configuración Rápida

Para configurar todo el entorno de desarrollo (backend y frontend), ejecuta:

```bash
./setup_dev.sh
```

O si tienes `make` instalado:

```bash
make install
```

## Ejecución

Para iniciar tanto el backend como el frontend (Next.js):

```bash
make start
```

- **Backend (FastAPI)**: http://localhost:8000
- **Documentación API**: http://localhost:8000/docs
- **Frontend (Next.js - Neo ERP)**: http://localhost:3000

## Estructura del Proyecto

- `backend/`: API FastAPI y lógica de negocio.
- `neo-erp-web/`: Aplicación principal en Next.js (Turborepo).
- `frontend/`: (Legado - No usar) Código antiguo en Angular.
- `setup_dev.sh`: Script de configuración automática.
- `Makefile`: Comandos rápidos de gestión.
