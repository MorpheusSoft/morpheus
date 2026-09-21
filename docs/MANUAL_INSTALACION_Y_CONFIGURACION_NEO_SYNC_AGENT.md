# 🚀 Manual Oficial de Instalación y Configuración: Neo Sync Agent (Agente de Tiendas)

**Sistema Central:** Neo ERP  
**Módulo:** Neo Core / Sincronización de Sucursales  
**Agente Local:** Neo Sync Agent (`MorpheusSyncAgent`)  
**Configurador Visual:** `MorpheusConfigurador.exe`  
**Servicio de Windows:** `NeoAgentSync`  
**Versión Actual:** `2.2.0-neo`  

---

## 📌 Introducción y Propósito

**Neo Sync Agent** es el agente local de integración que comunica las tiendas físicas que operan bajo **Stellar POS (base de datos SQL Server VAD10/VAD20)** con la nube central de **Neo ERP**.

El agente se encarga de:
1. **Sincronización continua de ventas (POS):** Transmite tickets, facturas y notas de crédito hacia Neo ERP en tiempo real o cada 10 minutos sin necesidad de abrir puertos de entrada en el router de la tienda.
2. **Descarga de inventario en Kardex:** Asocia los depósitos de venta con los almacenes correspondientes en Neo WMS.
3. **Migración y Puesta a Punto:** Sube catálogo de maestros (productos, códigos de barra, proveedores, costos) e inventario inicial (Baseline).
4. **Telemetría y Heartbeat con Dante:** Reporta estado de conexión, lag en minutos, facturas emitidas y responde a órdenes remotas desde la consola web de Neo Core.

---

## 📋 Requisitos Previos en la Tienda

* **Sistema Operativo:** Windows 10, Windows 11 o Windows Server (64 bits).
* **Acceso a SQL Server Local:** Motor donde se encuentra la base de datos de Stellar POS (`VAD10` o `VAD20`).
* **Permisos:** Usuario con privilegios de **Administrador de Windows**.
* **Conexión a Internet:** Salida HTTPS hacia `https://api.qa.morpheussoft.net` (puerto 443 saliente).
* **Dependencias:** **NO** requiere instalar .NET SDK ni paquetes externos (el agente y configurador son 100% autónomos y auto-contenidos).

---

## ⚡ Métodos de Instalación

Puedes realizar la instalación mediante cualquiera de los dos métodos descritos a continuación:

```
                  ┌──────────────────────────────────────────────┐
                  │          ¿Cómo deseas instalarlo?            │
                  └──────────────────────┬───────────────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 ▼                                               ▼
     【 MÉTODO 1: COMANDO RÁPIDO 】                 【 MÉTODO 2: DESCARGA ZIP 】
  PowerShell como Administrador (1 línea)        Descarga directa desde el navegador
  Descarga, extrae, registra servicio e         Para personal sin acceso a terminal
  inicia el Configurador automáticamente        Extracción manual en C:\MorpheusSyncAgent
```

---

### 🔹 Método 1: Instalación Rápida por PowerShell (Recomendado)

Este método es el más rápido, seguro y automatizado. En una sola línea descarga la última versión oficial, preserva configuraciones previas (si existían), registra el servicio de Windows y abre el Configurador Visual.

1. En la máquina de la tienda, presiona la tecla `Windows` y busca **PowerShell**.
2. Haz clic derecho y selecciona **"Ejecutar como Administrador"**.
3. Pega y ejecuta el siguiente comando oficial:

```powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://api.qa.morpheussoft.net/static/instalar.ps1 | iex
```

> **¿Por qué se incluye `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;`?**  
> En muchas versiones de Windows (Windows 10 / Windows Server), PowerShell utiliza por defecto TLS 1.0/1.1 que son rechazados por servidores modernos. Este prefijo fuerza el protocolo seguro **TLS 1.2**, garantizando que la descarga funcione a la primera sin errores de conexión SSL/TLS.

4. **Resultado automático del script:**
   * Detiene procesos previos en ejecución si existían.
   * Descarga el paquete actualizado desde `https://api.qa.morpheussoft.net/static/MorpheusSyncAgent_Installer.zip`.
   * Si ya existía un archivo `appsettings.json`, realiza un respaldo temporal y lo restaura para **no perder las claves ni la sede configurada**.
   * Extrae los archivos en la ruta estándar: `C:\MorpheusSyncAgent`.
   * Registra y arranca el servicio Windows `NeoAgentSync` (con nombre para mostrar `NEO Agent Sync` y descripción `Integrador con Stellar`).
   * Abre en pantalla la aplicación gráfica **`MorpheusConfigurador.exe`**.

