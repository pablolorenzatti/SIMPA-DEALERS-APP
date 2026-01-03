# Webhook Enrich - Funcionamiento Completo

## 📋 Resumen

El endpoint `webhook-enrich` recibe webhooks de HubSpot, enriquece la información del deal y contactos asociados, y actualiza automáticamente la información en SIMPA cuando existe un `idNegocioSimpa`.

## 🔄 Flujo Completo

### 1. Recepción del Webhook

El endpoint recibe un webhook de HubSpot con el siguiente formato:

```json
{
  "appId": 23431355,
  "eventId": 100,
  "subscriptionId": 4688180,
  "portalId": 50104303,
  "occurredAt": 1763411205926,
  "subscriptionType": "deal.propertyChange",
  "attemptNumber": 0,
  "objectId": 49478055588,
  "changeSource": "CRM",
  "propertyName": "dealstage",
  "propertyValue": "qualifiedtobuy"
}
```

**Validaciones:**
- Verifica que existan `portalId` y `objectId`
- Valida el método HTTP (solo POST)

### 2. Obtención de Token de Acceso

El endpoint busca el token de acceso de HubSpot según el `portalId` recibido:

1. **Busca en `razones-sociales.json`** por `portalId`
2. **Obtiene `tokenEnv`** de la razón social encontrada
3. **Lee la variable de entorno** correspondiente en Vercel
4. **Fallbacks:**
   - `PORTAL_{portalId}_TOKEN`
   - `HUBSPOT_ACCESS_TOKEN` (genérico)

**Ejemplo:**
- `portalId: 50104303` → Busca en `razones-sociales.json`
- Encuentra `"TEST ACCOUNT"` con `tokenEnv: "TEST_ACCOUNT_KEY"`
- Lee `process.env.TEST_ACCOUNT_KEY`

### 3. Enriquecimiento de Datos

El endpoint obtiene información adicional desde HubSpot:

#### 3.1. Información del Deal
- Nombre del deal
- Monto (`amount`)
- Fecha de cierre (`closedate`)
- Tipo de deal (`dealtype`)
- Marca (`marca_simpa`)
- Modelo (`modelo_simpa`)
- Concesionario (`concesionarios_simpa`)
- **ID Negocio SIMPA (`id_negocio_simpa`)** ⭐
- Fechas de creación y actualización

#### 3.2. Información de Pipeline y Stage
- ID y label del pipeline
- ID y label del stage
- Probabilidad del stage
- Orden de visualización

#### 3.3. Contactos Asociados
- Hasta 10 contactos asociados al deal
- Información de cada contacto:
  - Nombre, apellido, email, teléfono
  - Marca y modelo de interés

### 4. Actualización en SIMPA ⭐ (NUEVO)

Si el deal tiene un `idNegocioSimpa`, el endpoint actualiza automáticamente la información en SIMPA.

#### 4.1. Verificación
```javascript
if (enrichedPayload.enrichedData.dealInfo.idNegocioSimpa) {
  // Actualizar SIMPA
}
```

#### 4.2. Configuración Requerida

**Variables de entorno en Vercel:**
- `SIMPA_API_URL`: URL del endpoint de SIMPA para actualizar negocios
  - Ejemplo: `https://api.simpa.com/negocios/update`
- `SIMPA_API_TOKEN` (opcional): Token de autenticación
  - O `SIMPA_ACCESS_TOKEN`

#### 4.3. Payload Enviado a SIMPA

```json
{
  "idNegocio": "4990947-0-3-49633068845",
  "dealInfo": {
    "name": "test gas gas Test - GASGAS Córdoba",
    "amount": null,
    "closeDate": null,
    "dealType": null,
    "marca": "GASGAS",
    "modelo": "MC 125",
    "concesionario": "GASGAS Córdoba",
    "updatedAt": "2025-11-20T17:57:01.437Z"
  },
  "pipelineStage": {
    "pipelineId": "default",
    "pipelineLabel": "Sales Pipeline",
    "stageId": "appointmentscheduled",
    "stageLabel": "Appointment Scheduled",
    "probability": "0.2"
  },
  "propertyChanged": {
    "name": "dealstage",
    "oldValue": "qualifiedtobuy",
    "newValue": "appointmentscheduled"
  },
  "contactsCount": 0,
  "updatedAt": "2025-11-22T14:05:40.256Z"
}
```

