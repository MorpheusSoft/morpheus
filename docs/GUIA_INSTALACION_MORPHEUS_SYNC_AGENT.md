# 🚀 Guía de Instalación y Operación: Morpheus Sync Agent

Este documento detalla el procedimiento oficial paso a paso para instalar, configurar y operar el agente de sincronización **Morpheus Sync Agent** en las computadoras y servidores de las tiendas físicas (entorno Windows).

---

## 📋 Requisitos Previos

* **Sistema Operativo:** Windows 10, Windows 11 o Windows Server (64 bits).
* **Base de Datos Local:** Acceso a la instancia de SQL Server donde opera el sistema de caja/tienda (**VAD10 / VAD20**).
* **Conectividad:** Conexión a Internet con salida HTTPS hacia `api.qa.morpheussoft.net` (puerto 443).
* **Permisos:** Cuenta de usuario con permisos de **Administrador** en Windows.
* **Componentes Externos:** **NO se requiere instalar .NET** ni ningún SDK adicional (el ejecutable es 100% auto-contenido).

---

## ⚡ Método 1: Instalación Rápida en 1 Línea (Recomendado)

En la máquina Windows de la tienda, abre **PowerShell como Administrador** (clic derecho sobre el menú Inicio ➔ *Terminal de Windows (Administrador)* o *Windows PowerShell (Administrador)*) y ejecuta:

```powershell
irm https://api.qa.morpheussoft.net/static/instalar.ps1 | iex
```

### ¿Qué hace automáticamente este instalador?
1. Descarga el paquete oficial más reciente desde la nube.
2. Descomprime los archivos en `C:\MorpheusSyncAgent`.
3. **Registra el Servicio de Windows** con inicio automático, pero lo deja en estado **DETENIDO** (para que puedas hacer tus validaciones y cargas previas sin interferencias).
4. Crea el acceso directo en el Escritorio: **`Morpheus - Configurar Agente`**.
5. Abre automáticamente la **Interfaz Visual de Control**.

---

## 📁 Método 2: Instalación Manual por ZIP

Si prefieres realizar el proceso manualmente mediante el Explorador de Archivos:

