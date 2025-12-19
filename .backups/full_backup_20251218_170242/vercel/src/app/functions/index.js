/**
 * Custom Workflow Action - Configurar Propiedades de Cuenta Externa
 * 
 * Esta acción:
 * 1. Recibe parámetros: marca, dealer, llave (accessToken)
 * 2. Identifica la cuenta externa de HubSpot usando el accessToken
 * 3. Consulta el schema de contactos de la cuenta externa
 * 4. Crea propiedades personalizadas según la configuración de marca/dealer
 */

const hubspot = require('@hubspot/api-client');

// Configuración de propiedades base para CONTACTOS (siempre las mismas para todos los dealers y marcas)
// Las opciones varían según marca/dealer según la configuración de opciones
const BASE_PROPERTIES_CONTACT = [
  {
    name: 'id_contacto_simpa',
    description: "ID del Contacto en SIMPA",
    label: "SIMPA ID Contact",
    groupName: "contactinformation",
    type: "string",
    hasVariableOptions: false // Esta propiedad no tiene opciones variables
  },
  {
    name: 'modelo_simpa',
    description: "Modelos de motos",
    label: "Modelo",
    groupName: "contactinformation",
    type: "enumeration",
    hasVariableOptions: true, // Las opciones varían según marca (iguales para todos los dealers de esa marca)
    optionsKey: 'modelo_simpa' // Clave para buscar opciones en la configuración
  },
  {
    name: 'modelo_{marca}', // El nombre se reemplazará dinámicamente con la marca
    description: "Modelos de motos {marca}",
    label: "Modelo {marca}",
    groupName: "contactinformation",
    type: "enumeration",
    hasVariableOptions: true, // Las opciones varían según marca (iguales para todos los dealers de esa marca)
    optionsKey: 'modelo_marca' // Clave para buscar opciones en la configuración
  },
  {
    name: 'marca_simpa',
    description: "Marca de la moto",
    label: "Marca",
    groupName: "contactinformation",
    type: "enumeration",
    hasVariableOptions: true,
    optionsKey: 'marca_simpa' // Las opciones varían según marca
  },
  {
    name: 'concesionarios_simpa',
    description: "Concesionarios disponibles",
    label: "Concesionarios",
    groupName: "contactinformation",
    type: "enumeration",
    hasVariableOptions: true,
    optionsKey: 'concesionarios_simpa' // Las opciones varían según dealer
  }
];

// Configuración de propiedades base para NEGOCIOS/DEALS (siempre las mismas para todos los dealers y marcas)
// Las opciones varían según marca/dealer según la configuración de opciones
const BASE_PROPERTIES_DEAL = [
  {
    name: 'id_contacto_simpa',
    description: "ID del Contacto en SIMPA",
    label: "SIMPA ID Contact",
    groupName: "dealinformation",
    type: "string",
    hasVariableOptions: false // Esta propiedad no tiene opciones variables
  },
  {
    name: 'modelo_simpa',
    description: "Modelos de motos",
    label: "Modelo",
    groupName: "dealinformation",
    type: "enumeration",
    hasVariableOptions: true, // Las opciones varían según marca (iguales para todos los dealers de esa marca)
    optionsKey: 'modelo_simpa' // Clave para buscar opciones en la configuración
  },
  {
    name: 'modelo_{marca}', // El nombre se reemplazará dinámicamente con la marca
    description: "Modelos de motos {marca}",
    label: "Modelo {marca}",
    groupName: "dealinformation",
    type: "enumeration",
    hasVariableOptions: true, // Las opciones varían según marca (iguales para todos los dealers de esa marca)
    optionsKey: 'modelo_marca' // Clave para buscar opciones en la configuración
  },
  {
    name: 'marca_simpa',
    description: "Marca de la moto",
    label: "Marca",
    groupName: "dealinformation",
    type: "enumeration",
    hasVariableOptions: true,
    optionsKey: 'marca_simpa' // Las opciones varían según marca
  },
  {
    name: 'concesionarios_simpa',
    description: "Concesionarios disponibles",
    label: "Concesionarios",
    groupName: "dealinformation",
    type: "enumeration",
    hasVariableOptions: true,
    optionsKey: 'concesionarios_simpa' // Las opciones varían según dealer
  }
];

