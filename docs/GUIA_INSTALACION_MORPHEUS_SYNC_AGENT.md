# 🚀 Guía de Instalación y Operación: Morpheus Sync Agent (Tiendas)

Este documento detalla el procedimiento oficial y simplificado para instalar, configurar y operar el agente de sincronización **Morpheus Sync Agent** en las computadoras y servidores de las 15 tiendas físicas (entorno Windows).

Diseñado específicamente para que el **personal de tienda y supervisores** puedan realizar la instalación y puesta en marcha en 2 clics, mediante un **Asistente Visual Gráfico**, sin necesidad de conocimientos técnicos avanzados ni comandos de consola.

---

## 📋 Requisitos Previos

* **Sistema Operativo:** Windows 10, Windows 11 o Windows Server (64 bits).
* **Base de Datos Local:** Acceso a la instancia de SQL Server donde opera el sistema de caja/tienda (**VAD10 / VAD20**).
* **Conectividad:** Conexión a Internet con salida HTTPS hacia `https://api.qa.morpheussoft.net` (puerto 443).
* **Permisos:** Cuenta de usuario con permisos de **Administrador** en Windows.
* **Componentes Externos:** **NO se requiere instalar .NET** ni SDK adicional (el binario es 100% auto-contenido).

---

## ⚡ Método 1: Instalación Visual mediante Descarga (Para Personal de Tienda)

