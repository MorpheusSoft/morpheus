# 🚀 Guía Maestra: Puesta a Cero y Protocolo de Arranque a Productivo (Go-Live) de Neo ERP

Esta guía documenta el protocolo operativo y técnico oficial para realizar la **puesta a cero (wipe & reset)** de la base de datos central en la nube, inicializar los correlativos transaccionales y ejecutar la **siembra ordenada de catálogos maestros y saldos de inventario** desde las tiendas físicas locales mediante el agente de integración **NeoAgentSync** (`MorpheusConfigurador.exe`), dejando el sistema 100% operativo en producción.

---

## 🧭 Diagrama de Flujo del Proceso de Go-Live

```
┌────────────────────────────────────────────────────────────────────────┐
│                      FASE 1: NUBE / BASE DE DATOS                      │
│   1. Respaldo previo (pg_dump) -> 2. TRUNCATE CASCADE & Secuencias = 1 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      FASE 2: NUBE / CONFIGURACIÓN                      │
│   Verificar Sucursales (Facilities), Monedas (VED/USD) y Usuarios      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   FASE 3: TIENDA FÍSICA / RESET LOCAL                  │
│   MorpheusConfigurador -> [ Limpiar / Resetear Estado Local ]          │
│   (Elimina marcas de agua sync_state.json y SQLite temporal)           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│              FASE 4: TIENDA FÍSICA / SIEMBRA DE CATÁLOGOS              │
│   0. Categorías ➔ 1. Proveedores ➔ 2. Productos & Variantes ➔          │
│   3. Códigos de Barra ➔ 4. Costos & Cruces ➔ 5. Baseline Inventario    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 FASE 5: NUBE / ALMACENES Y MAPEO WMS                   │
│   Crear Almacenes (Piso de Venta / Cambios) y vincular depósitos       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                FASE 6: TIENDA FÍSICA / SERVICIO ACTIVO                 │
│   Instalar e Iniciar Windows Service (NeoAgentSync) para Ventas        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 FASE 7: AUDITORÍA CON AGENTES IA DE NEO                │
│   Dante TI (/estado en Telegram) + Arturo WMS (WhatsApp)               │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 Fase 1: Respaldo de Seguridad y Puesta a Cero en la Nube

Antes de iniciar la siembra de la tienda, la base de datos central en la nube (`morpheus_db` en PostgreSQL) debe quedar completamente limpia de transacciones de prueba, catálogos previos, almacenes y ubicaciones, restableciendo todos los correlativos a 1.

### 1. Conexión al Servidor Central
Acceder vía SSH a la instancia del servidor (ej. servidor QA o producción):
```bash
ssh lzambrano@217.216.83.151
```

### 2. Ejecutar el Script Automatizado de Puesta a Cero
Ejecutar el script [backend/reset_database_for_golive.py](file:///home/lzambrano/Desarrollo/Morpheus/backend/reset_database_for_golive.py):
```bash
cd ~/Morpheus/backend
source .venv/bin/activate
python reset_database_for_golive.py
```

#### ¿Qué realiza este script automáticamente?
1. **Respaldo Previo de Seguridad:** Ejecuta un `pg_dump` completo guardado en `/home/lzambrano/backup_morpheus_db_before_golive_YYYYMMDD_HHMMSS.sql`.
2. **Vaciado de Almacenes y Ubicaciones WMS:** Limpia `inv.locations`, `inv.warehouses` y `inv.store_deposit_mappings`.
3. **Vaciado de Transacciones:** Vence y trunca ventas (`sales.documents`, `document_lines`, `document_payments`), compras (`pur.purchase_orders`, `purchase_order_lines`), y movimientos WMS (`inv.stock_moves`, `inv.stock_pickings`, `inv.inventory_snapshots`, `inv.inventory_sessions`, etc.).
4. **Vaciado de Catálogo Maestro:** Elimina productos, variantes, barras, precios de sede y proveedores (`inv.products`, `inv.product_variants`, `core.suppliers`).
5. **Reinicio de Correlativos a 1:** Todas las secuencias de base de datos (`ALTER SEQUENCE ... RESTART WITH 1;`) vuelven al valor inicial.
6. **Preservación Segura:** Conserva intactos los usuarios administradores (`core.users`), sucursales (`core.facilities`), monedas (`core.currencies`) y agentes de IA (`core.digital_workers`).

---

## 🏢 Fase 2: Verificación de Parámetros Base en Neo Core

1. Iniciar sesión como Administrador en **Neo Core** (`https://hub.qa.morpheussoft.net/login`).
2. **Sucursales (`/dashboard/facilities`):** Verificar que estén registradas las 15 tiendas con su código y nombre oficial (ej. `01 - Patio Trigal`, `10 - Cumboto`, `11 - Maracay`).
3. **Monedas (`/dashboard/currencies`):** Verificar la moneda base (`USD`) y moneda de referencia (`VED`) con su tasa de cambio actualizada.
4. **Usuarios y Permisos (`/dashboard/users`):** Verificar que los supervisores de tienda tengan asignada la sucursal que les corresponde.

---

## 💻 Fase 3: Reseteo de Estado Local en la Tienda Física (Semilla Cero)

Para garantizar que el agente local de la tienda extraiga **todo el historial limpio** desde el sistema de caja (Stellar POS / VAD10) y no utilice marcas de tiempo anteriores:

1. Abrir en el servidor de la tienda la aplicación oficial:
   👉 **`Morpheus - Panel de Control`** (`MorpheusConfigurador.exe`).
