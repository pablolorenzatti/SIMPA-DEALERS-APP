
const hubspot = require('@hubspot/api-client');
const { sendSlackErrorNotification } = require('./_utils/slack-notifier');
const ConfigService = require('./_services/config-service');
const LeadProcessor = require('./_services/lead-processor');
const AnalyticsService = require('./_services/analytics-service'); // Nuevo servicio de Analytics
const path = require('path'); // Added for path.join

// Fallback configuration if KV fails
const FALLBACK_CONFIG_PATH = path.join(process.cwd(), 'src/config/razones-sociales.json');

// Funciones utilitarias (Delegadas a LeadProcessor donde sea posible, mantenemos locales si son ui-specific)
function sanitize(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeKey(value) {
  return LeadProcessor.normalizeKey(value);
}

function sanitizeName(value) {
  if (!value) return value;
  // Normalize, remove accents, and allow strictly alphanumeric + spaces (NO hyphens/special chars)
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim();
}

function getObjectTypeKey(objectType) {
  return objectType === 'deal' ? 'deals' : 'contacts';
}

// Función helper para verificar si una propiedad existe en HubSpot
async function propertyExists(hubspotClient, objectType, propertyName) {
  try {
    const objectTypeKey = getObjectTypeKey(objectType);
    await hubspotClient.crm.properties.coreApi.getByName(objectTypeKey, propertyName);
    return true;
  } catch (error) {
    // Si el error es 404 o indica que la propiedad no existe, retornar false
    if (error.code === 404 || (error.body && typeof error.body === 'string' && error.body.includes('does not exist'))) {
      return false;
    }
    // Para otros errores, asumir que no existe para evitar fallos
    console.warn(`[forward - lead] ⚠️ Error verificando propiedad ${propertyName} en ${objectType}: ${error.message} `);
    return false;
  }
}

// Función para agregar una opción a una propiedad (adaptada de bulk-models.js)
// MODIFICADO: No crea la propiedad si no existe, solo agrega opción si la propiedad existe
// Función para agregar una opción a una propiedad (adaptada de bulk-models.js)
// MODIFICADO: No crea la propiedad si no existe, solo agrega opción si la propiedad existe
async function addOptionToProperty(hubspotClient, objectType, propertyName, newModelOption) {
  const objectTypeKey = getObjectTypeKey(objectType);
  console.log(`[forward - lead] Verificando opción "${newModelOption}" en ${objectType}:${propertyName} `);

  try {
    // Intentar obtener la propiedad
    let existingProperty = null;
    try {
      existingProperty = await hubspotClient.crm.properties.coreApi.getByName(objectTypeKey, propertyName);
    } catch (error) {
      // Propiedad no existe
      console.warn(`[forward - lead] ⚠️ La propiedad ${propertyName} no existe en ${objectType}. No se creará automáticamente.`);
      return { exists: false, added: false, reason: 'property_missing' };
    }

    if (!existingProperty) {
      // Esto no debería ocurrir si el catch funciona, pero por seguridad
      return { exists: false, added: false, reason: 'property_missing' };
    }

    // Verificar si la opción ya existe
    const existingOptions = Array.isArray(existingProperty.options) ? existingProperty.options : [];
    const newOptionNormalized = normalizeKey(newModelOption);

    // Buscar la opción exacta (valor o label) que coincida normalizada
    const matchedOption = existingOptions.find(opt =>
      normalizeKey(opt.value || opt.label || '') === newOptionNormalized
    );

    if (matchedOption) {
      const actualValue = matchedOption.value;
      console.log(`[forward - lead] ✅ Opción "${newModelOption}" ya existe en ${objectType}:${propertyName} (Valor real: "${actualValue}")`);
      return { exists: true, added: true, reason: 'already_exists', successValue: actualValue };
    }

    // Agregar nueva opción
    console.log(`[forward - lead] Agregando opción "${newModelOption}" a ${propertyName}...`);
    const maxDisplayOrder = existingOptions.length > 0 ? Math.max(...existingOptions.map(opt => opt.displayOrder ?? -1)) : -1;
    const newOption = { label: newModelOption, value: newModelOption, hidden: false, displayOrder: maxDisplayOrder + 1 };
    const updateDefinition = { options: [...existingOptions, newOption] };
    await hubspotClient.crm.properties.coreApi.update(objectTypeKey, propertyName, updateDefinition);
    console.log(`[forward - lead] ✅ Opción "${newModelOption}" agregada exitosamente`);
    return { exists: true, added: true, reason: 'added', successValue: newModelOption };

  } catch (error) {
    console.warn(`[forward - lead] ⚠️ Error asegurando opción en ${objectType}:${propertyName}: ${error.message} `);
    return { exists: true, added: false, reason: 'error', error: error.message };
  }
}

module.exports = async (req, res) => {
  // Cargar configuración dinámica (Redis > Local)
  const razonesSocialesConfig = await ConfigService.getRazonesSociales();

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', message: 'Forward lead endpoint is running' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }

  // Variables para Analytics
  let dealerName = 'Unknown';
  let originalBrandName = 'Unknown';
  let inferredRazon = null;
  let razonSocial = null; // Lifted to outer scope to be available in catch block

  // Execution Log for detailed debugging
  const executionSteps = [];
  const logStep = (step, data = null) => {
    const entry = { ts: new Date().toISOString(), step, data };
    executionSteps.push(entry);
    if (data) console.log(`[step] ${step}`, JSON.stringify(data).substring(0, 200));
    else console.log(`[step] ${step}`);
  };

  try {
    const event = req.body || {};
    const inputFields = event.inputFields || {};

    // Obtener parámetros
    const razonSocialInput = sanitize(inputFields.razon_social);
    const dealerNameInput = sanitize(inputFields.dealer_name);
    const marca = sanitize(inputFields.contact_brand);
    const comoQueresSerContactado = sanitize(inputFields.como_queres_ser_contactado_);

    // Assign to analytics variable
    dealerName = dealerNameInput || 'Unknown';
    originalBrandName = marca || 'Unknown';

    // DEBUG: Log del valor de marca inmediatamente después de obtenerlo
    console.log(`[forward - lead] 🔍 DEBUG - Marca obtenida de inputFields.contact_brand: "${originalBrandName}"(tipo: ${typeof originalBrandName})`);
    console.log(`[forward - lead] 🔍 DEBUG - inputFields.contact_brand raw: ${JSON.stringify(inputFields.contact_brand)} `);

    // Validar parámetros requeridos
    // NOTA: razon_social ya no es estrictamente requerido aquí porque puede ser inferido más adelante

    // Validar parámetros requeridos para inferencia
    let assignedPipeline = null;
    let assignedStage = null;

    if (!dealerName) {
      logStep('Error: Missing dealer_name');
      throw new Error('El campo "dealer_name" es obligatorio');
    }
    logStep('Input Validation Passed', { dealerName, originalBrandName });

    // Resolver Razón Social usando LeadProcessor
    razonSocial = razonSocialInput; // Assign to outer variable

    if (!razonSocial) {
      console.log(`[forward - lead] Razón social no proporcionada.Intentando inferir desde dealer "${dealerName}" y marca "${originalBrandName || '(no proporcionada)'}"...`);

      if (!razonesSocialesConfig) {
        throw new Error('No se pudo cargar la configuración de razones sociales para inferir la entidad legal');
      }

      // Usar servicio centralizado para inferencia
      inferredRazon = LeadProcessor.inferRazonSocial(razonesSocialesConfig, dealerName, originalBrandName);

      if (inferredRazon.razonSocial) {
        razonSocial = inferredRazon.razonSocial;
        console.log(`[forward - lead] ✅ Razón social inferida: "${razonSocial}"(Método: ${inferredRazon.method}, Confianza: ${inferredRazon.confidence})`);
      } else {
        console.error(`[forward - lead] ❌ No se pudo inferir la razón social.Detalles: ${inferredRazon.reason} `);
        logStep('Razon Social Inference Failed', { reason: inferredRazon.reason });
        if (inferredRazon.reason === 'Dealer name missing') {
          throw new Error('El campo "dealer_name" es obligatorio para inferir la razón social');
        }
        throw new Error(`No se pudo determinar la razón social para el dealer "${dealerName}".Verifica configuración.`);
      }
    } else {
      // If razonSocial was provided, create a mock inferredRazon object for analytics
      inferredRazon = {
        razonSocial: razonSocial,
        method: 'provided',
        confidence: 'high',
        reason: 'Razon social provided in input'
      };
      logStep('Razon Social Provided', { razonSocial });
    }

    // Resolver access token
    // PRIORIDAD: Si hay razón social, SIEMPRE usar el token de la variable de entorno correspondiente
    let accessToken = null;
    let tokenSource = null;

    console.log(`[forward - lead] Usando Razón Social: "${razonSocial}"`);

    // Buscar el tokenEnv en el archivo de configuración razones-sociales.json
    let tokenEnv = null;

    // Buscar la razón social en el archivo de configuración
    const rsConfig = razonesSocialesConfig[razonSocial];

    // Resolver Token Env usando LeadProcessor
    const tokenDetermination = LeadProcessor.determineTokenEnv(rsConfig, razonSocial);
    tokenEnv = tokenDetermination.tokenEnv;

    if (tokenDetermination.source === 'config') {
      console.log(`[forward - lead] ✅ Token configurado encontrado: ${tokenEnv} `);
    } else {
      console.warn(`[forward - lead] ⚠️ Usando fallback para token: ${tokenEnv} `);
    }

    if (tokenEnv) {
      console.log(`[forward - lead] Obteniendo token desde variable de entorno: ${tokenEnv} `);
      accessToken = process.env[tokenEnv];

      if (accessToken) {
        tokenSource = `variable de entorno ${tokenEnv} `;
        logStep('Token Resolved', { tokenEnv, source: tokenSource });
        console.log(`[forward - lead] ✅ Token obtenido desde variable de entorno: ${tokenEnv} `);
      } else {
        console.error(`[forward - lead] ❌ Variable de entorno ${tokenEnv} no existe o está vacía`);
        logStep('Token Missing', { tokenEnv });
        throw new Error(`No se encontró token para la razón social "${razonSocial}".Define la variable ${tokenEnv} en Vercel.`);
      }
    } else {
      console.error(`[forward - lead] ❌ No se pudo determinar el nombre de la variable de entorno para "${razonSocial}"`);
      throw new Error(`No se pudo determinar el token para la razón social "${razonSocial}".Verifica la configuración en razones - sociales.json.`);
    }

    // Logging simplificado del token utilizado
    const tokenPreview = accessToken.length > 20
      ? `${accessToken.substring(0, 10)}...${accessToken.substring(accessToken.length - 10)} `
      : '***';
    console.log(`[forward - lead] Token utilizado(preview): ${tokenPreview} `);
    console.log(`[forward - lead] Fuente del token: ${tokenSource} `);
    console.log(`[forward - lead] Razón social: ${razonSocialInput} `);
    console.log(`[forward - lead] Iniciando envío de lead al dealer: ${dealerName} (${razonSocialInput})`);

    // Inicializar cliente de HubSpot con retries automáticos
    const hubspotClient = new hubspot.Client({
      accessToken,
      numberOfApiCallRetries: 6 // Reintenta automáticamente en caso de error 429 (Rate Limit)
    });

    // Probar conexión obteniendo propiedades
    let contactProperties = [];
    let dealProperties = [];
    try {
      const contactResponse = await hubspotClient.crm.properties.coreApi.getAll('contacts', false);
      contactProperties = contactResponse.results || [];
      const dealResponse = await hubspotClient.crm.properties.coreApi.getAll('deals', false);
      dealProperties = dealResponse.results || [];
      console.log(`[forward - lead] Conexión exitosa.Contactos: ${contactProperties.length}, Deals: ${dealProperties.length} `);
      logStep('HubSpot Connection Success', { contactsProps: contactProperties.length });
    } catch (error) {
      console.error('[forward-lead] Error obteniendo propiedades:', error.message);
      logStep('HubSpot Connection Failed', { error: error.message });
      throw new Error(`Error conectando con HubSpot: ${error.message} `);
    }

    // Obtener datos del contacto
    const contactData = {
      firstname: sanitizeName(inputFields.contact_firstname) || '',
      lastname: sanitizeName(inputFields.contact_lastname) || '',
      email: sanitize(inputFields.contact_email) || '',
      phone: sanitize(inputFields.contact_phone) || '',
      city: sanitizeName(inputFields.contact_city) || ''
    };

    // Obtener IDs de SIMPA (origen) si están disponibles
    const originContactId = sanitize(inputFields.origin_contact_id);
    const originDealId = sanitize(inputFields.origin_deal_id);

    if (originContactId) {
      console.log(`[forward - lead] ID de contacto SIMPA recibido: ${originContactId} `);
    }
    if (originDealId) {
      console.log(`[forward - lead] ID de negocio SIMPA recibido: ${originDealId} `);
    }

    // Validar que al menos tenemos email o nombre
    if (!contactData.email && !contactData.firstname) {
      throw new Error('Se requiere al menos email o nombre del contacto');
    }

    console.log(`[forward - lead] === Iniciando creación / actualización de contacto y deal === `);
    console.log(`[forward - lead] Datos del contacto: `, JSON.stringify(contactData, null, 2));

    // 1. Buscar o crear contacto
    let contactId = null;
    let contactAction = 'created';
    let contactResponse = null; // To store the actual contact object

    try {
      // Si tenemos email, buscar por email primero
      if (contactData.email) {
        console.log(`[forward - lead] Buscando contacto por email: ${contactData.email} `);
        try {
          const searchResponse = await hubspotClient.crm.contacts.searchApi.doSearch({
            filterGroups: [
              {
                filters: [
                  {
                    propertyName: 'email',
                    operator: 'EQ',
                    value: contactData.email
                  }
                ]
              }
            ],
            limit: 1,
            sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
            properties: ['email', 'firstname', 'lastname']
          });

          if (searchResponse.results && searchResponse.results.length > 0) {
            contactId = searchResponse.results[0].id;
            contactResponse = searchResponse.results[0]; // Store the found contact
            contactAction = 'updated';
            console.log(`[forward - lead] ✅ Contacto encontrado por email.ID: ${contactId} `);
          } else {
            console.log(`[forward - lead] No se encontró contacto con email: ${contactData.email} `);
          }
        } catch (searchError) {
          console.warn(`[forward - lead] ⚠️ Error buscando contacto por email: ${searchError.message} `);
          // Continuar con la creación si la búsqueda falla
        }
      }

      // Si no encontramos por email, crear nuevo contacto
      if (!contactId) {
        console.log(`[forward - lead] Creando nuevo contacto...`);
        const contactProperties = {
          firstname: sanitizeName(contactData.firstname),
          lastname: sanitizeName(contactData.lastname),
          email: contactData.email,
          phone: contactData.phone,
          phone: contactData.phone,
          city: contactData.city,
          como_queres_ser_contactado_: comoQueresSerContactado
        };

        // Agregar ID de contacto SIMPA si está disponible
        if (originContactId) {
          contactProperties.id_contacto_simpa = originContactId;
          console.log(`[forward - lead] Agregando id_contacto_simpa: ${originContactId} `);
        }

        // Agregar propiedades adicionales si están disponibles
        // Agregar propiedades adicionales si están disponibles (hs_lead_status removido para evitar conflictos con opciones personalizadas)
        // if (marca) {
        //   contactProperties.hs_lead_status = 'NEW';
        // }

        let newContact;
        try {
          newContact = await hubspotClient.crm.contacts.basicApi.create({
            properties: contactProperties,
            associations: []
          });
        } catch (createError) {
          // Detección de error de límite de contactos
          const errorMsg = createError.message || '';
          const errorBody = createError.body ? JSON.stringify(createError.body) : '';

          if (errorMsg.includes('exceeded the limit') || errorBody.includes('exceeded the limit') ||
            errorMsg.includes('limit exceeded') || errorBody.includes('limit exceeded')) {

            console.warn(`[forward-lead] ⚠️ Se alcanzó el límite de contactos. Reintentando como NO-MARKETING (hs_marketable_status=false)...`);
            if (typeof logStep !== 'undefined') logStep('Contact Limit Hit - Retrying as Non-Marketing');

            // Agregar propiedad para evitar que cuente como contacto de marketing
            contactProperties.hs_marketable_status = 'false';

            // Reintentar creación
            newContact = await hubspotClient.crm.contacts.basicApi.create({
              properties: contactProperties,
              associations: []
            });
            console.log(`[forward-lead] ✅ Contacto creado exitosamente en segundo intento (Non-Marketing).`);
          } else {
            // Si no es error de límite, relanzar el error original
            throw createError;
          }
        }

        contactId = newContact.id;
        contactAction = 'created';
        logStep('Contact Created', { contactId, retry: contactProperties.hs_marketable_status === 'false' });
        console.log(`[forward-lead] ✅ Contacto creado exitosamente.ID: ${contactId} `);
      } else {
        // Actualizar contacto existente
        console.log(`[forward - lead] Actualizando contacto existente...`);
        const updateProperties = {};
        if (contactData.firstname) updateProperties.firstname = contactData.firstname;
        if (contactData.lastname) updateProperties.lastname = contactData.lastname;
        if (contactData.phone) updateProperties.phone = contactData.phone;
        if (contactData.city) updateProperties.city = contactData.city;
        if (comoQueresSerContactado) updateProperties.como_queres_ser_contactado_ = comoQueresSerContactado;

        // Agregar o actualizar ID de contacto SIMPA si está disponible
        if (originContactId) {
          updateProperties.id_contacto_simpa = originContactId;
          console.log(`[forward - lead] Actualizando id_contacto_simpa: ${originContactId} `);
        }

        if (Object.keys(updateProperties).length > 0) {
          await hubspotClient.crm.contacts.basicApi.update(contactId, {
            properties: updateProperties
          });
          logStep('Contact Updated', { contactId, updatedFields: Object.keys(updateProperties) });
          console.log(`[forward - lead] ✅ Contacto actualizado exitosamente`);
        }
      }
    } catch (contactError) {
      console.error(`[forward - lead] ❌ Error procesando contacto: `, contactError.message);
      console.error(`[forward - lead] Error completo: `, JSON.stringify(contactError, null, 2));

      // Extraer información detallada del error
      let contactErrorDetails = contactError.message || 'Error desconocido al procesar el contacto';

      if (contactError.body) {
        try {
          const errorBody = typeof contactError.body === 'string' ? JSON.parse(contactError.body) : contactError.body;
          if (errorBody.message) {
            contactErrorDetails = errorBody.message;
          }
        } catch (parseError) {
          console.warn(`[forward - lead] ⚠️ Error parseando body del error: ${parseError.message} `);
        }
      }

      // NO lanzamos error para permitir que se cree el negocio con la data de respaldo
      console.warn(`[forward-lead] ⚠️ Continuando con creación de Deal a pesar del error de contacto: ${contactErrorDetails}`);
      if (typeof logStep !== 'undefined') logStep('Contact Creation Failed - Continuing', { error: contactErrorDetails });

      // Asegurar que contactId sea null
      contactId = null;
    }

    // 2. Crear deal asociado al contacto
    let dealId = null;
    let dealAction = 'created';
    let dealErrorDetails = null;

    try {
      console.log(`[forward - lead] Creando deal para el contacto ${contactId}...`);

      const contactModel = sanitize(inputFields.contact_model) || '';
      const contactFullName = `${contactData.firstname || ''} ${contactData.lastname || ''}`.trim() || 'Lead';

      const dealProperties = {
        dealname: `SIMPA - ${contactFullName} - ${dealerNameInput} - ${contactModel}`
      };

      // Agregar ID de negocio SIMPA si está disponible
      if (originDealId) {
        dealProperties.id_negocio_simpa = originDealId;
        console.log(`[forward - lead] Agregando id_negocio_simpa: ${originDealId} `);
      }

      // LÓGICA DE ASIGNACIÓN DINÁMICA DE PIPELINE (Refactorizada con LeadProcessor)
      console.log(`[forward - lead] 🔍 Determinando Pipeline para "${razonSocial}"...`);

      const pipelineDetermination = LeadProcessor.determinePipeline(
        rsConfig,  // Config de la RS (puede ser undefined si no existe en config pero se infirió nombre)
        marca,
        inputFields.deal_pipeline,
        inputFields.deal_stage,
        dealerNameInput
      );

      assignedPipeline = pipelineDetermination.pipeline;
      assignedStage = pipelineDetermination.stage;
      const pipelineSource = pipelineDetermination.source;

      console.log(`[forward - lead] Pipeline asignado: ${assignedPipeline} (Fuente: ${pipelineSource})`);
      console.log(`[forward - lead] Stage asignado: ${assignedStage} `);

      // Aplicar propiedades personalizadas usando LeadProcessor
      console.log(`[forward - lead] 🔍 Calculando Propiedades Personalizadas...`);
      const customPropsCalculated = LeadProcessor.determineCustomProperties(rsConfig, marca, dealerName);

      if (Object.keys(customPropsCalculated).length > 0) {
        console.log(`[forward - lead] 📋 Propiedades personalizadas calculadas: `, JSON.stringify(customPropsCalculated));
        for (const [key, value] of Object.entries(customPropsCalculated)) {
          dealProperties[key] = value;
          console.log(`[forward - lead] ✅ Agregando propiedad personalizada: ${key} = ${value} `);
        }
      }



      // Agregar dealstage y pipeline solo si están definidos
      if (assignedStage) {
        dealProperties.dealstage = assignedStage;
      }

      if (assignedPipeline) {
        dealProperties.pipeline = assignedPipeline;
      }

      // Agregar propiedades adicionales del deal si están disponibles
      // Verificar y agregar marca_simpa solo si existe
      if (marca) {
        // Verificar y agregar marca_simpa usando lógica robusta
        if (marca) {
          // Usar addOptionToProperty para asegurar que la opción exista y obtener el valor correcto (casing)
          // Esto previene errores de "INVALID_OPTION" si el casing difiere (ej: "Aprilia" vs "APRILIA")
          const resultMarca = await addOptionToProperty(hubspotClient, 'deal', 'marca_simpa', marca);

          if (resultMarca.exists) {
            // IMPORTANTE: Usar successValue si existe (valor real en HubSpot), sino usar el input
            const valueToUse = resultMarca.successValue || marca;
            dealProperties.marca_simpa = valueToUse;
            console.log(`[forward - lead] Agregando marca_simpa: ${valueToUse} `);
          } else {
            // Intentar agregarlo (aunque addOptionToProperty ya lo intenta si no existe)
            if (resultMarca.added) {
              dealProperties.marca_simpa = marca;
              console.log(`[forward - lead] Agregando nueva marca_simpa: ${marca} `);
            } else {
              console.warn(`[forward - lead] ⚠️ No se pudo asignar marca_simpa.Razón: ${resultMarca.reason} `);
            }
          }
        }
      }

      // Usar modelo_simpa para el modelo general (verificar si existe)
      // contactModel defined above
      if (contactModel) {
        // Usar addOptionToProperty para asegurar opciones en modelo_simpa
        const resultSimpa = await addOptionToProperty(hubspotClient, 'deal', 'modelo_simpa', contactModel);

        if (resultSimpa.exists) {
          const valueToUse = resultSimpa.successValue || contactModel;
          dealProperties.modelo_simpa = valueToUse;
          console.log(`[forward - lead] Agregando modelo_simpa: ${valueToUse} `);
        } else {
          if (resultSimpa.added) {
            dealProperties.modelo_simpa = contactModel;
            console.log(`[forward - lead] Agregando nuevo modelo_simpa: ${contactModel} `);
          } else {
            console.warn(`[forward - lead] ⚠️ Propiedad modelo_simpa no existe en el portal del dealer, omitiendo`);
          }
        }
      }

      // Usar modelo_{marca} para el modelo específico de la marca (verificar si existe)
      if (marca && contactModel) {
        // DEBUG: Log del valor original de marca antes de cualquier procesamiento
        console.log(`[forward - lead] ========================================`);
        console.log(`[forward - lead] 🔍 DEBUG - INICIO PROCESAMIENTO MARCA`);
        console.log(`[forward - lead] 🔍 DEBUG - Valor original de marca(tipo: ${typeof marca}, longitud: ${marca ? marca.length : 0}): "${marca}"`);
        console.log(`[forward - lead] 🔍 DEBUG - Valor original de marca(JSON): ${JSON.stringify(marca)} `);
        console.log(`[forward - lead] 🔍 DEBUG - Valor de contactModel: "${contactModel}"`);

        // LÓGICA GENERALIZADA PARA CUALQUIER MARCA
        // Generar candidatos de nombres de propiedad y buscar cuál existe
        let marcaString = String(marca || '').trim();
        const marcaLower = marcaString.toLowerCase();

        // Generar candidatos
        // 1. Snake case: "Moto Guzzi" -> "modelo_moto_guzzi"
        const candidateSnake = `modelo_${marcaLower.replace(/\s+/g, '_')} `;
        // 2. Merged: "Moto Guzzi" -> "modelo_motoguzzi"
        const candidateMerged = `modelo_${marcaLower.replace(/\s+/g, '')} `;

        // Lista de candidatos a probar (en orden de preferencia)
        // Si es Moto Morini, históricamente preferimos 'modelo_moto_morini' (snake), pero probaremos ambos
        const candidates = [candidateSnake, candidateMerged];

        // Eliminar duplicados (si la marca es una sola palabra, snake y merged son iguales)
        const uniqueCandidates = [...new Set(candidates)];

        console.log(`[forward - lead] � Buscando propiedades candidatas para marca "${marcaString}": ${uniqueCandidates.join(', ')}`);

        let foundProperty = null;

        // Iterar sobre candidatos para encontrar una propiedad existente
        for (const candidateProp of uniqueCandidates) {
          console.log(`[forward-lead] 🔍 Verificando existencia de propiedad candidata: ${candidateProp}`);
          const exists = await propertyExists(hubspotClient, 'deal', candidateProp);

          if (exists) {
            foundProperty = candidateProp;
            console.log(`[forward-lead] ✅ Propiedad encontrada: ${foundProperty}`);
            break; // Encontramos una, dejamos de buscar
          }
        }

        if (foundProperty) {
          // Verificar si la propiedad existe y asegurar que tenga la opción
          console.log(`[forward-lead] 🔍 DEBUG - Asegurando opción en propiedad encontrada: ${foundProperty}`);

          // Usar addOptionToProperty para asegurar que la opción exista (pero NO crear la propiedad, ya sabemos que existe)
          const result = await addOptionToProperty(hubspotClient, 'deal', foundProperty, contactModel);

          if (result.exists && result.added) {
            const valueToUse = result.successValue || contactModel;
            dealProperties[foundProperty] = valueToUse;
            console.log(`[forward-lead] ✅ Agregando modelo a propiedad ${foundProperty}: ${valueToUse}`);
            console.log(`[forward-lead] ✅ dealProperties[${foundProperty}] = "${valueToUse}"`);
          } else {
            // Esto es raro porque acabamos de verificar que existe, pero por si acaso
            console.warn(`[forward-lead] ⚠️ No se pudo agregar la opción a ${foundProperty}. Razón: ${result.reason}`);
          }
        } else {
          console.warn(`[forward-lead] ⚠️ No se encontró ninguna propiedad válida para la marca "${marcaString}".`);
          console.warn(`[forward-lead] ⚠️ Candidatos probados: ${uniqueCandidates.join(', ')}`);
          console.warn(`[forward-lead] ⚠️ Sugerencia: Ejecuta "Configure External Account Properties" para crear las propiedades necesarias.`);

          // Fallback histórico: intentar modelo_simpa si no se encontró nada específico
          console.log(`[forward-lead] 🔧 Intentando fallback a modelo_simpa...`);
          const resultSimpa = await addOptionToProperty(hubspotClient, 'deal', 'modelo_simpa', contactModel);
          if (resultSimpa.exists && resultSimpa.added) {
            console.log(`[forward-lead] ✅ modelo_simpa asegurado y ya está en dealProperties: ${dealProperties.modelo_simpa}`);
          }
        }

        console.log(`[forward-lead] 🔍 DEBUG - FIN PROCESAMIENTO MARCA`);
        console.log(`[forward-lead] ========================================`);
      }

      const contactComments = sanitize(inputFields.contact_comments);
      if (contactComments) {
        dealProperties.message = contactComments;
      }

      const financingOption = sanitize(inputFields.financing_option);
      if (financingOption) {
        dealProperties.financing_option = financingOption;
      }

      const inquiryReason = sanitize(inputFields.inquiry_reason);
      if (inquiryReason) {
        dealProperties.inquiry_reason = inquiryReason;
      }

      const purchaseTimeline = sanitize(inputFields.purchase_timeline);
      if (purchaseTimeline) {
        dealProperties.purchase_timeline = purchaseTimeline;
      }

      console.log(`[forward-lead] Propiedades del deal:`, JSON.stringify(dealProperties, null, 2));

      // Asociar con el dealer si hay una propiedad para eso
      // Asociar con el dealer si hay una propiedad para eso
      if (dealerNameInput) {
        // Intentar usar concesionarios_simpa si existe
        // Usar addOptionToProperty para asegurar opciones en concesionarios_simpa
        const resultDealer = await addOptionToProperty(hubspotClient, 'deal', 'concesionarios_simpa', dealerNameInput);

        if (resultDealer.exists) {
          const valueToUse = resultDealer.successValue || dealerNameInput;
          dealProperties.concesionarios_simpa = valueToUse;
          console.log(`[forward - lead] Agregando concesionarios_simpa: ${valueToUse} `);
        } else {
          if (resultDealer.added) {
            dealProperties.concesionarios_simpa = dealerNameInput;
            console.log(`[forward - lead] Agregando nuevo concesionarios_simpa: ${dealerNameInput} `);
          } else {
            console.warn(`[forward - lead] ⚠️ No se pudo asignar concesionarios_simpa. Razón: ${resultDealer.reason}`);
          }
        }
      }

      // Preparar backup de info de contacto si no hay ID (porque falló creación o límite alcanzado)
      if (!contactId) {
        const contactInfoParts = [];
        if (contactData.firstname || contactData.lastname) contactInfoParts.push(`Nombre: ${contactData.firstname} ${contactData.lastname}`);
        if (contactData.email) contactInfoParts.push(`Email: ${contactData.email}`);
        if (contactData.phone) contactInfoParts.push(`Teléfono: ${contactData.phone}`);
        if (contactData.city) contactInfoParts.push(`Ciudad: ${contactData.city}`);
        if (originContactId) contactInfoParts.push(`ID SIMPA: ${originContactId}`);

        dealProperties.simpa_contact_info = contactInfoParts.join('\n');
        console.log('[forward-lead] ⚠️ Agregando info de contacto a dealProperties (simpa_contact_info) porque falló la creación del contacto');
      }

      // Preparar asociaciones condicionales
      const associations = [];
      if (contactId) {
        associations.push({
          to: { id: contactId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }]
        });
      }

      // Crear el deal
      console.log(`[forward-lead] Creando deal... (Asociación contacto: ${contactId ? 'SI' : 'NO'})`);
      const newDeal = await hubspotClient.crm.deals.basicApi.create({
        properties: dealProperties,
        associations: associations
      });

      dealId = newDeal.id;
      console.log(`[forward-lead] ✅ Deal creado exitosamente. ID: ${dealId}`);

      // Verificar y asegurar la asociación (por si acaso no se creó en el paso anterior)
      // Verificar y asegurar la asociación (por si acaso no se creó en el paso anterior)
      // NOTA: En la versión v10+ del cliente, associationsApi cambió de ubicación.
      // Dado que ya estamos creando la asociación en el paso anterior (create deal),
      // y si eso no falla, la asociación existe.
      // Eliminamos la verificación redundante que estaba causando error.
      console.log(`[forward-lead] ✅ Asociación creada implícitamente con el deal.`);

      dealAction = 'created';

    } catch (dealError) {
      console.error(`[forward-lead] ❌ Error creando deal:`, dealError.message);
      console.error(`[forward-lead] Error completo:`, JSON.stringify(dealError, null, 2));

      // Extraer información detallada del error
      let errorDetails = dealError.message || 'Error desconocido al crear el deal';
      let errorProperty = null;
      let errorValue = null;
      let validOptions = null;

      // Intentar extraer información del body del error
      if (dealError.body) {
        try {
          const errorBody = typeof dealError.body === 'string' ? JSON.parse(dealError.body) : dealError.body;

          if (errorBody.message) {
            errorDetails = errorBody.message;
          }

          // Buscar información de propiedades inválidas
          if (errorBody.errors && Array.isArray(errorBody.errors) && errorBody.errors.length > 0) {
            const firstError = errorBody.errors[0];
            if (firstError.context && firstError.context.propertyName) {
              errorProperty = Array.isArray(firstError.context.propertyName)
                ? firstError.context.propertyName[0]
                : firstError.context.propertyName;
            }

            // Extraer el valor inválido y opciones válidas del mensaje
            if (firstError.message) {
              const messageMatch = firstError.message.match(/was not one of the allowed options: \[(.*?)\]/);
              if (messageMatch) {
                validOptions = messageMatch[1].split(', ').map(opt => opt.trim());
              }

              const valueMatch = firstError.message.match(/^([^"]+)"? was not/);
              if (valueMatch) {
                errorValue = valueMatch[1].trim();
              }
            }
          }

          // También buscar en el mensaje principal
          if (errorBody.message && !errorProperty) {
            const propMatch = errorBody.message.match(/Property "([^"]+)"/);
            if (propMatch) {
              errorProperty = propMatch[1];
            }

            const optionsMatch = errorBody.message.match(/allowed options: \[(.*?)\]/);
            if (optionsMatch) {
              validOptions = optionsMatch[1].split(', ').map(opt => opt.trim());
            }

            const valueMatch = errorBody.message.match(/"([^"]+)" was not one of/);
            if (valueMatch) {
              errorValue = valueMatch[1];
            }
          }
        } catch (parseError) {
          console.warn(`[forward-lead] ⚠️ Error parseando body del error: ${parseError.message}`);
        }
      }

      // Construir mensaje de error detallado
      let detailedErrorMessage = `Error al crear el deal`;

      if (errorProperty && errorValue) {
        detailedErrorMessage = `Error en la propiedad "${errorProperty}": el valor "${errorValue}" no es válido`;

        if (validOptions && validOptions.length > 0) {
          detailedErrorMessage += `. Opciones válidas: ${validOptions.join(', ')}`;
        }
      } else if (errorProperty) {
        detailedErrorMessage = `Error en la propiedad "${errorProperty}"`;
      } else if (errorDetails) {
        detailedErrorMessage = errorDetails;
      }

      console.error(`[forward-lead] Mensaje de error detallado: ${detailedErrorMessage}`);

      // Guardar el error detallado para incluirlo en la respuesta
      dealAction = 'error';
      dealErrorDetails = detailedErrorMessage;
    }

    // 3. Preparar respuesta
    let successMessage = '';
    let overallSuccess = true;

    if (contactId && dealId) {
      successMessage = `Lead enviado exitosamente. Contacto ${contactAction === 'created' ? 'creado' : 'actualizado'} (ID: ${contactId}), Deal creado (ID: ${dealId})`;
      overallSuccess = true;
    } else if (contactId) {
      if (dealErrorDetails) {
        successMessage = `Contacto ${contactAction === 'created' ? 'creado' : 'actualizado'} exitosamente (ID: ${contactId}), pero no se pudo crear el deal: ${dealErrorDetails}`;
      } else {
        successMessage = `Contacto ${contactAction === 'created' ? 'creado' : 'actualizado'} exitosamente (ID: ${contactId}), pero hubo un error al crear el deal`;
      }
      overallSuccess = false;
    } else {
      successMessage = `Error al procesar el lead: no se pudo crear el contacto`;
      overallSuccess = false;
    }

    const outputFields = {
      success: overallSuccess,
      message: successMessage,
      razonSocial: razonSocialInput,
      dealerContactId: contactId || '',
      dealerDealId: dealId || '',
      contactAction: contactAction,
      dealAction: dealAction,
      dealerName: dealerNameInput
    };

    // Agregar detalles del error si existe
    if (dealErrorDetails) {
      outputFields.dealError = dealErrorDetails;
    }

    console.log(`[forward-lead] === Resultado final ===`);
    console.log(`[forward-lead] Contacto: ${contactAction} - ID: ${contactId || 'N/A'}`);
    console.log(`[forward-lead] Deal: ${dealAction} - ID: ${dealId || 'N/A'}`);
    console.log(`[forward-lead] =======================`);

    // --- ANALYTICS LOGGING (FINAL STATUS) ---
    try {
      await AnalyticsService.logEvent({
        status: overallSuccess ? 'success' : 'error',
        dealer: dealerNameInput,
        brand: originalBrandName || 'Inferred',
        razonSocial: razonSocial,
        hsDealId: dealId,
        portalId: (typeof rsConfig !== 'undefined' && rsConfig) ? rsConfig.portalId : '',
        error: overallSuccess ? null : successMessage,
        details: {
          executionSteps: executionSteps,
          inputFields: inputFields,
          contactId: contactId,
          pipelineId: assignedPipeline,
          dealStage: assignedStage
        }
      });
    } catch (e) {
      console.error('[Analytics] Error logging event:', e);
    }

    res.status(200).json({ outputFields });
  } catch (error) {
    console.error('[forward-lead] Error general:', error);
    if (typeof logStep !== 'undefined') logStep('Fatal Error', { message: error.message });
    console.error('[forward-lead] Stack:', error.stack);

    // Extraer información detallada del error
    let errorMessage = error.message || 'Error desconocido';
    let errorDetails = null;

    if (error.body) {
      try {
        const errorBody = typeof error.body === 'string' ? JSON.parse(error.body) : error.body;
        if (errorBody.message) {
          errorDetails = errorBody.message;
        }
      } catch (parseError) {
        console.warn(`[forward-lead] ⚠️ Error parseando body del error: ${parseError.message}`);
        if (typeof logStep !== 'undefined') logStep('Fatal Error - Error Parsing Body', { error: parseError.message });
      }
    }

    const finalMessage = errorDetails
      ? `Error: ${errorMessage}. Detalles: ${errorDetails}`
      : `Error: ${errorMessage}`;

    // Enviar notificación a Slack (non-blocking)
    const SLACK_WEBHOOK_URL = process.env.SLACK_ERROR_WEBHOOK_URL;
    if (SLACK_WEBHOOK_URL) {
      // Extraer contexto seguro de inputFields si están disponibles en este scope
      const context = {
        timestamp: new Date().toISOString()
      };

      // Intentar recuperar datos del request si es posible
      if (req && req.body && req.body.inputFields) {
        if (req.body.inputFields.dealer_name) context.dealer = req.body.inputFields.dealer_name;
        if (req.body.inputFields.contact_brand) context.marca = req.body.inputFields.contact_brand;
        if (req.body.inputFields.contact_email) context.email = req.body.inputFields.contact_email;
        if (req.body.inputFields.razon_social) context.razon_social = req.body.inputFields.razon_social;
      }

      // Esperar a que se envíe la notificación antes de responder (crítico en serverless)
      try {
        await sendSlackErrorNotification(SLACK_WEBHOOK_URL, {
          functionName: 'forward-lead',
          error: error,
          context: context
        });
        if (typeof logStep !== 'undefined') logStep('Slack Notification Sent');
      } catch (slackError) {
        console.error('[forward-lead] Error enviando notificación a Slack (ignorado para no afectar respuesta):', slackError);
        if (typeof logStep !== 'undefined') logStep('Error Sending Slack Notification', { error: slackError.message });
      }
    }

    // Manejo específico para Rate Limit (429)
    if (error.code === 429 || error.statusCode === 429 || error.message.includes('429') || (error.body && JSON.stringify(error.body).includes('RATE_LIMIT'))) {
      const rateLimitMsg = "Se alcanzó el límite de velocidad de la API de HubSpot (Rate Limit). La acción se reintentará automáticamente.";
      console.warn(`[forward-lead] ⚠️ ${rateLimitMsg}`);
      if (typeof logStep !== 'undefined') logStep('Rate Limit Error', { message: rateLimitMsg });

      // --- ANALYTICS LOGGING (RATE LIMIT) ---
      try {
        await AnalyticsService.logEvent({
          status: 'error',
          dealer: dealerName,
          brand: originalBrandName || 'Inferred',
          razonSocial: razonSocial || 'Unknown',
          error: "Rate Limit (429)",
          details: {
            executionSteps: typeof executionSteps !== 'undefined' ? executionSteps : [],
            input: req.body ? req.body.inputFields : 'N/A',
            errorDetails: errorDetails
          }
        });
      } catch (e) { console.error('[Analytics] Error logging rate limit:', e); }

      // Devolver 429 explícitamente le indica a HubSpot (y otros clientes) que deben reintentar
      return res.status(429).json({
        outputFields: {
          success: false,
          message: rateLimitMsg,
          error: "RATE_LIMIT",
          errorDetails: errorDetails || null
        }
      });
    }

    // --- ANALYTICS LOGGING (ERROR) ---
    try {
      const errorRazon = (typeof inferredRazon !== 'undefined' && inferredRazon) ? inferredRazon.razonSocial : (razonSocial || 'Unknown');

      await AnalyticsService.logEvent({
        status: 'error',
        dealer: dealerName,
        brand: originalBrandName || 'Inferred',
        razonSocial: errorRazon,
        error: errorMessage,
        details: {
          executionSteps: typeof executionSteps !== 'undefined' ? executionSteps : [],
          input: req.body ? req.body.inputFields : 'N/A',
          stack: error.stack
        }
      });
    } catch (e) { console.error('[Analytics] Error logging error:', e); }

    res.status(500).json({
      outputFields: {
        success: false,
        message: finalMessage,
        error: errorMessage,
        errorDetails: errorDetails || null
      }
    });
  }
};