1. En la máquina de la tienda, descarga el paquete oficial desde el navegador:  
   👉 **[https://api.qa.morpheussoft.net/static/MorpheusSyncAgent_Installer.zip](https://api.qa.morpheussoft.net/static/MorpheusSyncAgent_Installer.zip)**

2. Descomprime el archivo `.zip` en cualquier carpeta (o se extrae automáticamente en `C:\MorpheusSyncAgent`).

3. Haz doble clic directamente sobre el ejecutable oficial:  
   👉 **`MorpheusConfigurador.exe`**

4. **Se abrirá inmediatamente la Aplicación Nativa en C#:**
   ```
   ┌──────────────────────────────────────────────────────────────────────────────┐
   │  M Morpheus Sync Agent - Panel de Control & Sincronizacion   [🔴 DETENIDO]   │
   ├──────────────────────────────────────────────────────────────────────────────┤
   │  [ 1. Puesta a Punto ] [ 2. Sincronizar a Voluntad ] [ 3. Servicio en Fondo ]│
   │  [ 4. Conexiones y Tienda ]                                                  │
   └──────────────────────────────────────────────────────────────────────────────┘
   ```

5. **Pasos dentro de la aplicación para configurar la tienda:**
   * **Paso 1 (Pestaña 4 - Conexiones y Tienda):** Selecciona tu tienda de la lista desplegable (ej. *01 - Patio Trigal*, *10 - Cumboto*, etc.) y haz clic en **`[ Probar Conexion SQL ]`** para verificar enlace con la base de datos local. Haz clic en **`[ Guardar Configuracion ]`**.
   * **Paso 2 (Pestaña 3 - Servicio en Fondo):** Haz clic en **`[ Instalar Servicio de Windows ]`** (se registra en estado DETENIDO) y en **`[ Crear Acceso Directo en el Escritorio ]`**.
   * **Paso 3 (Pestaña 1 - Puesta a Punto):** Ejecuta la siembra ordenada de datos.

---

## ⚡ Método 2: Instalación por Comando Rápido (Para Soporte / TI)

Si prefieres realizar la descarga e inicio en un solo comando mediante PowerShell como Administrador:

```powershell
irm https://api.qa.morpheussoft.net/static/instalar.ps1 | iex
```

Este comando descargará el paquete oficial, lo extraerá en `C:\MorpheusSyncAgent` y **abrirá de inmediato `MorpheusConfigurador.exe`**.

---

## 🖥️ Uso del Panel de Control Visual ("Morpheus - Panel de Control")

Una vez instalado, el personal de tienda puede abrir el panel en cualquier momento desde el acceso directo del **Escritorio**:  
👉 **`Morpheus - Panel de Control`** *(o ejecutando directamente `MorpheusConfigurador.exe`)*.

> **Aplicación Nativa C# WinForms:** 100% binario compilado de 64 bits. Sin intérpretes, sin scripts VBScript ni PowerShell, sin ventanas negras y libre de bloqueos de antivirus.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  M Morpheus Sync Agent - Panel de Control & Sincronizacion   [🔴 DETENIDO]   │
├──────────────────────────────────────────────────────────────────────────────┤
│  [ 1. Puesta a Punto ] [ 2. Sincronizar a Voluntad ] [ 3. Servicio en Fondo ]│
│  [ 4. Conexiones y Diagnostico ]                                             │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

### 📍 Paso 1: Puesta a Punto Inicial (Fases 2 y 3)

#### A. Limpieza de Estado Local (Fase 2)
1. Ve a la pestaña **1. Puesta a Punto (Fases 2 y 3)**.
2. En la sección superior, presiona:
   ```
   [ Limpiar / Resetear Estado Local ]
   ```
3. Confirma el mensaje. El sistema creará un respaldo de seguridad en `/backup` y dejará el estado listo para sembrar datos desde cero.

#### B. Carga de Maestros Inicial (Fase 3)
Presiona los botones en el orden indicado:
1. **`[ 1. Sincronizar Proveedores ]`** (Catálogo de proveedores de compra).
2. **`[ 2. Sincronizar Productos & Variantes ]`** (Catálogo de artículos, SKU y descripciones).
3. **`[ 3. Sincronizar Codigos de Barra ]`** (Barras de empaque y unidades).
4. **`[ 4. Sincronizar Costos & Cruces ]`** (Costos de compra de proveedores).
5. **`5. Inventario Inicial (Baseline):`**
   * Selecciona **"Al momento actual (Hoy)"** si deseas el inventario vivo.
   * O selecciona **"A fecha especifica de corte"** e indica la fecha deseada (ej. `2026-06-07`).
   * Presiona **`[ Sincronizar Inventario Inicial (Baseline) ]`**.

> **Monitoreo en vivo:** Cada botón abre una ventana visible donde podrás ver la cantidad de registros transmitidos con la barra de progreso.

---

### 📍 Paso 2: Sincronizar Ventas Históricas a Voluntad

Si deseas enviar un bloque de ventas del POS para alimentar las sugerencias de compra (MRP):

1. Ve a la pestaña **2. Sincronizar a Voluntad**.
2. Selecciona el rango deseado:
   * `( ) Ultimos 30 dias`
   * `(•) Ultimos 3 meses (Recomendado para UAT)`
   * `( ) Ultimos 6 meses`
   * `( ) Todo el Historial Completo`
   * `( ) Fecha personalizada (Desde: [ AAAA-MM-DD ])`
3. Presiona **`[ Sincronizar Ventas Ahora ]`**.

---

### 📍 Paso 3: Poner el Servicio en Marcha en Segundo Plano

Una vez culminada la carga inicial:

1. Ve a la pestaña **3. Servicio en Segundo Plano**.
2. Verifica qué datos sincronizará automáticamente el servicio (por defecto: ☑️ **Ventas** cada 10 min).
3. Presiona el botón:
   ```
   [ Iniciar Servicio ]
   ```
4. El indicador superior cambiará a **`EN EJECUCION [ACTIVO]`** con color verde.

A partir de este momento, las ventas se sincronizarán solas cada 10 minutos y el servicio se reiniciará automáticamente si se reinicia la máquina de la tienda.

---

## 🛠️ Estructura de Archivos en `C:\MorpheusSyncAgent`

| Archivo | Función |
| :--- | :--- |
| **`MorpheusConfigurador.exe`** | **Aplicación Nativa C# WinForms** (Panel de Control, configuración de tienda y ejecutor de siembra). |
| **`MorpheusSyncAgent.exe`** | Binario motor de sincronización en tiempo real con SQL Server y la Nube Morpheus. |
| **`Microsoft.Data.SqlClient.SNI.dll`** | Biblioteca de soporte nativo para conexiones cifradas a SQL Server. |
| **`appsettings.json`** | Archivo de configuración con ID de tienda y conexiones. |
| **`Configurar_Agente.bat`** | Lanzador de respaldo para iniciar `MorpheusConfigurador.exe`. |
| **`scripts/`** | Carpeta con utilitarios de servicio (`Iniciar_Servicio.bat`, `Detener_Servicio.bat`, `Desinstalar_Servicio.bat`). |

---

## ❓ Preguntas Frecuentes

### ¿Qué tienda debo seleccionar en el instalador?
Selecciona el nombre de la sucursal donde estás físicamente instalando (ej. *01 - PATIO TRIGAL*). Esto asegura que todo el inventario y las ventas de esa caja se asignen a su sucursal correspondiente en el ERP central.

### ¿Puedo probar la conexión a la base de datos antes de instalar?
Sí, en el Asistente de Instalación presiona **`[ Probar Conexion SQL ]`**. Si los datos son correctos verás un mensaje verde de confirmación `[OK] Conexion exitosa`.
