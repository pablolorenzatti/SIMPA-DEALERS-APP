const hubspot = require('@hubspot/api-client');
const fs = require('fs');
const https = require('https');
const querystring = require('querystring');
const ConfigService = require('./_services/config-service');

// Variables globales para caché en ejecución de serverless (container reuse)
let razonesSocialesConfig;
let simpaPipelinesConfig;

async function loadConfigs() {
  if (!razonesSocialesConfig) {
    razonesSocialesConfig = await ConfigService.getRazonesSociales();
    console.log(`[webhook-enrich] ✅ Configuración de Razones Sociales cargada (${Object.keys(razonesSocialesConfig).length} items)`);
  } else {
    console.log(`[webhook-enrich] ♻️ Reusando configuración en memoria`);
  }

  if (!simpaPipelinesConfig) {
    simpaPipelinesConfig = await ConfigService.getSimpaPipelines();
    console.log(`[webhook-enrich] ✅ Configuración de Pipelines SIMPA cargada (${Object.keys(simpaPipelinesConfig).length} items)`);
  }
}

/**
 * Obtiene un access token usando OAuth refresh token
 */
async function getAccessTokenFromRefreshToken(refreshToken, clientId, clientSecret) {
  return new Promise((resolve, reject) => {
    const formData = querystring.stringify({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken
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
          if (res.statusCode === 200 && json.access_token) {
            console.log(`[webhook-enrich] ✅ Access token obtenido vía OAuth refresh token`);
            resolve(json.access_token);
          } else {
            reject(new Error(`Error obteniendo access token: ${json.error || json.message || 'Unknown error'}`));
          }
        } catch (e) {
          reject(new Error(`Error parsing OAuth response: ${e.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Error de conexión OAuth: ${error.message}`));
    });

    req.write(formData);
    req.end();
  });
}

/**
 * Obtiene el token de acceso para un portalId específico
 * Prioriza OAuth refresh tokens, luego Private Access Tokens
 */
async function getAccessTokenForPortalId(portalId) {
  if (!portalId) {
    throw new Error('El portalId es requerido');
  }

  if (!razonesSocialesConfig || Object.keys(razonesSocialesConfig).length === 0) {
    console.error(`[webhook-enrich] ❌ razonesSocialesConfig está vacío o no se cargó`);
    console.error(`[webhook-enrich] ❌ Esto significa que razones-sociales.json no se incluyó en el despliegue de Vercel`);
    // Continuar con fallbacks aunque no haya config para intentar PORTAL_XXX_TOKEN
  }

  const portalIdStr = String(portalId);
  console.log(`[webhook-enrich] 🔍 Buscando token para portalId: ${portalId} (string: "${portalIdStr}")`);
  console.log(`[webhook-enrich] 🔍 razonesSocialesConfig tiene ${razonesSocialesConfig ? Object.keys(razonesSocialesConfig).length : 0} razones sociales`);

  // Obtener CLIENT_ID y CLIENT_SECRET de OAuth (compartidos para todos los portales)
  const clientId = process.env.HUBSPOT_CLIENT_ID || process.env.CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET || process.env.CLIENT_SECRET;

  // PRIORIDAD 1: Intentar OAuth refresh token por portalId
  // Buscar con formato PORTAL_{portalId}_REFRESH_TOKEN
  // NO usar PORTAL_SIMPA_REFRESH_TOKEN como fallback genérico (solo es para SIMPA)
  let portalRefreshToken = process.env[`PORTAL_${portalId}_REFRESH_TOKEN`];

  if (portalRefreshToken && clientId && clientSecret) {
    try {
      console.log(`[webhook-enrich] 🔄 Intentando obtener access token vía OAuth refresh token para portalId ${portalId}`);
      const accessToken = await getAccessTokenFromRefreshToken(portalRefreshToken, clientId, clientSecret);
      console.log(`[webhook-enrich] ✅ Access token obtenido vía OAuth para portalId ${portalId}`);
      return accessToken;
    } catch (oauthError) {
      console.warn(`[webhook-enrich] ⚠️ Error obteniendo access token vía OAuth: ${oauthError.message}`);
      console.warn(`[webhook-enrich] ⚠️ Continuando con método PAT (Private Access Token)`);
    }
  } else if (!portalRefreshToken) {
    console.log(`[webhook-enrich] 🔍 No se encontró PORTAL_${portalId}_REFRESH_TOKEN, continuando con PAT`);
  }

  // PRIORIDAD 2: Buscar razón social por portalId y usar tokenEnv (PAT)
  if (razonesSocialesConfig && Object.keys(razonesSocialesConfig).length > 0) {
    for (const [razonSocial, config] of Object.entries(razonesSocialesConfig)) {
      const configPortalId = config.portalId ? String(config.portalId) : null;
      console.log(`[webhook-enrich] 🔍 Comparando: "${configPortalId}" === "${portalIdStr}" (${razonSocial})`);

      if (config.portalId && String(config.portalId) === portalIdStr) {
        console.log(`[webhook-enrich] ✅ Encontrada razón social: ${razonSocial}`);
        // Si tiene tokenEnv, usar esa variable de entorno (PAT)
        if (config.tokenEnv) {
          console.log(`[webhook-enrich] 🔍 Buscando variable de entorno: ${config.tokenEnv}`);
          const token = process.env[config.tokenEnv];
          console.log(`[webhook-enrich] 🔍 Token encontrado: ${token ? 'SÍ (' + token.substring(0, 10) + '...)' : 'NO'}`);
          if (token) {
            console.log(`[webhook-enrich] ✅ Token obtenido desde ${config.tokenEnv} para portalId ${portalId} (${razonSocial})`);
            return token;
          }
          throw new Error(`Token ${config.tokenEnv} no encontrado en variables de entorno de Vercel para portalId ${portalId} (${razonSocial}). Verifica que la variable esté configurada en Vercel Environment Variables.`);
        }
      }
    }
  }

  // PRIORIDAD 3: Intentar con variable de entorno específica del portal (PAT)
  const portalTokenEnv = `PORTAL_${portalId}_TOKEN`;
  const portalToken = process.env[portalTokenEnv];

  if (portalToken) {
    console.log(`[webhook-enrich] ✅ Token obtenido desde ${portalTokenEnv} (fallback PAT)`);
    return portalToken;
  }

  // PRIORIDAD 4: Token genérico (PAT)
  const genericToken = process.env.HUBSPOT_ACCESS_TOKEN;
  if (genericToken) {
    console.warn(`[webhook-enrich] ⚠️ Usando token genérico HUBSPOT_ACCESS_TOKEN para portalId ${portalId}`);
    return genericToken;
  }

  throw new Error(`No se encontró token de acceso para portalId ${portalId}. ` +
    `Opciones:\n` +
    `1. Configurar OAuth: PORTAL_${portalId}_REFRESH_TOKEN + HUBSPOT_CLIENT_ID + HUBSPOT_CLIENT_SECRET\n` +
    `2. Configurar PAT: portalId en razones-sociales.json con tokenEnv\n` +
    `3. Configurar PAT: variable ${portalTokenEnv} o HUBSPOT_ACCESS_TOKEN en Vercel.`);
}

