const hubspot = require('@hubspot/api-client');
const fs = require('fs');
const path = require('path');

// Cargar configuración de razones sociales
let razonesSocialesConfig;
const razonesSocialesPaths = [
  path.join(__dirname, '../../src/config/razones-sociales.json'),
  path.join(__dirname, '../src/config/razones-sociales.json'),
  path.join(__dirname, 'src/config/razones-sociales.json'),
  path.join(process.cwd(), 'src/config/razones-sociales.json'),
  '/var/task/src/config/razones-sociales.json',
  '/var/task/vercel/src/config/razones-sociales.json',
  '/var/task/api/src/config/razones-sociales.json'
];

for (const razonesSocialesPath of razonesSocialesPaths) {
  try {
    if (fs.existsSync(razonesSocialesPath)) {
      razonesSocialesConfig = JSON.parse(fs.readFileSync(razonesSocialesPath, 'utf8'));
      console.log(`[bulk-models] ✅ razones-sociales.json cargado`);
      break;
    }
  } catch (error) {
    // Continuar con el siguiente path
  }
}

if (!razonesSocialesConfig) {
  try {
    razonesSocialesConfig = require('../../src/config/razones-sociales.json');
    console.log('[bulk-models] ✅ razones-sociales.json cargado con require');
  } catch (error) {
    try {
      razonesSocialesConfig = require('../src/config/razones-sociales.json');
      console.log('[bulk-models] ✅ razones-sociales.json cargado con require relativo');
    } catch (error2) {
      console.warn('[bulk-models] ⚠️ Usando fallback hardcodeado para razones-sociales.json');
      razonesSocialesConfig = {
        "SPORTADVENTURE": { "tokenEnv": "SPORTADVENTURE_TOKEN", "brands": ["Moto Morini", "Royal Enfield", "KTM", "QJ Motor", "CF Moto"], "dealers": [] },
        "BAMP MOTORCYCLES SA": { "tokenEnv": "BAMP_MOTORCYCLES_SA_TOKEN", "brands": ["Royal Enfield", "KTM", "Vespa"], "dealers": [] },
        "I CASA": { "tokenEnv": "I_CASA_TOKEN", "brands": ["Moto Morini", "Royal Enfield", "KTM", "QJ Motor"], "dealers": [] },
        "RE VESPA MENDOZA SAS": { "tokenEnv": "RE_VESPA_MENDOZA_SAS_TOKEN", "brands": ["Royal Enfield", "Vespa"], "dealers": [] },
        "ASIAN MOTION POINT S.A.": { "tokenEnv": "ASIAN_MOTION_POINT_SA_TOKEN", "brands": ["QJ Motor"], "dealers": [] },
        "BUENOS RUMBOS SA": { "tokenEnv": "BUENOS_RUMBOS_SA_TOKEN", "brands": ["QJ Motor"], "dealers": [] },
        "CLAUSELL RICARDO ARIEL": { "tokenEnv": "CLAUSELL_RICARDO_ARIEL_TOKEN", "brands": ["QJ Motor"], "dealers": [] },
        "LEMAMOTOR SA": { "tokenEnv": "LEMAMOTOR_SA_TOKEN", "brands": ["Royal Enfield", "KTM", "Moto Morini"], "dealers": [] },
        "OLIVERA ROBERTO FEDERICO": { "tokenEnv": "OLIVERA_ROBERTO_FEDERICO_TOKEN", "brands": ["QJ Motor"], "dealers": [] },
        "PRO ONE SA": { "tokenEnv": "PRO_ONE_SA_TOKEN", "brands": ["QJ Motor"], "dealers": [] },
        "QJ MENDOZA SAS": { "tokenEnv": "QJ_MENDOZA_SAS_TOKEN", "brands": ["QJ Motor"], "dealers": [] },
        "ROYAL MOTORS SA": { "tokenEnv": "ROYAL_MOTORS_SA_TOKEN", "brands": ["Royal Enfield", "QJ Motor"], "dealers": [] },
        "URBAN MOBILITY SRL": { "tokenEnv": "URBAN_MOBILITY_SRL_TOKEN", "brands": ["QJ Motor"], "dealers": [] },
        "USADOS DE CALIDAD SRL": { "tokenEnv": "USADOS_DE_CALIDAD_SRL_TOKEN", "brands": ["QJ Motor"], "dealers": [] },
        "BUENAS RUTAS": { "tokenEnv": "BUENAS_RUTAS_TOKEN", "brands": ["Royal Enfield"], "dealers": [] },
        "CORDASCO": { "tokenEnv": "CORDASCO_TOKEN", "brands": ["Royal Enfield"], "dealers": [] },
        "ALTO OESTE": { "tokenEnv": "ALTO_OESTE_TOKEN", "brands": ["Royal Enfield"], "dealers": [] },
        "MOTOLIFE SA": { "tokenEnv": "MOTOLIFE_SA_TOKEN", "brands": ["Moto Morini", "Royal Enfield"], "dealers": [] },
        "NSM": { "tokenEnv": "NSM_TOKEN", "brands": ["Royal Enfield"], "dealers": [] },
        "REYVEN": { "tokenEnv": "REYVEN_TOKEN", "brands": ["KTM", "Moto Morini"], "dealers": [] },
        "SUR VALLEY SA": { "tokenEnv": "SUR_VALLEY_SA_TOKEN", "brands": ["Moto Morini", "KTM"], "dealers": [] },
        "TEST ACCOUNT": { "tokenEnv": "TEST_ACCOUNT_KEY", "brands": [], "dealers": [] }
      };
    }
  }
}

