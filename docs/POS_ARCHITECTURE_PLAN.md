# Plan Arquitectónico: Morpheus POS (Punto de Venta)

## Resumen del Proyecto
Desarrollo de un sistema de Punto de Venta (POS) ultrarrápido, robusto, y tolerante a fallos de internet, pensado específicamente para entornos Retail físicos de alto volumen de transacciones dentro del ecosistema Morpheus ERP.

## 1. Definición Tecnológica
- **Ecosistema Principal:** Estará alojado de forma independiente pero dentro del mismo paraguas del repositorio en GitHub.
  - **Ruta del Proyecto:** `Morpheus/neo-pos` (A nivel de la raíz, hermano del Backend y del ERP Web).
  - **Puerto de Desarrollo Asignado:** `4009` (En dev).
- **Mantra Oficial del Proyecto:** _"Estúpidamente simple por fuera, pero una completa bestia por dentro."_ Cero fricción visual; el cajero asimila la caja en segundos, mientras el código interno procesa colas offline, SQLite y puertos seriales a velocidad hiper-latente.
- **Framework FrontEnd:** **Flutter (Dart)**.
  - **Razón Estratégica:** Provee compilación estática a binarios nativos permitiendo operar sin depender de navegadores web limitados. Es el rey unificando plataformas con un solo código.
  - **Plataformas Objetivo Nativas:** Windows (.exe), Linux Binaries, y Android (APK). 

## 2. Topología Dinámica: Offline-First Adaptativo
Morpheus POS no puede paralizarse si se corta el internet. Operará bajo un modelo de red "Líquido" que se configura según la capacidad de cada cliente de Morpheus:

### 2.1. Nivel 1: Modo Standalone (Directo a la Nube)
- Ideal para comercios pequeños (1 o 2 cajas).
- El POS descarga su propio catálogo a un SQLite nativo y lo sincroniza directamente hacia FastAPI en la nube. Cero hardware de servidor, máxima independencia.

### 2.2. Nivel 2: Modo Local Master (Caja Principal Dúo)
- Ideal para tiendas medianas (3 a 5 cajas).
- Una de las cajas se configura como "Master". Las demás cajas se configuran como "Client" (Esclavas).
- Las esclavas no van al internet, sino que le rinden cuentas a la "Caja Master" a través de la Red LAN usando micro-sockets internos. La Master consolida todo y hace el viaje a la matriz. 

### 2.3. Nivel 3: Store Server Dedicado (Headless Node)
- Ideal para Retail denso (10+ Cajas en un supermercado).
- Se instala un "Servidor de Piso" invisible que maneja las colas (`Outbox Pattern`) de todas las cajas hacia la matriz, soportando caídas de internet sin que los cajeros se enteren de que hubo un apagón de red. Permite "Tickets en Suspenso" compartidos entre cajas en la red LAN.

## 3. Matriz de Responsabilidades (Flujo de Datos)
Para mantener el sistema incorruptible y veloz, los datos se confinan según su dominio bajo la siguiente regla:

### 3.1. En la Nube (Central/ERP Web) -> **"Fuente Única de Verdad"**
- **Gestión Maestra:** Creación de Productos, Categorías, variantes, lotes.
- **Decisiones Financieras:** Motor global de Precios, campañas de promociones a nivel corporativo, creación de Combos estacionales.
- **Reportería Masiva:** Consolidación de ingresos de todas las sucursales, auditorías de cajas, cuadres contables y pago de comisiones a usuarios.
- **Supply Chain:** Todo lo de Compras, WMS local y proveedores para abastecer la tienda.

### 3.2. En el Store Server (o Caja Maestra) -> **"El Árbitro de la Sucursal"**
- **Sincronización Inteligente:** Descarga el catálogo maestro de la Nube solo 1 vez y se lo esparce a las 15 cajas por la LAN. 
- **Stock Verdadero de Sucursal:** Conoce el inventario exacto de *esta* tienda minuto a minuto y aprueba si se puede vender o no sin preguntarle a la nube.
- **Central de Mantenimiento de Tickets:** Almacena los carritos armados o "Cuentas en Suspenso". Si un vendedor armó un carrito en el pasillo, el Store Server lo guarda para que la Caja 4 pueda llamarlo y cobrarlo.
- **Consolidador Batch:** Recoge los 5,000 tickets del día generados por las esclavas y los inyecta agrupados y encriptados en la matriz (Nube) sin saturar internet.

### 3.3. En el POS Final (Client Node) -> **"La Espada Samurái"**
- **Interfaz y Velocidad:** Búsqueda en memoria local (SQLite en RAM). Debe retornar resultados al teclado/pantalla táctil $< 0.1$ milisegundos.
- **Cálculo de Transacción:** Suma, resta, calcula el IVA/IGTF, aplica descuentos manuales validados por un pin y cierra el flujo de dinero.
- **Conversación con Hardware:** Comunica a bajísimo nivel los puertos COM (Visores de cliente, básculas de peso para charcutería), lectores láser, y dispara el comando Hexadecimal de Facturación hacia la impresora fiscal/térmica local.

## 4. Integración de Periféricos (Hardware Retail)
- **Teclados Programables (Ej. PrehKeyTec):** Como son emuladores por hardware, el POS utilizará *Raw Keyboard Listeners / Focus Nodes* globales. Se diseñará un mapa de eventos (KeyBinding) donde, por ejemplo, pulsar la tecla física especial enviará la señal `Ctrl+Shift+F10` = Abrir pantalla de pago.
- **Puertos COM (Serial RS232) y USB Directo:** 
  - Para balanzas y visores de clientes, se usarán librerías cruzadas como `flutter_libserialport` en Desktop.
  - Soporte de USB/OTG directo para dispositivos Android con paquetes nativos (`usb_serial`).
