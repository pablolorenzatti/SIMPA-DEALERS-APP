const AnalyticsService = require('../services/analytics-service');

module.exports = async (req, res) => {
    // Basic Authentication (Copy of admin/index.js logic)
    const auth = req.headers.authorization;
    const user = process.env.ADMIN_USER || 'admin';
    const pass = process.env.ADMIN_PASS || 'simpa2025';
    const expectedAuth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

    if (!auth || auth !== expectedAuth) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    res.setHeader('Cache-Control', 'no-store, max-age=0');

    try {
        if (req.method === 'POST') {
            const { action } = req.body;
            if (action === 'clear') {
                const result = await AnalyticsService.clearHistory();
                return res.json(result);
            }
            if (action === 'restore') {
                const result = await AnalyticsService.restoreHistory();
                return res.json(result);
            }
            return res.status(400).json({ error: 'Invalid action' });
        }

        const { period, includeHistory } = req.query;
        const stats = await AnalyticsService.getDashboardStats(period, includeHistory === 'true');
        res.status(200).json(stats);
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
