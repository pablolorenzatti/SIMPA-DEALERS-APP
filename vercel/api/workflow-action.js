const hubspot = require('@hubspot/api-client');
const path = require('path');
const fs = require('fs'); // Still needed for configUtils maybe
const PropertyService = require('../src/services/PropertyService');
const ConfigService = require('./services/config-service');

// Cargar funciones de configuración (config.js - utilidades puras)
let configUtils;
const configPaths = [
  path.join(__dirname, '../../src/utils/config.js'),
  path.join(__dirname, '../src/utils/config.js'),
  path.join(process.cwd(), 'src/utils/config.js'),
  '/var/task/src/utils/config.js'
];

for (const configPath of configPaths) {
  try {
    if (fs.existsSync(configPath)) {
      configUtils = require(configPath);
      break;
    }
  } catch (error) { }
}

if (!configUtils) {
  try {
    configUtils = require('../../src/utils/config.js');
  } catch (error) {
    configUtils = null;
  }
}

// Cargar properties-config.json (ESTÁTICO - raramente cambia)
let propertiesConfig;
const propertiesConfigPaths = [
  path.join(__dirname, '../../src/config/properties-config.json'),
  path.join(__dirname, '../src/config/properties-config.json'),
  path.join(__dirname, 'src/config/properties-config.json'),
  path.join(process.cwd(), 'src/config/properties-config.json'),
  '/var/task/src/config/properties-config.json',
  '/var/task/vercel/src/config/properties-config.json',
  '/var/task/api/src/config/properties-config.json'
];

for (const propertiesConfigPath of propertiesConfigPaths) {
  try {
    if (fs.existsSync(propertiesConfigPath)) {
      propertiesConfig = JSON.parse(fs.readFileSync(propertiesConfigPath, 'utf8'));
      break;
    }
  } catch (error) { }
}

if (!propertiesConfig) {
  try {
    propertiesConfig = require('../../src/config/properties-config.json');
  } catch (error) {
    try {
      propertiesConfig = require('../src/config/properties-config.json');
    } catch (e) { console.error('Error loading properties-config'); }
  }
}

function sanitize(value) {
  return typeof value === 'string' ? value.trim() : value;
}

