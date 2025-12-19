const hubspot = require('@hubspot/api-client');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', message: 'Test action endpoint is running' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }

  try {
    const event = req.body || {};
    const inputFields = event.inputFields || {};

    // Obtener parámetros
    const accessToken = inputFields.llave || inputFields.access_token;
    const marca = inputFields.marca || 'Test';
    const dealer = inputFields.dealer || 'Test Dealer';

    if (!accessToken) {
      return res.status(400).json({
        outputFields: {
          success: false,
          message: 'Token de acceso privado (llave) es requerido',
          contactPropertiesCount: 0,
          dealPropertiesCount: 0
        }
      });
    }

    console.log(`[test-action] Iniciando prueba de conexión para marca: ${marca}, dealer: ${dealer}`);

    // Inicializar cliente de HubSpot
    const hubspotClient = new hubspot.Client({ accessToken });

    // Probar conexión obteniendo propiedades
    let contactProperties = [];
    let dealProperties = [];
    
    try {
      const contactResponse = await hubspotClient.crm.properties.coreApi.getAll('contacts', false);
      contactProperties = contactResponse.results || [];
      console.log(`[test-action] ✅ Se encontraron ${contactProperties.length} propiedades de contactos`);
    } catch (error) {
      console.error(`[test-action] ❌ Error obteniendo propiedades de contactos:`, error.message);
      throw new Error(`Error al obtener propiedades de contactos: ${error.message}`);
    }

    try {
      const dealResponse = await hubspotClient.crm.properties.coreApi.getAll('deals', false);
      dealProperties = dealResponse.results || [];
      console.log(`[test-action] ✅ Se encontraron ${dealProperties.length} propiedades de deals`);
    } catch (error) {
      console.error(`[test-action] ❌ Error obteniendo propiedades de deals:`, error.message);
      throw new Error(`Error al obtener propiedades de deals: ${error.message}`);
    }

    const message = `Conexión exitosa con el portal del dealer. Se encontraron ${contactProperties.length} propiedades de contactos y ${dealProperties.length} de deals.`;

    console.log(`[test-action] ✅ ${message}`);

    return res.status(200).json({
      outputFields: {
        success: true,
        message: message,
        contactPropertiesCount: contactProperties.length,
        dealPropertiesCount: dealProperties.length
      }
    });

  } catch (error) {
    console.error('[test-action] ❌ Error:', error);
    
    return res.status(500).json({
      outputFields: {
        success: false,
        message: `Error: ${error.message}`,
        contactPropertiesCount: 0,
        dealPropertiesCount: 0
      }
    });
  }
};

