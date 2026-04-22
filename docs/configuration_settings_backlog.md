# Backlog de Configuración Global del Sistema (Neo ERP)

Este documento guarda los procesos y reglas abstractas que el usuario debe poder definir en una futura **Página de Configuración Global del Sistema (Ajustes de Empresa)**, para que toda la aplicación modifique su comportamiento dinámicamente y no dependa de código "quemado" (hardcoded).

## 1. Configuración de Estrategia de Precios (Pricing Engine)
*Ruta propuesta: `/settings/inventory/pricing`*

**Requisito:** 
El cliente debe poder definir cómo el ERP escoge la matemática comercial para sus precios de venta y a partir de qué variables.

### A. Política de Margen de Ganancias
Define la fórmula matemática maestra para calcular la relación Costo-Utilidad en todo el sistema.
- **Opción 1: Margen sobre Venta (Markup on Sales)** -> *[SELECCIONADA POR DEFECTO]*
  - **Fórmula de Precio:** `Precio = Costo / (1 - Margen_Deseado)`
  - **Fórmula de Utilidad:** `Margen% = ((Precio - Costo) / Precio) * 100`
  - *Contexto:* El enfoque comercial gerencial más utilizado, donde el `30%` de utilidad significa que te quedas con 30 céntimos de cada dólar vendido.

- **Opción 2: Incremento Simple / Aditivo (Markup on Cost)**
  - **Fórmula de Precio:** `Precio = Costo * (1 + Margen_Deseado)`
  - **Fórmula de Utilidad:** `Margen% = ((Precio - Costo) / Costo) * 100`
  - *Contexto:* Un método más simple (bazar/minorista pequeño) donde inflas el costo base linealmente.

### B. Fuente de Costeamiento Base
Al decirle al sistema "Calcula los precios automáticamente", el sistema necesita saber hacia qué métrica del Kardex mirar.
- **Opción 1: Costo Actual / Estándar** (El costo con el que entró la última mercancía facturada). -> *[SELECCIONADA POR DEFECTO]*
- **Opción 2: Costo de Reposición** (El costo comercial actual fijado por el mercado, independientemente de que se haya pagado menos en el pasado).
- **Opción 3: Promedio Ponderado Móvil** (Estrictamente contable; aísla picos inflacionarios promediando el volumen del almacén).

> **Nota para los desarrolladores:** Actualmente en el `ProductForm` (Paso 1 y 2), la métrica base está acoplada al **Costo Actual**, y las fórmulas implementan estáticamente **Margen Sobre Venta**. Cuando se implemente este módulo de configuración, se debe inyectar la regla global vía API (`/api/v1/settings/core`) en el Contexto de React para volverla reactiva.