// Configuración de opciones por marca y dealer
// Estructura: 
// - Para modelo_simpa y modelo_marca: { marca: [opciones] } (a nivel de marca, igual para todos los dealers)
// - Para marca_simpa: { marca: [opciones] } (a nivel de marca)
// - Para concesionarios_simpa: { dealer: [opciones] } (a nivel de dealer)
const OPTIONS_CONFIG = {
  // Opciones para modelo_simpa (varía solo por marca, igual para todos los dealers de esa marca)
  modelo_simpa: {
    'moto morini': ['X-Cape', 'X-Cape x', 'Seiemmezzo STR', 'Seiemmezzo SCR', 'Calibro Custom', 'Calibro Bagger', 'X-Cape 700'],
    'royal enfield': ['Classic 350', 'Continental GT 650', 'Himalayan', 'Himalayan 450', 'HNTR 350', 'Interceptor 650', 'Meteor 350', 'Scram 411', 'Shotgun', 'Super Meteor 650', 'GRR 450', 'BEAR 650'],
    'ktm': ['390 Duke', '390 Adventure', '790 Duke', '890 Adventure', '1290 Super Duke R', '1290 Super Adventure'],
    'cf moto': ['CFORCE 110', 'CFORCE 450 TOURING', 'CFORCE 625 TOURING', 'CFORCE 1000', 'UFORCE 600', 'UFORCE 1000', 'UFORCE 1000 XL', 'ZFORCE 800 EX', 'ZFORCE 950 SPORT-4 Plazas', 'ZFORCE 1000 SPORT R', 'CX - 2E', 'CX - 5E', 'CFORCE 850 TOURING', 'Otro Modelo CFMOTO', 'ZFORCE 550', 'CFORCE 850', 'UFORCE 1000 PRO', 'ZFORCE 950 SPORT-4', 'UFORCE U10 PRO'],
    'qj motor': ['SRT 550', 'SRT 700', 'SRT 800 XS', 'SRK 400', 'SRK 600', 'FORT 350', 'SRV 300', 'SRT 700X'],
    // Agregar más marcas aquí
  },
  
  // Opciones para modelo_{marca} (varía solo por marca, igual para todos los dealers de esa marca)
  modelo_marca: {
    'moto morini': ['X-Cape', 'X-Cape x', 'Seiemmezzo STR', 'Seiemmezzo SCR', 'Calibro Custom', 'Calibro Bagger', 'X-Cape 700'],
    'royal enfield': ['Classic 350', 'Continental GT 650', 'Himalayan', 'Himalayan 450', 'HNTR 350', 'Interceptor 650', 'Meteor 350', 'Scram 411', 'Shotgun', 'Super Meteor 650', 'GRR 450', 'BEAR 650'],
    'ktm': ['390 Duke', '390 Adventure', '790 Duke', '890 Adventure', '1290 Super Duke R', '1290 Super Adventure'],
    'cf moto': ['CFORCE 110', 'CFORCE 450 TOURING', 'CFORCE 625 TOURING', 'CFORCE 1000', 'UFORCE 600', 'UFORCE 1000', 'UFORCE 1000 XL', 'ZFORCE 800 EX', 'ZFORCE 950 SPORT-4 Plazas', 'ZFORCE 1000 SPORT R', 'CX - 2E', 'CX - 5E', 'CFORCE 850 TOURING', 'Otro Modelo CFMOTO', 'ZFORCE 550', 'CFORCE 850', 'UFORCE 1000 PRO', 'ZFORCE 950 SPORT-4', 'UFORCE U10 PRO'],
    'qj motor': ['SRT 550', 'SRT 700', 'SRT 800 XS', 'SRK 400', 'SRK 600', 'FORT 350', 'SRV 300', 'SRT 700X'],
    // Agregar más marcas aquí
  },
  
  // Opciones para marca_simpa (varía solo por marca)
  marca_simpa: {
    'moto morini': ['Moto Morini'],
    'royal enfield': ['Royal Enfield'],
    'ktm': ['KTM'],
    'cf moto': ['CF MOTO'],
    'qj motor': ['QJ Motor'],
    // Agregar más marcas aquí
  },
  
  // Opciones para concesionarios_simpa (varía solo por dealer)
  concesionarios_simpa: {
    'moto morini leloir': ['Moto Morini Leloir'],
    'moto morini otro dealer': ['Moto Morini Otro Dealer'],
    'royal enfield dealer 1': ['Royal Enfield Dealer 1'],
    'ktm dealer 1': ['KTM Dealer 1'],
    // Agregar más dealers aquí
  }
};

