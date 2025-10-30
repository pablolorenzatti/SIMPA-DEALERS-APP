require('dotenv').config();
const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');
const session = require('express-session');
const open = require('open');
const { Client } = require('@hubspot/api-client');

const app = express();
const PORT = process.env.PORT || 3000;

// Almacenamiento de tokens
const refreshTokenStore = {};
const accessTokenCache = new NodeCache({ deleteOnExpire: true });

// Validación de variables de entorno
if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET) {
    throw new Error('❌ ERROR: Falta CLIENT_ID o CLIENT_SECRET en el archivo .env');
}

//===========================================================================//
//  CONFIGURACIÓN DE LA APLICACIÓN HUBSPOT
//===========================================================================//

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

// Scopes: permisos que necesita la aplicación
let SCOPES = ['crm.objects.contacts.read'];
if (process.env.SCOPE) {
    SCOPES = process.env.SCOPE.split(/ |, ?|%20/).filter(s => s);
}

// URL de callback después de la autorización
const REDIRECT_URI = `http://localhost:${PORT}/oauth-callback`;

//===========================================================================//

// Configuración de sesión
app.use(session({
  secret: Math.random().toString(36).substring(2),
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // En producción usar true con HTTPS
}));

// Middleware para parsear JSON (necesario para webhooks)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//===========================================================================//
//   FLUJO OAUTH 2.0
//===========================================================================//

