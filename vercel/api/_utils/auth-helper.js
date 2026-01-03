const jwt = require('jsonwebtoken');
const cookie = require('cookie');

const JWT_SECRET = process.env.JWT_SECRET || process.env.SIMPA_HUBSPOT_API_TOKEN || 'fallback-secret-simpa-2025'; // Fallback for dev
const COOKIE_NAME = 'simpa_auth_token';

module.exports = {
    COOKIE_NAME,

    /**
     * Signs a JWT for the user
     */
    signToken(payload) {
        return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
    },

    /**
     * Verifies the request authentication (Cookie)
     * Returns decoded token or null
     */
    verifyRequest(req) {
        try {
            const cookies = cookie.parse(req.headers.cookie || '');
            const token = cookies[COOKIE_NAME];

            if (!token) return null;

            return jwt.verify(token, JWT_SECRET);
        } catch (e) {
            return null;
        }
    },

    /**
     * Generates the Hubspot OAuth URL
     */
    getAuthorizationUrl(host) {
        const clientId = process.env.HUBSPOT_CLIENT_ID;
        // Construct redirect URI dynamically based on host, or use env var
        const redirectUri = process.env.HUBSPOT_REDIRECT_URI || `https://${host}/api/auth/callback`;
        const scope = 'oauth'; // Basic scope to identify user and portal

        return `https://app.hubspot.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;
    }
};
