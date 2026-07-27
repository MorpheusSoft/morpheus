# Guía de Salida a Productivo: Limpieza de Base de Datos y Carga desde el Agente Local

Esta guía detalla los pasos requeridos para inicializar la base de datos central de Morpheus, realizar la carga inicial de datos maestros utilizando los extractores del agente local de la tienda (`MorpheusSyncAgent`) y configurar el flujo constante de sincronización exclusivo para ventas.

---

## Fase 1: Limpieza e Inicialización de la Base de Datos Central (Nube)
Antes de iniciar la transmisión de datos desde la tienda física, la base de datos en el servidor en la nube debe encontrarse limpia y sin transacciones de prueba previas.

### Ejecutar Limpieza Operativa (Soft Truncate)
Para conservar usuarios administrativos, monedas y configuraciones básicas, pero vaciar por completo las transacciones (ventas, compras, inventario, etc.):
1. Acceder al servidor central vía SSH.
2. Ejecutar el script de mantenimiento operativo:
   ```bash
   python3 ~/Morpheus/backend/truncate_qa_prep.py
   ```

---

## Fase 2: Reseteo del Estado del Agente Local (Tienda Física)
Para garantizar que el agente de sincronización extraiga **todo el historial completo** desde el POS y no use fechas de sincronización previas (marcas de agua):

1. **Detener el servicio del Agente:** 
   Asegurar que el daemon/servicio de `MorpheusSyncAgent` esté completamente apagado en la máquina de la tienda.
2. **Resetear marcas de sincronización (Correlativos):**
   Eliminar el archivo local `sync_state.json` en la carpeta del agente. Esto restablecerá todos los contadores de sincronización a la fecha base por defecto (`2000-01-01`).
3. **Limpiar cola transaccional temporal:**
   Eliminar el archivo SQLite `morpheus_local.db` en la misma carpeta del agente. Al arrancar nuevamente, el agente creará una base de datos de cola vacía y limpia.

---

## Fase 3: Carga Inicial de Datos Maestros (Semilla en Orden Lógico)
Ejecutar consecutivamente los siguientes comandos desde la carpeta del agente local en la tienda para migrar la base de datos real del POS a la nube:

1. **Migración de Proveedores:**
   ```bash
   dotnet run --project MorpheusInventoryAgent/MorpheusSyncAgent.csproj -- --run suppliers
   ```
2. **Migración del Maestro de Productos (Variantes):**
   ```bash
   dotnet run --project MorpheusInventoryAgent/MorpheusSyncAgent.csproj -- --run products
   ```
3. **Migración de Códigos de Barra Alternativos:**
   ```bash
   dotnet run --project MorpheusInventoryAgent/MorpheusSyncAgent.csproj -- --run barcodes
   ```
4. **Migración de Vínculos Proveedor-Producto (Costos y Cruces):**
   ```bash
   dotnet run --project MorpheusInventoryAgent/MorpheusSyncAgent.csproj -- --run supplier-products
   ```
5. **Establecimiento de Inventario de Partida (Baseline):**
   ```bash
   dotnet run --project MorpheusInventoryAgent/MorpheusSyncAgent.csproj -- --run baseline
   ```

---

## Fase 4: Configuración para la Sincronización Diaria de Ventas
Una vez que toda la base semilla esté en el servidor, configuramos el agente para que corra continuamente reportando **únicamente las ventas en tiempo real**, desactivando los extractores de catálogos:

1. Abrir el archivo `appsettings.json` en el agente de la tienda.
2. En la propiedad `DirectExtractors`, colocar en `false` todos los extractores excepto **Sales**:
   ```json
   {
     "ConnectionStrings": {
       "LocalSqlServer": "Server=SERVIDOR_SQL_TIENDA;Database=VAD10;User Id=USUARIO_SQL;Password=CLAVE_SQL;TrustServerCertificate=True;"
     },
     "DirectExtractors": {
       "Products": { "Enabled": false },
       "ProductBarcodes": { "Enabled": false },
       "InventoryBaseline": { "Enabled": false },
       "InventoryMovements": { "Enabled": false },
       "Sales": {
         "Enabled": true,
         "IntervalMinutes": 10,
         "TargetApiUrl": "https://api.qa.morpheussoft.net/api/v1/import/sales-legacy"
       },
       "SupplierProducts": { "Enabled": false },
       "Suppliers": { "Enabled": false }
     },
     "StoreFacilityId": 1
   }
   ```
3. **Iniciar el Agente en segundo plano:**
   Iniciar el daemon o Windows Service para que continúe subiendo transacciones de venta de forma automática cada 10 minutos.