---

### 🔹 Método 2: Instalación Manual mediante Descarga de Paquete ZIP

Si prefieres no usar la consola de comandos, puedes instalarlo de forma visual:

1. Abre el navegador web en la máquina de la tienda y descarga el instalador:  
   👉 **[https://api.qa.morpheussoft.net/static/MorpheusSyncAgent_Installer.zip](https://api.qa.morpheussoft.net/static/MorpheusSyncAgent_Installer.zip)**
2. Haz clic derecho sobre el archivo descargado `MorpheusSyncAgent_Installer.zip` y selecciona **"Extraer todo..."**.
3. Define como ruta de destino exactamente:
   ```text
   C:\MorpheusSyncAgent
   ```
4. Ingresa a la carpeta `C:\MorpheusSyncAgent` y ejecuta como Administrador:
   ```text
   MorpheusConfigurador.exe
   ```

---

## 🖥️ Guía de Configuración Paso a Paso (Configurador Visual)

Al abrir **`MorpheusConfigurador.exe`**, verás el panel de control con 5 pestañas de navegación:

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🚀 Neo Sync Agent - Panel de Control & Sincronización                    [🟢 EN EJECUCIÓN] │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ [1. Puesta a Punto] [2. Mapeo Depósitos] [3. Sincronizar a Voluntad] [4. Servicio] [5. Tienda]│
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

Sigue este orden secuencial para dejar la tienda 100% operativa:

---

### 📍 Paso 1: Pestaña 5 — "Conexiones & Tienda" (Enlace con SQL Server y Neo ERP)

1. Haz clic en la pestaña **`5. Conexiones & Tienda`**.
2. Completa los datos de conexión a la base de datos de Stellar POS:
   * **Servidor SQL Server:** Nombre de la máquina o instancia (ej: `localhost`, `.\SQLEXPRESS`, `192.168.1.50`).
   * **Base de Datos:** Nombre de la base de datos de Stellar (ej: `VAD10` o `VAD20`).
   * **Usuario SQL:** Usuario del motor (ej: `sa`).
   * **Contraseña SQL:** Contraseña del motor.
3. Presiona el botón:
   ```text
   [ 🔍 Probar Conexión SQL ]
   ```
   * Si es exitosa, se mostrará un mensaje en verde confirmando la lectura de `MA_PRODUCTOS`, `MA_TRANSACCION` y `MA_DEPOSITO`.
4. **Asignación de Sucursal en Neo ERP:**
   * En la sección "Conexión con Neo ERP (Nube)", verifica que la URL sea `https://api.qa.morpheussoft.net`.
   * En la lista desplegable **Sucursal / Tienda**, selecciona la sede correspondiente a esta instalación física (ej: `10 - CATANIA TUCACAS`).
5. Presiona:
   ```text
   [ 💾 Guardar Configuración ]
   ```

---

### 📍 Paso 2: Pestaña 2 — "Mapeo de Depósitos" (Stellar POS ➔ Neo ERP WMS)

Este paso garantiza que cada venta registrada en Stellar POS descargue stock del almacén correcto en Neo ERP, o sea omitida si se trata de un depósito que no maneja inventario central.

1. Ve a la pestaña **`2. Mapeo de Depósitos`**.
2. Presiona:
   ```text
   [ 🔍 1. Detectar Depósitos (Stellar) ]
   ```
   * El sistema consultará la tabla `MA_DEPOSITO` y listará todos los depósitos locales encontrados (ej: `1001 Piso de Venta`, `1002 Avería`, `1003 Merma`).
3. Presiona:
   ```text
   [ ☁ 2. Consultar Neo ERP ]
   ```
   * El agente descargará los almacenes y ubicaciones WMS creados en Neo ERP para esta sucursal.
4. **Configurar la Grilla de Mapeo:**
   * **Columna `¿Sincronizar?`:**
     * **Marcada `[x]`:** El depósito será sincronizado activamente con Neo ERP.
     * **Desmarcada `[ ]`:** El depósito será tratado como **Omitido** (ignorado en inventarios y ventas, sin afectar stock).
   * **Almacén y Ubicación Neo ERP:** Selecciona a qué Almacén y Ubicación de Neo ERP corresponde cada depósito marcado (ej: *Almacén Principal Tucacas* ➔ *Stock Principal*).
   * **Columna `¿Afecta Kardex?`:**
     * **Marcada `[x]`:** Cada venta genera un movimiento de salida de inventario (`StockMove`) en el Kardex de Neo ERP.
     * **Desmarcada `[ ]`:** Registra la venta solo a nivel financiero/documental sin alterar existencias físicas.
5. Presiona:
   ```text
   [ 💾 3. Guardar en Neo ERP ]
   ```
   * Los depósitos quedarán registrados y confirmados tanto en la nube como en el configurador local.

---

### 📍 Paso 3: Pestaña 1 — "Puesta a Punto (Maestros & Baseline)"

> [!TIP]
> Si la tienda ya tiene el catálogo migrado en Neo ERP y solo necesitas sincronizar ventas, puedes omitir este paso o ejecutar solo los que requieras actualizar.

1. Ve a la pestaña **`1. Puesta a Punto`**.
2. *(Opcional)* Si vas a iniciar una sincronización desde cero, presiona **`[ Limpiar / Resetear Estado Local ]`**. Esto creará un respaldo de seguridad en la carpeta `backup` y reiniciará los punteros de sincronización.
3. Ejecuta los maestros en el siguiente orden recomendado:
   1. **`[ 1. Sincronizar Proveedores ]`**: Exporta proveedores de compra desde Stellar hacia Neo Compras.
   2. **`[ 2. Sincronizar Productos & Variantes ]`**: Crea o actualiza el maestro de artículos, SKU y descripciones en Neo Inventario.
   3. **`[ 3. Sincronizar Códigos de Barra ]`**: Vincula códigos de barra de unidades, empaques y bultos.
   4. **`[ 4. Sincronizar Costos & Cruces ]`**: Asocia los costos del proveedor con cada producto.
   5. **`5. Inventario Inicial (Baseline)`**:
      * Selecciona **"Al momento actual (Hoy)"** para cargar el stock disponible en este instante.
      * O selecciona **"A fecha específica de corte"** e indica la fecha requerida (ej: `2026-06-07`).
      * Haz clic en **`[ Sincronizar Inventario Inicial (Baseline) ]`**. El sistema solo tomará los depósitos que tengan la casilla `¿Sincronizar?` activa.

---

### 📍 Paso 4: Pestaña 3 — "Sincronizar a Voluntad (Ventas & Históricos)"

Si deseas cargar de inmediato un bloque de ventas pasadas para alimentar los reportes y el módulo de compras sugeridas (MRP):

1. Ve a la pestaña **`3. Sincronizar a Voluntad`**.
2. Selecciona el período deseado:
   * `( ) Últimos 30 días`
   * `(•) Últimos 3 meses (Recomendado para puesta en marcha)`
   * `( ) Últimos 6 meses`
   * `( ) Todo el Historial Completo`
   * `( ) Rango personalizado (Fecha Desde: AAAA-MM-DD)`
3. Presiona:
   ```text
   [ Sincronizar Ventas Ahora ]
   ```
4. Se abrirá una ventana de progreso detallando la cantidad de documentos procesados y transmitidos.

---

### 📍 Paso 5: Pestaña 4 — "Servicio en Fondo (NeoAgentSync)"

Para que la tienda transmita ventas automáticamente sin que ningún usuario tenga que intervenir:

1. Ve a la pestaña **`4. Servicio en Fondo`**.
2. Verifica el estado en la esquina superior derecha:
   * Si indica **`🔴 DETENIDO`**:
     * Presiona **`[ Instalar Servicio de Windows ]`** (si no se instaló automáticamente por el comando).
     * Presiona **`[ Iniciar Servicio ]`**.
   * El indicador cambiará a **`🟢 EN EJECUCIÓN`**.
3. Presiona **`[ Crear Acceso Directo en el Escritorio ]`** para que el personal de tienda tenga acceso directo al panel cuando lo necesite.
4. A partir de este momento, el servicio Windows **`NeoAgentSync`** se ejecutará de forma permanente, arrancará solo cada vez que se encienda o reinicie la computadora y sincronizará ventas cada 10 minutos.

---

## 🌐 Monitoreo y Control Remoto desde la Web (Neo Core)

No es necesario conectarse por AnyDesk o TeamViewer a la máquina de la tienda para verificar su funcionamiento. Puedes supervisarla y controlarla desde el navegador:

1. Ingresa a la plataforma central: **`https://qa.morpheussoft.net`** (o dominio oficial).
2. Ve al módulo **Neo Core** ➔ Menú **Sincronización de Tiendas** (`/dashboard/store-sync`).
3. Selecciona la sucursal instalada (ej: *Catania Tucacas*):
   * **Tarjeta de Telemetría:**
     * **Estado:** `ONLINE` (verde)
     * **Versión del Agente:** `v2.2.0-neo`
     * **Lag de Sincronización:** `0 min`
     * **Ventas de Hoy:** Cantidad de facturas emitidas y monto total en USD.
     * **Estado de SQL Server:** `CONECTADO`
   * **Botonera de Control Remoto:**
     * **⚡ Forzar Sincronización de Ventas:** Despierta al agente en tienda para que procese de inmediato los tickets pendientes.
     * **📦 Sincronizar Catálogo Maestro:** Ordena a la tienda refrescar artículos y códigos de barra.
     * **📅 Carga Histórica Parametrizada:** Permite enviar una orden remota con fechas personalizadas para reprocesar ventas.
     * **🔄 Reiniciar Servicio:** Reinicia el servicio Windows `NeoAgentSync` en sitio.
     * **🚀 Actualizar Versión (OTA):** Despacha la orden de auto-actualización del software de tienda sin intervención humana.
   * **Pestaña Mapeo de Depósitos:**
     * Muestra la tabla de depósitos asociados.
     * Permite alternar con un solo clic el switch **`¿Sincronizar?`** entre `[✓] Sí (Activo)` y `[⏸] Omitido`.
     * Permite modificar el Almacén y Ubicación de destino o eliminar mapeos con el botón papelera **`🗑`**.

---

## 📂 Estructura de Archivos en `C:\MorpheusSyncAgent`

| Archivo / Carpeta | Descripción |
| :--- | :--- |
| **`MorpheusConfigurador.exe`** | Aplicación Gráfica C# WinForms (Panel de Control y configurador de tienda). |
| **`MorpheusSyncAgent.exe`** | Binario ejecutable del servicio de sincronización en segundo plano. |
| **`Microsoft.Data.SqlClient.SNI.dll`** | Biblioteca de bajo nivel para comunicación segura con SQL Server. |
| **`e_sqlite3.dll`** | Motor SQLite local para almacenamiento de estado y colas de reintento. |
| **`appsettings.json`** | Archivo JSON con la configuración de la tienda, credenciales y endpoints. |
| **`Configurar_Agente.bat`** | Acceso directo de respaldo para abrir el configurador gráfico. |
| **`scripts/Iniciar_Servicio.bat`** | Utilitario para iniciar el servicio Windows por comando. |
| **`scripts/Detener_Servicio.bat`** | Utilitario para detener el servicio Windows por comando. |
| **`scripts/Desinstalar_Servicio.bat`** | Utilitario para remover el servicio de Windows si se cambia de equipo. |

---

## ❓ Preguntas Frecuentes y Solución de Problemas (Troubleshooting)

### 1. El script de PowerShell da error de "conexión subyacente cerrada" o "SSL/TLS"
* **Causa:** PowerShell 5.1 intentó usar TLS 1.0.
* **Solución:** Asegúrate de incluir el prefijo de seguridad:
  ```powershell
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://api.qa.morpheussoft.net/static/instalar.ps1 | iex
  ```

### 2. ¿Qué pasa si reinicio la computadora de la tienda?
* El servicio **`NeoAgentSync`** está configurado con tipo de inicio **Automático**. Se iniciará solo al arrancar Windows sin necesidad de que el cajero inicie sesión o abra ningún programa.

### 3. ¿El agente sobreescribe la configuración si ejecuto la instalación de nuevo?
* **No.** El script `instalar.ps1` detecta si ya existe `appsettings.json`, realiza un respaldo automático y restaura tus credenciales y sede seleccionada tras descomprimir la actualización.

### 4. ¿Cómo sé si las ventas están llegando a Neo ERP?
* Entra en la web de Neo Core (`/dashboard/store-sync`), selecciona tu sede y verifica que el indicador diga **`ONLINE`** y el campo **"Ventas de Hoy"** coincida con los tickets cobrados en caja.

---
*Manual verificado y actualizado para la versión 2.2.0-neo de Neo ERP.*