2. Ir a la pestaña **`1. Puesta a Punto (Fases 2 y 3)`**.
3. En la sección superior **`FASE 2: Resetear Estado Local (Semilla Cero)`**, hacer clic en:
   ```
   [ Limpiar / Resetear Estado Local ]
   ```
4. **Resultado:** El sistema crea automáticamente un respaldo de seguridad en la subcarpeta `\backup` y elimina los archivos `sync_state.json` y `morpheus_local.db`. El estado local queda en fecha base (`2000-01-01`).

---

## 📦 Fase 4: Siembra Ordenada de Catálogos (Extracción Inicial)

En la misma pestaña **`1. Puesta a Punto`** de `MorpheusConfigurador.exe`, presionar los botones de la **FASE 3** en el siguiente **orden estricto**:

```
┌────────────────────────────────────────────────────────────────────────┐
│  1. [ 0. Sincronizar Categorías (Árbol) ]                              │
│     -> Extrae departamentos, grupos y subgrupos del POS.               │
├────────────────────────────────────────────────────────────────────────┤
│  2. [ 1. Sincronizar Proveedores ]                                     │
│     -> Extrae el catálogo de proveedores y RIFs.                       │
├────────────────────────────────────────────────────────────────────────┤
│  3. [ 2. Sincronizar Productos & Variantes ]                           │
│     -> Extrae los artículos, descripciones y SKUs maestros.            │
├────────────────────────────────────────────────────────────────────────┤
│  4. [ 3. Sincronizar Códigos de Barra ]                                │
│     -> Extrae códigos de barra de empaque y unidades de venta.         │
├────────────────────────────────────────────────────────────────────────┤
│  5. [ 4. Sincronizar Costos & Cruces ]                                 │
│     -> Vincula códigos proveedor y costos de compra referenciales.     │
├────────────────────────────────────────────────────────────────────────┤
│  6. 5. Inventario Inicial (Baseline):                                  │
│     -> Seleccionar: "Al momento actual (Hoy)"                          │
│     -> Presionar: [ Sincronizar Inventario Inicial (Baseline) ]        │
└────────────────────────────────────────────────────────────────────────┘
```

> **Nota Operativa:** Durante la sincronización de cada botón se abrirá una consola visual que reportará el lote actual, cantidad de registros procesados y el código `HTTP 200 OK` de confirmación del servidor central.

---

## 🏭 Fase 5: Creación de Almacenes y Mapeo WMS

Una vez que el catálogo y el inventario inicial están en la nube, se configuran los almacenes de la tienda:

1. **Crear Almacenes en Neo WMS:**
   - Ingresar a **Neo WMS** > **Mapa de Almacén / Ubicaciones**.
   - Para la sucursal (ej. *Cumboto*), crear los almacenes requeridos:
     - **Piso de Venta / Principal:** Código `CUM-PISO`, Uso `INTERNAL`.
     - **Almacén de Muelle / Recepción:** Código `CUM-DOC`, Uso `INTERNAL`.
     - **Almacén de Cambios / Mermas:** Código `CUM-CAMBIOS`, Uso `INTERNAL`.
2. **Mapeo de Depósitos de Tienda (`store-deposit-mapping`):**
   - En **Neo Core** > **Sincronización de Tiendas** > **Mapeo de Depósitos**, asociar el código del depósito de Stellar (ej. `01`) al almacén correspondiente de Neo ERP (`CUM-PISO`).

---

## ⚡ Fase 6: Arranque del Servicio Continuo de Ventas (Daemon en Tienda)

Con la base de datos inicializada y los almacenes listos, se activa la transmisión desatendida en tiempo real:

1. En `MorpheusConfigurador.exe`, ir a la pestaña **`3. Servicio en Fondo`**.
2. Hacer clic en **`[ Iniciar Servicio de Windows ]`**.
3. El indicador superior cambiará a:
   ```
   [ 🟢 EJECUTANDOSE (Automatico) ]
   ```
4. El servicio `NeoAgentSync`:
   - Emitirá un **latido (heartbeat)** cada 60 segundos hacia la nube con el estado del enlace y de SQL Server.
   - Transmitirá automáticamente las **ventas de tickets fiscales** cada 5 a 10 minutos.

---

## 🤖 Fase 7: Validación de Integridad y Supervisión con Agentes de IA

Una vez en marcha, los Supervisores de TI y Operaciones pueden verificar la salud de la tienda sin ingresar a la base de datos:

### 1. Diagnóstico Inmediato con Dante TI (Telegram)
- Abrir el chat con **`@dante_neo_erp_bot`**.
- Enviar el comando:
  ```text
  /estado
  ```
- **Respuesta esperada:**
  ```text
  📡 Diagnóstico de Conectividad y Latidos (Neo WMS / POS):
  🟢 10 - CUMBOTO: En línea (0 min) | SQL Server: Conectado v2.1.0-neo
  ```
- Verificar la cuadratura de ventas:
  ```text
  /cuadratura
  ```

### 2. Consultas de Almacén con Arturo WMS (WhatsApp)
- Consultar existencia por WhatsApp:
  ```text
  "Arturo, ¿cuál es el stock actual de Harina PAN en Cumboto?"
  ```
- Arturo responderá con las existencias netas registradas en la siembra inicial (Baseline).

---

## 🛡️ Protocolo de Contingencia / Rollback

En caso de cualquier eventualidad durante la siembra o si se requiere restaurar el estado previo:
```bash
# En el servidor central (PostgreSQL):
psql -h localhost -U morpheus_admin -d morpheus_db -f /home/lzambrano/backup_morpheus_db_before_golive_<TIMESTAMP>.sql

# Reiniciar servicios API:
pm2 restart neo-api hub-core
```
