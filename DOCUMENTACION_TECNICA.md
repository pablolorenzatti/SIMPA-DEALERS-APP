# Documentación Técnica - SIMPA

Documentación técnica detallada del funcionamiento interno de la aplicación SIMPA.

## 🏗️ Arquitectura

### Componentes Principales

1. **Endpoints Serverless (Vercel)**
   - Funciones Node.js desplegadas en Vercel
   - Manejan la lógica de negocio
   - Se comunican con HubSpot API usando tokens privados

2. **Custom Actions (HubSpot)**
   - Metadata que define inputs/outputs
   - Se ejecutan desde workflows de HubSpot
   - Llaman a los endpoints en Vercel

3. **Archivos de Configuración**
   - `razones-sociales.json`: Mapeo de razones sociales a tokens y marcas
   - `properties-config.json`: Definición de propiedades base
   - `models-by-brand.json`: Mapeo de marcas a modelos

## 🔄 Flujo de Datos

### Forward Lead (Envío de Leads)

```
Workflow HubSpot
    ↓
Custom Action: Forward Lead To Dealer
    ↓
Endpoint: /api/forward-lead (Vercel)
    ↓
1. Lee razones-sociales.json
2. Resuelve token desde tokenEnv
3. Crea cliente HubSpot con token
4. Crea/actualiza contacto
5. Crea negocio asociado
6. Guarda IDs de SIMPA en propiedades
    ↓
Retorna resultados a HubSpot
```

### Bulk Update Models (Actualización Masiva)

```
Workflow HubSpot
    ↓
Custom Action: Bulk Update Models
    ↓
Endpoint: /api/bulk-models (Vercel)
    ↓
1. Lee razones-sociales.json
2. Filtra razones sociales por marca
3. Para cada razón social:
   a. Obtiene token desde tokenEnv
   b. Crea cliente HubSpot
   c. Agrega modelo a modelo_simpa (contact/deal)
   d. Agrega modelo a modelo_{marca} (contact/deal)
4. Retorna estadísticas agregadas
    ↓
Retorna resultados a HubSpot
```

### Configure Properties (Configuración de Propiedades)

```
Workflow HubSpot
    ↓
Custom Action: Configure External Account Properties
    ↓
Endpoint: /api/workflow-action (Vercel)
    ↓
Según tipo_proceso:
  - todas_propiedades: Crea todas las propiedades base
  - propiedades_modelos: Agrega modelo (individual o bulk)
  - propiedades_concesionarios: Agrega concesionario
  - pipeline_negocio: Configura pipeline (pendiente)
    ↓
Retorna resultados a HubSpot
```

### Check Lead Status (Verificación de Estado)

```
Workflow HubSpot
    ↓
Custom Action: Check Lead Status
    ↓
Endpoint: /api/check-lead-status (Vercel)
    ↓
1. Lee razones-sociales.json
2. Resuelve token desde tokenEnv
3. Valida conexión con cuenta del dealer
4. Busca deal usando dealer_deal_id (ID en cuenta del dealer)
5. Obtiene información del deal (stage, pipeline, propiedades)
6. Obtiene información del contacto (si se proporciona dealer_contact_id)
7. Obtiene todas las actividades relacionadas (meetings, calls, notes, emails, tasks)
    ↓
Retorna información completa estructurada
```

**⚠️ Importante:** La búsqueda del deal usa SIEMPRE el `dealer_deal_id` del input, que es el ID del negocio en la cuenta del dealer (retornado por "Forward Lead To Dealer"). NO busca por `id_negocio_simpa` como fallback.

### Webhook Enrich (Enriquecimiento y Actualización Automática)

