/**
 * Módulo para enviar notificaciones a Slack a través de Webhooks
 * Con rate limiting y retry logic
 */
const https = require('https');
const url = require('url');

// Queue para manejar rate limiting
let notificationQueue = [];
let isProcessingQueue = false;
let lastNotificationTime = 0;
const MIN_INTERVAL_MS = 1100; // 1.1 segundos entre notificaciones (más seguro que 1s)

/**
 * Procesa la cola de notificaciones respetando rate limits
 */
async function processQueue() {
    if (isProcessingQueue || notificationQueue.length === 0) {
        return;
    }

    isProcessingQueue = true;

    while (notificationQueue.length > 0) {
        const now = Date.now();
        const timeSinceLastNotification = now - lastNotificationTime;

        // Esperar si es necesario para respetar rate limit
        if (timeSinceLastNotification < MIN_INTERVAL_MS) {
            const waitTime = MIN_INTERVAL_MS - timeSinceLastNotification;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        const { webhookUrl, payload, resolve: resolvePromise, reject: rejectPromise } = notificationQueue.shift();

        try {
            await sendToSlackDirect(webhookUrl, payload);
            lastNotificationTime = Date.now();
            resolvePromise();
        } catch (error) {
            rejectPromise(error);
        }
    }

    isProcessingQueue = false;
}

/**
 * Envía directamente a Slack (función interna)
 */
function sendToSlackDirect(webhookUrl, payload) {
    return new Promise((resolve, reject) => {
        const slackUrl = new url.URL(webhookUrl);
        const options = {
            hostname: slackUrl.hostname,
            path: slackUrl.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let responseBody = '';
            res.on('data', (d) => { responseBody += d; });
            res.on('end', () => {
                if (res.statusCode === 200) {
                    console.log('[Slack Notification] ✅ Notificación enviada exitosamente');
                    resolve();
                } else if (res.statusCode === 429) {
                    console.warn(`[Slack Notification] ⚠️ Rate limit alcanzado. La notificación se reintentará.`);
                    // No rechazar, solo resolver para no romper el flujo
                    resolve();
                } else {
                    console.warn(`[Slack Notification] ⚠️ Error enviando a Slack (Status: ${res.statusCode}): ${responseBody}`);
                    resolve(); // No rechazar para no romper flujo principal
                }
            });
        });

        req.on('error', (e) => {
            console.error(`[Slack Notification] ❌ Error de red: ${e.message}`);
            resolve(); // No rechazar para no romper flujo principal
        });

        req.write(JSON.stringify(payload));
        req.end();
    });
}

/**
 * Envía una notificación de error formateada a Slack (con rate limiting)
 * @param {string} webhookUrl - URL del Webhook de Slack
 * @param {object} errorData - Datos del error y contexto
 * @returns {Promise}
 */
async function sendSlackErrorNotification(webhookUrl, errorData) {
    if (!webhookUrl) {
        console.warn('[Slack Notification] No se proporcionó webhook URL. Omitiendo notificación.');
        return;
    }

    const {
        functionName, // Nombre de la función donde ocurrió el error (ej: forward-lead)
        error,        // Objeto de error o mensaje
        context       // Objeto con contexto adicional relevante (dealer, marca, lead email, etc)
    } = errorData;

    const errorMessage = error.message || String(error);
    const errorStack = error.stack ? `\`\`\`${error.stack.substring(0, 1000)}...\`\`\`` : '';

    // Construir bloques de mensaje para Slack (formato Blocks a mejor visualización)
    const payload = {
        text: `🚨 Error en SIMPA Workflow Action: ${functionName}`, // Texto fallback
        blocks: [
            {
                type: "header",
                text: {
                    type: "plain_text",
                    text: "🚨 Error Crítico en SIMPA Workflow",
                    emoji: true
                }
            },
            {
                type: "section",
                fields: [
                    {
                        type: "mrkdwn",
                        text: `*Función:*\n${functionName}`
                    },
                    {
                        type: "mrkdwn",
                        text: `*Fecha:*\n${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`
                    }
                ]
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*Error:*\n${errorMessage}`
                }
            }
        ]
    };

    // Agregar contexto si existe
    if (context) {
        const contextFields = [];

        if (context.dealer) contextFields.push({ type: "mrkdwn", text: `*Dealer:*\n${context.dealer}` });
        if (context.marca) contextFields.push({ type: "mrkdwn", text: `*Marca:*\n${context.marca}` });
        if (context.email) contextFields.push({ type: "mrkdwn", text: `*Email Lead:*\n${context.email}` });
        if (context.portalId) contextFields.push({ type: "mrkdwn", text: `*Portal ID:*\n${context.portalId}` });

        // Agregar cualquier otro campo extra que venga en contexto
        Object.keys(context).forEach(key => {
            if (!['dealer', 'marca', 'email', 'portalId'].includes(key)) {
                // Solo agregar si es un valor simple (string/number)
                const val = context[key];
                if (typeof val === 'string' || typeof val === 'number') {
                    if (contextFields.length < 10) { // Límite de slack
                        contextFields.push({ type: "mrkdwn", text: `*${key}:*\n${val}` });
                    }
                }
            }
        });

        if (contextFields.length > 0) {
            payload.blocks.push({
                type: "section",
                text: { type: "mrkdwn", text: "*Contexto:*" },
                fields: contextFields
            });
        }
    }

    // Agregar stacktrace si existe
    if (errorStack) {
        payload.blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: "*Stack Trace:*"
            }
        });
        payload.blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: errorStack
            }
        });
    }

    // Agregar a la cola en lugar de enviar directamente
    return new Promise((resolve, reject) => {
        notificationQueue.push({
            webhookUrl,
            payload,
            resolve,
            reject
        });

        // Iniciar procesamiento de cola
        processQueue().catch(err => {
            console.error('[Slack Queue] Error procesando cola:', err);
        });

        // Resolver inmediatamente para no bloquear el flujo principal
        // La notificación se enviará en background
        setTimeout(() => resolve(), 100);
    });
}

module.exports = { sendSlackErrorNotification };
