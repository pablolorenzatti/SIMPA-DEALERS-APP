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
      console.log(`[check-lead-status] ✅ razones-sociales.json cargado`);
      break;
    }
  } catch (error) {
    console.warn(`[check-lead-status] Error cargando razones-sociales.json desde ${razonesSocialesPath}: ${error.message}`);
  }
}

if (!razonesSocialesConfig) {
  try {
    razonesSocialesConfig = require('../../src/config/razones-sociales.json');
    console.log('[check-lead-status] ✅ razones-sociales.json cargado con require');
  } catch (error) {
    try {
      razonesSocialesConfig = require('../src/config/razones-sociales.json');
      console.log('[check-lead-status] ✅ razones-sociales.json cargado con require relativo');
    } catch (error2) {
      console.warn('[check-lead-status] ⚠️ Usando fallback hardcodeado para razones-sociales.json');
      razonesSocialesConfig = {
        "SPORTADVENTURE": { "tokenEnv": "SPORTADVENTURE_TOKEN" },
        "TEST ACCOUNT": { "tokenEnv": "TEST_ACCOUNT_KEY" }
      };
    }
  }
}

function sanitize(value) {
  return typeof value === 'string' ? value.trim() : value;
}

// Función para obtener actividades relacionadas a un deal
async function getDealActivities(hubspotClient, dealId) {
  const activities = {
    meetings: [],
    calls: [],
    notes: [],
    emails: [],
    tasks: [],
    total: 0
  };

  try {
    // Obtener todas las actividades asociadas al deal
    const associations = ['meeting', 'call', 'note', 'email', 'task'];
    
    for (const activityType of associations) {
      try {
        const response = await hubspotClient.crm.deals.associationsApi.getAll(
          dealId,
          activityType
        );
        
        if (response.results && response.results.length > 0) {
          const activityIds = response.results.map(r => r.id);
          
          // Obtener detalles de cada actividad según el tipo
          for (const activityId of activityIds) {
            try {
              let activityDetails = null;
              
              switch (activityType) {
                case 'meeting':
                  activityDetails = await hubspotClient.crm.objects.meetings.basicApi.getById(activityId);
                  if (activityDetails) {
                    activities.meetings.push({
                      id: activityId,
                      title: activityDetails.properties?.hs_meeting_title || 'Sin título',
                      startDate: activityDetails.properties?.hs_meeting_start_time || null,
                      endDate: activityDetails.properties?.hs_meeting_end_time || null,
                      body: activityDetails.properties?.hs_meeting_body || null,
                      location: activityDetails.properties?.hs_meeting_location || null,
                      createdAt: activityDetails.createdAt || null,
                      updatedAt: activityDetails.updatedAt || null
                    });
                  }
                  break;
                  
                case 'call':
                  activityDetails = await hubspotClient.crm.objects.calls.basicApi.getById(activityId);
                  if (activityDetails) {
                    activities.calls.push({
                      id: activityId,
                      title: activityDetails.properties?.hs_call_title || 'Sin título',
                      body: activityDetails.properties?.hs_call_body || null,
                      duration: activityDetails.properties?.hs_call_duration || null,
                      status: activityDetails.properties?.hs_call_status || null,
                      direction: activityDetails.properties?.hs_call_direction || null,
                      createdAt: activityDetails.createdAt || null,
                      updatedAt: activityDetails.updatedAt || null
                    });
                  }
                  break;
                  
                case 'note':
                  activityDetails = await hubspotClient.crm.objects.notes.basicApi.getById(activityId);
                  if (activityDetails) {
                    activities.notes.push({
                      id: activityId,
                      body: activityDetails.properties?.hs_note_body || 'Sin contenido',
                      createdAt: activityDetails.createdAt || null,
                      updatedAt: activityDetails.updatedAt || null
                    });
                  }
                  break;
                  
                case 'email':
                  activityDetails = await hubspotClient.crm.objects.emails.basicApi.getById(activityId);
                  if (activityDetails) {
                    activities.emails.push({
                      id: activityId,
                      subject: activityDetails.properties?.hs_email_subject || 'Sin asunto',
                      text: activityDetails.properties?.hs_email_text || null,
                      html: activityDetails.properties?.hs_email_html || null,
                      from: activityDetails.properties?.hs_email_from_email || null,
                      to: activityDetails.properties?.hs_email_to_email || null,
                      direction: activityDetails.properties?.hs_email_direction || null,
                      status: activityDetails.properties?.hs_email_status || null,
                      createdAt: activityDetails.createdAt || null,
                      updatedAt: activityDetails.updatedAt || null
                    });
                  }
                  break;
                  
                case 'task':
                  activityDetails = await hubspotClient.crm.objects.tasks.basicApi.getById(activityId);
                  if (activityDetails) {
                    activities.tasks.push({
                      id: activityId,
                      subject: activityDetails.properties?.hs_task_subject || 'Sin asunto',
                      body: activityDetails.properties?.hs_task_body || null,
                      status: activityDetails.properties?.hs_task_status || null,
                      priority: activityDetails.properties?.hs_task_priority || null,
                      dueDate: activityDetails.properties?.hs_task_due_date || null,
                      createdAt: activityDetails.createdAt || null,
                      updatedAt: activityDetails.updatedAt || null
                    });
                  }
                  break;
              }
            } catch (activityError) {
              console.warn(`[check-lead-status] Error obteniendo detalles de ${activityType} ${activityId}:`, activityError.message);
            }
          }
        }
      } catch (assocError) {
        console.warn(`[check-lead-status] Error obteniendo asociaciones de tipo ${activityType}:`, assocError.message);
      }
    }
    
    activities.total = activities.meetings.length + activities.calls.length + 
                       activities.notes.length + activities.emails.length + activities.tasks.length;
    
  } catch (error) {
    console.warn(`[check-lead-status] Error general obteniendo actividades:`, error.message);
  }
  
  return activities;
}

