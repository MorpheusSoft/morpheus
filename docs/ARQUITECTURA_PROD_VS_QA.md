# 🏗️ Arquitectura Dual de Servidor: Producción (PROD) vs Pruebas (QA)
## Configuración y Operación del Servidor VPS (`vmi3245958` - `217.216.83.151`)

**Fecha de Implementación:** 20 de Octubre de 2026  
**Sistema:** Neo ERP  
**Estado:** ✅ 100% Operativo y Aislado  

---

## 🧭 1. Resumen de la Separación de Entornos

El servidor VPS ahora opera con **dos instancias completamente aisladas** que no comparten memoria, bases de datos ni procesos:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ SERVIDOR VPS (Ubuntu 22.04 LTS — IP: 217.216.83.151)                                   │
├───────────────────────────────────────────┬────────────────────────────────────────────┤
│ 🟢 ENTORNO DE PRODUCCIÓN (PROD)           │ 🧪 ENTORNO DE PRUEBAS (QA)                 │
├───────────────────────────────────────────┼────────────────────────────────────────────┤
│ 📁 Ruta: `/home/lzambrano/Morpheus`       │ 📁 Ruta: `/home/lzambrano/Morpheus-QA`     │
│ 🗄️ Base de Datos: `morpheus_prod`         │ 🗄️ Base de Datos: `morpheus_qa`            │
│ 🌐 Dominios: `*.morpheussoft.net`         │ 🌐 Dominios: `*.qa.morpheussoft.net`       │
│ ⚙️ Ecosistema: `ecosystem.prod.config.js` │ ⚙️ Ecosistema: `ecosystem.qa.config.js`    │
│ 💾 Respaldo: Cron diario 02:00 AM         │ 🛠️ Uso: Pruebas, Demos y Capacitación      │
└───────────────────────────────────────────┴────────────────────────────────────────────┘
```

---

## 🔌 2. Matriz de Puertos y Procesos PM2

| Módulo / Servicio | Puerto PROD | Nombre PM2 PROD | Puerto QA | Nombre PM2 QA |
| :--- | :---: | :--- | :---: | :--- |
| **Backend API (FastAPI)** | **`8000`** | `prod-api` | **`8100`** | `qa-api` |
| **Neo Core (Hub)** | **`4000`** | `prod-hub` | **`4100`** | `qa-hub` |
| **Neo Compras** | **`4001`** | `prod-compras` | **`4101`** | `qa-compras` |
| **Neo Inventario** | **`4002`** | `prod-inventario` | **`4102`** | `qa-inventario` |
| **Neo Logística / WMS** | **`4003`** | `prod-logistica` | **`4103`** | `qa-logistica` |
| **Neo Pricing (Costos)**| **`4004`** | `prod-costos` | **`4104`** | `qa-costos` |
| **Neo B2B** | **`4005`** | `prod-b2b` | **`4105`** | `qa-b2b` |
| **Neo Producción** | **`4007`** | `prod-produccion` | **`4107`** | `qa-produccion` |

---

## 🌐 3. Configuración de Red y Nginx

### Entorno QA (`https://*.qa.morpheussoft.net`)
* **Archivo Nginx:** `/etc/nginx/sites-available/morpheus_qa`
* **Certificado SSL:** Let's Encrypt activo (`/etc/letsencrypt/live/api.qa.morpheussoft.net/`).
* **Enrutamiento:**
  * `https://api.qa.morpheussoft.net` ➔ `http://127.0.0.1:8100`
  * `https://hub.qa.morpheussoft.net` ➔ `http://127.0.0.1:4100`
  * `https://logistica.qa.morpheussoft.net` ➔ `http://127.0.0.1:4103`
  * `https://compras.qa.morpheussoft.net` ➔ `http://127.0.0.1:4101`
  * `https://inventario.qa.morpheussoft.net` ➔ `http://127.0.0.1:4102`
  * `https://costos.qa.morpheussoft.net` ➔ `http://127.0.0.1:4104`
  * `https://b2b.qa.morpheussoft.net` ➔ `http://127.0.0.1:4105`
  * `https://produccion.qa.morpheussoft.net` ➔ `http://127.0.0.1:4107`

### Entorno de Producción (`https://*.grupocatania.com` y `http://*.morpheussoft.net`)
* **Archivo Nginx:** `/etc/nginx/sites-available/morpheus_prod`
* **Enrutamiento:**
  * `api.grupocatania.com` / `api.morpheussoft.net` ➔ `http://127.0.0.1:8000`
  * `hub.grupocatania.com` / `hub.morpheussoft.net` ➔ `http://127.0.0.1:4000`
  * `logistica.grupocatania.com` / `logistica.morpheussoft.net` ➔ `http://127.0.0.1:4003`
  * `compras.grupocatania.com` / `compras.morpheussoft.net` ➔ `http://127.0.0.1:4001`
  * `inventario.grupocatania.com` / `inventario.morpheussoft.net` ➔ `http://127.0.0.1:4002`
  * `costos.grupocatania.com` / `costos.morpheussoft.net` ➔ `http://127.0.0.1:4004`
  * `b2b.grupocatania.com` / `b2b.morpheussoft.net` ➔ `http://127.0.0.1:4005`
  * `produccion.grupocatania.com` / `produccion.morpheussoft.net` ➔ `http://127.0.0.1:4007`
* **Paso Pendiente de DNS para Activar SSL (HTTPS):**
  1. En el panel de DNS (GoDaddy) de `morpheussoft.net`, crear el registro A para `*` (o para `api`, `hub`, `logistica`, etc.) apuntando a `217.216.83.151`.
  2. Ejecutar en el servidor:
     ```bash
     sudo certbot --nginx -d api.morpheussoft.net -d hub.morpheussoft.net -d logistica.morpheussoft.net -d compras.morpheussoft.net -d inventario.morpheussoft.net -d costos.morpheussoft.net
     ```

---

## 🗄️ 4. Bases de Datos PostgreSQL

* **`morpheus_prod` (Producción):**
  * Conectada exclusivamente por `/home/lzambrano/Morpheus/backend/.env`.
  * Contiene las tablas limpias para la siembra de la tienda piloto.
  * Respaldo automático diario a las 02:00 AM en `/home/lzambrano/backups/`.
* **`morpheus_qa` (Pruebas / QA):**
  * Conectada por `/home/lzambrano/Morpheus-QA/backend/.env`.
  * Utilizada para demos, capacitaciones y pruebas sin riesgo de afectar tiendas vivas.
* **`morpheus_db` (Respaldo Histórico Original):**
  * Mantenida intacta como salvaguarda.

---

## 🛠️ 5. Comandos de Operación Rápida

### Ver Estado de Procesos:
```bash
pm2 list
```

### Reiniciar Producción:
```bash
pm2 restart prod-api prod-hub prod-compras prod-inventario prod-logistica prod-costos
```

### Reiniciar QA:
```bash
pm2 restart qa-api qa-hub qa-compras qa-inventario qa-logistica qa-costos
```

### Forzar Respaldo Manual de Producción:
```bash
/home/lzambrano/backup_prod_daily.sh
```