// Función para procesar modelos en bulk (todas las razones sociales con la marca)
async function procesarPropiedadesModelosBulk(marca, modelo, stats, razonesSocialesConfig, propertyService) {
  console.log('[workflow-action] === Procesando propiedades de MODELOS (MODO BULK) ===');
  console.log(`[workflow-action] Marca: "${marca}", Modelo: "${modelo}"`);

  if (!marca) {
    throw new Error('El parámetro "marca" es requerido para bulk updates');
  }
  if (!modelo) {
    throw new Error('El parámetro "modelo" es requerido para bulk updates');
  }

  if (!razonesSocialesConfig) {
    throw new Error('No se pudo cargar la configuración de razones sociales');
  }

  // Función auxiliar para normalizar y comparar marcas (más robusta)
  function normalizeMarcaForComparison(marcaValue) {
    if (!marcaValue || typeof marcaValue !== 'string') {
      return '';
    }
    return marcaValue.toLowerCase().trim();
  }

  const marcaNormalized = normalizeMarcaForComparison(marca);
  console.log(`[workflow-action] Marca normalizada para búsqueda: "${marcaNormalized}"`);

  // Verificar que tenemos la configuración cargada y mostrar información de debugging
  if (!razonesSocialesConfig) {
    console.error(`[workflow-action] ❌ razonesSocialesConfig no está cargado`);
    throw new Error('No se pudo cargar la configuración de razones sociales');
  }

  const totalRazones = Object.keys(razonesSocialesConfig).length;
  console.log(`[workflow-action] Total de razones sociales en configuración: ${totalRazones}`);

  // Buscar todas las razones sociales que tengan esta marca
  // Comparar tanto en formato original como normalizado
  const razonesSocialesConMarca = Object.entries(razonesSocialesConfig)
    .filter(([razon, config]) => {
      if (!config || !config.brands || !Array.isArray(config.brands)) {
        return false;
      }

      const brands = config.brands;
      const hasMarca = brands.some(b => {
        // Comparar tanto en formato original como normalizado
        const matchOriginal = b === marca;
        const matchNormalized = normalizeMarcaForComparison(b) === marcaNormalized;
        return matchOriginal || matchNormalized;
      });

      return hasMarca;
    })
    .map(([razon]) => razon);

  console.log(`[workflow-action] Razones sociales encontradas después del filtro: ${razonesSocialesConMarca.length}`);

  if (razonesSocialesConMarca.length === 0) {
    console.warn(`[workflow-action] ⚠️ No se encontraron razones sociales con marca "${marca}"`);
    throw new Error(`No se encontraron razones sociales configuradas con la marca "${marca}"`);
  }

  console.log(`[workflow-action] ✅ Encontradas ${razonesSocialesConMarca.length} razones sociales con marca "${marca}":`);
  razonesSocialesConMarca.forEach((razon, index) => {
    console.log(`[workflow-action]   ${index + 1}. ${razon}`);
  });

  // Estadísticas de bulk (con errores detallados)
  const bulkStats = {
    total: razonesSocialesConMarca.length,
    procesadas: 0,
    exitosas: 0,
    fallidas: 0,
    errores: [] // { razonSocial, error, property?, option?, objectType? }
  };

  // Procesar cada razón social
  for (const razonSocial of razonesSocialesConMarca) {
    console.log(`[workflow-action] >>> Procesando ${razonSocial} (Bulk) <<<`);
    try {
      // Obtener token
      let accessToken = null;
      const tokenEnv = razonesSocialesConfig[razonSocial]?.tokenEnv || `${razonSocial.toUpperCase().replace(/\s+/g, '_')}_TOKEN`;
      accessToken = process.env[tokenEnv];

      if (!accessToken) {
        throw new Error(`No se encontró token para ${razonSocial} (variable: ${tokenEnv})`);
      }

      const hubspotClient = new hubspot.Client({ accessToken });

      // Crear contexto para esta razón social
      const context = {
        razonSocial,
        marca,
        modelo
      };

      // Crear stats temporales para esta ejecución
      const tempStats = {
        propertiesCreated: 0,
        propertiesUpdated: 0,
        propertiesSkipped: 0,
        optionsAdded: 0,
        createdProperties: [],
        updatedProperties: [],
        optionDetails: []
      };

      // Ejecutar procesarPropiedadesModelos para esta razón social
      // Reutilizamos la lógica existente
      await procesarPropiedadesModelos(hubspotClient, context, tempStats, propertyService);

      // Actualizar stats globales
      stats.propertiesCreated += tempStats.propertiesCreated;
      stats.propertiesUpdated += tempStats.propertiesUpdated;
      stats.propertiesSkipped += tempStats.propertiesSkipped;
      stats.optionsAdded += tempStats.optionsAdded;
      stats.createdProperties.push(...tempStats.createdProperties);
      stats.updatedProperties.push(...tempStats.updatedProperties);
      stats.optionDetails.push(...tempStats.optionDetails);

      bulkStats.procesadas++;
      bulkStats.exitosas++;
      console.log(`[workflow-action] ✅ ${razonSocial} procesada exitosamente`);

    } catch (error) {
      console.error(`[workflow-action] ❌ Error procesando ${razonSocial}:`, error.message);
      bulkStats.procesadas++;
      bulkStats.fallidas++;
      bulkStats.errores.push({
        razonSocial,
        error: error.message
      });
    }
  }

  // Guardar resultado del bulk en stats
  stats.bulkResult = bulkStats;
  console.log(`[workflow-action] === Fin Bulk Update: ${bulkStats.exitosas}/${bulkStats.total} exitosas ===`);
}

