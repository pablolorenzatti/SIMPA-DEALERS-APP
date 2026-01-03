#!/usr/bin/env node
/**
 * Script para publicar la custom workflow action usando la API de HubSpot Developer
 *
 * Uso con Developer API Key:
 *   node publish-action.js <APP_ID> <HAPIKEY>
 *
 * Uso con Developer Personal Access Token (pat-...):
 *   node publish-action.js <APP_ID> <TOKEN> --bearer
 */

const https = require('https');

const APP_ID = process.argv[2];
const CREDENTIAL = process.argv[3];
const FLAGS = process.argv.slice(4);

if (!APP_ID || !CREDENTIAL) {
  console.error('❌ Error: faltan parámetros');
  console.error('');
  console.error('Uso:');
  console.error('  node publish-action.js <APP_ID> <HAPIKEY>');
  console.error('  node publish-action.js <APP_ID> <TOKEN> --bearer');
  console.error('');
  console.error('Ejemplos:');
  console.error('  node publish-action.js 23431355 9bc28228-e62e-410a-ab28-a1405b2572fb');
  console.error('  node publish-action.js 23431355 pat-na1-xxx --bearer');
  process.exit(1);
}

// Por defecto, publicar TODAS las acciones no publicadas
// Para publicar solo una acción específica, usa: ACTION_URL_FILTER=bulk-models node publish-action.js ...
const ACTION_URL_FILTER = process.env.ACTION_URL_FILTER || 'all';
const isBearerFlag = FLAGS.includes('--bearer');
const isBearerAuto = CREDENTIAL.startsWith('pat-') || CREDENTIAL.startsWith('dpat-');
const USE_BEARER = isBearerFlag || isBearerAuto;

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

async function publishAction(appId, actionId) {
  await request('PATCH', `/automation/v4/actions/${appId}/${actionId}`, JSON.stringify({ published: true }));
}

async function main() {
  try {
    console.log(`🔍 Buscando workflow actions para appId ${APP_ID}...`);
    const actions = await getActionDefinitions(APP_ID);

    if (!actions.length) {
      console.log('❌ No se encontraron workflow actions para la app');
      console.log('  - Verifica si el build se desplegó correctamente');
      console.log('  - Asegúrate de usar la credencial del developer account');
      process.exit(1);
    }

    console.log(`✅ Se encontraron ${actions.length} action(s):`);
    actions.forEach((action, idx) => {
      console.log(`   ${idx + 1}. ${action.actionUrl || 'sin actionUrl'} (ID: ${action.id}, published: ${action.published})`);
    });

    // Si ACTION_URL_FILTER está definido, publicar solo esa acción
    // Si no, publicar todas las acciones no publicadas
    const publishAll = !ACTION_URL_FILTER || ACTION_URL_FILTER === 'all';
    
    let targets = [];
    if (publishAll) {
      targets = actions.filter(action => !action.published);
      console.log(`\n📤 Publicando todas las acciones no publicadas (${targets.length} encontradas)...`);
    } else {
      const target = actions.find(action => action.actionUrl && action.actionUrl.includes(ACTION_URL_FILTER));
      if (!target) {
        console.error(`❌ No se encontró acción cuya actionUrl contenga "${ACTION_URL_FILTER}"`);
        console.error('   - Ajusta la variable ACTION_URL_FILTER o revisa que la acción exista.');
        process.exit(1);
      }
      if (target.published) {
        console.log(`✅ La acción ${target.id} ya está publicada.`);
        process.exit(0);
      }
      targets = [target];
    }

    if (targets.length === 0) {
      console.log('✅ Todas las acciones ya están publicadas.');
      process.exit(0);
    }

    for (const target of targets) {
      console.log(`📤 Publicando acción ID ${target.id} (${target.actionUrl || 'sin actionUrl'})...`);
      await publishAction(APP_ID, target.id);
      console.log(`✅ Acción ${target.id} publicada exitosamente.`);
    }
    
    console.log(`\n✅ ¡${targets.length} acción(es) publicada(s) exitosamente!`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();

