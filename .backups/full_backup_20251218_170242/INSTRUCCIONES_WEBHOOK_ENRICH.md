# 🚀 Instrucciones para Probar Webhook-Enrich

## 🔐 Error 401 - Solución

El error **401 Unauthorized** es porque el endpoint está protegido con **Vercel Authentication**.

### Solución: Agregar Bypass Token

Agrega el siguiente query parameter a tu URL:

```
?x-vercel-protection-bypass=e4f3b1c6a9d8e7f0123456789abcdef0
```

### URL Completa para Probar

```
https://simpa-workflow-action-gyi60eft2-pablo-lorenzattis-projects.vercel.app/api/webhook-enrich?x-vercel-protection-bypass=e4f3b1c6a9d8e7f0123456789abcdef0
```

## 📝 Configuración en Postman/API Client

### Opción 1: Query Parameters
1. Ve a la pestaña **Params** o **Query**
2. Agrega:
   - **Key:** `x-vercel-protection-bypass`
   - **Value:** `e4f3b1c6a9d8e7f0123456789abcdef0`

### Opción 2: URL Directa
Agrega el parámetro directamente en la URL:
```
.../api/webhook-enrich?x-vercel-protection-bypass=e4f3b1c6a9d8e7f0123456789abcdef0
```

## 📋 Payload de Ejemplo

```json
{
  "appId": 23432893,
  "eventId": 100,
  "subscriptionId": 4688180,
  "portalId": 50104303,
  "occurredAt": 1763411205926,
  "subscriptionType": "deal.propertyChange",
  "attemptNumber": 0,
  "objectId": 123,
  "changeSource": "CRM",
  "propertyName": "dealstage",
  "propertyValue": "appointmentscheduled"
}
```

## ⚙️ Variables de Entorno en Vercel

Para que el webhook funcione correctamente, también necesitas configurar el token de HubSpot en Vercel:

### Para portalId 50104303 (TEST ACCOUNT):
- **Variable:** `TEST_ACCOUNT_KEY` (según razones-sociales.json)
- **O alternativamente:** `PORTAL_50104303_TOKEN`
- **Valor:** Tu Private Access Token de HubSpot para esa cuenta

### Cómo configurar en Vercel:
1. Ve a tu proyecto en Vercel
2. Settings → Environment Variables
3. Agrega la variable con el nombre y valor correspondiente
4. Selecciona los ambientes (Production, Preview, Development)
5. Guarda y redeploy si es necesario

## 🧪 Pruebas Esperadas

### GET (Health Check)
Debería retornar:
```json
{
  "status": "ok",
  "message": "Webhook enrich endpoint is running",
  "timestamp": "2025-11-21T..."
}
```

### POST (Webhook Processing)
Si el token está configurado correctamente, debería retornar:
```json
{
  "status": "success",
  "message": "Webhook enriquecido exitosamente",
  "enrichedPayload": {
    "originalWebhook": {...},
    "enrichedData": {
      "dealInfo": {...},
      "pipelineStage": {...},
      "associatedContacts": [...]
    }
  }
}
```

Si falta el token de HubSpot, recibirás un error indicando que no se pudo obtener el token.

## ⚠️ Notas Importantes

1. **Bypass Token:** El token `e4f3b1c6a9d8e7f0123456789abcdef0` está expuesto en los `actionUrl` de las custom actions. Considera removerlo antes de subir a GitHub.

2. **Portal IDs:** Solo 1 de 22 razones sociales tiene `portalId` configurado. Para que webhook-enrich funcione con otros portales, necesitas:
   - Agregar `portalId` en `razones-sociales.json`
   - Configurar la variable de entorno correspondiente en Vercel

3. **Producción:** Para webhooks reales de HubSpot, considera configurar la protección de Vercel de manera diferente o usar un webhook secret para validar las peticiones.

