# Simulador de Inferencia y Asignación de Leads (SIMPA v2)

Este documento describe la nueva funcionalidad de **Simulación** y la refactorización lógica del procesamiento de leads implementada en Diciembre 2025.

## 1. Objetivo
El objetivo del Simulador es proporcionar una herramienta visual para probar, depurar y validar la lógica de asignación de leads ("routing") sin necesidad de enviar datos reales a HubSpot. Esto soluciona la "caja negra" que representaba el proceso de asignación anterior.

## 2. Arquitectura Nueva

Se ha separado la lógica de negocio de la capa de transporte (endpoints).

- **`api/services/lead-processor.js`**: "Cerebro" centralizado. Contiene toda la lógica pura:
    - Normalización de textos (`normalizeKey`).
    - Inferencia de Razón Social (`inferRazonSocial`).
    - Determinación de Pipeline y Stage (`determinePipeline`), con soporte para inferencia de marca.
    - Selección de Token de Entorno (`determineTokenEnv`).
    - Cálculo de Propiedades Personalizadas (`determineCustomProperties`).
    - Validación de Datos de Entrada (`validateLeadData`).

- **`api/forward-lead.js`** (Producción): Endpoint que recibe el webhook de HubSpot. Ahora delega todas las decisiones al `LeadProcessor`, asegurando consistencia total con el simulador.
- **`api/admin/simulate.js`**: Nuevo endpoint exclusivo para el simulador. Ejecuta el `LeadProcessor` y devuelve un reporte detallado (JSON) con el resultado de la inferencia y los logs de decisión.

## 3. Uso del Simulador

1. Acceder al Admin Dashboard: `/api/admin`
2. Ir a la pestañaa **"Simulador"**.
3. Ingresar datos de prueba:
    - **Dealer Name**: Nombre del concesionario (ej: "QJ Motor CABA Villa Luro").
    - **Brand**: Marca (opcional, el sistema intentará inferirla si se omite).
4. Ejecutar **"Simular Asignación"**.

### Resultados Visualizados
- **Configuración Encontrada**: Si el sistema logró mapear el dealer a una Razón Social.
- **Pipeline Target**: ID del Pipeline y Stage que se usarían. Muestra el "Origen Lógica" (ej: `brand_exact`, `mapping_default`, `inferred_brand`).
- **Autenticación**: Qué variable de entorno (Token) se usaría.
- **Validaciones**: Advertencias (ej: falta teléfono) y Errores (ej: falta Dealer Name).

## 4. Configuración (`razones-sociales.json`)

La lógica se alimenta del archivo `api/config/razones-sociales.json`.
Estructura clave actualizada para manejar casos "default":

```json
"RAZON SOCIAL EJEMPLO": {
  "brands": ["Marca A", "Marca B"],
  "dealers": ["Dealer 1", "Dealer 2"],
  "pipelineMapping": {
    "Marca A": { "pipeline": "default", "stage": "12345" },
    "default": { "pipeline": "default", "stage": "67890" } 
  }
}
```

## 5. Casos de Uso Resueltos

- **Inferencia de Marca**: Si el lead llega sin marca (`contact_brand` vacío), el sistema ahora deduce la marca basándose en:
    1. Si la Razón Social solo tiene 1 marca configurada.
    2. Si el nombre del Dealer contiene el nombre de alguna marca configurada.
- **Validación de Stage**: Se evita el error `INVALID_OPTION` asegurando que siempre se resuelva a un ID numérico válido (usando bloques `default` explícitos si es necesario).