function getObjectTypeKey(objectType) {
  return objectType === 'deal' ? 'deals' : 'contacts';
}

// Obtener opciones para una propiedad según marca y dealer
function getOptionsForProperty(propertyKey, marca, dealer) {
  const options = OPTIONS_CONFIG[propertyKey];
  if (!options) {
    return [];
  }
  const dealerOptions = options[dealer];
  if (dealerOptions) {
    return dealerOptions;
  }
  const marcaOptions = options[marca];
  if (marcaOptions) {
    return marcaOptions;
  }
  return [];
}

// Consultar schema de contactos existente
async function getExistingContactProperties(hubspotClient) {
  try {
    const response = await hubspotClient.crm.properties.coreApi.getAll('contacts', false);
    const properties = response.results || [];
    
    // Crear un mapa de propiedades existentes por nombre
    const propertiesMap = {};
    properties.forEach(prop => {
      propertiesMap[prop.name] = prop;
    });
    
    return propertiesMap;
  } catch (error) {
    console.error('Error consultando schema de contactos:', error);
    throw new Error(`Error al consultar propiedades de contactos: ${error.message}`);
  }
}

// Consultar schema de deals (negocios) existente
async function getExistingDealProperties(hubspotClient) {
  try {
    const response = await hubspotClient.crm.properties.coreApi.getAll('deals', false);
    const properties = response.results || [];
    
    // Crear un mapa de propiedades existentes por nombre
    const propertiesMap = {};
    properties.forEach(prop => {
      propertiesMap[prop.name] = prop;
    });
    
    return propertiesMap;
  } catch (error) {
    console.error('Error consultando schema de deals:', error);
    throw new Error(`Error al consultar propiedades de deals: ${error.message}`);
  }
}

// Crear una propiedad en HubSpot
// objectType puede ser 'contact' o 'deal'
async function createProperty(hubspotClient, propertyConfig, existingProperties, objectType = 'contact') {
  const propertyName = propertyConfig.name;
  
  // Verificar si la propiedad ya existe
  if (existingProperties[propertyName]) {
    console.log(`La propiedad ${propertyName} ya existe en ${objectType}, se omite`);
    return { created: false, skipped: true, name: propertyName };
  }
  
  try {
    // Usar el tipo directamente de la configuración (ya viene en formato HubSpot)
    const hubspotFieldType = propertyConfig.type;
    
    // Construir la definición de la propiedad
    const propertyDefinition = {
      name: propertyName,
      label: propertyConfig.label,
      type: hubspotFieldType,
      description: propertyConfig.description || '',
      groupName: propertyConfig.groupName || (objectType === 'deal' ? 'dealinformation' : 'contactinformation')
    };
    
    // Si es un campo de enumeración, agregar opciones
    if (hubspotFieldType === 'enumeration' && propertyConfig.options && propertyConfig.options.length > 0) {
      // Las opciones ya vienen en el formato correcto {label, value}
      propertyDefinition.options = propertyConfig.options;
    }
    
    // Crear la propiedad en HubSpot según el tipo de objeto
    await hubspotClient.crm.properties.coreApi.create(
      getObjectTypeKey(objectType),
      propertyDefinition
    );
    
    console.log(`Propiedad ${propertyName} creada exitosamente en ${objectType}`);
    
    return { created: true, skipped: false, name: propertyName };
  } catch (error) {
    console.error(`Error creando propiedad ${propertyName} en ${objectType}:`, error);
    throw new Error(`Error al crear propiedad ${propertyName} en ${objectType}: ${error.message}`);
  }
}

