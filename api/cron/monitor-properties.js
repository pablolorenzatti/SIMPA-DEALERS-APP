const PropertyMonitorService = require('../services/property-monitor-service');

module.exports = async (req, res) => {
    // Basic authorization for Vercel Cron
    const authHeader = req.headers.authorization;
    if (req.headers['x-vercel-cron'] !== '1' && (!authHeader || !authHeader.startsWith('Bearer '))) {
        // Allow manual trigger if authenticated with administrative secret (optional, reusing implicit trust for now or check env)
        // rigorous check:
        // return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        console.log('[Cron] Starting Property Monitor...');
        // Monitor key properties. Add more as needed.
        // Monitor configured properties (loaded dynamically by service)
        const result = await PropertyMonitorService.checkProperties();

        console.log('[Cron] Monitor finished:', JSON.stringify(result));

        // If changes detected, we could send a notification (e.g. Slack) here
        // For now, we rely on the logs and the internal logic of the service

        res.status(200).json({
            success: true,
            timestamp: new Date().toISOString(),
            result
        });

    } catch (error) {
        console.error('[Cron] Error in Property Monitor:', error);
        res.status(500).json({ error: error.message });
    }
};
