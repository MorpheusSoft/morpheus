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

2. Descomprime el archivo `.zip` en cualquier carpeta (ej. en *Descargas* o en el *Escritorio*).

3. Haz doble clic sobre el archivo:  
   👉 **`1_Instalar_Morpheus_Tienda.vbs`** *(o `1_Instalar_Morpheus_Tienda.bat`)*

4. **Se abrirá inmediatamente el Asistente Gráfico de Instalación:**
   ```
   ┌────────────────────────────────────────────────────────────────────────┐
   │  Morpheus Sync Agent - Asistente de Instalacion en Tiendas             │
   ├────────────────────────────────────────────────────────────────────────┤
   │  PASO 1: SELECCION DE SUCURSAL / TIENDA                                │
   │  Tienda a Instalar: [ 01 - PATIO TRIGAL (CAT-11)                   ▼ ] │
   │                                                                        │
   │  PASO 2: CONEXION AL SISTEMA POS LOCAL (SQL SERVER)                    │
   │  Servidor SQL:   [ AGUERREVERE\SRVAGUERREVERE                        ] │
   │  Base de Datos:  [ VAD10                                             ] │
   │  [ Probar Conexion SQL ] -> [OK] Conexion exitosa con SQL Server       │
   │                                                                        │
   │  PASO 3: OPCIONES DE INSTALACION                                       │
   │  [X] Registrar Servicio de Windows (Permanecera DETENIDO)              │
   │  [X] Crear acceso directo en el Escritorio (Morpheus - Panel Control)  │
   │                                                                        │
   │  [ INSTALAR EN ESTA TIENDA ]                                           │
   └────────────────────────────────────────────────────────────────────────┘
   ```

5. **Pasos dentro del Asistente:**
   * **Paso 1:** Selecciona tu tienda de la lista desplegable (ej. *01 - Patio Trigal*, *10 - Cumboto*, etc.).
   * **Paso 2:** Haz clic en **`[ Probar Conexion SQL ]`** para verificar que hay enlace con la base de datos de caja.
   * **Paso 3:** Haz clic en el botón verde grande:  
     👉 **`[ INSTALAR EN ESTA TIENDA ]`**.

6. El asistente configurará automáticamente `C:\MorpheusSyncAgent`, registrará el servicio de Windows (en estado DETENIDO para evitar transmisiones antes de tiempo), creará el icono oficial en el Escritorio y **abrirá de inmediato el Panel de Control**.

---

## ⚡ Método 2: Instalación por Comando Rápido (Para Soporte / TI)

Si prefieres realizar la instalación en un solo paso mediante PowerShell como Administrador:

```powershell
irm https://api.qa.morpheussoft.net/static/instalar.ps1 | iex
```

Este comando descargará el paquete, lo ubicará en `C:\MorpheusSyncAgent` y **abrirá de inmediato el Asistente Gráfico de Instalación** para seleccionar la tienda.

---

## 🖥️ Uso del Panel de Control Visual ("Morpheus - Panel de Control")

Una vez instalado, el personal de tienda puede abrir el panel en cualquier momento desde el acceso directo del **Escritorio**:  
👉 **`Morpheus - Panel de Control`** *(o ejecutando `Configurar_Agente.vbs`)*.

> **Cero Ventanas Negras:** Al abrirlo desde el acceso directo o el archivo `.vbs`, la aplicación se ejecuta como interfaz gráfica limpia, sin consolas cmd abiertas ni pantallas intermedias.

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
| **`1_Instalar_Morpheus_Tienda.vbs`** | **Asistente Gráfico de Instalación** (Ejecución limpia sin consola negra). |
| **`Configurar_Agente.vbs`** | **Panel de Control y Sincronización** (Ejecución limpia sin consola negra). |
| **`MorpheusConfigurador.exe`** | Ejecutable nativo generado durante la instalación para acceso directo. |
| **`MorpheusSyncAgent.exe`** | Binario motor de sincronización con SQL Server y la Nube Morpheus. |
| **`appsettings.json`** | Archivo de configuración con ID de tienda y conexiones. |
| **`scripts/`** | Carpeta con herramientas técnicas de mantenimiento (`Iniciar_Servicio.bat`, `Detener_Servicio.bat`, `Desinstalar_Servicio.bat`). |

---

## ❓ Preguntas Frecuentes

### ¿Qué tienda debo seleccionar en el instalador?
Selecciona el nombre de la sucursal donde estás físicamente instalando (ej. *01 - PATIO TRIGAL*). Esto asegura que todo el inventario y las ventas de esa caja se asignen a su sucursal correspondiente en el ERP central.

### ¿Puedo probar la conexión a la base de datos antes de instalar?
Sí, en el Asistente de Instalación presiona **`[ Probar Conexion SQL ]`**. Si los datos son correctos verás un mensaje verde de confirmación `[OK] Conexion exitosa`.
