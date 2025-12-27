const { createClient } = require('@vercel/kv');


// Cliente KV para Analytics (Reutiliza lógica de conexión si es posible, o crea nueva)
// Copiamos lógica de conexión segura para no depender de exportaciones privadas
function getKvClient() {
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (url && token && url.startsWith('http')) {
        return createClient({ url, token });
    }
    return null;
}

const kv = getKvClient();

const KEYS = {
    RECENT_LOGS: 'analytics:logs:recent', // List
    DAILY_STATS: 'analytics:stats:daily:', // Hash por fecha (YYYY-MM-DD)
    GLOBAL_STATS: 'analytics:stats:global' // Hash acumulado
};

const MAX_LOGS = 100; // Guardar últimos 100 eventos detallados

const AnalyticsService = {

    /**
     * Registra un evento de procesamiento de lead
     * @param {Object} data - Datos del evento
     * @param {string} data.status - 'success' | 'error'
     * @param {string} data.dealer - Nombre del dealer
     * @param {string} data.brand - Marca detectada
     * @param {string} data.razonSocial - Razón social asignada
     * @param {string} data.hsDealId - ID del deal en HubSpot (si existe)
     * @param {string} data.error - Mensaje de error (si existe)
     */
    async logEvent(data) {
        if (!kv) {
            console.warn('[Analytics] KV no disponible. No se guardaron métricas.');
            return;
        }

        const now = new Date();
        const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
        const timestamp = now.toISOString();

        const logEntry = {
            id: Date.now().toString(36),
            ts: timestamp,
            status: data.status,
            dealer: data.dealer || 'Unknown',
            brand: data.brand || 'N/A',
            razon: data.razonSocial || 'N/A',
            dealId: data.hsDealId,
            link: data.hsDealId && data.portalId ? `https://app.hubspot.com/contacts/${data.portalId}/deal/${data.hsDealId}` : null,
            error: data.error,
            details: data.details || null // Store extra context (payload, contactId, etc)
        };

        try {
            const pipeline = kv.pipeline();

            // 1. Agregar a Log Reciente (LPUSH + LTRIM)
            pipeline.lpush(KEYS.RECENT_LOGS, logEntry);
            pipeline.ltrim(KEYS.RECENT_LOGS, 0, MAX_LOGS - 1);

            // 2. Actualizar Estadísticas Diarias
            const dailyKey = KEYS.DAILY_STATS + dateStr;
            pipeline.hincrby(dailyKey, 'total', 1);
            if (data.status === 'success') {
                pipeline.hincrby(dailyKey, 'success', 1);
            } else {
                pipeline.hincrby(dailyKey, 'error', 1);
            }

            // Incrementar contador por marca
            if (data.brand) {
                pipeline.hincrby(dailyKey, `brand:${data.brand}`, 1);
            }

            // Expirar la key diaria en 30 días para limpieza automática
            pipeline.expire(dailyKey, 60 * 60 * 24 * 30);

            await pipeline.exec();
            // console.log('[Analytics] Evento registrado corectamente');

        } catch (error) {
            console.error('[Analytics] Error guardando métricas:', error);
        }
    },

    /**
     * Obtiene los datos para el dashboard
     */
    async getDashboardStats(period = 'today', includeHistory = false) {
        if (!kv) return { error: 'KV no configurado' };

        // Helper to get date string in Argentina Timezone (UTC-3)
        const getArgDate = (d) => {
            const offset = -3;
            const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
            const nd = new Date(utc + (3600000 * offset));
            return nd.toISOString().split('T')[0];
        };

        const now = new Date();
        const todayStr = getArgDate(now);

        try {
            // Get recent logs
            let logs = await kv.lrange(KEYS.RECENT_LOGS, 0, MAX_LOGS - 1);

            if (includeHistory) {
                // Find backup keys
                const backupKeys = await kv.keys(KEYS.RECENT_LOGS + ':backup:*');
                if (backupKeys && backupKeys.length > 0) {
                    const pipeline = kv.pipeline();
                    backupKeys.forEach(k => pipeline.lrange(k, 0, MAX_LOGS - 1));
                    const backupResults = await pipeline.exec();

                    // Merge results
                    backupResults.forEach(backupLogs => {
                        if (Array.isArray(backupLogs)) {
                            logs = logs.concat(backupLogs);
                        }
                    });

                    // Deduplicate based on ID just in case
                    const uniqueLogs = new Map();
                    logs.forEach(l => { if (l.id) uniqueLogs.set(l.id, l); });

                    logs = Array.from(uniqueLogs.values());

                    // Sort by timestamp descending
                    logs.sort((a, b) => new Date(b.ts) - new Date(a.ts));

                    // Limit to avoid sending huge payload
                    logs = logs.slice(0, 500);
                }
            }

            // Calculate Date Range based on period
            let daysToFetch = 1;
            let startDate = new Date(); // cloning now

            if (period === 'yesterday') {
                startDate.setDate(startDate.getDate() - 1);
                daysToFetch = 1;
            } else if (period === '7d') {
                startDate.setDate(startDate.getDate() - 6);
                daysToFetch = 7;
            } else if (period === '30d') {
                startDate.setDate(startDate.getDate() - 29);
                daysToFetch = 30;
            } else {
                // today or default
                daysToFetch = 1;
            }

            // Aggregate stats for the requested range
            const aggregatedStats = { total: 0, success: 0, error: 0 };
            const history = [];

            // If periods > 1 (e.g. 7d, 30d), specifically fetch those keys
            // If period is 'yesterday', just fetch yesterday

            // Generate list of dates to fetch
            const datesToFetch = [];
            // We need to iterate from startDate to (msg) today/yesterday
            // Actually simpler: iterate 'daysToFetch' times backwards from EndDate

            // Determine EndDate
            const endDate = (period === 'yesterday') ? new Date(new Date().setDate(new Date().getDate() - 1)) : new Date();

            for (let i = 0; i < daysToFetch; i++) {
                const d = new Date(endDate);
                d.setDate(d.getDate() - i);
                datesToFetch.push(getArgDate(d));
            }

            // Use pipeline for performance
            const pipeline = kv.pipeline();
            datesToFetch.forEach(date => {
                pipeline.hgetall(KEYS.DAILY_STATS + date);
            });

            const results = await pipeline.exec(); // Returns array of results in order

            // Process results (reverse to have chronological order if needed, but for aggregation order doesn't matter)
            // But for history array we want chronological

            // Combine dates and results
            const periodData = datesToFetch.map((date, index) => ({
                date,
                data: results[index] || { total: 0, success: 0, error: 0 }
            }));

            // Fetch current active offset if we are NOT showing history
            let offsetData = null;
            if (!includeHistory) {
                offsetData = await kv.get('analytics:stats:offset:current');
            }

            // Aggregate
            periodData.forEach(item => {
                let s = { ...item.data };

                // Apply offset subtraction if applicable (only for the specific date of the snapshot)
                if (offsetData && item.date === offsetData.date) {
                    s.total = Math.max(0, parseInt(s.total || 0) - parseInt(offsetData.total || 0));
                    s.success = Math.max(0, parseInt(s.success || 0) - parseInt(offsetData.success || 0));
                    s.error = Math.max(0, parseInt(s.error || 0) - parseInt(offsetData.error || 0));
                }

                aggregatedStats.total += parseInt(s.total || 0);
                aggregatedStats.success += parseInt(s.success || 0);
                aggregatedStats.error += parseInt(s.error || 0);
            });

            // For graphs, we return the data chronologically
            const historyChronological = periodData.reverse();

            return {
                summary: {
                    period: period,
                    stats: aggregatedStats,
                    lastUpdated: new Date().toISOString()
                },
                history: historyChronological,
                recentLogs: logs
            };

        } catch (error) {
            console.error('[Analytics] Error leyendo stats:', error);
            return { error: 'Error leyendo base de datos' };
        }
    },

    /**
     * Resets current metrics by moving them to a backup key.
     */
    async clearHistory() {
        if (!kv) return { error: 'KV no configurado' };
        try {
            const timestamp = Date.now();
            const backupSuffix = `:backup:${timestamp}`;

            // 1. Rename Recent Logs
            const logsExists = await kv.exists(KEYS.RECENT_LOGS);
            if (logsExists) {
                await kv.rename(KEYS.RECENT_LOGS, KEYS.RECENT_LOGS + backupSuffix);
                // Store backup key reference
                await kv.set('analytics:backup:last_ref', timestamp);
            }

            // 2. Snapshot current Stats to use as Offset (to make them appear as 0)
            const now = new Date();
            const getArgDate = (d) => {
                const offset = -3;
                const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
                const nd = new Date(utc + (3600000 * offset));
                return nd.toISOString().split('T')[0];
            };
            const dailyKey = KEYS.DAILY_STATS + getArgDate(now);
            const currentStats = await kv.hgetall(dailyKey);

            if (currentStats) {
                // Save this snapshot as the "zero point" for the current view
                const offsetKey = 'analytics:stats:offset:current';
                await kv.set(offsetKey, { ...currentStats, date: getArgDate(now) });
            }

            return { success: true, backupId: timestamp, message: 'History cleared' };
        } catch (error) {
            console.error('[Analytics] Error clearing history:', error);
            return { error: error.message };
        }
    },

    /**
     * Restore logs from the last backup.
     */
    async restoreHistory() {
        if (!kv) return { error: 'KV no configurado' };
        try {
            const lastBackupTs = await kv.get('analytics:backup:last_ref');
            if (!lastBackupTs) return { success: false, message: 'No backup found' };

            const backupKey = KEYS.RECENT_LOGS + `:backup:${lastBackupTs}`;
            const exists = await kv.exists(backupKey);

            if (exists) {
                // If current logs exist, maybe merge? Or just overwrite?
                // Overwrite seems safer for "Undo" functionality.
                await kv.del(KEYS.RECENT_LOGS); // clear current "fresh" logs
                await kv.rename(backupKey, KEYS.RECENT_LOGS); // restore old ones

                // Clear offset to restore global stats visibility
                await kv.del('analytics:stats:offset:current');

                return { success: true, message: 'History restored' };
            }
            return { success: false, message: 'Backup key not found' };
        } catch (error) {
            console.error('[Analytics] Error restoring history:', error);
            return { error: error.message };
        }
    }
};

module.exports = AnalyticsService;