// Función para procesar todas las propiedades (contactos y deals)
async function procesarTodasPropiedades(hubspotClient, marca, dealer, stats) {
  console.log('=== Procesando TODAS las propiedades ===');
  
  // Procesar propiedades para CONTACTOS
  console.log('--- Procesando propiedades para CONTACTOS ---');
  const contactPropertiesToCreate = getPropertiesToCreate(marca, dealer, 'contact', ['all']);
  console.log(`Se generaron ${contactPropertiesToCreate.length} propiedades de contacto a crear`);
  
  const existingContactProperties = await getExistingContactProperties(hubspotClient);
  console.log(`Se encontraron ${Object.keys(existingContactProperties).length} propiedades de contacto existentes`);
  
  for (const propertyConfig of contactPropertiesToCreate) {
    try {
      const result = await createProperty(hubspotClient, propertyConfig, existingContactProperties, 'contact');
      if (result.created) {
        stats.propertiesCreated++;
        stats.createdProperties.push(`contact:${result.name}`);
        existingContactProperties[result.name] = { name: result.name };
      } else if (result.skipped) {
        stats.propertiesSkipped++;
        stats.skippedProperties.push(`contact:${result.name}`);
      }
    } catch (error) {
      console.error(`Error procesando propiedad de contacto ${propertyConfig.name}:`, error);
    }
  }
  
  // Procesar propiedades para DEALS (NEGOCIOS)
  console.log('--- Procesando propiedades para DEALS/NEGOCIOS ---');
  const dealPropertiesToCreate = getPropertiesToCreate(marca, dealer, 'deal', ['all']);
  console.log(`Se generaron ${dealPropertiesToCreate.length} propiedades de deal a crear`);
  
  const existingDealProperties = await getExistingDealProperties(hubspotClient);
  console.log(`Se encontraron ${Object.keys(existingDealProperties).length} propiedades de deal existentes`);
  
  for (const propertyConfig of dealPropertiesToCreate) {
    try {
      const result = await createProperty(hubspotClient, propertyConfig, existingDealProperties, 'deal');
      if (result.created) {
        stats.propertiesCreated++;
        stats.createdProperties.push(`deal:${result.name}`);
        existingDealProperties[result.name] = { name: result.name };
      } else if (result.skipped) {
        stats.propertiesSkipped++;
        stats.skippedProperties.push(`deal:${result.name}`);
      }
    } catch (error) {
      console.error(`Error procesando propiedad de deal ${propertyConfig.name}:`, error);
    }
  }
}