1. Descarga el archivo comprimido desde el navegador:
   🔗 [https://api.qa.morpheussoft.net/static/MorpheusSyncAgent_Installer.zip](https://api.qa.morpheussoft.net/static/MorpheusSyncAgent_Installer.zip)
2. Extrae el contenido en la ruta raíz recomendada:
   ```
   C:\MorpheusSyncAgent
   ```
3. Haz clic derecho sobre el archivo **`Instalar_Servicio.bat`** y selecciona **"Ejecutar como administrador"**.
4. Se creará el acceso directo en el Escritorio y el servicio quedará registrado.

---

## 🖥️ Uso del Panel de Control Visual (`Configurar_Agente.bat`)

Puedes abrir el panel en cualquier momento haciendo doble clic en el acceso directo del Escritorio **"Morpheus - Configurar Agente"** o ejecutando `C:\MorpheusSyncAgent\Configurar_Agente.bat`.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ⚡ Morpheus Sync Agent - Panel de Control & Configuración    [🔴 DETENIDO]  │
├──────────────────────────────────────────────────────────────────────────────┤
│  [ Pestaña 1: Fases 2 y 3 ] [ Pestaña 2: Ventas ] [ Pestaña 3: Servicio ]   │
│  [ Pestaña 4: Conexiones & Diagnóstico ]                                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

### 📍 Paso 1: Validar Conexiones (Pestaña "Conexiones & Diagnóstico")

Antes de transmitir datos, comprueba la comunicación:

1. Ve a la pestaña **🔧 Conexiones & Diagnóstico**.
2. Verifica los parámetros de SQL Server local:
   * **Servidor / Instancia:** `AGUERREVERE\SRVAGUERREVERE` (o la instancia local correspondiente).
   * **Base de Datos:** `VAD10`
   * **Usuario:** `jqFydZPO` (o usuario con lectura a VAD10 y VAD20)
   * **Contraseña:** `+121f4T$19`
3. Presiona **`🔍 Probar Conexión SQL`**. Debe responder:  
   `✅ Conexión Exitosa con SQL Server`.
4. Revisa la URL Base de la API: `https://api.qa.morpheussoft.net`.
5. Presiona **`🌐 Probar Conexión Nube`**. Debe responder:  
   `✅ Conexión Exitosa con Nube Morpheus`.
6. Si hiciste cambios, presiona **`💾 Guardar Configuración`**.

---

### 📍 Paso 2: Resetear el Estado Local (Pestaña "Puesta a Punto" - FASE 2)

Para garantizar que la extracción no use marcas de tiempo obsoletas:

1. Ve a la pestaña **🚀 Puesta a Punto (Fases 2 y 3)**.
2. En la sección superior (Fase 2), presiona:
   ```
   [ 🧹 Resetear Estado Local Ahora ]
   ```
3. Confirma el mensaje. El sistema:
   * Creará automáticamente una copia de respaldo en `C:\MorpheusSyncAgent\backup\`.
   * Eliminará `sync_state.json` y `morpheus_local.db`.
   * Dejará el estado listo para arrancar en cero absoluto.

---

### 📍 Paso 3: Carga de Maestros Inicial (Pestaña "Puesta a Punto" - FASE 3)

Ejecuta los extractores en **orden estricto** haciendo clic en los botones correspondientes:

1. **`[ 1️⃣ Sincronizar Proveedores ]`**  
   *Extrae el directorio de proveedores de compras.*
2. **`[ 2️⃣ Sincronizar Productos & Variantes ]`**  
   *Extrae el catálogo general de artículos, descripciones y precios base.*
3. **`[ 3️⃣ Sincronizar Códigos de Barra ]`**  
   *Extrae códigos de barra alternativos y multipack.*
4. **`[ 4️⃣ Sincronizar Costos & Cruces ]`**  
   *Extrae costos por proveedor y empaques.*
5. **`5️⃣ Inventario Inicial (Baseline):`**  
   * Selecciona **"Al momento actual (Hoy)"** si deseas registrar el stock vivo a la fecha de hoy.
   * O selecciona **"A fecha específica de corte"** e indica la fecha deseada (ej. `2026-06-07`).
   * Presiona **`[ 🚀 Sincronizar Inventario Inicial (Baseline) ]`**.

> **Nota:** Cada botón abre una ventana de consola visible para que puedas observar en tiempo real la cantidad de registros procesados y los tiempos de respuesta.

---

### 📍 Paso 4: Carga de Ventas Históricas (Pestaña "Sincronizar a Voluntad")

Si deseas enviar un bloque específico de ventas pasadas para alimentar el motor de reabastecimiento (MRP):

1. Ve a la pestaña **🛒 Sincronizar a Voluntad (Parámetros)**.
2. En la sección de ventas, selecciona el rango deseado:
   * `( ) Últimos 30 días`
   * `(•) Últimos 3 meses (Recomendado para UAT)`
   * `( ) Últimos 6 meses`
   * `( ) Todo el historial disponible`
   * `( ) Desde fecha personalizada: [ AAAA-MM-DD ]`
3. Presiona **`[ ▶️ Sincronizar Ventas Ahora ]`**.
4. La ventana de consola procesará las ventas hora por hora hasta llegar al presente.

---

### 📍 Paso 5: Activar el Servicio Continuo en Segundo Plano

Una vez cargada toda la semilla:

1. Ve a la pestaña **⚙️ Servicio Continuo (Background)**.
2. En la lista de extractores, confirma que solo esté marcado lo que deseas que corra automáticamente (por defecto: ☑️ **Ventas continuas** cada 10 minutos).
3. Presiona el botón verde:
   ```
   [ ▶️ Iniciar Servicio ]
   ```
4. El indicador superior cambiará a **`EN EJECUCIÓN 🟢`**.

A partir de este momento, el agente operará de forma transparente y se reiniciará automáticamente cada vez que se encienda o reinicie la computadora de la tienda.

---

## 🛠️ Scripts Auxiliares de Consola (`.bat`)

Para tareas rápidas sin abrir la interfaz gráfica, la carpeta `C:\MorpheusSyncAgent` cuenta con:

| Archivo `.bat` | Función |
| :--- | :--- |
| `Configurar_Agente.bat` | Abre el Panel de Control Visual (solicita permisos de Administrador automáticamente). |
| `1_Carga_Inicial_Maestros.bat` | Ejecuta de corrido la secuencia de los 5 extractores semilla. |
| `2_Iniciar_Servicio.bat` | Inicia el servicio de Windows en segundo plano. |
| `3_Detener_Servicio.bat` | Detiene el servicio de Windows. |
| `4_Probar_En_Consola.bat` | Ejecuta el agente en primer plano para ver todos los logs en vivo. |
| `5_Desinstalar_Servicio.bat` | Detiene y elimina el servicio de Windows de forma segura. |

---

## ❓ Preguntas Frecuentes y Solución de Problemas

### 1. El botón de prueba SQL indica "Error al conectar"
* Verifica que el servicio de **SQL Server (MSSQLSERVER o SQLEXPRESS)** esté iniciado en Windows (`services.msc`).
* Asegúrate de que el protocolo **TCP/IP** esté habilitado en el *SQL Server Configuration Manager*.
* Confirma que el usuario y la contraseña tengan acceso de lectura a las bases de datos `VAD10` y `VAD20`.

### 2. El botón de prueba Nube indica "Error de conexión"
* Comprueba que la computadora tenga salida a Internet.
* Abre el navegador en la tienda e ingresa a: `https://api.qa.morpheussoft.net/docs`. Si abre la página de documentación, la red está en orden.

### 3. ¿Cómo saber cuándo fue la última sincronización?
En la pestaña **🚀 Puesta a Punto**, consulta la tarjeta **📊 Marcas de Agua Actuales** y presiona **`🔄 Refrescar`**. Te mostrará la fecha y hora exacta registrada en `sync_state.json` para cada elemento.