```
Webhook desde Dealer (HubSpot)
    ↓
Endpoint: /api/webhook-enrich (Vercel)
    ↓
1. Parsea payload (maneja arrays y objetos)
2. Obtiene token del dealer desde razones-sociales.json
3. Obtiene deal del dealer usando objectId del webhook
4. Extrae idNegocioSimpa del deal
5. Parsea idNegocioSimpa (formato compuesto o simple)
6. Obtiene token para SIMPA (OAuth o PAT)
7. Obtiene deal de SIMPA usando hs_object_id extraído
8. Obtiene información del pipeline/stage del dealer
   - Si propertyName === 'dealstage', usa propertyValue (nuevo stage)
   - Obtiene probability del nuevo stage
9. Mapea stage del dealer a stage de SIMPA:
   - Lee simpa-pipelines.json
   - Busca configuración por marca
   - Encuentra stage con probability más cercana
10. Actualiza deal en SIMPA con:
    - Pipeline y stage mapeados
    - Otras propiedades (amount, closedate, dealtype)
    ↓
Retorna payload enriquecido y resultado de actualización
```

**Características clave:**
- Maneja webhooks en formato array o objeto
- Usa `propertyValue` del webhook para obtener el nuevo stage (no el actual)
- Mapea stages basándose en probability y marca
- Actualiza automáticamente SIMPA cuando cambia un stage en el dealer

## 🔄 Mapeo de Stages (Webhook Enrich)

### Proceso de Mapeo

El endpoint `webhook-enrich` mapea stages del dealer a stages de SIMPA usando la probability:

1. **Obtención de Probability:**
   ```javascript
   // Si el webhook es por cambio de dealstage
   if (propertyName === 'dealstage' && propertyValue) {
     // Usa el propertyValue (nuevo stage) para obtener su probability
     stageToUse = propertyValue;
     pipelineStageInfo = await getPipelineStageInfo(client, pipelineId, stageToUse);
   }
   ```

2. **Búsqueda en Configuración:**
   ```javascript
   // Lee simpa-pipelines.json
   const marcaConfig = simpaPipelinesConfig[marcaNormalized];
   const stages = marcaConfig.stages;
   ```

3. **Encontrar Stage Más Cercano:**
   ```javascript
   // Calcula diferencia absoluta entre probabilities
   const difference = Math.abs(stageProb - targetProb);
   // Retorna el stage con menor diferencia
   ```

4. **Actualización en SIMPA:**
   ```javascript
   updateProperties.pipeline = simpaStage.pipelineId;
   updateProperties.dealstage = simpaStage.stageId;
   ```

### Formato de idNegocioSimpa

El endpoint maneja dos formatos:

1. **Formato Compuesto:** `"4990947-0-3-49633068845"`
   - `4990947`: portalId de SIMPA
   - `49633068845`: hs_object_id del deal en SIMPA

2. **Formato Simple:** `"49633068845"`
   - Solo hs_object_id del deal en SIMPA
   - Usa variable de entorno `SIMPA_PORTAL_ID` o `PORTAL_SIMPA_REFRESH_TOKEN` para identificar portal

## 🔐 Resolución de Tokens

### Prioridad de Resolución

1. **Si hay `razon_social` o `portalId`:**
   - Busca en `razones-sociales.json` por `portalId`
   - Lee `tokenEnv` de la configuración
   - Obtiene token desde `process.env[tokenEnv]` (Vercel)
   - Si no existe, construye fallback: `${RAZON_SOCIAL}_TOKEN` o `PORTAL_${portalId}_TOKEN`

2. **OAuth Refresh Token (para SIMPA):**
   - Intenta `PORTAL_{portalId}_REFRESH_TOKEN`
   - Si no existe, usa `PORTAL_SIMPA_REFRESH_TOKEN` como fallback genérico
   - Intercambia refresh token por access token usando `HUBSPOT_CLIENT_ID` y `HUBSPOT_CLIENT_SECRET`

3. **Si NO hay `razon_social`:**
   - Usa el token del input `llave` (si está disponible)
   - Solo para acciones que lo permitan

### Variables de Entorno en Vercel

Cada razón social debe tener su token configurado en Vercel:

```
SPORTADVENTURE_TOKEN → pat-na1-xxxx...
TEST_ACCOUNT_KEY → pat-na1-yyyy...
```