// Función para procesar solo propiedades de modelos
async function procesarPropiedadesModelos(hubspotClient, marca, dealer, stats) {
  console.log('=== Procesando propiedades de MODELOS ===');
  
  // Procesar en CONTACTOS
  console.log('--- Procesando propiedades de modelos en CONTACTOS ---');
  const contactPropertiesToCreate = getPropertiesToCreate(marca, dealer, 'contact', ['modelos', 'marca']);
  const existingContactProperties = await getExistingContactProperties(hubspotClient);
  
  for (const propertyConfig of contactPropertiesToCreate) {
    try {
      const result = await createProperty(hubspotClient, propertyConfig, existingContactProperties, 'contact');
      if (result.created) {
        stats.propertiesCreated++;
        stats.createdProperties.push(`contact:${result.name}`);
        existingContactProperties[result.name] = { name: result.name };
      } else if (result.skipped) {
        stats.propertiesSkipped++;
        stats.skippedProperties.push(`contact:${result.name}`);
      }
    } catch (error) {
      console.error(`Error procesando propiedad de modelo en contacto ${propertyConfig.name}:`, error);
    }
  }
  
  // Procesar en DEALS
  console.log('--- Procesando propiedades de modelos en DEALS ---');
  const dealPropertiesToCreate = getPropertiesToCreate(marca, dealer, 'deal', ['modelos', 'marca']);
  const existingDealProperties = await getExistingDealProperties(hubspotClient);
  
  for (const propertyConfig of dealPropertiesToCreate) {
    try {
      const result = await createProperty(hubspotClient, propertyConfig, existingDealProperties, 'deal');
      if (result.created) {
        stats.propertiesCreated++;
        stats.createdProperties.push(`deal:${result.name}`);
        existingDealProperties[result.name] = { name: result.name };
      } else if (result.skipped) {
        stats.propertiesSkipped++;
        stats.skippedProperties.push(`deal:${result.name}`);
      }
    } catch (error) {
      console.error(`Error procesando propiedad de modelo en deal ${propertyConfig.name}:`, error);
    }
  }
}

// Función para procesar solo propiedades de concesionarios
async function procesarPropiedadesConcesionarios(hubspotClient, marca, dealer, stats) {
  console.log('=== Procesando propiedades de CONCESIONARIOS ===');
  
  // Procesar en CONTACTOS
  console.log('--- Procesando propiedades de concesionarios en CONTACTOS ---');
  const contactPropertiesToCreate = getPropertiesToCreate(marca, dealer, 'contact', ['concesionarios']);
  const existingContactProperties = await getExistingContactProperties(hubspotClient);
  
  for (const propertyConfig of contactPropertiesToCreate) {
    try {
      const result = await createProperty(hubspotClient, propertyConfig, existingContactProperties, 'contact');
      if (result.created) {
        stats.propertiesCreated++;
        stats.createdProperties.push(`contact:${result.name}`);
        existingContactProperties[result.name] = { name: result.name };
      } else if (result.skipped) {
        stats.propertiesSkipped++;
        stats.skippedProperties.push(`contact:${result.name}`);
      }
    } catch (error) {
      console.error(`Error procesando propiedad de concesionario en contacto ${propertyConfig.name}:`, error);
    }
  }
  
  // Procesar en DEALS
  console.log('--- Procesando propiedades de concesionarios en DEALS ---');
  const dealPropertiesToCreate = getPropertiesToCreate(marca, dealer, 'deal', ['concesionarios']);
  const existingDealProperties = await getExistingDealProperties(hubspotClient);
  
  for (const propertyConfig of dealPropertiesToCreate) {
    try {
      const result = await createProperty(hubspotClient, propertyConfig, existingDealProperties, 'deal');
      if (result.created) {
        stats.propertiesCreated++;
        stats.createdProperties.push(`deal:${result.name}`);
        existingDealProperties[result.name] = { name: result.name };
      } else if (result.skipped) {
        stats.propertiesSkipped++;
        stats.skippedProperties.push(`deal:${result.name}`);
      }
    } catch (error) {
      console.error(`Error procesando propiedad de concesionario en deal ${propertyConfig.name}:`, error);
    }
  }
}

// Definir las etapas requeridas del pipeline
function getRequiredPipelineStages() {
  return [
    { label: "Negocio Creado", metadata: { probability: 0.1 } },
    { label: "Negocio Gestionado", metadata: { probability: 0.3 } },
    { label: "Negocio Reservado", metadata: { probability: 0.8 } },
    { label: "Negocio Ganado", metadata: { probability: 1.0 } },
    { label: "Moto Entregada", metadata: { probability: 1.0 } },
    { label: "Negocio Perdido", metadata: { probability: 0.0 } }
  ];
}

