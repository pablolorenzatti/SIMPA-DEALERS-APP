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
        const { period } = req.query;
        const stats = await AnalyticsService.getDashboardStats(period);
        res.status(200).json(stats);
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
