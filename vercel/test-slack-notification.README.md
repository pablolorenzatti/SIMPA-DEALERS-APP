# 🧪 Script de Prueba de Notificaciones Slack

Este script permite probar que las notificaciones de Slack están funcionando correctamente.

## Uso

### 1. Configurar la variable de entorno

```bash
export SLACK_ERROR_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
```

### 2. Ejecutar el script

```bash
cd vercel
node test-slack-notification.js
```

### 3. Verificar en Slack

Deberías recibir una notificación de prueba en tu canal de Slack configurado.

## Ejemplo de salida exitosa

```
🧪 Iniciando prueba de notificación Slack...

📤 Enviando notificación de prueba a Slack...
📍 Webhook URL: https://hooks.slack.com/services/...
📋 Contexto: {
  "dealer": "DEALER DE PRUEBA",
  "marca": "KTM",
  ...
}

[Slack Notification] ✅ Notificación enviada exitosamente
✅ Notificación enviada exitosamente!
👀 Revisa tu canal de Slack para verificar que llegó el mensaje.

🎉 Prueba completada
```

## Solución de Problemas

### Error 429 (Rate Limit)
Si recibes un error 429, significa que has alcanzado el límite de tasa de Slack (1 mensaje/segundo).
El nuevo sistema de cola debería manejar esto automáticamente.

### Variable no configurada
Si ves el error "SLACK_ERROR_WEBHOOK_URL no está configurada", asegúrate de exportar la variable de entorno antes de ejecutar el script.
