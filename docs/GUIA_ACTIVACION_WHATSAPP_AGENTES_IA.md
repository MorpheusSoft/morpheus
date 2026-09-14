# GUÍA EJECUTIVA Y TÉCNICA: ACTIVACIÓN DE META WHATSAPP CLOUD API Y AGENTES DE IA

**Sistema:** Neo ERP  
**Módulos Involucrados:** Neo Core (Usuarios Digitales), Neo WMS (Arturo WMS), Neo Compras (Clara Compras) y Neo Core / POS (Dante TI)  
**Fecha:** Septiembre 2026  
**Versión:** 1.0  
**Dirigido a:** Gerencia General, Dirección de Operaciones y Equipo de Tecnología  

---

## 1. RESUMEN EJECUTIVO Y ARQUITECTURA

Neo ERP cuenta con un ecosistema de **Trabajadores Digitales (Agentes de Inteligencia Artificial)** capaces de interactuar directamente con los supervisores de la empresa a través de **WhatsApp**:

- **Arturo WMS (Supervisor Autónomo de Almacenes):** Consulta de existencias, productos en negativo, estatus de recepciones y mermas en muelle.
- **Clara Compras (Analista Predictiva de Abastecimiento y MRP):** Diagnóstico de proveedores en quiebre, cálculo de sugeridos de compra, generación de borradores de Órdenes de Compra (ODC) y alertas de variaciones de costos.
- **Dante TI (Guardián de Infraestructura y Datos):** Monitoreo de latidos de tiendas físicas, sincronización de cajas POS y alertas de discrepancias.

### Arquitectura de Conexión
```
[ Supervisor Móvil ] 
        ▲
        │  (Mensaje WhatsApp)
        ▼
[ Meta WhatsApp Cloud API ] (Nube Oficial de Meta / Facebook)
        ▲
        │  (Webhook Seguro HTTPS / X-Hub-Signature-256)
        ▼
[ Neo ERP API Gateway ] (FastAPI - /api/v1/whatsapp/webhook)
        ▲
        │
        ├──► [ Motor Conversacional / NLP (Google Gemini 2.5) ]
        └──► [ Base de Datos PostgreSQL (Morpheus DB / Neo ERP) ]
```

---

## 2. REQUISITOS PREVIOS (LEGALES Y TÉCNICOS)

Para solicitar y activar el servicio oficial sin retrasos por parte de Meta, la empresa debe preparar con antelación:

### A. Requisitos Técnicos
1. **Línea Telefónica Corporativa Exclusiva:**
   - Puede ser un número celular móvil o un número de red fija (DID).
   - Capacidad comprobada para recibir llamadas de voz o mensajes SMS internacionales con el código de confirmación.
   - **Regla Crítica:** El número **NO debe tener una cuenta activa de WhatsApp** (ni la aplicación personal ni WhatsApp Business App). Si ya la tiene en un teléfono físico, se debe ingresar a la app móvil y ejecutar: `Ajustes > Cuenta > Eliminar mi cuenta`. Si no se elimina de la app móvil, Meta rechazará el alta en la Cloud API.
2. **Dominio Público con Certificado SSL Válido:**
   - El Webhook del ERP debe estar expuesto bajo una URL segura `https://` (ejemplo: `https://api.qa.morpheussoft.net/api/v1/whatsapp/webhook`). Meta rechaza URLs bajo `http://` no seguras o con certificados auto-firmados.