**Configuración:**
1. Vercel Dashboard → Project Settings → Environment Variables
2. Agrega variable con nombre exacto de `tokenEnv`
3. Valor: Private Access Token de la cuenta HubSpot correspondiente

## 📦 Gestión de Propiedades

### Creación de Propiedades

Las propiedades se crean con la siguiente estructura:

```javascript
{
  name: "modelo_qj_motor",           // Nombre técnico (lowercase)
  label: "Modelo QJ Motor",          // Etiqueta visible
  description: "Modelos de motos QJ Motor",
  groupName: "contactinformation",     // o "dealinformation"
  type: "enumeration",
  fieldType: "select",
  options: [                         // Al menos una opción requerida
    {
      label: "Nuevo Modelo",
      value: "Nuevo Modelo",
      hidden: false,
      displayOrder: 0
    }
  ]
}
```

### Actualización de Opciones

Cuando una propiedad ya existe:

1. Se obtiene la propiedad actual desde HubSpot API
2. Se verifica si la opción ya existe (comparación normalizada)
3. Si no existe, se agrega con `displayOrder` incrementado
4. Se actualiza la propiedad con todas las opciones

### Normalización

- **Nombres de propiedades:** Siempre lowercase, espacios → guiones bajos
- **Opciones:** Comparación case-insensitive y sin espacios extra
- **Marcas:** Comparación flexible (original y normalizada)

## 🔄 Modo Bulk

### Detección de Modo Bulk

El modo bulk se activa cuando:
- `tipo_proceso === 'propiedades_modelos'` Y
- `razon_social` está vacío o undefined

### Proceso Bulk

1. **Búsqueda de Razones Sociales:**
   ```javascript
   // Lee razones-sociales.json
   // Filtra por marca (comparación original y normalizada)
   // Retorna array de razones sociales
   ```

2. **Procesamiento Individual:**
   ```javascript
   for (razonSocial of razonesSocialesConMarca) {
     // Obtiene token
     // Crea cliente HubSpot
     // Procesa modelo
     // Registra estadísticas
   }
   ```

3. **Manejo de Errores:**
   - Errores parciales no fallan todo el proceso
   - Se registran en `bulkStats.errores`
   - Si al menos una razón social tiene éxito, no se lanza error general

### Estadísticas Bulk

```javascript
{
  total: 11,           // Total de razones sociales encontradas
  procesadas: 11,      // Total procesadas
  exitosas: 9,         // Actualizadas exitosamente
  fallidas: 2,         // Que fallaron completamente
  errores: [...]       // Detalle de errores
}
```

## 🛡️ Manejo de Errores

### Estrategia de Errores

1. **Errores de Validación:**
   - Se validan inputs al inicio
   - Se retornan mensajes descriptivos
   - `success: false` en la respuesta

2. **Errores de API:**
   - Se capturan y parsean
   - Se extraen mensajes específicos de HubSpot
   - Se incluyen opciones válidas cuando aplica

3. **Errores Parciales (Bulk):**
   - Se registran pero no fallan todo el proceso
   - Se retornan en `bulkErroresDetalle`
   - Si hay al menos un éxito, `success: true`

### Logging

Todos los endpoints usan `console.log` con prefijos:
- `[forward-lead]`: Endpoint de envío de leads
- `[bulk-models]`: Endpoint de bulk update
- `[workflow-action]`: Endpoint de configuración

Los logs se pueden ver en Vercel Dashboard → Functions → Logs

## 📊 Estadísticas y Métricas

### Stats Object

Cada proceso mantiene estadísticas:

```javascript
{
  propertiesCreated: 0,      // Propiedades creadas
  propertiesUpdated: 0,      // Propiedades actualizadas
  propertiesSkipped: 0,      // Propiedades omitidas
  optionsAdded: 0,           // Opciones agregadas
  createdProperties: [],     // Lista de propiedades creadas
  updatedProperties: [],     // Lista de propiedades actualizadas
  optionDetails: [],         // Detalle de opciones agregadas
  bulkResult: null           // Resultado de bulk (si aplica)
}
```

