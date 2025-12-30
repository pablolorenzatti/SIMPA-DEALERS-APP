/**
 * Script de prueba para verificar notificaciones de Slack
 */
const { sendSlackErrorNotification } = require('./api/_utils/slack-notifier');

// URL del webhook desde variable de entorno
const SLACK_WEBHOOK_URL = process.env.SLACK_ERROR_WEBHOOK_URL;

if (!SLACK_WEBHOOK_URL) {
    console.error('❌ Error: SLACK_ERROR_WEBHOOK_URL no está configurada');
    console.log('💡 Configúrala con: export SLACK_ERROR_WEBHOOK_URL="tu-webhook-url"');
    process.exit(1);
}

async function testSlackNotification() {
    console.log('🧪 Iniciando prueba de notificación Slack...\n');

    try {
        // Simular un error de prueba
        const testError = new Error('Este es un error de prueba desde el script de testing');
        testError.stack = 'Error: Este es un error de prueba\n    at testSlackNotification (/test-slack-notification.js:15:25)';

        const testContext = {
            dealer: 'DEALER DE PRUEBA',
            marca: 'KTM',
            email: 'test@example.com',
            razon_social: 'MOTO MORINI SAN ISIDRO',
            portalId: '123456789',
            testMode: true,
            timestamp: new Date().toISOString()
        };

        console.log('📤 Enviando notificación de prueba a Slack...');
        console.log('📍 Webhook URL:', SLACK_WEBHOOK_URL.substring(0, 50) + '...');
        console.log('📋 Contexto:', JSON.stringify(testContext, null, 2));
        console.log('');

        await sendSlackErrorNotification(SLACK_WEBHOOK_URL, {
            functionName: 'test-slack-notification (PRUEBA)',
            error: testError,
            context: testContext
        });

        console.log('✅ Notificación enviada exitosamente!');
        console.log('👀 Revisa tu canal de Slack para verificar que llegó el mensaje.\n');

    } catch (error) {
        console.error('❌ Error enviando notificación de prueba:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Ejecutar prueba
testSlackNotification()
    .then(() => {
        console.log('🎉 Prueba completada');
        process.exit(0);
    })
    .catch((err) => {
        console.error('💥 Error fatal:', err);
        process.exit(1);
    });