// Procesar propiedades de modelos (individual)
async function procesarPropiedadesModelos(hubspotClient, context, stats, propertyService) {
  console.log('[workflow-action] === Procesando propiedades de MODELOS ===');

  const { marca, modelo } = context;

  if (!marca) {
    throw new Error('El parámetro "marca" es requerido para actualizar modelos');
  }
  if (!modelo) {
    throw new Error('El parámetro "modelo" es requerido para actualizar modelos');
  }

  const newModelOption = modelo.trim();
  console.log(`[workflow-action] Nuevo modelo a agregar: "${newModelOption}" para marca "${marca}"`);

  // Normalizar marca para nombre de propiedad
  const marcaNormalized = propertyService.normalizeMarcaToPropertyName(marca);
  const propertyName = `modelo_${marcaNormalized}`;
  console.log(`[workflow-action] Nombre de propiedad de modelo: "${propertyName}"`);

  // Función auxiliar para agregar modelo a una propiedad
  async function addModelToProperty(objectType) {
    const objectTypeKey = propertyService.getObjectTypeKey(objectType);
    console.log(`[workflow-action] --- Procesando ${objectType}:${propertyName} ---`);

    try {
      // Obtener propiedad existente
      let existingProperty;
      try {
        const response = await hubspotClient.crm.properties.coreApi.getByName(objectTypeKey, propertyName);
        existingProperty = response;
        console.log(`[workflow-action] ✅ Propiedad ${propertyName} encontrada en ${objectType}`);
      } catch (error) {
        // Si no existe, crearla
        console.log(`[workflow-action] Propiedad ${propertyName} no existe en ${objectType}, creándola...`);

        // Obtener opciones iniciales desde models-by-brand.json si existen
        const initialOptions = propertyService.getOptionsFromConfig(propertyName, marcaNormalized);

        // Asegurar que el nuevo modelo esté en las opciones iniciales
        const modelExistsInConfig = initialOptions.some(opt =>
          propertyService.normalizeKey(opt.value) === propertyService.normalizeKey(newModelOption)
        );

        if (!modelExistsInConfig) {
          initialOptions.push({
            label: newModelOption,
            value: newModelOption,
            hidden: false,
            displayOrder: initialOptions.length
          });
        }

        const newProperty = {
          name: propertyName,
          label: `Modelo ${marca}`,
          description: `Modelos de ${marca}`,
          groupName: objectType === 'deal' ? 'dealinformation' : 'contactinformation',
          type: 'enumeration',
          fieldType: 'select',
          options: initialOptions
        };

        try {
          existingProperty = await hubspotClient.crm.properties.coreApi.create(objectTypeKey, newProperty);
          console.log(`[workflow-action] Propiedad ${propertyName} creada en ${objectType}`);
          stats.propertiesCreated++;
          stats.createdProperties.push(`${objectType}:${propertyName}`);
          stats.optionsAdded += initialOptions.length;
          return { added: true, created: true };
        } catch (createError) {
          console.error(`[workflow-action] ❌ Error creando propiedad ${propertyName}:`, createError.message);
          throw createError;
        }
      }

      // Si ya existe, verificar si el modelo está en las opciones
      const existingOptions = Array.isArray(existingProperty.options)
        ? existingProperty.options.map(opt => ({ ...opt }))
        : [];

      const newOptionNormalized = propertyService.normalizeKey(newModelOption);
      const existingKeys = new Set(
        existingOptions.map(opt => propertyService.normalizeKey(opt.value || opt.label || '')).filter(Boolean)
      );

      if (existingKeys.has(newOptionNormalized)) {
        console.log(`[workflow-action] ℹ️ El modelo "${newModelOption}" ya existe en ${objectType}:${propertyName}`);
        return { added: false, reason: 'already_exists' };
      }

      console.log(`[workflow-action] Agregando modelo "${newModelOption}" a ${objectType}:${propertyName}`);

      const maxDisplayOrder = existingOptions.length > 0
        ? Math.max(...existingOptions.map(opt => opt.displayOrder ?? -1))
        : -1;

      existingOptions.push({
        label: newModelOption,
        value: newModelOption,
        hidden: false,
        displayOrder: maxDisplayOrder + 1
      });

      const updateDefinition = {
        options: existingOptions
      };

      await hubspotClient.crm.properties.coreApi.update(
        objectTypeKey,
        propertyName,
        updateDefinition
      );

      console.log(`[workflow-action] ✅ Modelo "${newModelOption}" agregado a ${objectType}:${propertyName}`);
      stats.propertiesUpdated++;
      stats.updatedProperties.push(`${objectType}:${propertyName}`);
      stats.optionsAdded++;
      stats.optionDetails.push(`${objectType}:${propertyName} (modelo): ${newModelOption}`);

      return { added: true };

    } catch (error) {
      console.error(`[workflow-action] ❌ Error procesando ${objectType}:${propertyName}:`, error.message);
      throw error;
    }
  }

  await addModelToProperty('contact');
  await addModelToProperty('deal');
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', message: 'Workflow action endpoint is running' });
  }

  // Cargar configuración de forma dinámica (Redis > Local)
  const razonesSocialesConfig = await ConfigService.getRazonesSociales();
  const modelsByBrandConfig = await ConfigService.getModelsByBrand();

  // Inicializar PropertyService para este request
  const propertyService = new PropertyService({
    razonesSocialesConfig,
    propertiesConfig,
    modelsByBrandConfig,
    configUtils
  });

  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }

  try {
    const event = req.body || {};
    const inputFields = event.inputFields || {};

    // Obtener parámetros
    const marca = sanitize(inputFields.marca);
    const modelo = sanitize(inputFields.modelo);
    const dealer = sanitize(inputFields.dealer);
    const llaveInput = sanitize(inputFields.llave);
    const razonSocial = sanitize(inputFields.razon_social);
    const tipoProceso = sanitize(inputFields.tipo_proceso);

    // Validar parámetros requeridos según el tipo de proceso
    if (!tipoProceso) {
      throw new Error('El parámetro "tipo_proceso" es requerido');
    }

    // Razón social es requerida para TODOS los tipos de proceso EXCEPTO propiedades_modelos (bulk)
    if (!razonSocial && tipoProceso !== 'propiedades_modelos') {
      throw new Error('El parámetro "razon_social" es requerido para todos los tipos de proceso (excepto propiedades_modelos)');
    }

    // --- Lógica Principal según Tipo de Proceso ---
    if (tipoProceso === 'propiedades_concesionarios') {
      // Para crear concesionarios: solo razón social y dealer (NO marca)
      if (!dealer) {
        throw new Error('El parámetro "dealer" es requerido para el proceso de propiedades de concesionarios');
      }
    } else if (tipoProceso === 'propiedades_modelos') {
      // Para propiedades de modelos: razón social, marca y modelo (NO dealer)
      if (!marca) {
        throw new Error('El parámetro "marca" es requerido para el proceso de propiedades de modelos');
      }
      if (!modelo) {
        throw new Error('El parámetro "modelo" es requerido para el proceso de propiedades de modelos');
      }
    } else if (tipoProceso === 'todas_propiedades') {
      // Para crear todas las propiedades: razón social y marca (dealer es opcional)
      if (!marca) {
        throw new Error('El parámetro "marca" es requerido');
      }
    } else {
      // Para otros procesos (pipeline_negocio): razón social, marca y dealer
      if (!marca) {
        throw new Error('El parámetro "marca" es requerido');
      }
      if (!dealer) {
        throw new Error('El parámetro "dealer" es requerido');
      }
    }

    // Resolver access token
    let accessToken = null;
    let tokenSource = null;

    // Si es modo bulk (propiedades_modelos sin razonSocial), saltar resolución de token
    const isBulkMode = tipoProceso === 'propiedades_modelos' && !razonSocial;

    if (isBulkMode) {
      console.log(`[workflow-action] ⚡ Modo BULK detectado: No se requiere token único, se obtendrán tokens individuales por razón social`);
    } else if (razonSocial) {
      console.log(`[workflow-action] Razón social proporcionada: "${razonSocial}" - Usando token de variable de entorno (ignorando input "llave")`);

      // Intentar desde configUtils primero
      if (tipoProceso === 'propiedades_concesionarios' && configUtils && configUtils.resolveAccessToken) {
        console.log(`[workflow-action] Intentando resolver token desde configUtils para ${razonSocial}`);
        try {
          accessToken = await configUtils.resolveAccessToken(razonSocial);
          tokenSource = `configUtils.resolveAccessToken(${razonSocial})`;
          console.log(`[workflow-action] ✅ Token resuelto desde configUtils`);
        } catch (error) {
          console.warn(`[workflow-action] ❌ No se pudo resolver token desde configUtils: ${error.message}`);
        }
      } else if (configUtils && configUtils.resolveAccessToken) {
        console.log(`[workflow-action] Intentando resolver token desde configUtils para ${razonSocial} con dealer y marca`);
        try {
          accessToken = await configUtils.resolveAccessToken(razonSocial, dealer, marca);
          tokenSource = `configUtils.resolveAccessToken(${razonSocial}, ${dealer}, ${marca})`;
          console.log(`[workflow-action] ✅ Token resuelto desde configUtils`);
        } catch (error) {
          console.warn(`[workflow-action] ❌ No se pudo resolver token desde configUtils: ${error.message}`);
        }
      }

      // Si no se pudo resolver desde configUtils, buscar tokenEnv en razones-sociales.json
      if (!accessToken) {
        let tokenEnv = null;

        // Buscar la razón social en el archivo de configuración
        if (razonesSocialesConfig && razonesSocialesConfig[razonSocial]) {
          tokenEnv = razonesSocialesConfig[razonSocial].tokenEnv;
          console.log(`[workflow-action] ✅ Encontrada razón social "${razonSocial}" en configuración con tokenEnv: ${tokenEnv}`);
        } else {
          // Fallback: construir el nombre de la variable de entorno si no está en el archivo
          tokenEnv = `${razonSocial.toUpperCase().replace(/\s+/g, '_')}_TOKEN`;
          console.warn(`[workflow-action] ⚠️ Razón social "${razonSocial}" no encontrada en configuración, usando fallback: ${tokenEnv}`);
        }

        if (tokenEnv) {
          console.log(`[workflow-action] Obteniendo token desde variable de entorno: ${tokenEnv}`);
          accessToken = process.env[tokenEnv];
          if (accessToken) {
            tokenSource = `variable de entorno ${tokenEnv}`;
            console.log(`[workflow-action] ✅ Token obtenido desde variable de entorno: ${tokenEnv}`);
          } else {
            console.error(`[workflow-action] ❌ Variable de entorno ${tokenEnv} no existe o está vacía`);
          }
        } else {
          console.error(`[workflow-action] ❌ No se pudo determinar el nombre de la variable de entorno para "${razonSocial}"`);
        }
      }
    } else {
      // Si NO hay razón social, usar el token del input "llave"
      console.log(`[workflow-action] No hay razón social proporcionada, usando token del input "llave"`);
      accessToken = llaveInput;
      tokenSource = 'input (llave)';
    }

    // Solo validar token si NO es modo bulk
    if (!isBulkMode && !accessToken) {
      throw new Error('Debes proporcionar "llave" (access token) o "razon_social" con token configurado');
    }

    const procesoInfo = tipoProceso === 'propiedades_concesionarios'
      ? `razon_social: ${razonSocial}, dealer: ${dealer}`
      : tipoProceso === 'propiedades_modelos'
        ? `razon_social: ${razonSocial || 'BULK'}, marca: ${marca}, modelo: ${modelo}`
        : `razon_social: ${razonSocial}, marca: ${marca}, dealer: ${dealer}`;
    console.log(`[workflow-action] Iniciando proceso: ${tipoProceso} - ${procesoInfo}`);

    // Inicializar cliente de HubSpot (solo si no es modo bulk)
    let hubspotClient = null;
    if (!isBulkMode) {
      hubspotClient = new hubspot.Client({ accessToken });
    }

    // Inicializar estadísticas
    const stats = {
      propertiesCreated: 0,
      propertiesSkipped: 0,
      propertiesUpdated: 0,
      optionsAdded: 0,
      createdProperties: [],
      skippedProperties: [],
      updatedProperties: [],
      optionDetails: [],
      bulkResult: null
    };

    // Construir contexto según el tipo de proceso
    const context = { razonSocial };

    // Agregar marca solo si es necesario (no para propiedades_concesionarios)
    if (tipoProceso !== 'propiedades_concesionarios' && marca) {
      context.marca = marca;
    }

    // Agregar dealer solo si es necesario (no para propiedades_modelos)
    if (tipoProceso !== 'propiedades_modelos' && dealer) {
      context.dealer = dealer;
    }

    // Agregar modelo solo para propiedades_modelos
    if (tipoProceso === 'propiedades_modelos' && modelo) {
      context.modelo = modelo;
    }

    // Ejecutar proceso según el tipo
    switch (tipoProceso) {
      case 'propiedades_concesionarios':
        // Usar lógica simplificada para concesionarios (no requiere PropertyService completo)
        await procesarPropiedadesConcesionarios(hubspotClient, context, stats, propertyService);
        break;

      case 'propiedades_modelos':
        // Si razonSocial está vacío, hacer bulk update en todas las razones sociales con esa marca
        if (!razonSocial) {
          console.log(`[workflow-action] ⚡ Modo BULK: razon_social no especificada, actualizando todas las razones sociales con marca "${marca}"`);
          await procesarPropiedadesModelosBulk(marca, modelo, stats, razonesSocialesConfig, propertyService);

          // Validar resultado del bulk
          if (stats.bulkResult && stats.bulkResult.exitosas === 0 && stats.bulkResult.total > 0) {
            throw new Error('Bulk update falló completamente. Revisa los logs para detalles.');
          }
        } else {
          // Modo normal: actualizar solo la razón social especificada
          if (!hubspotClient) {
            throw new Error('Error: No se pudo inicializar el cliente de HubSpot para modo individual');
          }
          await procesarPropiedadesModelos(hubspotClient, context, stats, propertyService);
        }
        break;

      case 'todas_propiedades':
        await propertyService.procesarTodasPropiedades(hubspotClient, context, stats);
        break;

      default:
        // Para otros tipos de proceso, por ahora solo probamos conexión
        if (!hubspotClient) {
          throw new Error('Error: No se pudo inicializar el cliente de HubSpot');
        }
        const contactProperties = await propertyService.getExistingProperties(hubspotClient, 'contact');
        const dealProperties = await propertyService.getExistingProperties(hubspotClient, 'deal');
        console.log(`[workflow-action] Conexión exitosa. Contactos: ${Object.keys(contactProperties).length}, Deals: ${Object.keys(dealProperties).length}`);
    }

    // Preparar respuesta
    console.log(`[workflow-action] 📊 Stats FINALES antes de construir respuesta:`, JSON.stringify({
      propertiesCreated: stats.propertiesCreated,
      propertiesSkipped: stats.propertiesSkipped,
      propertiesUpdated: stats.propertiesUpdated,
      optionsAdded: stats.optionsAdded,
      updatedProperties: stats.updatedProperties,
      optionDetails: stats.optionDetails
    }));

    const outputFields = {
      success: true,
      message: `Proceso ${tipoProceso} completado. Creadas: ${stats.propertiesCreated}, Actualizadas: ${stats.propertiesUpdated}, Omitidas: ${stats.propertiesSkipped}, Opciones agregadas: ${stats.optionsAdded}`,
      razonSocial: razonSocial,
      propertiesCreated: stats.propertiesCreated,
      propertiesSkipped: stats.propertiesSkipped,
      propertiesUpdated: stats.propertiesUpdated,
      optionsAdded: stats.optionsAdded,
      createdPropertiesList: stats.createdProperties.join(', '),
      skippedPropertiesList: stats.skippedProperties.join(', '),
      updatedPropertiesList: stats.updatedProperties.join(', '),
      optionDetails: stats.optionDetails.join('; '),
      tipoProceso: tipoProceso
    };

    console.log(`[workflow-action] 📤 Respuesta que se enviará a HubSpot:`, JSON.stringify(outputFields, null, 2));

    // Si es modo bulk, agregar información detallada a la salida
    if (tipoProceso === 'propiedades_modelos' && !razonSocial && stats.bulkResult) {
      const bulkResult = stats.bulkResult;
      outputFields.bulkTotal = bulkResult.total;
      outputFields.bulkExitosas = bulkResult.exitosas;
      outputFields.bulkFallidas = bulkResult.fallidas;

      const errores = bulkResult.errores || [];
      if (errores.length > 0) {
        outputFields.bulkErroresCount = errores.length;
        outputFields.bulkErroresDetalle = errores
          .map(e => `${e.razonSocial} | Propiedad: ${e.property || 'N/A'} | Opción: ${e.option || 'N/A'} | Tipo: ${e.objectType || 'N/A'} | Error: ${e.error}`)
          .join('\n');
        outputFields.message += ` | Bulk: ${bulkResult.exitosas}/${bulkResult.total} exitosas, ${bulkResult.fallidas} fallidas`;
      } else {
        outputFields.message += ` | Bulk: ${bulkResult.exitosas}/${bulkResult.total} procesadas exitosamente`;
      }
    }

    return res.status(200).json(outputFields);
  } catch (error) {
    console.error('[workflow-action] Error:', error.message);
    console.error('[workflow-action] Stack:', error.stack);
    return res.status(500).json({
      success: false,
      message: error.message,
      error: error.message
    });
  }
};