// Paso 1: URL de autorización
const authUrl =
  'https://app.hubspot.com/oauth/authorize' +
  `?client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&scope=${encodeURIComponent(SCOPES.join(' '))}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

// Ruta de instalación: inicia el flujo OAuth
app.get('/install', (req, res) => {
  console.log('\n🚀 === Iniciando flujo OAuth 2.0 con HubSpot ===');
  console.log('📍 Paso 1: Redirigiendo al usuario a la URL de autorización de HubSpot');
  res.redirect(authUrl);
  console.log('⏳ Paso 2: Usuario siendo solicitado para dar consentimiento...');
});

// Paso 3: Callback después de la autorización
app.get('/oauth-callback', async (req, res) => {
  console.log('📥 Paso 3: Manejando la respuesta del servidor de HubSpot');

  // Si hay un error en la autorización
  if (req.query.error) {
    console.error('❌ Error en autorización:', req.query.error);
    return res.redirect(`/error?msg=${req.query.error}`);
  }

  // Recibimos el código de autorización
  if (req.query.code) {
    console.log('   ✓ Código de autorización recibido');

    const authCodeProof = {
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      code: req.query.code
    };

    // Paso 4: Intercambiar código por tokens
    console.log('🔄 Paso 4: Intercambiando código por access token y refresh token');
    const result = await exchangeForTokens(req.sessionID, authCodeProof);
    
    if (result.error) {
      return res.redirect(`/error?msg=${result.error}`);
    }

    console.log('✅ ¡Autorización exitosa!');
    res.redirect(`/`);
  }
});

//===========================================================================//
//   GESTIÓN DE TOKENS
//===========================================================================//

const exchangeForTokens = async (userId, exchangeProof) => {
  try {
    const response = await axios.post('https://api.hubapi.com/oauth/v1/token', 
      new URLSearchParams(exchangeProof).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const tokens = response.data;
    
    // Guardar tokens (en producción, usar base de datos)
    refreshTokenStore[userId] = tokens.refresh_token;
    accessTokenCache.set(
      userId, 
      tokens.access_token, 
      Math.round(tokens.expires_in * 0.75)
    );

    console.log('   ✓ Access token y refresh token obtenidos correctamente');
    return { success: true, accessToken: tokens.access_token };
  } catch (error) {
    console.error('❌ Error intercambiando tokens:', error.response?.data || error.message);
    return { error: error.response?.data?.message || 'Error al obtener tokens' };
  }
};

const refreshAccessToken = async (userId) => {
  const refreshTokenProof = {
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    refresh_token: refreshTokenStore[userId]
  };
  return await exchangeForTokens(userId, refreshTokenProof);
};

const getAccessToken = async (userId) => {
  // Si el token expiró, renovarlo usando el refresh token
  if (!accessTokenCache.get(userId)) {
    console.log('🔄 Renovando access token expirado...');
    await refreshAccessToken(userId);
  }
  return accessTokenCache.get(userId);
};

const isAuthorized = (userId) => {
  return refreshTokenStore[userId] ? true : false;
};

//===========================================================================//
//   USANDO EL SDK DE HUBSPOT PARA CONSULTAR LA API
//===========================================================================//

const getContact = async (accessToken) => {
  console.log('\n📊 === Obteniendo contacto de HubSpot usando el SDK ===');
  
  try {
    // Inicializar el cliente de HubSpot con el access token
    const hubspotClient = new Client({ accessToken });

    // Obtener el primer contacto usando el SDK oficial
    const response = await hubspotClient.crm.contacts.basicApi.getPage(1);
    
    if (response.results && response.results.length > 0) {
      const contact = response.results[0];
      console.log('   ✓ Contacto obtenido exitosamente');
      return {
        id: contact.id,
        properties: contact.properties,
        createdAt: contact.createdAt,
        updatedAt: contact.updatedAt
      };
    } else {
      console.log('   ⚠️ No se encontraron contactos');
      return { status: 'warning', message: 'No hay contactos en tu cuenta de HubSpot' };
    }
  } catch (error) {
    console.error('❌ Error al obtener contacto:', error.message);
    return { 
      status: 'error', 
      message: error.message || 'No se pudo obtener el contacto' 
    };
  }
};

//===========================================================================//
//   RUTAS DE LA INTERFAZ WEB
//===========================================================================//

app.get('/', async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  
  res.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>SIMPA Dealers - HubSpot OAuth</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          padding: 40px;
          max-width: 600px;
          width: 100%;
        }
        h1 {
          color: #333;
          margin-bottom: 10px;
          font-size: 28px;
        }
        h2 {
          color: #ff7a59;
          margin-bottom: 20px;
          font-size: 20px;
          font-weight: 500;
        }
        .info-box {
          background: #f8f9fa;
          border-left: 4px solid #667eea;
          padding: 15px;
          margin: 20px 0;
          border-radius: 5px;
        }
        .info-box h4 {
          color: #333;
          margin-bottom: 5px;
        }
        .info-box p {
          color: #666;
          margin: 5px 0;
          word-break: break-all;
        }
        .btn {
          display: inline-block;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 15px 30px;
          text-decoration: none;
          border-radius: 50px;
          font-weight: bold;
          margin-top: 20px;
          transition: transform 0.2s, box-shadow 0.2s;
          box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }
        .btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
        }
        .success { color: #28a745; }
        .warning { color: #ffc107; }
        .error { color: #dc3545; }
        .token-display {
          background: #2d2d2d;
          color: #4af626;
          padding: 15px;
          border-radius: 8px;
          font-family: 'Courier New', monospace;
          font-size: 12px;
          word-break: break-all;
          margin: 10px 0;
        }
        .contact-card {
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          color: white;
          padding: 20px;
          border-radius: 15px;
          margin: 20px 0;
        }
        .contact-card h3 {
          margin-bottom: 10px;
          font-size: 24px;
        }
        .contact-card p {
          opacity: 0.9;
          margin: 5px 0;
        }
        footer {
          margin-top: 30px;
          text-align: center;
          color: #999;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🚗 SIMPA Dealers App</h1>
        <h2>Integración con HubSpot OAuth 2.0</h2>
  `);

  if (isAuthorized(req.sessionID)) {
    const accessToken = await getAccessToken(req.sessionID);
    const contact = await getContact(accessToken);

    res.write(`
      <div class="info-box">
        <h4 class="success">✅ Conexión Autorizada</h4>
        <p>Tu aplicación está conectada exitosamente con HubSpot</p>
      </div>

      <div class="info-box">
        <h4>🔑 Access Token:</h4>
        <div class="token-display">${accessToken.substring(0, 20)}...${accessToken.substring(accessToken.length - 10)}</div>
      </div>
    `);

    if (contact.status === 'error') {
      res.write(`
        <div class="info-box">
          <h4 class="error">❌ Error al obtener contacto</h4>
          <p>${contact.message}</p>
        </div>
      `);
    } else if (contact.status === 'warning') {
      res.write(`
        <div class="info-box">
          <h4 class="warning">⚠️ ${contact.message}</h4>
        </div>
      `);
    } else if (contact.properties) {
      const firstname = contact.properties.firstname || 'N/A';
      const lastname = contact.properties.lastname || 'N/A';
      const email = contact.properties.email || 'N/A';
      
      res.write(`
        <div class="contact-card">
          <h3>👤 Primer Contacto de tu CRM</h3>
          <p><strong>Nombre:</strong> ${firstname} ${lastname}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>ID:</strong> ${contact.id}</p>
        </div>
      `);
    }
  } else {
    res.write(`
      <div class="info-box">
        <h4>🔓 No Autorizado</h4>
        <p>Para comenzar, necesitas autorizar la aplicación con tu cuenta de HubSpot</p>
      </div>
      <a href="/install" class="btn">🚀 Conectar con HubSpot</a>
    `);
  }

  res.write(`
        <footer>
          <p>💼 SIMPA Dealers App - Powered by HubSpot SDK</p>
          <p>🔧 <a href="https://github.com/pablolorenzatti/SIMPA-DEALERS-APP" style="color: #667eea;">GitHub</a></p>
        </footer>
      </div>
    </body>
    </html>
  `);
  
  res.end();
});