// Función para obtener información del contacto asociado
async function getContactInfo(hubspotClient, contactId) {
  try {
    const contact = await hubspotClient.crm.contacts.basicApi.getById(contactId, [
      'firstname', 'lastname', 'email', 'phone', 'city', 'marca_simpa', 
      'modelo_simpa', 'concesionarios_simpa'
    ]);
    
    return {
      id: contactId,
      firstName: contact.properties?.firstname || null,
      lastName: contact.properties?.lastname || null,
      email: contact.properties?.email || null,
      phone: contact.properties?.phone || null,
      city: contact.properties?.city || null,
      marca: contact.properties?.marca_simpa || null,
      modelo: contact.properties?.modelo_simpa || null,
      concesionario: contact.properties?.concesionarios_simpa || null,
      createdAt: contact.createdAt || null,
      updatedAt: contact.updatedAt || null
    };
  } catch (error) {
    console.warn(`[check-lead-status] Error obteniendo información del contacto ${contactId}:`, error.message);
    return null;
  }
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', message: 'Check lead status endpoint is running' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }

  try {
    const event = req.body || {};
    const inputFields = event.inputFields || {};

    // Obtener parámetros
    const razonSocial = sanitize(inputFields.razon_social);
    const dealerContactId = sanitize(inputFields.dealer_contact_id);
    const dealerDealId = sanitize(inputFields.dealer_deal_id);

    // Validar parámetros requeridos
    if (!razonSocial) {
      throw new Error('El campo "razon_social" es obligatorio');
    }

    if (!dealerDealId) {
      throw new Error('El campo "dealer_deal_id" es obligatorio');
    }

    console.log(`[check-lead-status] Consultando estado del lead:`);
    console.log(`[check-lead-status]   Razón social: ${razonSocial}`);
    console.log(`[check-lead-status]   Deal ID: ${dealerDealId}`);
    console.log(`[check-lead-status]   Contact ID: ${dealerContactId || 'No proporcionado'}`);

    // Resolver access token desde razones-sociales.json
    const razonConfig = razonesSocialesConfig[razonSocial];
    if (!razonConfig || !razonConfig.tokenEnv) {
      throw new Error(`No se encontró configuración de token para la razón social "${razonSocial}"`);
    }

    const tokenEnv = razonConfig.tokenEnv;
    const accessToken = process.env[tokenEnv];

    if (!accessToken) {
      throw new Error(`Token ${tokenEnv} no encontrado en variables de entorno de Vercel`);
    }

    console.log(`[check-lead-status] ✅ Token obtenido desde ${tokenEnv}`);

    // Crear cliente HubSpot para la cuenta del dealer
    const hubspotClient = new hubspot.Client({ accessToken });
    
    // Validar que el token funciona intentando obtener propiedades básicas
    console.log(`[check-lead-status] Validando conexión con la cuenta del dealer...`);
    try {
      // Intentar obtener una propiedad básica para validar el token
      await hubspotClient.crm.properties.coreApi.getAll('deals', { limit: 1 });
      console.log(`[check-lead-status] ✅ Conexión validada con la cuenta del dealer`);
    } catch (validationError) {
      console.error(`[check-lead-status] ❌ Error validando conexión:`, validationError.message);
      const isAuthError = validationError.code === 401 || 
                         (validationError.response && validationError.response.statusCode === 401) ||
                         (validationError.statusCode === 401);
      if (isAuthError) {
        throw new Error(`No se pudo autenticar con la cuenta del concesionario "${razonSocial}". Verifica que el token ${tokenEnv} sea válido y no haya expirado.`);
      }
      // Si no es error de autenticación, continuar (puede ser un problema de permisos menor)
      console.warn(`[check-lead-status] ⚠️ Advertencia al validar conexión, pero continuando...`);
    }

    // Obtener información del deal usando SIEMPRE el dealer_deal_id del input
    // Este es el ID del deal en la cuenta del dealer, NO el ID de SIMPA
    console.log(`[check-lead-status] Obteniendo información del deal ${dealerDealId}...`);
    console.log(`[check-lead-status] Endpoint utilizado: GET /crm/v3/objects/deals/${dealerDealId}`);
    console.log(`[check-lead-status] ⚠️ IMPORTANTE: Usando dealer_deal_id del input (ID del deal en cuenta del dealer)`);
    
    let deal;
    
    try {
      deal = await hubspotClient.crm.deals.basicApi.getById(dealerDealId, [
        'dealname', 'dealstage', 'amount', 'closedate', 'pipeline', 
        'dealtype', 'marca_simpa', 'modelo_simpa', 'id_negocio_simpa'
      ]);
      console.log(`[check-lead-status] ✅ Deal encontrado por dealer_deal_id: ${dealerDealId}`);
    } catch (dealError) {
      // Manejar específicamente el error 404
      const is404 = dealError.code === 404 || 
                   (dealError.response && dealError.response.statusCode === 404) ||
                   (dealError.statusCode === 404) ||
                   (dealError.message && dealError.message.includes('404'));
      
      if (is404) {
        const errorMsg = `El deal con ID ${dealerDealId} no existe en la cuenta del concesionario "${razonSocial}". ` +
          `Asegúrate de usar el ID del deal que fue retornado por la acción "Forward Lead To Dealer" (dealerDealId), ` +
          `no el ID del deal de la cuenta origen (SIMPA). ` +
          `El dealer_deal_id debe ser el ID del negocio generado en la cuenta del dealer. ` +
          `Endpoint utilizado: GET /crm/v3/objects/deals/${dealerDealId}`;
        console.error(`[check-lead-status] ${errorMsg}`);
        console.error(`[check-lead-status] Detalles del error:`, {
          code: dealError.code,
          statusCode: dealError.response?.statusCode || dealError.statusCode,
          message: dealError.message,
          url: dealError.response?.url || 'N/A',
          dealerDealId: dealerDealId
        });
        throw new Error(errorMsg);
      } else {
        // Re-lanzar otros errores con más información
        console.error(`[check-lead-status] ❌ Error obteniendo deal:`, {
          code: dealError.code,
          statusCode: dealError.response?.statusCode || dealError.statusCode,
          message: dealError.message,
          url: dealError.response?.url || 'N/A',
          body: dealError.body || 'N/A',
          dealerDealId: dealerDealId
        });
        throw dealError;
      }
    }

    // Usar SIEMPRE el dealerDealId del input para todas las operaciones
    // Este es el ID correcto del deal en la cuenta del dealer
    const dealIdToUse = dealerDealId; // Usar el ID del input, no el ID del objeto deal
    
    const dealInfo = {
      id: dealIdToUse, // Usar el dealer_deal_id del input
      name: deal.properties?.dealname || 'Sin nombre',
      stage: deal.properties?.dealstage || null,
      amount: deal.properties?.amount || null,
      closeDate: deal.properties?.closedate || null,
      pipeline: deal.properties?.pipeline || null,
      dealType: deal.properties?.dealtype || null,
      marca: deal.properties?.marca_simpa || null,
      modelo: deal.properties?.modelo_simpa || null,
      idNegocioSimpa: deal.properties?.id_negocio_simpa || null,
      createdAt: deal.createdAt || null,
      updatedAt: deal.updatedAt || null
    };
    
    console.log(`[check-lead-status] ✅ Deal info obtenida. ID usado: ${dealInfo.id}, Stage: ${dealInfo.stage}`);

    // Obtener información de la etapa del deal usando el stage del deal encontrado
    // El deal ya fue obtenido usando el dealer_deal_id correcto, así que usamos su stage
    let stageInfo = null;
    if (dealInfo.stage) {
      try {
        const pipelineId = dealInfo.pipeline;
        if (pipelineId) {
          console.log(`[check-lead-status] Obteniendo información de la etapa del deal ${dealIdToUse}. Stage ID: ${dealInfo.stage}, Pipeline ID: ${pipelineId}`);
          const pipeline = await hubspotClient.crm.pipelines.pipelinesApi.getById('deals', pipelineId);
          const stage = pipeline.stages?.find(s => s.id === dealInfo.stage);
          if (stage) {
            stageInfo = {
              id: stage.id,
              label: stage.label,
              probability: stage.metadata?.probability || null,
              displayOrder: stage.displayOrder || null
            };
            console.log(`[check-lead-status] ✅ Información de etapa obtenida: ${stage.label}`);
          } else {
            console.warn(`[check-lead-status] ⚠️ No se encontró la etapa ${dealInfo.stage} en el pipeline ${pipelineId}`);
          }
        }
      } catch (stageError) {
        console.warn(`[check-lead-status] Error obteniendo información de la etapa:`, stageError.message);
      }
    }

    // Obtener información del contacto si se proporcionó el ID
    let contactInfo = null;
    if (dealerContactId) {
      console.log(`[check-lead-status] Obteniendo información del contacto ${dealerContactId}...`);
      console.log(`[check-lead-status] Endpoint utilizado: GET /crm/v3/objects/contacts/${dealerContactId}`);
      try {
        contactInfo = await getContactInfo(hubspotClient, dealerContactId);
        if (contactInfo) {
          console.log(`[check-lead-status] ✅ Contacto encontrado: ${contactInfo.firstName} ${contactInfo.lastName}`);
        }
      } catch (contactError) {
        const is404 = contactError.code === 404 || 
                     (contactError.response && contactError.response.statusCode === 404) ||
                     (contactError.statusCode === 404);
        if (is404) {
          console.warn(`[check-lead-status] ⚠️ Contacto con ID ${dealerContactId} no encontrado. Continuando sin información del contacto.`);
          console.warn(`[check-lead-status] Endpoint utilizado: GET /crm/v3/objects/contacts/${dealerContactId}`);
        } else {
          console.error(`[check-lead-status] ❌ Error obteniendo contacto:`, contactError.message);
          throw contactError;
        }
      }
    }

    // Obtener actividades relacionadas usando el dealer_deal_id del input
    console.log(`[check-lead-status] Obteniendo actividades relacionadas al deal ${dealIdToUse}...`);
    console.log(`[check-lead-status] ⚠️ IMPORTANTE: Usando dealer_deal_id (${dealIdToUse}) para obtener actividades`);
    const activities = await getDealActivities(hubspotClient, dealIdToUse); // Usar el dealer_deal_id del input

    // Preparar respuesta
    const outputFields = {
      success: true,
      message: `Estado del lead consultado exitosamente. Deal: ${dealInfo.name}, Etapa: ${stageInfo?.label || dealInfo.stage || 'N/A'}`,
      razonSocial: razonSocial,
      dealInfo: JSON.stringify(dealInfo),
      dealName: dealInfo.name,
      dealStage: dealInfo.stage,
      dealStageLabel: stageInfo?.label || null,
      dealStageProbability: stageInfo?.probability || null,
      dealAmount: dealInfo.amount || null,
      dealCloseDate: dealInfo.closeDate || null,
      dealPipeline: dealInfo.pipeline || null,
      dealMarca: dealInfo.marca || null,
      dealModelo: dealInfo.modelo || null,
      contactInfo: contactInfo ? JSON.stringify(contactInfo) : null,
      contactFirstName: contactInfo?.firstName || null,
      contactLastName: contactInfo?.lastName || null,
      contactEmail: contactInfo?.email || null,
      contactPhone: contactInfo?.phone || null,
      activitiesTotal: activities.total,
      activitiesMeetings: activities.meetings.length,
      activitiesCalls: activities.calls.length,
      activitiesNotes: activities.notes.length,
      activitiesEmails: activities.emails.length,
      activitiesTasks: activities.tasks.length,
      activitiesDetails: JSON.stringify(activities)
    };

    console.log(`[check-lead-status] ✅ Consulta completada exitosamente`);
    console.log(`[check-lead-status]   Deal: ${dealInfo.name}`);
    console.log(`[check-lead-status]   Etapa: ${stageInfo?.label || dealInfo.stage || 'N/A'}`);
    console.log(`[check-lead-status]   Actividades totales: ${activities.total}`);

    return res.status(200).json({ outputFields });

  } catch (error) {
    console.error('[check-lead-status] Error:', error.message);
    console.error('[check-lead-status] Error completo:', {
      name: error.name,
      code: error.code,
      statusCode: error.response?.statusCode || error.statusCode,
      message: error.message,
      url: error.response?.url || error.url || 'N/A',
      method: error.response?.config?.method || error.method || 'N/A',
      headers: error.response?.headers ? Object.keys(error.response.headers) : 'N/A'
    });
    
    // Extraer información más detallada del error si es de HubSpot API
    let errorMessage = error.message || 'Error desconocido';
    let errorDetails = null;
    let errorEndpoint = 'N/A';
    
    // Extraer información del endpoint usado
    if (error.response?.url) {
      errorEndpoint = error.response.url;
    } else if (error.url) {
      errorEndpoint = error.url;
    } else if (error.config?.url) {
      errorEndpoint = error.config.url;
    }
    
    const is404 = error.code === 404 || 
                 (error.response && error.response.statusCode === 404) ||
                 (error.statusCode === 404) ||
                 (error.message && error.message.includes('404'));
    
    if (is404) {
      const event = req.body || {};
      const inputFields = event.inputFields || {};
      errorMessage = `El recurso no fue encontrado en la cuenta del concesionario "${razonSocial || inputFields.razon_social || 'N/A'}". ` +
        `Verifica que el ID del deal (${inputFields.dealer_deal_id || dealerDealId || 'N/A'}) sea el correcto ` +
        `y que corresponda a un deal en la cuenta del dealer. ` +
        `Asegúrate de usar el ID retornado por la acción "Forward Lead To Dealer" (dealerDealId), ` +
        `no el ID del deal de la cuenta origen (SIMPA). ` +
        `Endpoint utilizado: ${errorEndpoint}`;
    } else if (error.body) {
      try {
        const errorBody = typeof error.body === 'string' ? JSON.parse(error.body) : error.body;
        if (errorBody.message) {
          errorDetails = errorBody.message;
        }
      } catch (parseError) {
        console.warn(`[check-lead-status] ⚠️ Error parseando body del error: ${parseError.message}`);
      }
    }
    
    // Agregar información del endpoint al mensaje final
    const finalMessage = errorDetails && errorDetails !== errorMessage
      ? `${errorMessage}. Detalles: ${errorDetails}. Endpoint: ${errorEndpoint}`
      : `${errorMessage}. Endpoint: ${errorEndpoint}`;
    
    console.error('[check-lead-status] Stack:', error.stack);
    
    return res.status(500).json({
      outputFields: {
        success: false,
        message: finalMessage,
        error: errorMessage,
        errorDetails: errorDetails || null,
        errorEndpoint: errorEndpoint,
        errorCode: error.code || error.statusCode || 'N/A'
      }
    });
  }
};