## 🔍 Búsqueda y Filtrado

### Búsqueda de Razones Sociales por Marca

```javascript
// Normalización para comparación
function normalizeMarcaForComparison(marca) {
  return marca.toLowerCase().trim();
}

// Búsqueda dual (original y normalizada)
const hasMarca = brands.some(b => {
  const matchOriginal = b === marca;
  const matchNormalized = normalizeMarcaForComparison(b) === marcaNormalized;
  return matchOriginal || matchNormalized;
});
```

### Búsqueda de Opciones Existentes

```javascript
// Normalización de opciones
function normalizeKey(value) {
  return typeof value === 'string' 
    ? value.toLowerCase().trim() 
    : '';
}

// Verificación de existencia
const existingKeys = new Set(
  existingOptions.map(opt => 
    normalizeKey(opt.value || opt.label || '')
  ).filter(Boolean)
);
```

## 🚀 Optimizaciones

### Carga de Archivos de Configuración

Los archivos de configuración se cargan con múltiples rutas de fallback:

```javascript
const paths = [
  path.join(__dirname, '../../src/config/razones-sociales.json'),
  path.join(__dirname, '../src/config/razones-sociales.json'),
  path.join(process.cwd(), 'src/config/razones-sociales.json'),
  '/var/task/src/config/razones-sociales.json',
  // ... más rutas
];
```

Si ningún archivo se encuentra, se usa un fallback hardcodeado con datos completos.

### Clientes HubSpot

Se crean clientes individuales por razón social en modo bulk:

```javascript
// Un cliente por razón social
const hubspotClient = new hubspot.Client({ 
  accessToken: process.env[tokenEnv] 
});
```

Esto permite procesar múltiples cuentas en paralelo sin conflictos.

## 🔐 Seguridad

### Validación de Entrada

- Todos los inputs se sanitizan con `sanitize()`
- Validación de parámetros requeridos según tipo de proceso
- Validación de formato de tokens

### Protección de Endpoints

- Vercel Protection Bypass token en URLs
- Validación de método HTTP (solo POST)
- Manejo seguro de errores (no expone tokens en logs)

### Variables de Entorno

- Tokens nunca se logean completos
- Solo se muestran previews (primeros/últimos caracteres)
- Variables sensibles en `.gitignore`

## 📝 Convenciones de Código

### Nombres de Propiedades

- Siempre lowercase
- Espacios → guiones bajos
- Formato: `modelo_{marca_normalizada}`

Ejemplo: "QJ Motor" → `modelo_qj_motor`

### Nombres de Variables de Entorno

- Formato: `{RAZON_SOCIAL}_TOKEN` o `{RAZON_SOCIAL}_KEY`
- Definidos en `razones-sociales.json` como `tokenEnv`
- Deben coincidir exactamente con variables en Vercel

### Estructura de Respuestas

Todas las respuestas siguen el formato:

```javascript
{
  success: true/false,
  message: "Mensaje descriptivo",
  // ... campos específicos según la acción
}
```

## 🧪 Testing

### Endpoints de Prueba

- `GET /api/{endpoint}`: Retorna estado del endpoint
- `POST /api/{endpoint}`: Ejecuta la funcionalidad

### Logs de Debugging

Los logs incluyen:
- Prefijos de contexto `[endpoint-name]`
- Información de debugging (marcas encontradas, razones sociales, etc.)
- Estadísticas antes/después de operaciones

## 🔍 Búsqueda de Deals en Check Lead Status

### Uso de dealer_deal_id

La acción `check-lead-status` usa **SIEMPRE** el `dealer_deal_id` del input para buscar el deal:

