const axios = require('axios');
const cookie = require('cookie');
const AuthHelper = require('./_utils/auth-helper');

module.exports = async (req, res) => {
    const { code } = req.query;

    // --- CALLBACK MODE ---
    if (code) {
        if (!process.env.HUBSPOT_CLIENT_ID || !process.env.HUBSPOT_CLIENT_SECRET) {
            return res.status(500).send('HubSpot Client Credentials not configured in Vercel.');
        }

        try {
            // Redirect URI must match exactly what was sent in login
            // Pointing to THIS file now: /api/auth
            const redirectUri = process.env.HUBSPOT_REDIRECT_URI || `https://${req.headers.host}/api/auth`;

            // Exchange code for token
            const tokenRes = await axios.post('https://api.hubapi.com/oauth/v1/token',
                new URLSearchParams({
                    grant_type: 'authorization_code',
                    client_id: process.env.HUBSPOT_CLIENT_ID,
                    client_secret: process.env.HUBSPOT_CLIENT_SECRET,
                    redirect_uri: redirectUri,
                    code: code
                }),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
            );

            const { access_token } = tokenRes.data;

            // Get Access Token Info to verify Portal ID
            const infoRes = await axios.get(`https://api.hubapi.com/oauth/v1/access-tokens/${access_token}`);
            const { hub_id, user } = infoRes.data;

            const allowedPortalId = process.env.ALLOWED_PORTAL_ID || '4990947'; // SIMPA Portal ID

            if (String(hub_id) !== String(allowedPortalId)) {
                return res.status(403).send(`<h1>Acceso Denegado</h1><p>Este aplicativo es exclusivo para el Portal ${allowedPortalId}. Tu estas conectado al portal ${hub_id}.</p>`);
            }

            // Create Session JWT
            const sessionToken = AuthHelper.signToken({
                portalId: hub_id,
                userEmail: user,
                ts: Date.now()
            });

            // Set Cookie
            res.setHeader('Set-Cookie', cookie.serialize(AuthHelper.COOKIE_NAME, sessionToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV !== 'development', // Secure in Prod
                maxAge: 60 * 60 * 24, // 1 day
                sameSite: 'lax',
                path: '/'
            }));

            // Redirect to Admin
            return res.redirect('/api/admin');

        } catch (error) {
            console.error('OAuth Error:', error.response?.data || error.message);
            return res.status(500).send(`<h1>Error de Autenticaci&oacute;n</h1><p>${error.response?.data?.message || error.message}</p>`);
        }
    }

    // --- LOGIN MODE ---
    if (!process.env.HUBSPOT_CLIENT_ID) {
        return res.status(500).send('Error: HUBSPOT_CLIENT_ID not configured.');
    }

    // Generate Auth URL
    // We pass the CURRENT URL (/api/auth) as the redirect_uri handling both roles
    const host = req.headers.host;
    const redirectUri = process.env.HUBSPOT_REDIRECT_URI || `https://${host}/api/auth`;

    const clientId = process.env.HUBSPOT_CLIENT_ID;
    const scope = 'oauth';

    const authUrl = `https://app.hubspot.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;

    res.redirect(authUrl);
};