// Función auxiliar para procesar propiedades de concesionarios (copiada para mantener funcionalidad)
async function procesarPropiedadesConcesionarios(hubspotClient, context, stats, propertyService) {
  console.log('[workflow-action] === Procesando propiedades de CONCESIONARIOS (modo simplificado) ===');

  const { razonSocial, dealer } = context;

  if (!dealer) {
    throw new Error('El parámetro "dealer" es requerido para crear/actualizar concesionarios');
  }

  const newDealerOption = dealer.trim();
  console.log(`[workflow-action] Nueva opción a agregar: "${newDealerOption}"`);

  async function addOptionToProperty(objectType) {
    const objectTypeKey = propertyService.getObjectTypeKey(objectType);
    const propertyName = 'concesionarios_simpa';

    console.log(`[workflow-action] --- Procesando ${objectType}:${propertyName} ---`);

    try {
      let existingProperty;
      try {
        const response = await hubspotClient.crm.properties.coreApi.getByName(objectTypeKey, propertyName);
        existingProperty = response;
      } catch (error) {
        console.log(`[workflow-action] Propiedad ${propertyName} no existe, creándola...`);
        const newProperty = {
          name: propertyName,
          label: 'Concesionarios',
          description: 'Concesionarios disponibles',
          groupName: objectType === 'deal' ? 'dealinformation' : 'contactinformation',
          type: 'enumeration',
          fieldType: 'select',
          options: []
        };
        try {
          existingProperty = await hubspotClient.crm.properties.coreApi.create(objectTypeKey, newProperty);
          stats.propertiesCreated++;
          stats.createdProperties.push(`${objectType}:${propertyName}`);
        } catch (createError) {
          console.error(`[workflow-action] ❌ Error creando propiedad ${propertyName}:`, createError.message);
          throw createError;
        }
      }

      const existingOptions = Array.isArray(existingProperty.options)
        ? existingProperty.options.map(opt => ({ ...opt }))
        : [];

      const newOptionNormalized = propertyService.normalizeKey(newDealerOption);
      const existingKeys = new Set(
        existingOptions.map(opt => propertyService.normalizeKey(opt.value || opt.label || '')).filter(Boolean)
      );

      if (existingKeys.has(newOptionNormalized)) {
        console.log(`[workflow-action] ℹ️ La opción "${newDealerOption}" ya existe en ${objectType}`);
        return { added: false, reason: 'already_exists' };
      }

      console.log(`[workflow-action] ✅ La opción "${newDealerOption}" NO existe en ${objectType}, procediendo a agregarla`);

      const maxDisplayOrder = existingOptions.length > 0
        ? Math.max(...existingOptions.map(opt => opt.displayOrder ?? -1))
        : -1;
      const newDisplayOrder = maxDisplayOrder + 1;

      const newOption = {
        label: newDealerOption,
        value: newDealerOption,
        hidden: false,
        displayOrder: newDisplayOrder
      };

      const allOptions = [...existingOptions, newOption];

      const updateDefinition = {
        options: allOptions
      };

      await hubspotClient.crm.properties.coreApi.update(
        objectTypeKey,
        propertyName,
        updateDefinition
      );

      console.log(`[workflow-action] ✅ Opción "${newDealerOption}" agregada exitosamente a ${objectType}`);
      stats.propertiesUpdated++;
      stats.updatedProperties.push(`${objectType}:${propertyName}`);
      stats.optionsAdded++;
      stats.optionDetails.push(`${objectType}:${propertyName} (nueva): ${newDealerOption}`);
      return { added: true };

    } catch (error) {
      console.error(`[workflow-action] ❌ Error procesando ${objectType}:${propertyName}:`, error.message);
      throw error;
    }
  }

  await addOptionToProperty('contact');
  await addOptionToProperty('deal');
}