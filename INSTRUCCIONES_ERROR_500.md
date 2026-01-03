# 🔧 Solución al Error 500 - Webhook Enrich

## 🔍 Diagnóstico

El error **500 Internal Server Error (FUNCTION_INVOCATION_FAILED)** indica que el endpoint está accesible pero falla al ejecutarse.

### Causa Principal
**Falta el token de HubSpot en las variables de entorno de Vercel**

El endpoint `webhook-enrich` necesita un token de acceso de HubSpot para hacer llamadas a la API. Sin este token, falla con error 500.

## ✅ Solución Paso a Paso

### PASO 1: Ir a Vercel Dashboard
1. Abre https://vercel.com
2. Inicia sesión en tu cuenta
3. Ve a tu proyecto **"simpa-workflow-action"**
4. Haz clic en **Settings** → **Environment Variables**

### PASO 2: Agregar Variable de Entorno

Para el `portalId: 50104303` (TEST ACCOUNT), agrega una de estas variables:

**Opción A (Recomendada):**
- **Name:** `TEST_ACCOUNT_KEY`
- **Value:** `<tu_private_access_token_de_hubspot>`
- **Environment:** Marca **Production** (y Preview/Development si quieres)

**Opción B (Alternativa):**
- **Name:** `PORTAL_50104303_TOKEN`
- **Value:** `<tu_private_access_token_de_hubspot>`
- **Environment:** Marca **Production**

### PASO 3: Obtener el Token de HubSpot
1. Ve a tu cuenta de HubSpot (portalId 50104303)
2. Settings → Integrations → Private Apps
3. Crea o usa un Private App existente
4. Copia el **Private Access Token**
5. Pégalo en la variable de entorno en Vercel

**Permisos necesarios del token:**
- `crm.objects.deals.read`
- `crm.objects.contacts.read`
- `crm.pipelines.pipelines.read`

### PASO 4: Guardar y Esperar
1. Haz clic en **Save**
2. Vercel redeployeará automáticamente
3. Espera 1-2 minutos para que el despliegue se complete

### PASO 5: Probar Nuevamente

**URL actualizada (después del redespliegue):**
```
https://simpa-workflow-action-bj9di7vc3-pablo-lorenzattis-projects.vercel.app/api/webhook-enrich?x-vercel-protection-bypass=e4f3b1c6a9d8e7f0123456789abcdef0
```

**Payload de prueba:**
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

## ⚠️ Errores Posibles Después de Configurar el Token

### Error 404 - Deal no encontrado
Si recibes un 404, significa que el `objectId: 123` no existe en tu cuenta de HubSpot.
**Solución:** Usa un ID de deal real de tu cuenta.

### Error 401 - Token inválido
Si recibes un 401, el token no es válido o no tiene los permisos necesarios.
**Solución:** Verifica que el token sea correcto y tenga los permisos listados arriba.

### Error 500 - Otro error
Revisa los logs de Vercel para ver el error específico:
```bash
vercel logs simpa-workflow-action-bj9di7vc3-pablo-lorenzattis-projects.vercel.app
```

## 📝 Notas Importantes

1. **Bypass Token:** El token `e4f3b1c6a9d8e7f0123456789abcdef0` está expuesto. Considera removerlo antes de subir a GitHub.

2. **Portal IDs:** Solo 1 de 22 razones sociales tiene `portalId` configurado. Para otros portales, necesitas:
   - Agregar `portalId` en `razones-sociales.json`
   - Configurar la variable de entorno correspondiente en Vercel

3. **ObjectId Real:** El `objectId: 123` es solo de prueba. Usa un ID de deal real para probar correctamente.
