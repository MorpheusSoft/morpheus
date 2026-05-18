# Manual de Despliegue y Pruebas: Morpheus Sync Agent

Este documento detalla los pasos para probar la tubería de datos localmente y los requisitos para llevarla al entorno productivo del cliente.

---

## Parte 1: Prueba Manual en Desarrollo (Local)

Antes de ir al cliente, validaremos que la "tubería" transmite correctamente el JSON desde SQL Server hasta nuestra API.

### Paso 1: Levantar el Backend Receptor
En tu terminal de desarrollo, levanta el servidor de Morpheus (FastAPI):
```bash
cd backend
# Activa tu entorno virtual si usas uno
uvicorn app.main:app --reload --port 8000
```
*Esto encenderá el endpoint `http://localhost:8000/api/v1/sync/transactions`.*

### Paso 2: Configurar el Agente
Abre el archivo `scripts/sync_agent/sync_agent.py` y asegúrate de que:
1. Las cadenas de conexión (`DB_VAD10_DSN` y `DB_VAD20_DSN`) apunten a tus bases de datos locales o de prueba.
2. Escribe tus credenciales reales de SQL Server en `UID=...;PWD=...`.

### Paso 3: Ejecutar una Carga Pequeña (Histórica)
Abre otra terminal y ejecuta el agente forzando un rango de fechas pequeño (por ejemplo, el día de ayer) para ver cómo viajan los datos:
```bash
cd scripts/sync_agent
pip install -r requirements.txt
python sync_agent.py --start "2026-05-12 00:00:00" --end "2026-05-12 23:59:59"
```

**Resultado esperado:** 
Verás en la consola de Python: `[*] Enviando 45 registros a Morpheus... [+] Sincronización exitosa.`
Y en la consola del servidor Morpheus verás llegar la petición `POST /api/v1/sync/transactions` con código 201.

> **Nota Técnica:** Actualmente el endpoint recibe el JSON y responde OK, pero los bloques de inserción (`pass`) a las tablas en PostgreSQL todavía están en blanco. Esa será nuestra próxima tarea de programación.

---

## Parte 2: Pruebas en el Entorno QA (Staging)

Antes de conectar la tubería al servidor de Producción, debemos certificar el flujo en nuestro servidor de QA.

1. **Despliegue del Backend:** Asegúrate de que el código con el nuevo endpoint `sync.py` esté compilado y desplegado en tu servidor VPS de QA.
2. **Configuración del Agente:** En el `sync_agent.py`, cambia temporalmente la constante `MORPHEUS_API_URL` para que apunte al subdominio de QA (ej: `https://qa.tudominio.com/api/v1/sync/transactions`).
3. **Carga controlada:** Ejecuta el script con un rango de fechas (`--start` y `--end`) y entra a la web de Morpheus QA para verificar que los gráficos, inventarios y ventas cuadren con la realidad.

---

## Parte 3: Pase a Producción

### 1. ¿Qué debemos montar en el Servidor de la Tienda (El Cliente)?
Este servidor (donde está instalado SQL Server) será el que empuje los datos hacia afuera.
*   **Requisito 1:** Instalar **Python 3** (marcando la opción "Add Python to PATH" durante la instalación).
*   **Requisito 2:** Instalar el **ODBC Driver 17 for SQL Server** (usualmente ya está si tienen SQL Server, pero por si acaso).
*   **Requisito 3:** Copiar la carpeta `scripts/sync_agent/` allí. Abrir una consola como administrador e instalar librerías: `pip install -r requirements.txt`.
*   **Requisito 4:** Modificar el `sync_agent.py` para poner la URL real de Morpheus en la nube (`https://morpheus.cliente.com/api...`) y el Token de seguridad definitivo.
*   **Requisito 5:** Crear una **Tarea Programada en Windows (Task Scheduler)** que ejecute `python sync_agent.py` cada 10 o 15 minutos en modo silencioso.

### 2. ¿Qué debemos montar en el Servidor de Morpheus (La Nube VPS)?
*   **Requisito 1:** Desplegar el código de nuestro backend actualizado (que ahora contiene el archivo `endpoints/sync.py`).
*   **Requisito 2:** Asegurarnos de que el servidor web (Nginx) y el firewall (UFW) estén permitiendo tráfico entrante HTTPS (Puerto 443).
*   **Requisito 3:** Reiniciar el servicio del backend (ej: `pm2 restart morpheus-api` o `systemctl restart fastapi`).
