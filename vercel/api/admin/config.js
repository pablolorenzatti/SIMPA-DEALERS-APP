const ConfigService = require('../services/config-service');

// Simple Basic Auth middleware logic
function isAuthenticated(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return false;

    const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
    const user = auth[0];
    const pass = auth[1];

    // Usuario y contraseña hardcodeados para simplicidad inicial o variables de entorno
    // TODO: Mover a variables de entorno para producción real
    const ADMIN_USER = process.env.ADMIN_USER || 'admin';
    const ADMIN_PASS = process.env.ADMIN_PASS || 'simpa2025';

    return user === ADMIN_USER && pass === ADMIN_PASS;
}

module.exports = async (req, res) => {
    // CORS Headers para permitir desarrollo local si fuera necesario
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Verificar autenticación
    if (!isAuthenticated(req)) {
        res.setHeader('WWW-Authenticate', 'Basic realm="SIMPA Admin"');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        if (req.method === 'GET') {
            // Devolver ambas configuraciones
            const razonesSociales = await ConfigService.getRazonesSociales();
            const modelsByBrand = await ConfigService.getModelsByBrand();

            return res.status(200).json({
                razonesSociales,
                modelsByBrand
            });
        }

        if (req.method === 'POST') {
            const { type, data } = req.body;

            if (!data) {
                return res.status(400).json({ error: 'Data is required' });
            }

            if (type === 'razonesSociales') {
                await ConfigService.saveRazonesSociales(data);
                return res.status(200).json({ success: true, message: 'Razones Sociales updated' });
            }

            if (type === 'modelsByBrand') {
                await ConfigService.saveModelsByBrand(data);
                return res.status(200).json({ success: true, message: 'Models updated' });
            }

            return res.status(400).json({ error: 'Invalid config type' });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('[AdminAPI] Error:', error);
        return res.status(500).json({ error: error.message });
    }
};
