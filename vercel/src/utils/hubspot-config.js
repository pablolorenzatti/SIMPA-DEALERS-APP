/**
 * Helper común para cargar configuración de razones sociales y obtener tokens de HubSpot
 * Reutilizable en todos los endpoints de Vercel
 */

const fs = require('fs');
const path = require('path');

let razonesSocialesConfig = null;
let configLoaded = false;

/**
 * Rutas posibles para el archivo razones-sociales.json
 */
const razonesSocialesPaths = [
  path.join(__dirname, '../../src/config/razones-sociales.json'),
  path.join(__dirname, '../config/razones-sociales.json'),
  path.join(__dirname, 'src/config/razones-sociales.json'),
  path.join(process.cwd(), 'src/config/razones-sociales.json'),
  '/var/task/src/config/razones-sociales.json',
  '/var/task/vercel/src/config/razones-sociales.json',
  '/var/task/api/src/config/razones-sociales.json'
];

/**
 * Carga la configuración de razones sociales desde el archivo JSON
 * @returns {Object|null} Configuración de razones sociales o null si no se puede cargar
 */
function loadRazonesSocialesConfig() {
  if (configLoaded && razonesSocialesConfig) {
    return razonesSocialesConfig;
  }

  // Intentar cargar desde archivos
  for (const razonesSocialesPath of razonesSocialesPaths) {
    try {
      if (fs.existsSync(razonesSocialesPath)) {
        razonesSocialesConfig = JSON.parse(fs.readFileSync(razonesSocialesPath, 'utf8'));
        console.log(`[hubspot-config] ✅ razones-sociales.json cargado desde: ${razonesSocialesPath}`);
        configLoaded = true;
        return razonesSocialesConfig;
      }
    } catch (error) {
      console.warn(`[hubspot-config] ⚠️ Error cargando desde ${razonesSocialesPath}: ${error.message}`);
    }
  }

  // Intentar con require como fallback
  try {
    razonesSocialesConfig = require('../../src/config/razones-sociales.json');
    console.log('[hubspot-config] ✅ razones-sociales.json cargado con require');
    configLoaded = true;
    return razonesSocialesConfig;
  } catch (error) {
    try {
      razonesSocialesConfig = require('../config/razones-sociales.json');
      console.log('[hubspot-config] ✅ razones-sociales.json cargado con require relativo');
      configLoaded = true;
      return razonesSocialesConfig;
    } catch (error2) {
      console.warn('[hubspot-config] ⚠️ No se pudo cargar razones-sociales.json');
      configLoaded = true;
      return null;
    }
  }
}

/**
 * Obtiene la configuración de una razón social específica
 * @param {string} razonSocial - Nombre de la razón social
 * @returns {Object|null} Configuración de la razón social o null si no existe
 */
function getRazonSocialConfig(razonSocial) {
  const config = loadRazonesSocialesConfig();
  if (!config || !razonSocial) {
    return null;
  }
  return config[razonSocial] || null;
}

/**
 * Busca una razón social por portalId
 * @param {number|string} portalId - ID del portal de HubSpot
 * @returns {Object|null} Objeto con {razonSocial, config} o null si no se encuentra
 */
function findRazonSocialByPortalId(portalId) {
  const config = loadRazonesSocialesConfig();
  if (!config || !portalId) {
    return null;
  }

  const portalIdStr = String(portalId);

  // Buscar en todas las razones sociales
  for (const [razonSocial, razonConfig] of Object.entries(config)) {
    // Si el archivo tiene un campo portalId, usarlo
    if (razonConfig.portalId && String(razonConfig.portalId) === portalIdStr) {
      return { razonSocial, config: razonConfig };
    }
  }

  return null;
}

/**
 * Obtiene el token de acceso de HubSpot para una razón social
 * @param {string} razonSocial - Nombre de la razón social
 * @returns {string} Token de acceso
 * @throws {Error} Si no se encuentra la configuración o el token
 */
