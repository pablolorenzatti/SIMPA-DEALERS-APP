#!/usr/bin/env node
/**
 * Servidor para intercambio automático de OAuth tokens
 * Usa variables de entorno para CLIENT_ID y CLIENT_SECRET
 * 
 * Uso:
 *   CLIENT_ID=tu_client_id CLIENT_SECRET=tu_client_secret node server.js
 * 
 * O crea un archivo .env con:
 *   CLIENT_ID=tu_client_id
 *   CLIENT_SECRET=tu_client_secret
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const CLIENT_ID = process.env.CLIENT_ID || process.env.HUBSPOT_CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET || process.env.HUBSPOT_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000';

// Cargar variables de entorno desde .env si existe
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        if (!process.env[key.trim()]) {
          process.env[key.trim()] = value.replace(/^["']|["']$/g, '');
        }
      }
    });
  }
} catch (error) {
  // Ignorar errores al cargar .env, usar variables de entorno del sistema
  console.warn('⚠️  No se pudo cargar .env, usando variables de entorno del sistema');
}

// Verificar que las credenciales estén configuradas
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Error: CLIENT_ID y CLIENT_SECRET deben estar configurados');
  console.error('');
  console.error('Opciones:');
  console.error('1. Variables de entorno:');
  console.error('   CLIENT_ID=xxx CLIENT_SECRET=xxx node server.js');
  console.error('');
  console.error('2. Archivo .env (crear en la misma carpeta):');
  console.error('   CLIENT_ID=xxx');
  console.error('   CLIENT_SECRET=xxx');
  console.error('');
  console.error('3. Variables de entorno del sistema:');
  console.error('   export CLIENT_ID=xxx');
  console.error('   export CLIENT_SECRET=xxx');
  console.error('   node server.js');
  process.exit(1);
}

console.log('✅ Credenciales cargadas correctamente');
console.log(`   Client ID: ${CLIENT_ID.substring(0, 20)}...`);
console.log(`   Server iniciando en http://localhost:${PORT}`);

// Función para intercambiar code por tokens
function exchangeCodeForTokens(code) {
  return new Promise((resolve, reject) => {
    const querystring = require('querystring');
    const formData = querystring.stringify({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      code: code
    });

    const options = {
      hostname: 'api.hubapi.com',
      path: '/oauth/v1/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(formData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode === 200) {
            resolve({ success: true, data: json });
          } else {
            resolve({ success: false, error: json });
          }
        } catch (e) {
          resolve({ success: false, error: { message: 'Error parsing response', raw: data } });
        }
      });
    });

    req.on('error', (error) => {
      reject({ success: false, error: { message: error.message } });
    });

    req.write(formData);
    req.end();
  });
}

// Servidor HTTP
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Endpoint para intercambio automático
  if (pathname === '/api/exchange' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { code } = JSON.parse(body);
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Code is required' }));
          return;
        }

        console.log(`🔄 Intercambiando code: ${code.substring(0, 20)}...`);
        const result = await exchangeCodeForTokens(code);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        
        if (result.success) {
          console.log(`✅ Intercambio exitoso para hub_id: ${result.data.hub_id}`);
        } else {
          console.error(`❌ Error en intercambio:`, result.error);
        }
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: { message: error.message } }));
      }
    });
    return;
  }

  // Servir archivo HTML
  if (pathname === '/' || pathname === '/index.html') {
    const filePath = path.join(__dirname, 'index.html');
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading page');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  // 404 para otras rutas
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor OAuth iniciado en http://localhost:${PORT}`);
  console.log(`📋 Abre http://localhost:${PORT} para la página de instalación`);
  console.log('');
  console.log('💡 Para detener el servidor, presiona Ctrl+C');
});

