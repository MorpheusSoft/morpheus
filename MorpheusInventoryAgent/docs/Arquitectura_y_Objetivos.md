# Morpheus Sync System

## 🎯 Objetivo del Proyecto

El objetivo principal de este proyecto fue rediseñar y modernizar el antiguo servicio monolítico (`MorpheusSoport` en .NET Framework 4.8) encargado de sincronizar datos entre las tiendas físicas y el servidor en la nube de Morpheus. 

El viejo sistema presentaba problemas de tolerancia a fallos: si la conexión a internet fallaba durante la transmisión o si ocurría un error de Llaves Primarias (PK) en la base de datos central, los procesos se interrumpían, provocando pérdida de datos o bucles de errores infinitos.

El nuevo sistema soluciona esto implementando una arquitectura distribuida **Store-and-Forward** con capacidades de **UPSERT automático**, garantizando que nunca se pierda un solo registro.

---

## 🏗️ Lo que hicimos (Arquitectura Implementada)

Desacoplamos el sistema en dos proyectos independientes y modernos utilizando **C# y .NET 8/9**:

### 1. El Agente Local (`MorpheusSyncAgent`)
Se construyó un *Worker Service* multiplataforma (compatible nativamente con Windows Services y Linux Systemd) que se instala en la tienda. Cuenta con dos "motores" (hilos) que trabajan en paralelo:
- **El Extractor (Productor):** Lee las tareas configuradas localmente (`LocalTasks`), se conecta a la base de datos SQL Server de la tienda usando `Dapper`, extrae la información, la convierte a `JSON` y la guarda de forma súper segura en una "Bandeja de Salida" transaccional usando una base de datos embebida **SQLite** (`morpheus_local.db`).
- **El Transmisor (Consumidor):** Monitorea constantemente esta Bandeja de Salida en SQLite. Cuando ve datos pendientes, los envía por internet hacia la nube usando `HttpClient`. Si no hay internet, simplemente reintenta más tarde.

### 2. La API en la Nube (`MorpheusCloudApi`)
Se construyó una Web API segura (`X-API-KEY`) que actúa como receptor central.
- **Protección Anti-Errores (UPSERT):** Cuando la API recibe los miles de registros en JSON desde una tienda, los inyecta rapidísimo en una Tabla Temporal (`#TempTable`) usando `SqlBulkCopy`. Luego, ejecuta un comando SQL dinámico `MERGE`. 
- Gracias al `MERGE`, si la tienda mandó un registro que ya existía (ej. se actualizó el stock de un producto), la API lo actualiza (`UPDATE`). Si es un registro nuevo, lo inserta (`INSERT`). Esto elimina por completo los "errores de PK".

## 🚀 Tecnologías Clave Utilizadas
- **.NET 8 / 9** (C# 12)
- **SQLite** (Persistencia local a prueba de apagones)
- **Dapper** (Acceso a datos de alto rendimiento)
- **SqlBulkCopy** (Vaciado masivo a SQL Server)
