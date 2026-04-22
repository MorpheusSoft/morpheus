# Reglas de Negocio: Módulo de Compras y Reposición (Neo ERP)

Este documento define la inteligencia artificial, el flujo de trabajo y la estructura matemática necesaria para transformar la gestión operativa de compras en un esquema ultra-simplificado y proactivo ("Cero Fricción").

## 1. Perfilamiento Funcional y Gestión de Compradores
- **Ficha del Comprador Analista:** Un usuario del ERP puede recibir el rol de "Comprador". Este perfil segmentará visual y matemáticamente su responsabilidad.
- **Micro-Asignación y Filtros de Ruido:** A este perfil se le asignarán Categorías específicas, Proveedores particulares, o Locales/CEDI exclusivos. La pantalla de Neo estará limpia y el comprador no verá notificaciones ni quiebres de aquellos rubros fuera de su responsabilidad, combatiendo la parálisis por exceso de información.

## 2. Maestro de Proveedores Enriquecido
- **Metadata Logística (Variables de Proactividad):** La ficha dictará obligatoriamente los "Días Históricos de Entrega" (Lead Time Proveedor) para encender la mecha de compras y la "Cantidad Mínima de Orden" (MOQ).
- **Segmentación de Contactos Comerciales/Financieros:** Se albergarán correos electrónicos divididos: un correo comercial/ventas para recibir los envíos automatizados de la ODC; y correos financieros alternativos reservados para el intercambio oficial de pago de facturas y los comprobantes tributarios de retención.
- **Catálogo Bancario del Beneficiario:** El proveedor registrará nativamente sus cuentas receptoras dentro de su ficha en Neo, acopladas formalmente a su moneda de pago. Al momento de la facturación, el pago nacerá y conciliará contra estas cuentas base, haciendo hermético el manejo de tesorería y evitando fraudes de transferencias incorrectas.

## 3. Asistente Mágico de Reposición y Generación Rápida
- **Análisis Pre-masticado:** En contraposición a reportes tortuosos, la herramienta "Analizar Reposición" solicitará si se compra de manera consolidada (Centralización Logística: CEDI) o si se pide directamente hacia una Localidad/Tienda.
- **Fórmula Interna Predictiva:** Se cruza automáticamente: `(Venta Promedio Diaria [Run Rate] * Días Tiempos de Entrega)` de forma comparativa sumándole `Stock de Seguridad`.
- **Experiencia de Aprobación Simple (UI):** Neo pintará sobre el tapete de trabajo todo lo que "Debería comprarse" en modo canasta. Proveerá botones de ajuste fácil de Empaques (+ o - cajas) para los humanos y una confirmación ("Generar Orden"), transformando un análisis técnico en un flujo lúdico de tres pasos.

## 4. ODC Omitiendo Intermediarios (Envío Directo)
- **Frictionless Actioning:** Aprobada la Orden y cotejada por autorizaciones operativas (por ejemplo un ticket financiero de compra), aparecerá la acción transaccional primigenia: *"Aprobar y Disparar a Proveedor"*.
- **Back-End Mailing Server integrado:** Neo adjuntará un PDF oficial junto a una exportación pura para los datos e instanciará un correo electrónico emitido internamente en nombre de la Empresa directo al Proveedor, cerrando la brecha de exportar local a los sistemas del servidor e incluir archivos sueltos vía Outlook tradicional.

## 5. Prevención de Quiebres y el Analista Silencioso (Nightly Processing)
- **Cálculo Silente (Automatización Madrugada):** A lo largo de la noche, rutinas de servidor validan los Run Rates proyectados y el pliego físico para cada localidad por cada tienda individualmente.
- **Conciencia del Plazo:** Si la merma del inventario actual denota que llegará a quiebre físico antes o exactamente al mismo tiempo de la ventana de entrega de `Lead Time`, asoma un quiebre inevitable de negocio.
- **Proyectos de Elaboración y Avatares de Alerta:** El sistema no enviará spam inoperativo. Para las 08:00 AM, las Órdenes ("ODCs Borradores Inteligentes") se auto-fabricaron con distribuciones coherentes y aguardan revisión sobre la pantalla de aquel analista de compras encargado. El humano simplemente firma en conformidad tras revisar.