function sanitize(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeKey(value) {
  return typeof value === 'string' ? value.toLowerCase().trim() : '';
}

function normalizeMarcaToPropertyName(marca) {
  return marca.toLowerCase().trim().replace(/\s+/g, '_');
}

function getObjectTypeKey(objectType) {
  return objectType === 'deal' ? 'deals' : 'contacts';
}

// Función para agregar una opción a una propiedad
async function addOptionToProperty(hubspotClient, objectType, propertyName, newModelOption, stats, erroresDetallados) {
  const objectTypeKey = getObjectTypeKey(objectType);
  console.log(`[bulk-models] Procesando ${objectType}:${propertyName}`);

  try {
    // Intentar obtener la propiedad
    let existingProperty = null;
    try {
      existingProperty = await hubspotClient.crm.properties.coreApi.getByName(objectTypeKey, propertyName);
    } catch (error) {
      // Propiedad no existe, se creará
    }

    if (!existingProperty) {
      // Crear propiedad con opción inicial
      const propertyLabel = propertyName === 'modelo_simpa' ? 'Modelo' : `Modelo ${propertyName.replace('modelo_', '').replace(/_/g, ' ')}`;
      const propertyDescription = propertyName === 'modelo_simpa' ? 'Modelos de motos' : `Modelos de motos ${propertyName.replace('modelo_', '').replace(/_/g, ' ')}`;
      const initialOption = { label: newModelOption, value: newModelOption, hidden: false, displayOrder: 0 };
      const newProperty = {
        name: propertyName,
        label: propertyLabel,
        description: propertyDescription,
        groupName: objectType === 'deal' ? 'dealinformation' : 'contactinformation',
        type: 'enumeration',
        fieldType: 'select',
        options: [initialOption]
      };
      existingProperty = await hubspotClient.crm.properties.coreApi.create(objectTypeKey, newProperty);
      console.log(`[bulk-models] ✅ Propiedad ${propertyName} creada en ${objectType}`);
      stats.propertiesCreated++;
      stats.optionsAdded++;
      return { added: true, reason: 'created_with_option' };
    }

    // Verificar si la opción ya existe
    const existingOptions = Array.isArray(existingProperty.options) ? existingProperty.options : [];
    const newOptionNormalized = normalizeKey(newModelOption);
    const existingKeys = new Set(existingOptions.map(opt => normalizeKey(opt.value || opt.label || '')).filter(Boolean));
    
    if (existingKeys.has(newOptionNormalized)) {
      console.log(`[bulk-models] ⚠️ Opción "${newModelOption}" ya existe en ${objectType}:${propertyName}`);
      return { added: false, reason: 'already_exists' };
    }

    // Agregar nueva opción
    const maxDisplayOrder = existingOptions.length > 0 ? Math.max(...existingOptions.map(opt => opt.displayOrder ?? -1)) : -1;
    const newOption = { label: newModelOption, value: newModelOption, hidden: false, displayOrder: maxDisplayOrder + 1 };
    const updateDefinition = { options: [...existingOptions, newOption] };
    const updateResponse = await hubspotClient.crm.properties.coreApi.update(objectTypeKey, propertyName, updateDefinition);
    
    const responseValues = (updateResponse.options || []).map(opt => normalizeKey(opt.value || opt.label || ''));
    if (responseValues.includes(newOptionNormalized)) {
      console.log(`[bulk-models] ✅ Opción "${newModelOption}" agregada a ${objectType}:${propertyName}`);
      stats.propertiesUpdated++;
      stats.optionsAdded++;
      return { added: true };
    }
    
    return { added: false, reason: 'not_in_response' };
  } catch (error) {
    const errMsg = error?.message || 'Error procesando propiedad';
    console.error(`[bulk-models] ❌ Error procesando ${objectType}:${propertyName}:`, errMsg);
    erroresDetallados.push({ error: errMsg, property: propertyName, option: newModelOption, objectType });
    throw error;
  }
}

// Función para procesar modelo en una razón social
async function procesarModeloEnRazonSocial(razonSocial, marca, modelo, stats) {
  const config = razonesSocialesConfig[razonSocial];
  if (!config || !config.tokenEnv) {
    throw new Error(`No se encontró tokenEnv para ${razonSocial}`);
  }

  const accessToken = process.env[config.tokenEnv];
  if (!accessToken) {
    throw new Error(`Token ${config.tokenEnv} no encontrado en variables de entorno`);
  }

  const hubspotClient = new hubspot.Client({ accessToken });
  const newModelOption = modelo.trim();
  const marcaNormalized = normalizeMarcaToPropertyName(marca);
  const propertyNameMarca = `modelo_${marcaNormalized}`;
  const erroresDetallados = [];

  const statsBefore = {
    propertiesUpdated: stats.propertiesUpdated,
    optionsAdded: stats.optionsAdded
  };

  // Procesar modelo_simpa y modelo_{marca} para contact y deal
  await addOptionToProperty(hubspotClient, 'contact', 'modelo_simpa', newModelOption, stats, erroresDetallados);
  await addOptionToProperty(hubspotClient, 'deal', 'modelo_simpa', newModelOption, stats, erroresDetallados);
  await addOptionToProperty(hubspotClient, 'contact', propertyNameMarca, newModelOption, stats, erroresDetallados);
  await addOptionToProperty(hubspotClient, 'deal', propertyNameMarca, newModelOption, stats, erroresDetallados);

  const hadChanges = stats.propertiesUpdated > statsBefore.propertiesUpdated || stats.optionsAdded > statsBefore.optionsAdded;
  return { hadChanges, erroresDetallados };
}

// Función principal para procesar bulk
async function procesarBulkModels(marca, modelo) {
  if (!marca) {
    throw new Error('El parámetro "marca" es requerido');
  }
  if (!modelo) {
    throw new Error('El parámetro "modelo" es requerido');
  }
  if (!razonesSocialesConfig) {
    throw new Error('No se pudo cargar la configuración de razones sociales');
  }

  function normalizeMarcaForComparison(marcaValue) {
    if (!marcaValue || typeof marcaValue !== 'string') {
      return '';
    }
    return marcaValue.toLowerCase().trim();
  }

  const marcaNormalized = normalizeMarcaForComparison(marca);
  console.log(`[bulk-models] Buscando razones sociales con marca: "${marca}" (normalizada: "${marcaNormalized}")`);

  // Buscar razones sociales con esta marca
  const razonesSocialesConMarca = Object.entries(razonesSocialesConfig)
    .filter(([razon, config]) => {
      if (!config || !config.brands || !Array.isArray(config.brands)) {
        return false;
      }
      return config.brands.some(b => {
        const matchOriginal = b === marca;
        const matchNormalized = normalizeMarcaForComparison(b) === marcaNormalized;
        return matchOriginal || matchNormalized;
      });
    })
    .map(([razon]) => razon);

  if (razonesSocialesConMarca.length === 0) {
    throw new Error(`No se encontraron razones sociales configuradas con la marca "${marca}"`);
  }

  console.log(`[bulk-models] ✅ Encontradas ${razonesSocialesConMarca.length} razones sociales con marca "${marca}"`);

  const bulkStats = {
    total: razonesSocialesConMarca.length,
    procesadas: 0,
    exitosas: 0,
    fallidas: 0,
    errores: []
  };

  const stats = {
    propertiesCreated: 0,
    propertiesUpdated: 0,
    optionsAdded: 0
  };

  // Procesar cada razón social
  for (const razonSocial of razonesSocialesConMarca) {
    console.log(`[bulk-models] Procesando: ${razonSocial} (${bulkStats.procesadas + 1}/${bulkStats.total})`);
    
    try {
      const result = await procesarModeloEnRazonSocial(razonSocial, marca, modelo, stats);
      bulkStats.procesadas++;
      
      if (result.hadChanges) {
        bulkStats.exitosas++;
        console.log(`[bulk-models] ✅ ${razonSocial}: Modelo "${modelo}" agregado exitosamente`);
      } else {
        bulkStats.exitosas++;
        console.log(`[bulk-models] ✅ ${razonSocial}: Modelo "${modelo}" ya existía`);
      }
      
      if (result.erroresDetallados.length > 0) {
        result.erroresDetallados.forEach(e => {
          bulkStats.errores.push({ razonSocial, ...e });
        });
      }
    } catch (error) {
      bulkStats.procesadas++;
      bulkStats.fallidas++;
      const errorMessage = error?.message || 'Error desconocido';
      console.error(`[bulk-models] ❌ Error procesando ${razonSocial}: ${errorMessage}`);
      bulkStats.errores.push({ razonSocial, error: errorMessage });
    }
  }

  // Validar resultados
  if (bulkStats.exitosas === 0 && bulkStats.total > 0) {
    const errorMsg = `No se pudo actualizar ninguna razón social. Errores: ${bulkStats.errores.map(e => `${e.razonSocial}: ${e.error}`).join('; ')}`;
    throw new Error(errorMsg);
  }

  return { bulkStats, stats };
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', message: 'Bulk models endpoint is running' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }

  try {
    const event = req.body || {};
    const inputFields = event.inputFields || {};

    const marca = sanitize(inputFields.marca);
    const modelo = sanitize(inputFields.modelo);

    if (!marca) {
      throw new Error('El parámetro "marca" es requerido');
    }
    if (!modelo) {
      throw new Error('El parámetro "modelo" es requerido');
    }

    console.log(`[bulk-models] Iniciando bulk update: marca="${marca}", modelo="${modelo}"`);

    const result = await procesarBulkModels(marca, modelo);

    const outputFields = {
      success: true,
      message: `Bulk update completado. ${result.bulkStats.exitosas}/${result.bulkStats.total} razones sociales actualizadas exitosamente. ${result.bulkStats.fallidas} fallaron.`,
      bulkTotal: result.bulkStats.total,
      bulkExitosas: result.bulkStats.exitosas,
      bulkFallidas: result.bulkStats.fallidas,
      propertiesCreated: result.stats.propertiesCreated,
      propertiesUpdated: result.stats.propertiesUpdated,
      optionsAdded: result.stats.optionsAdded
    };

    if (result.bulkStats.errores.length > 0) {
      outputFields.bulkErroresCount = result.bulkStats.errores.length;
      outputFields.bulkErroresDetalle = result.bulkStats.errores
        .map(e => `${e.razonSocial} | Propiedad: ${e.property || 'N/A'} | Opción: ${e.option || 'N/A'} | Tipo: ${e.objectType || 'N/A'} | Error: ${e.error}`)
        .join('\n');
    }

    return res.status(200).json(outputFields);
  } catch (error) {
    console.error('[bulk-models] Error:', error.message);
    console.error('[bulk-models] Stack:', error.stack);
    return res.status(500).json({
      success: false,
      message: error.message,
      error: error.message
    });
  }
};