function getAccessTokenForRazonSocial(razonSocial) {
  if (!razonSocial) {
    throw new Error('La razón social es requerida');
  }

  const razonConfig = getRazonSocialConfig(razonSocial);
  
  if (!razonConfig || !razonConfig.tokenEnv) {
    // Fallback: construir el nombre de la variable de entorno
    const tokenEnv = `${razonSocial.toUpperCase().replace(/\s+/g, '_')}_TOKEN`;
    console.warn(`[hubspot-config] ⚠️ Razón social "${razonSocial}" no encontrada en configuración, usando fallback: ${tokenEnv}`);
    
    const accessToken = process.env[tokenEnv];
    if (!accessToken) {
      throw new Error(`No se encontró token para la razón social "${razonSocial}". Define la variable ${tokenEnv} en Vercel.`);
    }
    
    console.log(`[hubspot-config] ✅ Token obtenido desde ${tokenEnv} (fallback)`);
    return accessToken;
  }

  const tokenEnv = razonConfig.tokenEnv;
  const accessToken = process.env[tokenEnv];

  if (!accessToken) {
    throw new Error(`Token ${tokenEnv} no encontrado en variables de entorno de Vercel para la razón social "${razonSocial}"`);
  }

  console.log(`[hubspot-config] ✅ Token obtenido desde ${tokenEnv} para "${razonSocial}"`);
  return accessToken;
}

/**
 * Obtiene el token de acceso de HubSpot para un portalId
 * @param {number|string} portalId - ID del portal de HubSpot
 * @returns {string} Token de acceso
 * @throws {Error} Si no se encuentra la configuración o el token
 */
function getAccessTokenForPortalId(portalId) {
  if (!portalId) {
    throw new Error('El portalId es requerido');
  }

  // Buscar razón social por portalId
  const result = findRazonSocialByPortalId(portalId);
  
  if (result && result.config && result.config.tokenEnv) {
    const tokenEnv = result.config.tokenEnv;
    const accessToken = process.env[tokenEnv];
    
    if (!accessToken) {
      throw new Error(`Token ${tokenEnv} no encontrado en variables de entorno de Vercel para portalId ${portalId} (${result.razonSocial})`);
    }
    
    console.log(`[hubspot-config] ✅ Token obtenido desde ${tokenEnv} para portalId ${portalId} (${result.razonSocial})`);
    return accessToken;
  }

  // Fallback: intentar con variable de entorno específica del portal
  const portalTokenEnv = `PORTAL_${portalId}_TOKEN`;
  const portalToken = process.env[portalTokenEnv];
  
  if (portalToken) {
    console.log(`[hubspot-config] ✅ Token obtenido desde ${portalTokenEnv} (fallback)`);
    return portalToken;
  }

  // Último fallback: token genérico
  const genericToken = process.env.HUBSPOT_ACCESS_TOKEN;
  if (genericToken) {
    console.warn(`[hubspot-config] ⚠️ Usando token genérico HUBSPOT_ACCESS_TOKEN para portalId ${portalId}`);
    return genericToken;
  }

  throw new Error(`No se encontró token de acceso para portalId ${portalId}. ` +
    `Configura portalId en razones-sociales.json o define la variable ${portalTokenEnv} o HUBSPOT_ACCESS_TOKEN en Vercel.`);
}

/**
 * Obtiene información de la razón social asociada a un portalId
 * @param {number|string} portalId - ID del portal de HubSpot
 * @returns {Object|null} Objeto con {razonSocial, config} o null si no se encuentra
 */
function getRazonSocialInfoByPortalId(portalId) {
  return findRazonSocialByPortalId(portalId);
}

module.exports = {
  loadRazonesSocialesConfig,
  getRazonSocialConfig,
  findRazonSocialByPortalId,
  getAccessTokenForRazonSocial,
  getAccessTokenForPortalId,
  getRazonSocialInfoByPortalId
};