app.get('/error', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Error - SIMPA Dealers</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .error-container {
          background: white;
          border-radius: 20px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          padding: 40px;
          max-width: 500px;
          text-align: center;
        }
        h1 { color: #dc3545; font-size: 48px; }
        p { color: #666; margin: 20px 0; }
        a {
          display: inline-block;
          background: #667eea;
          color: white;
          padding: 12px 30px;
          text-decoration: none;
          border-radius: 50px;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="error-container">
        <h1>❌</h1>
        <h2>Error de Autorización</h2>
        <p>${req.query.msg || 'Ha ocurrido un error desconocido'}</p>
        <a href="/">← Volver al inicio</a>
      </div>
    </body>
    </html>
  `);
  res.end();
});

//===========================================================================//
//   WEBHOOK ENDPOINT
//===========================================================================//

app.post('/webhook', (req, res) => {
  const payload = req.body;
  console.log('\n📩 === Webhook recibido ===');
  console.log('Payload:', JSON.stringify(payload, null, 2));

  if (payload && payload.eventType) {
    switch (payload.eventType) {
      case 'contact.creation':
        console.log('✨ Nuevo contacto creado:', payload.objectId);
        break;
      case 'contact.propertyChange':
        console.log('📝 Contacto actualizado:', payload.objectId);
        break;
      case 'contact.deletion':
        console.log('🗑️ Contacto eliminado:', payload.objectId);
        break;
      default:
        console.log('🔔 Evento:', payload.eventType);
    }
  }

  res.status(200).json({ status: 'success', message: 'Webhook procesado' });
});

//===========================================================================//
//   INICIAR SERVIDOR
//===========================================================================//

app.listen(PORT, () => {
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║   🚗  SIMPA DEALERS APP - HubSpot Integration       ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log(`\n🌐 Servidor corriendo en: http://localhost:${PORT}`);
  console.log(`📍 Para iniciar OAuth: http://localhost:${PORT}/install\n`);
  console.log('💡 Tip: Asegúrate de haber configurado CLIENT_ID y CLIENT_SECRET en .env\n');
  
  // Abrir navegador automáticamente
  open(`http://localhost:${PORT}`);
});