```javascript
// Obtiene dealer_deal_id del input
const dealerDealId = sanitize(inputFields.dealer_deal_id);

// Busca directamente usando este ID
deal = await hubspotClient.crm.deals.basicApi.getById(dealerDealId, [
  'dealname', 'dealstage', 'amount', 'closedate', 'pipeline', 
  'dealtype', 'marca_simpa', 'modelo_simpa', 'id_negocio_simpa'
]);

// Usa el mismo ID para obtener actividades
const activities = await getDealActivities(hubspotClient, dealerDealId);
```

**Características:**
- No hay fallback a búsqueda por `id_negocio_simpa`
- El `dealer_deal_id` debe ser el ID retornado por "Forward Lead To Dealer"
- Si el deal no existe, retorna error descriptivo indicando que debe usarse el ID correcto
- Todas las operaciones (deal info, stage, actividades) usan el mismo `dealer_deal_id`

### Validación de Conexión

Antes de buscar el deal, se valida la conexión:

```javascript
// Validar que el token funciona
await hubspotClient.crm.properties.coreApi.getAll('deals', { limit: 1 });
```

Esto asegura que el token es válido antes de intentar operaciones más complejas.

## 📊 Configuración de Pipelines de SIMPA

### Archivo `simpa-pipelines.json`

Este archivo contiene la configuración de pipelines y stages de SIMPA organizados por marca.

**Estructura:**
```json
{
  "MARCA": {
    "pipelineId": "id_del_pipeline_en_simpa",
    "pipelineLabel": "Nombre del Pipeline",
    "stages": [
      {
        "stageId": "id_del_stage",
        "stageLabel": "Nombre del Stage",
        "probability": 0.5
      }
    ]
  }
}
```

**Uso:**
- El endpoint `webhook-enrich` lee este archivo para mapear stages
- Busca la marca del deal (normalizada a mayúsculas)
- Compara la probability del stage del dealer con las probabilities de los stages de SIMPA
- Selecciona el stage con la probability más cercana
- Actualiza el deal en SIMPA con el pipeline y stage correctos

**Ejemplo de Mapeo:**
- Dealer stage: `appointmentscheduled` con probability `0.2`
- SIMPA stages para GASGAS: `[0.1, 0.3, 0.5, 1.0]`
- Resultado: Se mapea al stage con probability `0.1` (más cercano a `0.2`)

## 🔄 Actualizaciones Futuras

### Pendientes

1. **Pipeline Configuration:**
   - Implementar completamente `procesarPipelineNegocio`
   - Crear pipelines por marca automáticamente
   - Configurar etapas personalizadas

2. **Mejoras de Seguridad:**
   - Implementar HubSpot Signature Validation para webhooks
   - Remover Vercel Protection Bypass tokens
   - Usar variables de entorno para bypass tokens

3. **Optimizaciones:**
   - Cache de propiedades existentes
   - Procesamiento paralelo en bulk
   - Retry logic para errores transitorios
   - Cache de configuración de pipelines

4. **Funcionalidades Adicionales:**
   - Soporte para múltiples marcas en `simpa-pipelines.json`
   - Validación de configuración de pipelines
   - Logging mejorado para debugging de mapeo de stages

## 📚 Referencias

- [HubSpot Custom Workflow Actions](https://developers.hubspot.com/docs/api-reference/automation-actions-v4-v4/guide)
- [HubSpot CRM API](https://developers.hubspot.com/docs/api-reference/crm)
- [Vercel Serverless Functions](https://vercel.com/docs/functions)

## 📦 Gestión de Backups

Los backups se almacenan en `.backup/` con formato de timestamp:
```
.backup/backup-YYYYMMDD-HHMMSS/
```

**Proceso de backup:**
1. Excluye: `node_modules`, `.git`, `.backup`, `.env`, `*.log`, `.DS_Store`
2. Incluye: Todo el código fuente, configuraciones, documentación
3. Tamaño típico: ~600-700KB

**Último backup:** `backup-20251117-163627`

---

**Última actualización:** Noviembre 2025  
**Build más reciente:** #173

