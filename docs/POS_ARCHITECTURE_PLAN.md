# Plan Arquitectónico: Morpheus POS (Punto de Venta)

## Resumen del Proyecto
Desarrollo de un sistema de Punto de Venta (POS) ultrarrápido, robusto, y tolerante a fallos de internet, pensado específicamente para entornos Retail físicos de alto volumen de transacciones dentro del ecosistema Morpheus ERP.

## 1. Definición Tecnológica
- **Ecosistema Principal:** Estará alojado como un módulo dentro del monorepositorio actual.
  - **Ruta del Proyecto:** `Morpheus/neo-erp-web/apps/neo-pos`
  - **Puerto de Desarrollo Asignado:** `4009` (En dev).
- **Mantra Oficial del Proyecto:** _"Estúpidamente simple por fuera, pero una completa bestia por dentro."_ Cero fricción visual; el cajero asimila la caja en segundos, mientras el código interno procesa colas offline, SQLite y puertos seriales a velocidad hiper-latente.
- **Framework FrontEnd:** **Flutter (Dart)**.
  - **Razón Estratégica:** Provee compilación estática a binarios nativos permitiendo operar sin depender de navegadores web limitados. Es el rey unificando plataformas con un solo código.
  - **Plataformas Objetivo Nativas:** Windows (.exe), Linux Binaries, y Android (APK). 

## 2. Abstracción Offline-First (Modo Sin Conexión)
Morpheus POS no puede paralizarse si se corta el internet. Operará bajo una política estricta **Offline-First**.

### 2.1. Almacenamiento Local (Edge Database)
- **Tecnología:** SQLite (Usando paquetes como `sqflite` o `drift` en Flutter).
- Todo el Maestro de Productos, Categorías y Reglas de Precificación residirán en la memoria local estática del dispositivo POS.
- Las consultas a la base de datos local toman $< 0.1$ milisegundos.

### 2.2. Motor de Sincronización (Background Workers)
- **Flujo de Lectura:** Un worker en segundo plano se encargará de "descargar" los cambios de precios y productos nuevos desde FastAPI (`localhost:8000`) cada "x" minutos hacia la SQLite local.
- **Flujo de Escritura (Outbox Pattern):** Cuando el cajero efectúe una venta, ésta se guarda como `TICKET_CERRADO` en la SQLite e imprime la factura. Una cola asíncrona revisará periódicamente la red y disparará las transacciones atrasadas al servidor FastAPI de forma segura y encriptada.

## 3. Integración de Periféricos (Hardware Retail)
- **Teclados Programables (Ej. PrehKeyTec):** Como son emuladores por hardware, el POS utilizará *Raw Keyboard Listeners / Focus Nodes* globales. Se diseñará un mapa de eventos (KeyBinding) donde, por ejemplo, pulsar la tecla física especial enviará la señal `Ctrl+Shift+F10` = Abrir pantalla de pago.
- **Puertos COM (Serial RS232) y USB Directo:** 
  - Para balanzas y visores de clientes, se usarán librerías cruzadas como `flutter_libserialport` en Desktop.
  - Soporte de USB/OTG directo para dispositivos Android con paquetes nativos (`usb_serial`).
- **Impresoras Fiscales (.dll o librerías dinámicas .so):** Se utilizará el sistema FFI (Foreign Function Interface) de Flutter o MethodChannels para aislar y comunicar el hardware legado de Windows/Linux escrito en C++/Java nativamente al POS sin ralentizar la interfaz reactiva.

## 4. Instrucciones para la IA (Antigravity) cuando se inicie este desarrollo
El Arquitecto de Software y Funcionalidades es el Humano (Usuario). Antigravity funge única y exclusivamente como el Programador e Ingeniero de Código de Flutter/FastAPI.

**Pasos de Despliegue cuando el usuario diga "Iniciemos POS":**
1. Ejecutar el CLI local para inicializar Flutter en `apps/neo-pos`.
2. Crear la capa de Datos (SQLite) según base dictada en el Backend.
3. Construir la UI Táctil y reactiva (Caja Registradora).
4. Unir el motor de transacciones (Outbox Pattern) al ERP Principal.