// Función para crear/configurar pipeline de negocio
async function procesarPipelineNegocio(hubspotClient, marca, dealer, stats) {
  console.log('=== Procesando PIPELINE DE NEGOCIO ===');
  
  const objectType = "deals";
  const pipelineName = marca.toUpperCase(); // Usar la marca como nombre del pipeline
  const requiredStages = getRequiredPipelineStages();
  const messages = [];
  let detallePipeline = [];
  let pipelineCreated = false;
  let pipelineUpdated = false;
  
  try {
    // Obtener pipelines existentes
    console.log(`Buscando pipelines de deals existentes...`);
    const apiResponse = await hubspotClient.crm.pipelines.pipelinesApi.getAll(objectType);
    const pipelines = apiResponse.results || [];
    
    console.log(`Se encontraron ${pipelines.length} pipelines de deals existentes`);
    
    // Crear el array de objetos con la estructura especificada para logging
    const pipelineDetails = pipelines.map(pipeline => ({
      Pipeline: pipeline.label,
      ID: pipeline.id,
      Stages: pipeline.stages.map(stage => ({
        Stage: stage.label,
        ID: stage.id,
        Probability: stage.metadata.probability
      }))
    }));
    
    console.log('Pipelines existentes:', JSON.stringify(pipelineDetails, null, 2));
    
    // Buscar si el pipeline ya existe
    let pipeline = pipelines.find(p => p.label === pipelineName);
    
    if (!pipeline) {
      // El pipeline no existe, intentar crearlo
      const message = `El pipeline '${pipelineName}' no existe. Creándolo...`;
      console.log(message);
      messages.push(message);
      
      const PipelineInput = {
        displayOrder: pipelines.length,
        stages: requiredStages.map((stage, index) => ({
          label: stage.label,
          displayOrder: index,
          metadata: stage.metadata
        })),
        label: pipelineName
      };
      
      try {
        console.log(`Creando pipeline '${pipelineName}' con ${requiredStages.length} etapas...`);
        await hubspotClient.crm.pipelines.pipelinesApi.create(objectType, PipelineInput);
        
        const createMessage = `El pipeline '${pipelineName}' ha sido creado exitosamente con las etapas requeridas.`;
        console.log(createMessage);
        messages.push(createMessage);
        pipelineCreated = true;
        
        // Obtener el pipeline recién creado para obtener su ID
        const updatedResponse = await hubspotClient.crm.pipelines.pipelinesApi.getAll(objectType);
        pipeline = updatedResponse.results.find(p => p.label === pipelineName);
        
        if (pipeline) {
          detallePipeline = pipeline.stages.map(stage => ({
            label: stage.label,
            id: stage.id,
            probability: stage.metadata.probability
          }));
        }
        
      } catch (createError) {
        console.log("Error al crear el pipeline. Buscando el motivo...");
        
        // Verificar si es un error de límite de pipelines
        if (createError.body && createError.body.message && createError.body.category === 'API_LIMIT') {
          const limitMessage = `No se puede crear el pipeline '${pipelineName}' debido al límite de pipelines. Utilizando el pipeline por defecto.`;
          messages.push(limitMessage);
          console.log("No se puede crear un nuevo Pipeline de Ventas en esta cuenta. Se debe utilizar el pipeline por defecto.");
          
          // Usar el primer pipeline disponible (pipeline por defecto)
          pipeline = pipelines[0];
          
          if (pipeline) {
            const existingStageDetails = pipeline.stages.map(stage => ({
              label: stage.label,
              id: stage.id,
              probability: stage.metadata.probability
            }));
            
            const stagesMessage = `El pipeline '${pipeline.label}' contiene las siguientes etapas: ${existingStageDetails.map(stage => `\nStage: ${stage.label} - ID: ${stage.id} - Probability: ${stage.probability}`).join(', ')}.`;
            messages.push(stagesMessage);
            detallePipeline = existingStageDetails;
          }
          
        } else {
          // Otro tipo de error
          let errorMessage = `Error al crear pipeline: ${createError.message}`;
          if (createError.response) {
            if (createError.response.body) {
              errorMessage += `\nBody: ${JSON.stringify(createError.response.body, null, 2)}`;
            }
            if (createError.response.headers) {
              errorMessage += `\nHeaders: ${JSON.stringify(createError.response.headers, null, 2)}`;
            }
          }
          console.error(errorMessage);
          messages.push(errorMessage);
          throw new Error(errorMessage);
        }
      }
      
    } else {
      // El pipeline existe, verificar y actualizar etapas si es necesario
      const message = `El pipeline '${pipelineName}' existe. Verificando las etapas...`;
      console.log(message);
      messages.push(message);
      
      const existingStageLabels = pipeline.stages.map(stage => stage.label);
      const missingStages = requiredStages.filter(stage => !existingStageLabels.includes(stage.label));
      
      if (missingStages.length > 0) {
        // Faltan etapas, agregarlas
        const missingStagesMessage = `Faltan las siguientes etapas en el pipeline '${pipelineName}': ${missingStages.map(stage => stage.label).join(', ')}. Agregándolas...`;
        console.log(missingStagesMessage);
        messages.push(missingStagesMessage);
        
        const PipelinePatchInput = {
          stages: pipeline.stages.concat(missingStages.map((stage, index) => ({
            label: stage.label,
            displayOrder: pipeline.stages.length + index,
            metadata: stage.metadata
          })))
        };
        
        console.log(`Actualizando pipeline '${pipelineName}' con ${missingStages.length} etapas nuevas...`);
        await hubspotClient.crm.pipelines.pipelinesApi.update(objectType, pipeline.id, PipelinePatchInput);
        
        const updateMessage = `Las etapas faltantes han sido agregadas al pipeline '${pipelineName}'.`;
        console.log(updateMessage);
        messages.push(updateMessage);
        pipelineUpdated = true;
        
        // Obtener el pipeline actualizado
        const updatedResponse = await hubspotClient.crm.pipelines.pipelinesApi.getAll(objectType);
        const updatedPipeline = updatedResponse.results.find(p => p.id === pipeline.id);
        
        if (updatedPipeline) {
          detallePipeline = updatedPipeline.stages.map(stage => ({
            label: stage.label,
            id: stage.id,
            probability: stage.metadata.probability
          }));
        }
        
      } else {
        // Todas las etapas están presentes
        const allStagesPresentMessage = `Todas las etapas requeridas están presentes en el pipeline '${pipelineName}'.`;
        console.log(allStagesPresentMessage);
        messages.push(allStagesPresentMessage);
        
        detallePipeline = pipeline.stages.map(stage => ({
          label: stage.label,
          id: stage.id,
          probability: stage.metadata.probability
        }));
      }
    }
    
    // Preparar mensaje final
    let finalMessage = messages.join('\n');
    if (pipelineCreated) {
      finalMessage = `Pipeline '${pipelineName}' creado exitosamente. ${finalMessage}`;
    } else if (pipelineUpdated) {
      finalMessage = `Pipeline '${pipelineName}' actualizado exitosamente. ${finalMessage}`;
    } else {
      finalMessage = `Pipeline '${pipelineName}' verificado. ${finalMessage}`;
    }
    
    stats.message = finalMessage;
    stats.propertiesCreated = pipelineCreated ? 1 : (pipelineUpdated ? 1 : 0);
    stats.pipelineDetails = detallePipeline;
    stats.pipelineName = pipeline ? pipeline.label : pipelineName;
    stats.pipelineId = pipeline ? pipeline.id : null;
    
    console.log('=== Pipeline procesado exitosamente ===');
    
  } catch (error) {
    let errorMessage = `Error procesando pipeline: ${error.message}`;
    if (error.response) {
      if (error.response.body) {
        errorMessage += `\nBody: ${JSON.stringify(error.response.body, null, 2)}`;
      }
      if (error.response.headers) {
        errorMessage += `\nHeaders: ${JSON.stringify(error.response.headers, null, 2)}`;
      }
    }
    console.error(errorMessage);
    messages.push(errorMessage);
    stats.message = messages.join('\n');
    throw new Error(errorMessage);
  }
}

