#!/usr/bin/env node
/**
 * Script para actualizar las URLs de las custom workflow actions en HubSpot
 *
 * Uso:
 *   node update-action-urls.js <APP_ID> <HAPIKEY>
 *   node update-action-urls.js <APP_ID> <TOKEN> --bearer
 */

const https = require('https');

const APP_ID = process.argv[2];
const CREDENTIAL = process.argv[3];
const FLAGS = process.argv.slice(4);

if (!APP_ID || !CREDENTIAL) {
  console.error('❌ Error: faltan parámetros');
  console.error('');
  console.error('Uso:');
  console.error('  node update-action-urls.js <APP_ID> <HAPIKEY>');
  console.error('  node update-action-urls.js <APP_ID> <TOKEN> --bearer');
  process.exit(1);
}

const isBearerFlag = FLAGS.includes('--bearer');
const isBearerAuto = CREDENTIAL.startsWith('pat-') || CREDENTIAL.startsWith('dpat-');
const USE_BEARER = isBearerFlag || isBearerAuto;

// Nueva URL base de producción (URL canónica)
const NEW_BASE_URL = 'https://simpa-workflow-action.vercel.app';
const BYPASS_TOKEN = 'e4f3b1c6a9d8e7f0123456789abcdef0';

const ACTION_URLS = {
  'workflow-action': `${NEW_BASE_URL}/api/workflow-action?x-vercel-protection-bypass=${BYPASS_TOKEN}`,
  'forward-lead': `${NEW_BASE_URL}/api/forward-lead?x-vercel-protection-bypass=${BYPASS_TOKEN}`,
  'bulk-models': `${NEW_BASE_URL}/api/bulk-models?x-vercel-protection-bypass=${BYPASS_TOKEN}`,
  'test-action': `${NEW_BASE_URL}/api/test-action?x-vercel-protection-bypass=${BYPASS_TOKEN}`,
  'check-lead-status': `${NEW_BASE_URL}/api/check-lead-status?x-vercel-protection-bypass=${BYPASS_TOKEN}`
};

function buildPath(path) {
  if (USE_BEARER) {
    return path;
  }
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}hapikey=${CREDENTIAL}`;
}

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.hubapi.com',
      path: buildPath(path),
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (USE_BEARER) {
      options.headers.Authorization = `Bearer ${CREDENTIAL}`;
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (!data) {
            resolve({});
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(new Error(`Error parseando respuesta: ${err.message}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

async function getActionDefinitions(appId) {
  const response = await request('GET', `/automation/v4/actions/${appId}`);
  return response.results || [];
}

async function updateActionUrl(appId, actionId, newUrl) {
  await request('PATCH', `/automation/v4/actions/${appId}/${actionId}`, JSON.stringify({ actionUrl: newUrl }));
}

async function main() {
  try {
    console.log(`🔍 Obteniendo workflow actions para appId ${APP_ID}...`);
    const actions = await getActionDefinitions(APP_ID);

    if (!actions.length) {
      console.log('❌ No se encontraron workflow actions');
      process.exit(1);
    }

    console.log(`✅ Se encontraron ${actions.length} action(s):\n`);

    let updated = 0;
    for (const action of actions) {
      const currentUrl = action.actionUrl || 'sin URL';
      console.log(`📋 Acción ID ${action.id}:`);
      console.log(`   URL actual: ${currentUrl}`);

      // Determinar qué endpoint es
      let newUrl = null;
      for (const [key, url] of Object.entries(ACTION_URLS)) {
        if (currentUrl.includes(key === 'workflow-action' ? '/workflow-action' : `/${key}`)) {
          newUrl = url;
          break;
        }
      }

      if (!newUrl) {
        console.log(`   ⚠️  No se pudo determinar el endpoint, saltando...\n`);
        continue;
      }

      if (currentUrl === newUrl) {
        console.log(`   ✅ URL ya está actualizada\n`);
        continue;
      }

      try {
        console.log(`   🔄 Actualizando a: ${newUrl}...`);
        await updateActionUrl(APP_ID, action.id, newUrl);
        console.log(`   ✅ URL actualizada exitosamente\n`);
        updated++;
      } catch (error) {
        console.error(`   ❌ Error actualizando URL: ${error.message}\n`);
      }
    }

    console.log(`\n✅ Proceso completado. ${updated} acción(es) actualizada(s).`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();