- **Impresoras Fiscales (.dll o librerías dinámicas .so):** Se utilizará el sistema FFI (Foreign Function Interface) de Flutter o MethodChannels para aislar y comunicar el hardware legado de Windows/Linux escrito en C++/Java nativamente al POS sin ralentizar la interfaz reactiva.

## 5. Estrategia Comercial de Desacoplamiento (API-First / Headless POS)
El POS no estará rígidamente ensamblado al núcleo interno de Morpheus ERP. Se diseñará bajo un modelo normativo de **"API-First"** (POS de Arquitectura Abierta o *Headless*):

Esto habilita un modelo de negocios expansivo (SaaS Escalable):
1. **Módelo de Licenciamiento Independiente:** Una empresa podrá registrarse y pagar una suscripción para usar **únicamente** el frontend de Cajas (POS), sin necesidad de operar el ERP corporativo Morpheus.
2. **API de Inyección/Extracción Genérica:** El POS se alimentará de manera agnóstica a través de endpoints REST (`/api/v1/pos/sync-catalog` y `/api/v1/pos/push-tickets`).
3. **Morpheus ERP como un "Cliente Más":** Neo ERP simplemente se conectará a este Hub de integraciones. Si el día de mañana un cliente gigantesco quiere usar las increíbles cajas de Morpheus POS, pero su empresa exige guardar la contabilidad en **SAP, Oracle u Odoo**, solo tendrán que conectar su propio conector a nuestra API abierta y el POS funcionará con total naturalidad con esos gigantes.

## 6. Instrucciones para la IA (Antigravity) cuando se inicie este desarrollo
El Arquitecto de Software y Funcionalidades es el Humano (Usuario). Antigravity funge única y exclusivamente como el Programador e Ingeniero de Código de Flutter/FastAPI.

**Pasos de Despliegue cuando el usuario diga "Iniciemos POS":**
1. Ejecutar el CLI local para inicializar Flutter en la carpeta raíz: `Morpheus/neo-pos`.
2. Crear la capa de Datos (SQLite) según base dictada en la API Headless.
3. Construir la UI Táctil y reactiva (Caja Registradora).
4. Unir el motor de transacciones (Outbox Pattern) al ERP Principal.

## 7. Bitácora de Decisiones Arquitectónicas (Actualizado Abril 2026)

### 7.1 Arquitectura Bimonetaria (Dual-Ledger)
- **Dual Booking:** Transición de tickets a esquema bimonetario estricto. Cada `ticket_line` graba el valor en la Moneda Base (ej. USD) y en la Moneda Transaccional (ej. VES) en el minuto exacto del cobro.
- **Instrumentos de Pago:** Desacoplamiento orgánico. El pago es un cruce con la tabla `payment_instruments` que define si exige número de lote/referencia bancaria o no.

### 7.2 Topología de Clientes Desacoplada
- Adición de `local_address_book` al POS: Funciona como caché para los "Consumidores Finales", para imprimir RIF/Razón Social sin colapsar el CRM Oficial del ERP.

### 7.3 Patrón UI Dual Adaptativo (Premium Dark Mode)
- El POS debe soportar **dos modos visuales** dinámicos:
  - **Modo Supermercado:** 100% Escáner y Teclado. Gran tabla de recibos, cliente visible (`local_address_book`), panel de "Último Escaneado", y botones grandes mapeados a `F1...F12`.
  - **Modo Restaurante:** Táctil puro. Reemplaza panel F-keys con menús de cristal ahumado para platillos y órdenes de cocina.
- **Estética Mandatoria:** Color base _Slate Grey oscura_ (#0F172A) con UI minimalista, transparencias estilo Glassmorphism y botón primario destacado (Pay Cyan Neón). Se descartan paletas de colores sólidos y chillones.

### 7.4 Flujo de Cierre de Venta (Checkout Interactivo)
- **Identidad de Papel Térmico:** Al presionar `F12 COBRAR`, la UI se divide. La mitad izquierda emula un rollo de papel blanco térmico pre-renderizando exactamente el ticket, mitigando riesgos visuales o errores del cajero.
- **Búsqueda Avanzada F1:** Modal interactivo de búsqueda de productos con soporte de conversión de precio por `unit_multiplier` (multiplicando automáticamente los subtotales para empaques grandes) e interruptor (Switch) para limitar a unidades sueltas.
- **Gestión de Cliente Dinámica:** El módulo superior incorpora un ingreso de datos manual rápido inyectable directo en la memoria del `CartProvider` para el armado ágil de la cabecera del ticket.

### 7.5 Operaciones Avanzadas de Caja (Teclado Experto)
- **Captura Global de Hardware:** Se implementó `HardwareKeyboard.instance.addHandler` de bajo nivel para atajos críticos (F2, F3, F7, F12). Esto asegura que la caja responda al instante a la botonera física del hardware sin que los widgets (como la barra del escáner láser) "se traguen" los eventos de foco en alto volumen de ventas.
- **Flujo de Cantidades Híbrido (Asterisco y F2):** Permite pre-cargar un multiplicador con el teclado numérico (Ej. `15*`) para ingresos masivos, o utilizar `F2` para editar retrospectivamente la cantidad del último artículo escaneado en el recibo (ubicado siempre en el tope superior `Index 0` para máxima visibilidad).
- **Flujo de Tickets en Espera (F3):** Salvavidas para clientes que interrumpen el pago. Guarda el carrito completo con una referencia manual obligatoria (editable sobre el nombre del cliente) y limpia el sistema para facturar a otros, permitiendo recuperar tickets previos desde un listado temporal reactivo.