/**
 * Obtiene información de la razón social asociada a un portalId
 */
function getRazonSocialInfoByPortalId(portalId) {
  if (!portalId || !razonesSocialesConfig) {
    return null;
  }

  const portalIdStr = String(portalId);

  for (const [razonSocial, config] of Object.entries(razonesSocialesConfig)) {
    if (config.portalId && String(config.portalId) === portalIdStr) {
      return {
        razonSocial,
        config
      };
    }
  }

  return null;
}

/**
 * Obtiene información completa del deal desde HubSpot
 */
async function getDealInfo(hubspotClient, dealId, propertyName) {
  try {
    // Propiedades a obtener
    const properties = [
      'dealname',
      'dealstage',
      'amount',
      'closedate',
      'pipeline',
      'dealtype',
      'marca_simpa',
      'modelo_simpa',
      'id_negocio_simpa',
      'concesionarios_simpa',
      'motivo_de_perdida',
      'otro_motivo_de_perdida',
      propertyName // Incluir la propiedad que cambió
    ].filter(Boolean); // Remover valores undefined/null

    console.log(`[webhook-enrich] 🔍 Intentando obtener deal ${dealId} con propiedades: ${properties.join(', ')}`);
    const deal = await hubspotClient.crm.deals.basicApi.getById(dealId, properties);

    console.log(`[webhook-enrich] ✅ Deal obtenido exitosamente: ${deal.id}`);
    return {
      id: deal.id,
      properties: deal.properties || {},
      createdAt: deal.createdAt,
      updatedAt: deal.updatedAt,
      archived: deal.archived || false
    };
  } catch (error) {
    // Mejorar el manejo de errores 404
    if (error.code === 404 || error.statusCode === 404 || (error.response && error.response.statusCode === 404)) {
      const errorMsg = `Deal ${dealId} no encontrado. Posibles causas:\n` +
        `1. El deal fue eliminado o archivado\n` +
        `2. El access token OAuth es para un portal diferente al del webhook\n` +
        `3. El deal no existe en el portal especificado\n` +
        `4. El access token no tiene permisos para acceder a este deal`;
      console.error(`[webhook-enrich] ❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }

    // Para otros errores, mantener el comportamiento original
    console.error(`[webhook-enrich] ❌ Error obteniendo deal ${dealId}:`, error.message);
    if (error.response) {
      console.error(`[webhook-enrich] ❌ Status Code: ${error.response.statusCode}`);
      console.error(`[webhook-enrich] ❌ Response Body:`, error.response.body);
    }
    throw error;
  }
}

/**
 * Obtiene información del pipeline y stage
 */
async function getPipelineStageInfo(hubspotClient, pipelineId, stageId) {
  try {
    if (!pipelineId || !stageId) {
      return null;
    }

    const pipeline = await hubspotClient.crm.pipelines.pipelinesApi.getById('deals', pipelineId);
    const stage = pipeline.stages?.find(s => s.id === stageId);

    if (stage) {
      return {
        pipelineId: pipelineId,
        pipelineLabel: pipeline.label || null,
        stageId: stage.id,
        stageLabel: stage.label,
        probability: stage.metadata?.probability || null,
        displayOrder: stage.displayOrder || null
      };
    }

    return null;
  } catch (error) {
    console.warn(`[webhook-enrich] Error obteniendo información de pipeline/stage:`, error.message);
    return null;
  }
}

/**
 * Obtiene contactos asociados al deal
 */
/**
 * Obtiene contactos asociados al deal
 */
async function getAssociatedContacts(hubspotClient, dealId) {
  try {
    // Verificar que el cliente y la API estén disponibles
    if (!hubspotClient || !hubspotClient.crm) {
      console.warn(`[webhook-enrich] ⚠️ Cliente HubSpot no disponible para obtener contactos asociados`);
      return [];
    }

    let associations = null;

    // Intentar usar la API v4 de asociaciones (más moderna)
    if (hubspotClient.crm.associations && hubspotClient.crm.associations.v4) {
      try {
        const response = await hubspotClient.crm.associations.v4.basicApi.getPage('deal', dealId, 'contact');
        associations = response.results;
      } catch (v4Error) {
        console.warn(`[webhook-enrich] Error usando API v4 de asociaciones: ${v4Error.message}`);
      }
    }

    // Si falla v4, intentar con la API v3 (legacy para algunos clientes)
    if (!associations && hubspotClient.crm.deals && hubspotClient.crm.deals.associationsApi) {
      try {
        const response = await hubspotClient.crm.deals.associationsApi.getAll(dealId, 'contact');
        associations = response.results;
      } catch (v3Error) {
        console.warn(`[webhook-enrich] Error usando API v3 de asociaciones: ${v3Error.message}`);
      }
    }

    if (!associations || associations.length === 0) {
      return [];
    }

    // Obtener información básica de los contactos asociados
    const contactIds = associations.map(r => r.toObjectId || r.id).filter(Boolean);
    const contacts = [];

    // Eliminar duplicados
    const uniqueContactIds = [...new Set(contactIds)];

    for (const contactId of uniqueContactIds.slice(0, 10)) { // Limitar a 10 contactos
      try {
        const contact = await hubspotClient.crm.contacts.basicApi.getById(contactId, [
          'firstname', 'lastname', 'email', 'phone', 'marca_simpa', 'modelo_simpa'
        ]);

        contacts.push({
          id: contact.id,
          firstName: contact.properties?.firstname || null,
          lastName: contact.properties?.lastname || null,
          email: contact.properties?.email || null,
          phone: contact.properties?.phone || null,
          marca: contact.properties?.marca_simpa || null,
          modelo: contact.properties?.modelo_simpa || null
        });
      } catch (contactError) {
        console.warn(`[webhook-enrich] Error obteniendo contacto ${contactId}:`, contactError.message);
      }
    }

    return contacts;
  } catch (error) {
    console.warn(`[webhook-enrich] Error obteniendo contactos asociados:`, error.message);
    return [];
  }
}

/**
 * Encuentra el stage de SIMPA más cercano por probability para una marca específica
 * @param {string} marca - Marca del deal (ej: "GASGAS")
 * @param {number|string} targetProbability - Probability del stage del dealer (ej: 0.8 o "0.8")
 * @returns {Object|null} { pipelineId, stageId, stageLabel, probability } o null si no se encuentra
 */
function findSimpaStageByProbability(marca, targetProbability) {
  if (!marca || targetProbability === null || targetProbability === undefined) {
    return null;
  }

  // Normalizar la marca (mayúsculas)
  const marcaNormalized = marca.toUpperCase().trim();

  // Convertir probability a número
  const targetProb = typeof targetProbability === 'string' ? parseFloat(targetProbability) : Number(targetProbability);

  if (isNaN(targetProb)) {
    console.warn(`[webhook-enrich] ⚠️ Probability inválida: ${targetProbability}`);
    return null;
  }

  // Buscar configuración de pipeline para la marca
  const marcaConfig = simpaPipelinesConfig && simpaPipelinesConfig[marcaNormalized];

  if (!marcaConfig || !marcaConfig.stages || marcaConfig.stages.length === 0) {
    console.warn(`[webhook-enrich] ⚠️ No se encontró configuración de pipeline para marca: ${marcaNormalized}`);
    return null;
  }

  const pipelineId = marcaConfig.pipelineId;
  const stages = marcaConfig.stages;

  // Encontrar el stage con la probability más cercana
  let closestStage = null;
  let minDifference = Infinity;

  for (const stage of stages) {
    const stageProb = typeof stage.probability === 'string' ? parseFloat(stage.probability) : Number(stage.probability);

    if (isNaN(stageProb)) {
      continue;
    }

    // Calcular diferencia absoluta
    const difference = Math.abs(stageProb - targetProb);

    // Si hay coincidencia exacta, retornar inmediatamente
    if (difference === 0) {
      console.log(`[webhook-enrich] ✅ Coincidencia exacta encontrada: marca ${marcaNormalized}, probability ${targetProb} → stageId ${stage.stageId}`);
      return {
        pipelineId: pipelineId,
        stageId: stage.stageId,
        stageLabel: stage.stageLabel || stage.stageId,
        probability: stageProb
      };
    }

    // Si es la diferencia más pequeña hasta ahora, guardarla
    if (difference < minDifference) {
      minDifference = difference;
      closestStage = stage;
    }
  }

  // Retornar el stage más cercano
  if (closestStage) {
    const closestProb = typeof closestStage.probability === 'string' ? parseFloat(closestStage.probability) : Number(closestStage.probability);
    console.log(`[webhook-enrich] ✅ Stage más cercano encontrado: marca ${marcaNormalized}, probability objetivo ${targetProb} → stageId ${closestStage.stageId} (probability: ${closestProb}, diferencia: ${minDifference.toFixed(3)})`);
    return {
      pipelineId: pipelineId,
      stageId: closestStage.stageId,
      stageLabel: closestStage.stageLabel || closestStage.stageId,
      probability: closestProb
    };
  }

  console.warn(`[webhook-enrich] ⚠️ No se pudo encontrar stage para marca ${marcaNormalized} con probability ${targetProb}`);
  return null;
}

/**
 * Extrae el portalId de SIMPA y el hs_object_id del deal en SIMPA desde idNegocioSimpa
 * Maneja dos formatos:
 * 1. Formato compuesto: "4990947-0-3-49633068845" → portalId SIMPA: "4990947", hs_object_id SIMPA: "49633068845"
 * 2. Formato simple: "49633068845" → portalId SIMPA: null (usar variable de entorno), hs_object_id SIMPA: "49633068845"
 * 
 * @returns {Object} { simpaPortalId: string|null, simpaHsObjectId: string }
 */
function extractSimpaInfoFromIdNegocioSimpa(idNegocioSimpa) {
  if (!idNegocioSimpa) {
    return { simpaPortalId: null, simpaHsObjectId: null };
  }

  const idStr = String(idNegocioSimpa).trim();

  // Si contiene guiones, es formato compuesto: "simpaPortalId-0-3-hs_object_id_simpa"
  if (idStr.includes('-')) {
    const segments = idStr.split('-');
    const simpaPortalId = segments[0]; // Primer segmento es el portalId de SIMPA
    const simpaHsObjectId = segments[segments.length - 1]; // Último segmento es el hs_object_id del deal en SIMPA
    console.log(`[webhook-enrich] 🔍 idNegocioSimpa compuesto: "${idStr}" → portalId SIMPA: "${simpaPortalId}", hs_object_id SIMPA: "${simpaHsObjectId}"`);
    return { simpaPortalId, simpaHsObjectId };
  }

  // Si no contiene guiones, es formato simple: solo hs_object_id del deal en SIMPA
  console.log(`[webhook-enrich] 🔍 idNegocioSimpa simple: "${idStr}" → hs_object_id SIMPA: "${idStr}" (sin portalId, usar variable de entorno)`);
  return { simpaPortalId: null, simpaHsObjectId: idStr };
}

/**
 * Actualiza información del negocio en SIMPA usando idNegocioSimpa
 */
async function updateSimpaBusiness(idNegocioSimpa, enrichedData, pipelineStageInfo) {
  try {
    // Validar que existe idNegocioSimpa
    if (!idNegocioSimpa) {
      console.log('[webhook-enrich] ⚠️ No hay idNegocioSimpa, omitiendo actualización en SIMPA');
      return { success: false, message: 'No hay idNegocioSimpa disponible' };
    }

    // Extraer hs_object_id de SIMPA desde idNegocioSimpa
    const simpaInfo = extractSimpaInfoFromIdNegocioSimpa(idNegocioSimpa);
    const hsObjectId = simpaInfo.simpaHsObjectId;
    if (!hsObjectId) {
      console.log('[webhook-enrich] ⚠️ No se pudo extraer hs_object_id de SIMPA desde idNegocioSimpa');
      return { success: false, message: 'No se pudo extraer hs_object_id de SIMPA desde idNegocioSimpa' };
    }

    // Obtener URL de API de SIMPA desde variable de entorno
    const simpaApiUrl = process.env.SIMPA_API_URL || process.env.SIMPA_UPDATE_URL;
    if (!simpaApiUrl) {
      console.warn('[webhook-enrich] ⚠️ SIMPA_API_URL no configurada, omitiendo actualización en SIMPA');
      return { success: false, message: 'SIMPA_API_URL no configurada en variables de entorno' };
    }

    // Obtener token de autenticación de SIMPA (si es necesario)
    const simpaApiToken = process.env.SIMPA_API_TOKEN || process.env.SIMPA_ACCESS_TOKEN;

    // Construir payload para actualizar SIMPA
    const simpaUpdatePayload = {
      idNegocio: idNegocioSimpa, // Mantener el idNegocioSimpa original para referencia
      hs_object_id: hsObjectId, // hs_object_id extraído (formato correcto para SIMPA)
      dealInfo: {
        name: enrichedData.dealInfo.name,
        amount: enrichedData.dealInfo.amount,
        closeDate: enrichedData.dealInfo.closeDate,
        dealType: enrichedData.dealInfo.dealType,
        marca: enrichedData.dealInfo.marca,
        modelo: enrichedData.dealInfo.modelo,
        concesionario: enrichedData.dealInfo.concesionario,
        updatedAt: enrichedData.dealInfo.updatedAt
      },
      pipelineStage: pipelineStageInfo ? {
        pipelineId: pipelineStageInfo.pipelineId,
        pipelineLabel: pipelineStageInfo.pipelineLabel,
        stageId: pipelineStageInfo.stageId,
        stageLabel: pipelineStageInfo.stageLabel,
        probability: pipelineStageInfo.probability
      } : null,
      propertyChanged: enrichedData.propertyChanged,
      contactsCount: enrichedData.contactsCount,
      updatedAt: new Date().toISOString()
    };

    console.log(`[webhook-enrich] 🔄 Actualizando negocio en SIMPA`);
    console.log(`[webhook-enrich]   idNegocioSimpa original: ${idNegocioSimpa}`);
    console.log(`[webhook-enrich]   hs_object_id extraído: ${hsObjectId}`);
    console.log(`[webhook-enrich]   Endpoint: ${simpaApiUrl}`);

    // Realizar petición a SIMPA
    const https = require('https');
    const http = require('http');
    const url = new URL(simpaApiUrl);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const postData = JSON.stringify(simpaUpdatePayload);

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'PUT', // O 'POST' según la API de SIMPA
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    // Agregar token de autenticación si existe
    if (simpaApiToken) {
      options.headers['Authorization'] = `Bearer ${simpaApiToken}`;
      // O si SIMPA usa otro formato:
      // options.headers['X-API-Key'] = simpaApiToken;
    }

    return new Promise((resolve, reject) => {
      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`[webhook-enrich] ✅ Negocio actualizado en SIMPA exitosamente`);
            resolve({
              success: true,
              response: data ? JSON.parse(data) : null,
              statusCode: res.statusCode
            });
          } else {
            const errorMsg = `HTTP ${res.statusCode}: ${data}`;
            console.error(`[webhook-enrich] ❌ Error actualizando SIMPA: ${errorMsg}`);
            reject(new Error(errorMsg));
          }
        });
      });

      req.on('error', (error) => {
        console.error(`[webhook-enrich] ❌ Error de conexión con SIMPA:`, error.message);
        reject(error);
      });

      req.write(postData);
      req.end();
    });
  } catch (error) {
    console.error(`[webhook-enrich] ❌ Error actualizando SIMPA:`, error.message);
    // No lanzar error, solo registrar y retornar
    return {
      success: false,
      message: error.message,
      error: error.name
    };
  }
}

/**
 * Envía el payload enriquecido a HubSpot o a otro endpoint
 */
async function sendEnrichedPayload(enrichedPayload, targetUrl = null) {
  // Si no se especifica targetUrl, retornar el payload enriquecido
  if (!targetUrl) {
    return enrichedPayload;
  }

  try {
    const https = require('https');
    const url = new URL(targetUrl);

    const postData = JSON.stringify(enrichedPayload);

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, response: data });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  } catch (error) {
    console.error(`[webhook-enrich] Error enviando payload:`, error.message);
    throw error;
  }
}

module.exports = async (req, res) => {
  // Permitir GET para verificación de salud
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      message: 'Webhook enrich endpoint is running',
      message: 'Webhook enrich endpoint is running',
      timestamp: new Date().toISOString()
    });
  }

  // Pre-cargar configuraciones
  await loadConfigs();

  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }

  // Parsear el body del request
  // En Vercel, el body puede venir como string o como objeto ya parseado
  // HubSpot puede enviar el webhook como un array con un solo objeto
  let webhookPayload = {};

  try {
    let parsedBody = null;

    if (typeof req.body === 'string' && req.body.trim()) {
      // Si el body es un string, parsearlo
      parsedBody = JSON.parse(req.body);
      console.log(`[webhook-enrich] 🔍 Body parseado desde string`);
    } else if (Buffer.isBuffer(req.body)) {
      // Si el body es un Buffer, convertirlo a string y parsearlo
      parsedBody = JSON.parse(req.body.toString('utf8'));
      console.log(`[webhook-enrich] 🔍 Body parseado desde Buffer`);
    } else if (req.body && typeof req.body === 'object') {
      // Si el body ya es un objeto, usarlo directamente
      parsedBody = req.body;
      console.log(`[webhook-enrich] 🔍 Body ya es un objeto`);
    } else {
      // Si no hay body o está vacío
      console.warn(`[webhook-enrich] ⚠️ Body no está en formato esperado`);
      parsedBody = {};
    }

    // HubSpot puede enviar el webhook como un array con un solo objeto
    // Extraer el primer elemento si es un array
    if (Array.isArray(parsedBody)) {
      if (parsedBody.length > 0) {
        webhookPayload = parsedBody[0];
        console.log(`[webhook-enrich] 🔍 Body es un array, extrayendo primer elemento`);
      } else {
        console.warn(`[webhook-enrich] ⚠️ Body es un array vacío`);
        webhookPayload = {};
      }
    } else {
      webhookPayload = parsedBody || {};
    }

    // Log del payload recibido para debugging
    console.log(`[webhook-enrich] 🔍 Payload recibido (tipo original: ${typeof req.body}, es array: ${Array.isArray(parsedBody)}):`, JSON.stringify(webhookPayload).substring(0, 300));
  } catch (parseError) {
    console.error(`[webhook-enrich] ❌ Error parseando body:`, parseError.message);
    console.error(`[webhook-enrich] ❌ Body raw:`, req.body);
    console.error(`[webhook-enrich] ❌ Stack:`, parseError.stack);
    return res.status(400).json({
      status: 'error',
      message: `Error parseando el payload del webhook: ${parseError.message}`,
      bodyType: typeof req.body,
      bodyPreview: typeof req.body === 'string' ? req.body.substring(0, 200) : String(req.body).substring(0, 200)
    });
  }

  try {

    console.log(`[webhook-enrich] 📥 Webhook recibido:`);
    console.log(`[webhook-enrich]   Tipo: ${webhookPayload.subscriptionType || 'N/A'}`);
    console.log(`[webhook-enrich]   Portal ID: ${webhookPayload.portalId || 'N/A'}`);
    console.log(`[webhook-enrich]   Object ID: ${webhookPayload.objectId || 'N/A'}`);
    console.log(`[webhook-enrich]   Property: ${webhookPayload.propertyName || 'N/A'}`);

    // Validar payload básico
    if (!webhookPayload.portalId || !webhookPayload.objectId) {
      return res.status(400).json({
        status: 'error',
        message: 'Payload inválido: faltan portalId u objectId'
      });
    }

    // Obtener token de acceso para el portal usando el helper unificado
    // Este helper busca en razones-sociales.json por portalId y usa tokenEnv
    console.log(`[webhook-enrich] 🔍 Obteniendo token para portalId: ${webhookPayload.portalId}`);

    let accessToken;
    let razonSocialInfo = null;

    try {
      // Usar la función local que busca en razones-sociales.json por portalId
      // y obtiene el token desde la variable de entorno especificada en tokenEnv
      // O usa OAuth refresh token si está configurado
      accessToken = await getAccessTokenForPortalId(webhookPayload.portalId);

      // Obtener información de la razón social asociada al portalId
      razonSocialInfo = getRazonSocialInfoByPortalId(webhookPayload.portalId);

      if (razonSocialInfo && razonSocialInfo.razonSocial) {
        console.log(`[webhook-enrich] ✅ PortalId ${webhookPayload.portalId} mapeado a razón social: "${razonSocialInfo.razonSocial}"`);
        console.log(`[webhook-enrich] ✅ Token obtenido desde ${razonSocialInfo.config?.tokenEnv || 'variable de entorno'}`);
      } else {
        console.log(`[webhook-enrich] ✅ Token obtenido para portalId ${webhookPayload.portalId} (sin mapeo a razón social en razones-sociales.json)`);
      }
    } catch (tokenError) {
      console.error(`[webhook-enrich] ❌ Error obteniendo token:`, tokenError.message);

      // Mensaje de error detallado con instrucciones
      const errorMessage = `No se pudo obtener token de acceso para portalId ${webhookPayload.portalId}. ` +
        `Opciones para solucionarlo:\n` +
        `1. Agregar "portalId": ${webhookPayload.portalId} en razones-sociales.json junto con "tokenEnv"\n` +
        `2. Configurar la variable de entorno PORTAL_${webhookPayload.portalId}_TOKEN en Vercel\n` +
        `3. Configurar la variable de entorno HUBSPOT_ACCESS_TOKEN en Vercel (token genérico)\n` +
        `Detalle: ${tokenError.message}`;

      throw new Error(errorMessage);
    }

    // Crear cliente HubSpot para el dealer (el webhook viene del dealer)
    const dealerHubspotClient = new hubspot.Client({ accessToken });

    // PASO 1: Obtener el deal del dealer para extraer idNegocioSimpa
    console.log(`[webhook-enrich] 🔍 PASO 1: Obteniendo deal del dealer (portalId: ${webhookPayload.portalId}, objectId: ${webhookPayload.objectId})...`);
    console.log(`[webhook-enrich] 🔍 Endpoint: GET /crm/v3/objects/deals/${webhookPayload.objectId}`);

    let dealerDealInfo;
    try {
      dealerDealInfo = await getDealInfo(
        dealerHubspotClient,
        webhookPayload.objectId,
        webhookPayload.propertyName
      );
      console.log(`[webhook-enrich] ✅ Deal del dealer obtenido: ${dealerDealInfo.id}`);
      console.log(`[webhook-enrich] 🔍 idNegocioSimpa en deal del dealer: ${dealerDealInfo.properties?.id_negocio_simpa || 'N/A'}`);
    } catch (dealError) {
      // Si es un 404, proporcionar información más detallada
      if (dealError.code === 404 || dealError.statusCode === 404 || (dealError.response && dealError.response.statusCode === 404)) {
        const detailedError = new Error(
          `Deal ${webhookPayload.objectId} no encontrado en portalId ${webhookPayload.portalId} (dealer). ` +
          `Posibles causas:\n` +
          `1. El deal fue eliminado o archivado\n` +
          `2. El access token OAuth es para un portal diferente\n` +
          `3. El deal no existe en el portal especificado\n` +
          `4. El access token no tiene permisos para acceder a este deal`
        );
        detailedError.code = 404;
        detailedError.statusCode = 404;
        throw detailedError;
      }
      throw dealError;
    }

    // PASO 2: Extraer información de SIMPA desde idNegocioSimpa
    const idNegocioSimpa = dealerDealInfo.properties?.id_negocio_simpa;
    let dealInfo = dealerDealInfo; // Por defecto, usar el deal del dealer
    let simpaDealInfo = null;
    let simpaPortalId = null;
    let simpaAccessToken = null;

    if (!idNegocioSimpa) {
      console.log(`[webhook-enrich] ⚠️ El deal del dealer no tiene idNegocioSimpa, usando información del deal del dealer directamente`);
    } else {
      console.log(`[webhook-enrich] 🔍 PASO 2: Extrayendo información de SIMPA desde idNegocioSimpa: ${idNegocioSimpa}`);
      const simpaInfo = extractSimpaInfoFromIdNegocioSimpa(idNegocioSimpa);
      const simpaPortalIdFromId = simpaInfo.simpaPortalId;
      const simpaHsObjectId = simpaInfo.simpaHsObjectId;

      if (!simpaHsObjectId) {
        console.log(`[webhook-enrich] ⚠️ No se pudo extraer hs_object_id de SIMPA desde idNegocioSimpa`);
      } else {
        // Determinar el portalId de SIMPA
        // Si no está en idNegocioSimpa, usar variable de entorno o buscar en razones-sociales.json
        if (simpaPortalIdFromId) {
          simpaPortalId = simpaPortalIdFromId;
        } else {
          // Buscar portalId de SIMPA en variables de entorno o configuración
          simpaPortalId = process.env.SIMPA_PORTAL_ID || null;
          if (!simpaPortalId) {
            console.warn(`[webhook-enrich] ⚠️ No se encontró portalId de SIMPA, intentando usar PORTAL_SIMPA_REFRESH_TOKEN para identificar portal`);
          }
        }

        console.log(`[webhook-enrich] 🔍 PortalId de SIMPA: ${simpaPortalId || 'N/A (usando token genérico)'}`);
        console.log(`[webhook-enrich] 🔍 hs_object_id del deal en SIMPA: ${simpaHsObjectId}`);

        // PASO 3: Obtener token para el portal de SIMPA
        try {
          console.log(`[webhook-enrich] 🔍 PASO 3: Obteniendo token para portal de SIMPA...`);

          // Intentar obtener token usando el portalId específico
          let tokenObtained = false;
          if (simpaPortalId) {
            try {
              simpaAccessToken = await getAccessTokenForPortalId(simpaPortalId);
              tokenObtained = true;
              console.log(`[webhook-enrich] ✅ Token obtenido para SIMPA usando portalId ${simpaPortalId}`);
            } catch (portalTokenError) {
              console.log(`[webhook-enrich] 🔍 No se pudo obtener token para portalId ${simpaPortalId}, intentando con PORTAL_SIMPA_REFRESH_TOKEN`);
            }
          }

          // Si no se obtuvo token, usar PORTAL_SIMPA_REFRESH_TOKEN como fallback
          if (!tokenObtained) {
            const clientId = process.env.HUBSPOT_CLIENT_ID || process.env.CLIENT_ID;
            const clientSecret = process.env.HUBSPOT_CLIENT_SECRET || process.env.CLIENT_SECRET;
            const refreshToken = process.env.PORTAL_SIMPA_REFRESH_TOKEN;

            if (refreshToken && clientId && clientSecret) {
              simpaAccessToken = await getAccessTokenFromRefreshToken(refreshToken, clientId, clientSecret);
              console.log(`[webhook-enrich] ✅ Token obtenido para SIMPA usando PORTAL_SIMPA_REFRESH_TOKEN`);
              tokenObtained = true;
            } else {
              throw new Error('No se encontró PORTAL_SIMPA_REFRESH_TOKEN o credenciales OAuth');
            }
          }
        } catch (tokenError) {
          console.warn(`[webhook-enrich] ⚠️ No se pudo obtener token para portal de SIMPA: ${tokenError.message}`);
          console.warn(`[webhook-enrich] ⚠️ Continuando sin actualizar SIMPA`);
        }

        // PASO 4: Obtener el deal del portal de SIMPA
        if (simpaAccessToken) {
          try {
            console.log(`[webhook-enrich] 🔍 PASO 4: Obteniendo deal del portal de SIMPA (hs_object_id: ${simpaHsObjectId})...`);
            const simpaHubspotClient = new hubspot.Client({ accessToken: simpaAccessToken });
            simpaDealInfo = await getDealInfo(
              simpaHubspotClient,
              simpaHsObjectId,
              webhookPayload.propertyName
            );
            console.log(`[webhook-enrich] ✅ Deal del portal de SIMPA obtenido: ${simpaDealInfo.id}`);

            // Usar la información del deal del dealer para el enrichedData (más actualizada)
            // Pero guardar simpaDealInfo para actualización
          } catch (simpaDealError) {
            console.warn(`[webhook-enrich] ⚠️ No se pudo obtener deal del portal de SIMPA: ${simpaDealError.message}`);
            console.warn(`[webhook-enrich] ⚠️ Continuando sin actualizar SIMPA`);
            // Si falla, no actualizar SIMPA pero continuar con el enriquecimiento
            simpaDealInfo = null;
          }
        }
      }
    }

    // Obtener información del pipeline y stage
    // Si el webhook es por cambio de dealstage, usar el propertyValue (nuevo stage)
    // Si no, usar el dealstage actual del deal
    const clientForPipeline = dealerHubspotClient;
    const dealIdForPipeline = dealInfo.id;

    let pipelineStageInfo = null;
    let stageToUse = null;
    let pipelineToUse = null;

    // Si el webhook es por cambio de dealstage, usar el propertyValue como el nuevo stage
    if (webhookPayload.propertyName === 'dealstage' && webhookPayload.propertyValue) {
      stageToUse = webhookPayload.propertyValue;
      pipelineToUse = dealInfo.properties?.pipeline || 'default';
      console.log(`[webhook-enrich] 🔍 Webhook por cambio de dealstage`);
      console.log(`[webhook-enrich]   propertyValue (nuevo stage): ${stageToUse}`);
      console.log(`[webhook-enrich]   pipeline: ${pipelineToUse}`);
      console.log(`[webhook-enrich]   stage actual del deal: ${dealInfo.properties?.dealstage || 'N/A'}`);
    } else if (dealInfo.properties?.pipeline && dealInfo.properties?.dealstage) {
      // Si no es cambio de dealstage, usar el stage actual del deal
      stageToUse = dealInfo.properties.dealstage;
      pipelineToUse = dealInfo.properties.pipeline;
      console.log(`[webhook-enrich] 🔍 Usando stage actual del deal: ${stageToUse} en pipeline: ${pipelineToUse}`);
    }

    if (pipelineToUse && stageToUse) {
      console.log(`[webhook-enrich] 🔍 Obteniendo información de pipeline/stage...`);
      try {
        pipelineStageInfo = await getPipelineStageInfo(
          clientForPipeline,
          pipelineToUse,
          stageToUse
        );
        if (pipelineStageInfo) {
          console.log(`[webhook-enrich] ✅ Información de pipeline/stage obtenida:`);
          console.log(`[webhook-enrich]   Stage ID: ${pipelineStageInfo.stageId}`);
          console.log(`[webhook-enrich]   Stage Label: ${pipelineStageInfo.stageLabel || 'N/A'}`);
          console.log(`[webhook-enrich]   Probability: ${pipelineStageInfo.probability || 'N/A'}`);
          console.log(`[webhook-enrich]   Pipeline ID: ${pipelineStageInfo.pipelineId || 'N/A'}`);
        } else {
          console.warn(`[webhook-enrich] ⚠️ No se pudo obtener información del stage ${stageToUse} en pipeline ${pipelineToUse}`);
        }
      } catch (pipelineError) {
        console.warn(`[webhook-enrich] ⚠️ Error obteniendo información de pipeline/stage: ${pipelineError.message}`);
      }
    }

    // Obtener contactos asociados
    // Usar el dealId del dealer si está disponible, sino el de SIMPA
    console.log(`[webhook-enrich] 🔍 Obteniendo contactos asociados...`);
    const associatedContacts = await getAssociatedContacts(clientForPipeline, dealIdForPipeline);

    // Construir payload enriquecido
    const enrichedPayload = {
      // Payload original del webhook
      originalWebhook: webhookPayload,

      // Información adicional
      enrichedData: {
        dealInfo: {
          id: dealInfo.id,
          name: dealInfo.properties?.dealname || null,
          amount: dealInfo.properties?.amount || null,
          closeDate: dealInfo.properties?.closedate || null,
          dealType: dealInfo.properties?.dealtype || null,
          marca: dealInfo.properties?.marca_simpa || null,
          modelo: dealInfo.properties?.modelo_simpa || null,
          concesionario: dealInfo.properties?.concesionarios_simpa || null,
          motivo_de_perdida: dealInfo.properties?.motivo_de_perdida || null,
          otro_motivo_de_perdida: dealInfo.properties?.otro_motivo_de_perdida || null,
          idNegocioSimpa: dealInfo.properties?.id_negocio_simpa || null,
          createdAt: dealInfo.createdAt,
          updatedAt: dealInfo.updatedAt,
          archived: dealInfo.archived
        },
        pipelineStage: pipelineStageInfo,
        associatedContacts: associatedContacts,
        contactsCount: associatedContacts.length,
        propertyChanged: {
          name: webhookPayload.propertyName,
          oldValue: webhookPayload.propertyValue, // En webhooks de HubSpot, esto es el nuevo valor
          newValue: dealInfo.properties?.[webhookPayload.propertyName] || null
        }
      },

      // Metadatos del enriquecimiento
      enrichmentMetadata: {
        enrichedAt: new Date().toISOString(),
        portalId: webhookPayload.portalId,
        objectId: webhookPayload.objectId,
        subscriptionType: webhookPayload.subscriptionType,
        razonSocial: razonSocialInfo?.razonSocial || null,
        tokenEnv: razonSocialInfo?.config?.tokenEnv || null
      }
    };

    console.log(`[webhook-enrich] ✅ Payload enriquecido creado`);
    console.log(`[webhook-enrich]   Deal: ${enrichedPayload.enrichedData.dealInfo.name || 'N/A'}`);
    console.log(`[webhook-enrich]   Stage: ${pipelineStageInfo?.stageLabel || 'N/A'}`);
    console.log(`[webhook-enrich]   Contactos: ${associatedContacts.length}`);
    console.log(`[webhook-enrich]   idNegocioSimpa: ${enrichedPayload.enrichedData.dealInfo.idNegocioSimpa || 'N/A'}`);

    // Actualizar información en SIMPA si existe idNegocioSimpa y se obtuvo el deal de SIMPA
    let simpaUpdateResult = null;
    if (idNegocioSimpa && simpaDealInfo && simpaAccessToken) {
      try {
        console.log(`[webhook-enrich] 🔄 Actualizando deal en SIMPA (hs_object_id: ${simpaDealInfo.id})...`);

        // Actualizar el deal en SIMPA con la información del dealer
        const simpaHubspotClient = new hubspot.Client({ accessToken: simpaAccessToken });

        // Preparar propiedades a actualizar en SIMPA
        const updateProperties = {};

        // Obtener la marca del deal para determinar el pipeline correcto
        // Intentar varias propiedades posibles para la marca
        let marca = dealInfo.properties?.marca_simpa || dealInfo.properties?.marca || dealInfo.properties?.brand;

        console.log(`[webhook-enrich] 🔍 Propiedades disponibles en deal dealer: ${Object.keys(dealInfo.properties || {}).join(', ')}`);
        console.log(`[webhook-enrich] 🔍 Valor marca_simpa: "${dealInfo.properties?.marca_simpa || ''}"`);

        if (simpaDealInfo) {
          console.log(`[webhook-enrich] 🔍 Propiedades disponibles en deal SIMPA: ${Object.keys(simpaDealInfo.properties || {}).join(', ')}`);
        }

        // Si no hay marca en el deal del dealer, intentar obtenerla del deal de SIMPA
        if (!marca && simpaDealInfo && simpaDealInfo.properties) {
          marca = simpaDealInfo.properties.marca_simpa || simpaDealInfo.properties.marca || simpaDealInfo.properties.brand;
          if (marca) {
            console.log(`[webhook-enrich] ⚠️ Marca no encontrada en deal del dealer, usando marca del deal de SIMPA: ${marca}`);
          }
        }

        // Si no hay marca en el deal, intentar obtenerla del primer contacto asociado
        if (!marca && associatedContacts && associatedContacts.length > 0) {
          marca = associatedContacts[0].marca;
          console.log(`[webhook-enrich] ⚠️ Marca no encontrada en deal, usando marca del primer contacto asociado: ${marca || 'N/A'}`);
        }

        // Fallback: Inferir marca del nombre del deal
        if (!marca && dealInfo.properties?.dealname && simpaPipelinesConfig) {
          const dealName = dealInfo.properties.dealname.toUpperCase();
          for (const configBrand of Object.keys(simpaPipelinesConfig)) {
            if (dealName.includes(configBrand.toUpperCase())) {
              marca = configBrand;
              console.log(`[webhook-enrich] ⚠️ Marca inferida del nombre del deal ("${dealInfo.properties.dealname}"): ${marca}`);
              break;
            }
          }
        }

        console.log(`[webhook-enrich] 🔍 Marca final detectada: ${marca || 'N/A'}`);
        console.log(`[webhook-enrich] 🔍 Pipeline stage info disponible: ${pipelineStageInfo ? 'SÍ' : 'NO'}`);
        console.log(`[webhook-enrich] 🔍 Probability: ${pipelineStageInfo?.probability || 'N/A'}`);
        console.log(`[webhook-enrich] 🔍 simpaPipelinesConfig disponible: ${simpaPipelinesConfig ? 'SÍ' : 'NO'}`);
        console.log(`[webhook-enrich] 🔍 Marcas en config: ${simpaPipelinesConfig ? Object.keys(simpaPipelinesConfig).join(', ') : 'N/A'}`);

        // Si hay información de pipeline/stage del dealer, mapear a SIMPA
        if (pipelineStageInfo && pipelineStageInfo.probability) {
          if (marca) {
            const simpaStage = findSimpaStageByProbability(marca, pipelineStageInfo.probability);

            if (simpaStage) {
              // Actualizar pipeline y stage en SIMPA
              updateProperties.pipeline = simpaStage.pipelineId;
              updateProperties.dealstage = simpaStage.stageId;
              console.log(`[webhook-enrich] 🔄 Mapeando stage del dealer (probability: ${pipelineStageInfo.probability}) a SIMPA (pipelineId: ${simpaStage.pipelineId}, stageId: ${simpaStage.stageId}, probability: ${simpaStage.probability})`);
            } else {
              console.warn(`[webhook-enrich] ⚠️ No se pudo encontrar stage en SIMPA para marca ${marca} con probability ${pipelineStageInfo.probability}`);
            }
          } else {
            console.warn(`[webhook-enrich] ⚠️ No hay marca disponible para mapear pipeline/stage`);
          }
        } else {
          if (!marca) {
            console.warn(`[webhook-enrich] ⚠️ No hay marca disponible para mapear pipeline/stage`);
          }
          if (!pipelineStageInfo || !pipelineStageInfo.probability) {
            console.warn(`[webhook-enrich] ⚠️ No hay información de pipeline/stage del dealer disponible`);
          }
        }

        // Actualizar otras propiedades relevantes del deal en SIMPA
        if (dealInfo.properties?.amount) {
          updateProperties.amount = dealInfo.properties.amount;
        }
        if (dealInfo.properties?.closedate) {
          updateProperties.closedate = dealInfo.properties.closedate;
        }
        if (dealInfo.properties?.dealtype) {
          updateProperties.dealtype = dealInfo.properties.dealtype;
        }

        // Si la probabilidad es 0.0 (Closed Lost), incluir motivos de pérdida
        if (pipelineStageInfo && pipelineStageInfo.probability === 0) {
          console.log(`[webhook-enrich] 🔍 Deal perdido (probability 0.0), incluyendo motivos de pérdida`);

          if (dealInfo.properties?.motivo_de_perdida) {
            updateProperties.motivo_de_perdida = dealInfo.properties.motivo_de_perdida;
            console.log(`[webhook-enrich]   motivo_de_perdida: ${dealInfo.properties.motivo_de_perdida}`);
          }

          if (dealInfo.properties?.otro_motivo_de_perdida) {
            updateProperties.otro_motivo_de_perdida = dealInfo.properties.otro_motivo_de_perdida;
            console.log(`[webhook-enrich]   otro_motivo_de_perdida: ${dealInfo.properties.otro_motivo_de_perdida}`);
          }
        }

        // Solo actualizar si hay propiedades para actualizar
        if (Object.keys(updateProperties).length > 0) {
          console.log(`[webhook-enrich] 🔄 Propiedades a actualizar en SIMPA: ${Object.keys(updateProperties).join(', ')}`);

          // Actualizar el deal en SIMPA
          await simpaHubspotClient.crm.deals.basicApi.update(simpaDealInfo.id, {
            properties: updateProperties
          });

          console.log(`[webhook-enrich] ✅ Deal actualizado en SIMPA exitosamente`);
          simpaUpdateResult = {
            success: true,
            message: `Deal ${simpaDealInfo.id} actualizado en SIMPA`,
            updatedProperties: Object.keys(updateProperties),
            simpaStage: updateProperties.dealstage ? {
              pipelineId: updateProperties.pipeline,
              stageId: updateProperties.dealstage
            } : null
          };
        } else {
          console.log(`[webhook-enrich] ℹ️ No hay propiedades para actualizar en SIMPA`);
          simpaUpdateResult = {
            success: true,
            message: `No hay propiedades para actualizar en SIMPA`,
            updatedProperties: []
          };
        }
      } catch (simpaError) {
        console.error(`[webhook-enrich] ❌ Error actualizando SIMPA:`, simpaError.message);
        // Continuar aunque falle la actualización de SIMPA
        simpaUpdateResult = { success: false, error: simpaError.message };
      }
    } else {
      if (!idNegocioSimpa) {
        console.log(`[webhook-enrich] ℹ️ No hay idNegocioSimpa, omitiendo actualización en SIMPA`);
      } else if (!simpaDealInfo) {
        console.log(`[webhook-enrich] ℹ️ No se pudo obtener deal de SIMPA, omitiendo actualización`);
      } else if (!simpaAccessToken) {
        console.log(`[webhook-enrich] ℹ️ No se pudo obtener token para SIMPA, omitiendo actualización`);
      }
    }

    // Obtener URL de destino desde query params o variable de entorno
    const targetUrl = req.query.targetUrl || process.env.WEBHOOK_TARGET_URL || null;

    // Si hay URL de destino, enviar el payload enriquecido
    if (targetUrl) {
      console.log(`[webhook-enrich] 📤 Enviando payload enriquecido a: ${targetUrl}`);
      const sendResult = await sendEnrichedPayload(enrichedPayload, targetUrl);
      console.log(`[webhook-enrich] ✅ Payload enviado exitosamente`);

      return res.status(200).json({
        status: 'success',
        message: 'Webhook enriquecido y enviado exitosamente',
        enrichedPayload: enrichedPayload,
        sendResult: sendResult,
        simpaUpdate: simpaUpdateResult
      });
    }

    // Si no hay URL de destino, retornar el payload enriquecido
    return res.status(200).json({
      status: 'success',
      message: 'Webhook enriquecido exitosamente',
      enrichedPayload: enrichedPayload,
      simpaUpdate: simpaUpdateResult
    });

  } catch (error) {
    console.error('[webhook-enrich] ❌ Error:', error.message);
    console.error('[webhook-enrich] Stack:', error.stack);

    // Determinar el código de estado apropiado
    let statusCode = 500;
    let errorMessage = error.message || 'Error procesando webhook';

    // Si es un error de token no encontrado, devolver 401
    if (error.message && error.message.includes('No se pudo obtener token')) {
      statusCode = 401;
      errorMessage = `Token de acceso no configurado para portalId ${webhookPayload?.portalId || 'N/A'}. ` +
        `Configura la variable de entorno en Vercel: TEST_ACCOUNT_KEY o PORTAL_${webhookPayload?.portalId || ''}_TOKEN`;
    }

    // Si es un error 404 de HubSpot (deal no encontrado)
    if (error.response?.statusCode === 404 || error.statusCode === 404) {
      statusCode = 404;
      errorMessage = `Deal ${webhookPayload?.objectId || 'N/A'} no encontrado en portalId ${webhookPayload?.portalId || 'N/A'}`;
    }

    // Si es un error 401 de HubSpot (token inválido)
    if (error.response?.statusCode === 401 || error.statusCode === 401) {
      statusCode = 401;
      errorMessage = `Token de HubSpot inválido o sin permisos para portalId ${webhookPayload?.portalId || 'N/A'}`;
    }

    return res.status(statusCode).json({
      status: 'error',
      message: errorMessage,
      portalId: webhookPayload?.portalId || null,
      objectId: webhookPayload?.objectId || null,
      error: {
        name: error.name,
        code: error.code,
        statusCode: error.response?.statusCode || error.statusCode,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    });
  }
};