### B. Requisitos Legales y Corporativos (Verificación Comercial de Meta)
1. **Meta Business Account (Business Manager):**
   - Acceso con rol de Administrador a [business.facebook.com](https://business.facebook.com).
2. **Documentación Legal Escaneada:**
   - Registro de Información Fiscal (RIF / RFC / RUT) o Acta Constitutiva / Registro Mercantil de la empresa.
   - Comprobante reciente de domicilio fiscal a nombre de la empresa (recibo de luz, agua, telefonía fija o extracto bancario con antigüedad menor a 3 meses).
3. **Sitio Web Corporativo y Correo Oficial:**
   - Sitio web corporativo activo bajo HTTPS que muestre visiblemente la razón social, dirección física y datos de contacto.
   - Correo electrónico bajo el dominio propio (ejemplo: `sistemas@tuempresa.com`). Meta no admite correos gratuitos (@gmail.com / @hotmail.com) para verificar cuentas comerciales.
4. **Tarjeta de Crédito Corporativa:**
   - Se debe registrar un método de pago internacional en Business Manager para el consumo excedente al nivel gratuito.

---

## 3. ESTRUCTURA DE COSTOS OFICIALES DE META (MODELO 2025/2026)

Meta no cobra suscripciones fijas mensuales; factura bajo el modelo de **mensaje entregado**:

| Tipo de Mensaje | Caso de Uso en Neo ERP | Tarifa Oficial Meta |
| :--- | :--- | :--- |
| **Mensajes de Servicio (Service)** | Respuestas de Arturo, Clara y Dante a consultas formuladas por supervisores en una ventana de 24h. | **Primeros 1.000 mensajes al mes GRATIS (Free Tier).** Luego ~$0.005 a $0.010 USD por mensaje. |
| **Mensajes Entrantes (Inbound)** | Mensajes que los empleados o proveedores envían hacia el WhatsApp del ERP. | **100% GRATIS e ILIMITADOS.** |
| **Mensajes de Utilidad (Utility)** | Notificaciones proactivas del ERP (ej: enviar ODC al proveedor o alertar caída de tienda). | ~$0.015 a $0.035 USD por mensaje (requiere plantilla aprobada). |

### Estimación Mensual para Neo ERP
- **8 Supervisores Operativos** consultando stocks, ODC y existencias (~1.200 mensajes/mes):
  - 1.000 mensajes cubiertos por el Free Tier: **$0.00 USD**
  - 200 mensajes adicionales: **~$2.00 USD**
- **Envío de Órdenes a Proveedores** (150 ODC enviadas por WhatsApp): **~$3.75 USD**
- **Costo Total Estimado:** **~$5.00 a $10.00 USD al mes.**

---

## 4. GUÍA PASO A PASO PARA ADQUIRIR Y CONFIGURAR EL SERVICIO

### Paso 1: Creación de la Aplicación en Meta for Developers
1. Iniciar sesión en [Meta for Developers](https://developers.facebook.com) con la cuenta que administra el Business Manager.
2. Navegar a **Mis Apps (My Apps)** y presionar **Crear App (Create App)**.
3. Seleccionar el caso de uso: **"Otro" (Other)** > presionar *Siguiente*.
4. Seleccionar el tipo de aplicación: **"Negocios" (Business)**.
5. Completar los datos iniciales:
   - **Nombre de la App:** `Neo ERP Operaciones` *(Nota: No incluir la palabra "WhatsApp" en el nombre para evitar rechazo de marca)*.
   - **Correo de contacto:** El correo de soporte o TI corporativo.
   - **Cuenta de Business Manager:** Seleccionar la cuenta comercial verificada de la empresa.
6. En el catálogo de productos disponibles en la app, localizar **WhatsApp** y hacer clic en **"Configurar" (Set up)**.

---

### Paso 2: Registro y Validación del Número Telefónico
1. En el menú lateral izquierdo de la app, ir a **WhatsApp > Configuración de la API (API Setup)**.
2. En la parte inferior (*"Paso 5: Agregar un número de teléfono"*), presionar **"Agregar número de teléfono"**.
3. Completar el perfil corporativo:
   - **Nombre para mostrar (Display Name):** Nombre comercial de la empresa o `Neo Asistente`.
   - **Categoría:** *Servicios empresariales* o *Compras y comercio minorista*.
   - **Descripción:** *Asistente de inteligencia artificial y supervisión operativa de Neo ERP*.
4. Ingresar el número telefónico exclusivo con su código internacional de país.
5. Seleccionar método de validación (**SMS** o **Llamada de voz**) e ingresar el código de verificación recibido.
6. Al finalizar el registro, copiar y resguardar:
   - **Phone Number ID** (ejemplo: `109283746501928`).
   - **WhatsApp Business Account ID - WABA ID** (ejemplo: `987654321098765`).

---

### Paso 3: Generación del Token de Acceso Permanente (System User Token)
> **IMPORTANTE:** El token provisional entregado en la pantalla de bienvenida expira en 24 horas. Para producción se debe crear un Token Permanente mediante un Usuario del Sistema:

1. Abrir la [Configuración del Negocio (Business Settings)](https://business.facebook.com/settings).
2. En el menú lateral, ingresar a **Usuarios > Usuarios del sistema (System Users)**.
3. Presionar el botón **"Agregar"**:
   - **Nombre:** `neo-erp-system-worker`
   - **Rol:** `Administrador de la cuenta comercial`.
4. Seleccionar el usuario creado y presionar **"Asignar activos"**:
   - Tipo de activo: **Cuentas de WhatsApp**.
   - Seleccionar la cuenta WABA y activar el permiso: **"Administrar cuenta de WhatsApp Business (Control total)"**. Guardar cambios.
5. En la misma pantalla del usuario del sistema, presionar **"Generar nuevo token"**:
   - Seleccionar la app: `Neo ERP Operaciones`.
   - **Caducidad del token:** Seleccionar **"Nunca" (Never)**.
   - Marcar obligatoriamente los permisos:
     - `whatsapp_business_messaging` (enviar y recibir mensajes).
     - `whatsapp_business_management` (administrar números y plantillas).
6. Presionar **"Generar token"** y copiar inmediatamente la cadena generada (`EAAB...`). Este valor corresponde a la variable `WHATSAPP_ACCESS_TOKEN`.

---

### Paso 4: Configuración del Webhook en Meta Developers
1. Regresar a [Meta for Developers](https://developers.facebook.com) > Tu App > **WhatsApp > Configuración (Configuration)**.
2. En la sección **Webhook**, presionar **"Editar"**:
   - **URL de devolución de llamada (Callback URL):**  
     `https://api.qa.morpheussoft.net/api/v1/whatsapp/webhook` *(o la URL productiva final).*
   - **Identificador de verificación (Verify Token):**  
     Definir una frase secreta segura (ejemplo: `neo_erp_wa_prod_token_2026`). Debe coincidir con la clave en el archivo `.env`.
3. Presionar **"Verificar y guardar"** (Meta enviará un ping de verificación inmediato; al coincidir responderá con el check verde).
4. En la tabla **Campos del webhook (Webhook fields)**, ubicar la fila **`messages`** y presionar **"Suscribirse" (Subscribe)**.
5. Ir a **Configuración de la app > Básica (Basic Settings)**:
   - Localizar **"Clave secreta de la app" (App Secret)**, presionar *Mostrar* y copiar el valor (`WHATSAPP_APP_SECRET`).

---

### Paso 5: Registro del Método de Pago Corporativo
1. En [Business Settings](https://business.facebook.com/settings) > **Pagos**.
2. Agregar la tarjeta de crédito corporativa y vincularla a la cuenta de WhatsApp Business. Esto evita pausas en el servicio al superar el volumen mensual gratuito.

---

## 5. CONFIGURACIÓN EN EL SERVIDOR DE NEO ERP (`.env`)

En el servidor donde corre el backend FastAPI (`backend/.env`), se deben configurar las siguientes variables de entorno:

```bash
# =====================================================================
# META WHATSAPP CLOUD API (PRODUCCIÓN)
# =====================================================================
# Frase secreta para el handshake del Webhook (GET /webhook)
WHATSAPP_VERIFY_TOKEN=neo_erp_wa_prod_token_2026

# App Secret copiado de Meta for Developers (para validación de firma HMAC SHA-256)
WHATSAPP_APP_SECRET=clave_secreta_de_la_app_en_meta

# Identificador del número telefónico corporativo asignado por Meta
WHATSAPP_PHONE_NUMBER_ID=109283746501928

# Token de acceso permanente del System User (cadena que inicia con EAAB...)
WHATSAPP_ACCESS_TOKEN=EAAB...cadena_permanente_del_system_user...

# =====================================================================
# GOOGLE GEMINI AI (MOTOR COGNITIVO PARA TRABAJADORES DIGITALES)
# =====================================================================
# Clave activa generada en https://aistudio.google.com
GEMINI_API_KEY=AIzaSy...nueva_clave_activa_de_gemini...
```

---

## 6. PLAN DE AJUSTES TÉCNICOS EN EL CÓDIGO FUENTE

Durante la auditoría del repositorio se identificaron 4 mejoras necesarias para la puesta en marcha:

1. **Despachador Saliente de Mensajes (`send_whatsapp_message`):**
   - Implementar el cliente asíncrono utilizando `httpx` (integrado nativamente en FastAPI) para que una vez procesada la respuesta del agente, se envíe de vuelta al WhatsApp del supervisor llamando a `https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages`.
2. **Corrección en la Asignación del PIN de Vinculación:**
   - En `backend/app/api/v1/endpoints/digital_workers.py` (Línea 160), modificar la asignación del PIN para que se guarde en `current_user.pairing_pin` (el supervisor humano autenticado) y no en el bot sintético. Esto preserva la identidad humana, la auditoría y los permisos de sucursales autorizadas.
3. **Enrutamiento de Intenciones para Dante TI:**
   - Incorporar disparadores en `backend/app/agents/whatsapp_agent.py` para palabras clave como *"sync"*, *"sincronización"*, *"latido"*, *"tienda"*, *"caja"* y *"offline"*, dirigiendo estas consultas a `DANTE_IT`.
4. **Renovación de Clave Gemini:**
   - Actualizar `GEMINI_API_KEY` con una clave activa de Google AI Studio para que los agentes operen con lenguaje natural y personalidad sin caer en plantillas estáticas.

---

## 7. MANUAL OPERATIVO: PROCEDIMIENTO PARA SUPERVISORES

### A. Vinculación del Teléfono (Se realiza una sola vez)
1. El supervisor inicia sesión en **Neo ERP** con su usuario y contraseña.
2. Ingresa al menú **Configuración > Usuarios Digitales (IA)** (`/dashboard/digital-workers`).
3. En la tarjeta de **Arturo WMS** o **Clara Compras**, hace clic en el botón **"Vincular WhatsApp"**.
4. En el modal interactivo, presiona **"Generar Nuevo PIN"** (el sistema genera un código de 6 dígitos único, ej: `738192`).
5. El supervisor abre WhatsApp en su teléfono móvil personal y envía al número oficial de la empresa:
   > `Vincular 738192`
6. El sistema de Neo ERP valida el PIN, vincula su número a su usuario y responde de inmediato:
   > *"✅ ¡Dispositivo Vinculado con Éxito! Hola [Nombre del Supervisor], has conectado tu WhatsApp con el ecosistema de IA de Neo ERP. Ahora puedes consultarme sobre inventarios, compras y operaciones."*

### B. Ejemplos de Consultas Diarias por WhatsApp

#### Con Arturo WMS (Logística y Almacén):
- *"Arturo, ¿qué productos tienen existencia negativa en Maracay?"*
- *"Arturo, existencias de Harina PAN"*
- *"Arturo, ¿cuántas recepciones de mercancía tenemos pendientes hoy en muelle?"*
- *"Arturo, ¿hubo devoluciones por merma esta semana?"*

#### Con Clara Compras (Abastecimiento y MRP):
- *"Clara, ¿qué proveedores están en quiebre de stock?"*
- *"Clara, ¿cuánto capital necesitamos para reponer inventario de víveres?"*
- *"Clara, genera el borrador de orden de compra para Cervecería Polar"*
- *"Clara, ¿qué órdenes de compra están pendientes de conciliar con factura?"*

#### Con Dante TI (Monitoreo e Infraestructura):
- *"Dante, ¿cómo está el estatus de las tiendas físicas?"*
- *"Dante, ¿hay alguna caja offline o desincronizada?"*
- *"Dante, reporte de latidos de sucursales"*

---

*Documento técnico preparado para el despliegue productivo del canal WhatsApp en Neo ERP.*