#### 4.4. Método HTTP
- **Por defecto:** `PUT`
- Puede cambiarse a `POST` según la API de SIMPA

#### 4.5. Autenticación
Si `SIMPA_API_TOKEN` está configurado, se envía como:
```
Authorization: Bearer {token}
```

O alternativamente:
```
X-API-Key: {token}
```

#### 4.6. Manejo de Errores
- Si falla la actualización en SIMPA, **no interrumpe el flujo principal**
- El error se registra en logs
- La respuesta incluye el resultado de la actualización en `simpaUpdate`

### 5. Respuesta

El endpoint retorna:

```json
{
  "status": "success",
  "message": "Webhook enriquecido exitosamente",
  "enrichedPayload": {
    "originalWebhook": { ... },
    "enrichedData": {
      "dealInfo": { ... },
      "pipelineStage": { ... },
      "associatedContacts": [ ... ],
      "contactsCount": 0,
      "propertyChanged": { ... }
    },
    "enrichmentMetadata": { ... }
  },
  "simpaUpdate": {
    "success": true,
    "response": { ... },
    "statusCode": 200
  }
}
```

## 🔧 Configuración

### Variables de Entorno en Vercel

#### Requeridas para HubSpot:
- `TEST_ACCOUNT_KEY` (o `PORTAL_{portalId}_TOKEN`)
- O `HUBSPOT_ACCESS_TOKEN` (genérico)

#### Requeridas para SIMPA:
- `SIMPA_API_URL`: URL del endpoint de SIMPA
- `SIMPA_API_TOKEN` (opcional): Token de autenticación

### Configuración en `razones-sociales.json`

Cada razón social debe tener:
```json
{
  "TEST ACCOUNT": {
    "portalId": "50104303",
    "tokenEnv": "TEST_ACCOUNT_KEY",
    "brands": [],
    "dealers": []
  }
}
```

## 📊 Logs

El endpoint genera logs detallados:

```
[webhook-enrich] 📥 Webhook recibido:
[webhook-enrich]   Tipo: deal.propertyChange
[webhook-enrich]   Portal ID: 50104303
[webhook-enrich]   Object ID: 49478055588
[webhook-enrich] 🔍 Obteniendo token para portalId: 50104303
[webhook-enrich] ✅ Token obtenido desde TEST_ACCOUNT_KEY
[webhook-enrich] 🔍 Obteniendo información del deal...
[webhook-enrich] 🔍 Obteniendo información de pipeline/stage...
[webhook-enrich] 🔍 Obteniendo contactos asociados...
[webhook-enrich] ✅ Payload enriquecido creado
[webhook-enrich]   idNegocioSimpa: 4990947-0-3-49633068845
[webhook-enrich] 🔄 Actualizando negocio en SIMPA: 4990947-0-3-49633068845
[webhook-enrich] ✅ SIMPA actualizado exitosamente
```

## ⚠️ Manejo de Errores

### Errores de Token
- **401 Unauthorized**: Token no encontrado o inválido
- Mensaje detallado con instrucciones

### Errores de Deal
- **404 Not Found**: Deal no encontrado en HubSpot
- Mensaje con `portalId` y `objectId`

### Errores de SIMPA
- **No crítico**: Si falla, no interrumpe el flujo
- Se registra en logs y en la respuesta

## 🚀 Uso

### URL del Endpoint
```
https://simpa-workflow-action-XXXXX.vercel.app/api/webhook-enrich?x-vercel-protection-bypass={token}
```

### Ejemplo de Request
```bash
curl -X POST \
  "https://simpa-workflow-action-XXXXX.vercel.app/api/webhook-enrich?x-vercel-protection-bypass={token}" \
  -H "Content-Type: application/json" \
  -d '{
    "portalId": 50104303,
    "objectId": 49478055588,
    "subscriptionType": "deal.propertyChange",
    "propertyName": "dealstage",
    "propertyValue": "qualifiedtobuy"
  }'
```

## 📝 Notas Importantes

1. **`idNegocioSimpa` es opcional**: Si no existe, el endpoint funciona normalmente sin actualizar SIMPA
2. **Actualización no bloqueante**: Si falla la actualización en SIMPA, el webhook se procesa igualmente
3. **Método HTTP configurable**: Por defecto usa `PUT`, pero puede cambiarse según la API de SIMPA
4. **Autenticación flexible**: Soporta Bearer token o API Key según la configuración