// Función principal para workflow-action (llamada directa)
async function executeWorkflowAction(event, callback) {
  const stats = {
    propertiesCreated: 0,
    propertiesSkipped: 0,
    createdProperties: [],
    skippedProperties: [],
    message: ''
  };
  
  try {
    // 1. Obtener parámetros de entrada
    const marca = event.inputFields.marca;
    const dealer = event.inputFields.dealer;
    const llave = event.inputFields.llave;
    const tipoProceso = event.inputFields.tipo_proceso;
    
    // Validar parámetros requeridos
    if (!marca) {
      throw new Error('El parámetro "marca" es requerido');
    }
    if (!dealer) {
      throw new Error('El parámetro "dealer" es requerido');
    }
    if (!llave) {
      throw new Error('El parámetro "llave" (accessToken) es requerido');
    }
    if (!tipoProceso) {
      throw new Error('El parámetro "tipo_proceso" es requerido');
    }
    
    console.log(`Iniciando proceso: ${tipoProceso} para marca: ${marca}, dealer: ${dealer}`);
    
    // 2. Inicializar cliente de HubSpot con el accessToken de la cuenta externa
    const externalHubspotClient = new hubspot.Client({ accessToken: llave });
    
    // 3. Ejecutar proceso según el tipo seleccionado
    switch (tipoProceso) {
      case 'todas_propiedades':
        await procesarTodasPropiedades(externalHubspotClient, marca, dealer, stats);
        stats.message = `Todas las propiedades procesadas. Creadas: ${stats.propertiesCreated}, Omitidas: ${stats.propertiesSkipped}`;
        break;
        
      case 'propiedades_modelos':
        await procesarPropiedadesModelos(externalHubspotClient, marca, dealer, stats);
        stats.message = `Propiedades de modelos procesadas. Creadas: ${stats.propertiesCreated}, Omitidas: ${stats.propertiesSkipped}`;
        break;
        
      case 'propiedades_concesionarios':
        await procesarPropiedadesConcesionarios(externalHubspotClient, marca, dealer, stats);
        stats.message = `Propiedades de concesionarios procesadas. Creadas: ${stats.propertiesCreated}, Omitidas: ${stats.propertiesSkipped}`;
        break;
        
      case 'pipeline_negocio':
        await procesarPipelineNegocio(externalHubspotClient, marca, dealer, stats);
        break;
        
      default:
        throw new Error(`Tipo de proceso no reconocido: ${tipoProceso}`);
    }
    
    // 4. Llamar al callback con éxito
    console.log(stats.message || 'Proceso completado exitosamente');
    
    const outputFields = {
      success: true,
      message: stats.message || 'Proceso completado exitosamente',
      propertiesCreated: stats.propertiesCreated,
      propertiesSkipped: stats.propertiesSkipped,
      createdPropertiesList: stats.createdProperties.join(', '),
      skippedPropertiesList: stats.skippedProperties.join(', '),
      tipoProceso: tipoProceso
    };
    
    // Agregar campos específicos de pipeline si el proceso fue de pipeline
    if (tipoProceso === 'pipeline_negocio') {
      outputFields.pipelineName = stats.pipelineName || '';
      outputFields.pipelineId = stats.pipelineId || '';
      outputFields.pipelineStagesCount = stats.pipelineDetails ? stats.pipelineDetails.length : 0;
    }
    
    callback({
      outputFields: outputFields
    });
    
  } catch (error) {
    console.error('Error en workflow action:', error);
    
    // Llamar al callback con error
    callback({
      outputFields: {
        success: false,
        message: `Error: ${error.message}`,
        propertiesCreated: stats.propertiesCreated,
        propertiesSkipped: stats.propertiesSkipped,
        error: error.message
      }
    });
  }
}

// Función principal para serverless function
// HubSpot llama a esta función con el formato (event, callback)
exports.main = async (event, callback) => {
  // Ejecutar la workflow action
  await executeWorkflowAction(event, callback);
};

