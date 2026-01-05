const hubspot = require('@hubspot/api-client');
const ConfigService = require('../services/config-service');
const propertiesConfig = require('../../src/config/properties-config.json');

// Helper to authenticate
async function getHubSpotClient(razonKey) {
    const razones = await ConfigService.getRazonesSociales();
    const config = razones[razonKey];

    if (!config) throw new Error(`Razón Social no encontrada: ${razonKey}`);
    if (!config.tokenEnv) throw new Error(`La Razón Social ${razonKey} no tiene configurada la variable del token (tokenEnv).`);

    const accessToken = process.env[config.tokenEnv];
    if (!accessToken) throw new Error(`El token no está definido en las variables de entorno: ${config.tokenEnv}`);

    return {
        client: new hubspot.Client({ accessToken }),
        config
    };
}

// Helper to normalize names
function normalizeKey(value) {
    return typeof value === 'string' ? value.toLowerCase().trim() : '';
}

function normalizeMarcaToPropertyName(marca) {
    return marca.toLowerCase().trim().replace(/\s+/g, '_');
}

// Helper: Add Option to Property
async function addOptionToProperty(hubspotClient, objectType, propertyName, label, value) {
    const objectTypeKey = objectType === 'deal' ? 'deals' : 'contacts';

    try {
        let property = await hubspotClient.crm.properties.coreApi.getByName(objectTypeKey, propertyName);

        // Check if option exists
        const existingOptions = property.options || [];
        const valueNormalized = normalizeKey(value);
        if (existingOptions.some(opt => normalizeKey(opt.value) === valueNormalized)) {
            return { added: false, message: 'Option already exists' };
        }

        // Add Option
        const newOption = {
            label,
            value,
            hidden: false,
            displayOrder: existingOptions.length
        };

        property.options.push(newOption);

        await hubspotClient.crm.properties.coreApi.update(objectTypeKey, propertyName, {
            options: property.options
        });

        return { added: true, message: 'Option added' };

    } catch (e) {
        if (e.code === 404) {
            throw new Error(`Property ${propertyName} does not exist. Please sync properties first.`);
        }
        throw e;
    }
}

// Helper: Ensure Property Exists (Create if not)
async function ensureProperty(hubspotClient, objectType, definition) {
    const objectTypeKey = objectType === 'deal' ? 'deals' : 'contacts';
    const propertyName = definition.name;

    try {
        await hubspotClient.crm.properties.coreApi.getByName(objectTypeKey, propertyName);
        return { status: 'exists', name: propertyName };
    } catch (e) {
        if (e.code === 404) {
            // Create
            const creationPayload = {
                name: propertyName,
                label: definition.label,
                description: definition.description,
                groupName: definition.groupName,
                type: definition.type,
                fieldType: definition.type === 'enumeration' ? 'select' : 'text',
                options: definition.options || []
            };

            await hubspotClient.crm.properties.coreApi.create(objectTypeKey, creationPayload);
            return { status: 'created', name: propertyName };
        }
        throw e;
    }
}


module.exports = async (req, res) => {
    // Basic Auth
    const auth = req.headers.authorization;
    const user = process.env.ADMIN_USER || 'admin';
    const pass = process.env.ADMIN_PASS || 'simpa2025';
    const expectedAuth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

    if (!auth || auth !== expectedAuth) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { action, razonKey, data } = req.body;

    if (!action || !razonKey) {
        return res.status(400).json({ error: 'Action and RazonKey are required' });
    }

    try {
        const { client: hubspotClient, config: razonConfig } = await getHubSpotClient(razonKey);
        const results = [];

        // ACTION: SYNC PROPERTIES
        if (action === 'sync_properties') {
            const baseProperties = propertiesConfig.baseProperties;

            // Generate full list of properties to check
            const propertiesToProcess = [];

            baseProperties.forEach(propDef => {
                if (propDef.name === 'modelo_{marca}') {
                    // Dynamic brands
                    const brands = razonConfig.brands || [];
                    brands.forEach(brand => {
                        const brandNormalized = normalizeMarcaToPropertyName(brand);
                        propertiesToProcess.push({
                            ...propDef,
                            name: `modelo_${brandNormalized}`,
                            label: propDef.label.replace('{marca}', brand),
                            description: propDef.description.replace('{marca}', brand)
                        });
                    });
                } else if (propDef.name.includes('{marca}')) {
                    // Catch-all for other dynamic props if any
                    // Skip for now if unhandled
                } else {
                    // Standard property
                    // Inject default options if available in config
                    if (propDef.optionsKey && propertiesConfig.optionsConfig[propDef.optionsKey]) {
                        const defaultOptMap = propertiesConfig.optionsConfig[propDef.optionsKey];
                        // defaultOptMap is object key -> array of values. We just need simple options
                        const options = [];
                        Object.keys(defaultOptMap).forEach(key => {
                            options.push({ label: key, value: key, displayOrder: options.length });
                        });
                        propDef.options = options;
                    }
                    propertiesToProcess.push(propDef);
                }
            });

            // Process creation
            for (const prop of propertiesToProcess) {
                // Ensure for Contact
                try {
                    const rContact = await ensureProperty(hubspotClient, 'contact', prop);
                    results.push({ object: 'contact', name: rContact.name, status: rContact.status });
                } catch (err) {
                    results.push({ object: 'contact', name: prop.name, status: 'error', error: err.message });
                }

                // Ensure for Deal
                try {
                    const rDeal = await ensureProperty(hubspotClient, 'deal', prop);
                    results.push({ object: 'deal', name: rDeal.name, status: rDeal.status });
                } catch (err) {
                    results.push({ object: 'deal', name: prop.name, status: 'error', error: err.message });
                }
            }
        }

        // ACTION: ADD MODEL
        else if (action === 'add_model') {
            const { modelName, brandName } = data;
            if (!modelName) throw new Error('Model name required');

            // 1. Add to modelo_simpa
            const r1c = await addOptionToProperty(hubspotClient, 'contact', 'modelo_simpa', modelName, modelName);
            const r1d = await addOptionToProperty(hubspotClient, 'deal', 'modelo_simpa', modelName, modelName);
            results.push({ property: 'modelo_simpa', contact: r1c, deal: r1d });

            // 2. Add to modelo_{brand}
            if (brandName) {
                const brandProp = `modelo_${normalizeMarcaToPropertyName(brandName)}`;
                try {
                    const r2c = await addOptionToProperty(hubspotClient, 'contact', brandProp, modelName, modelName);
                    const r2d = await addOptionToProperty(hubspotClient, 'deal', brandProp, modelName, modelName);
                    results.push({ property: brandProp, contact: r2c, deal: r2d });
                } catch (e) {
                    results.push({ property: brandProp, error: e.message });
                }
            }
        }

        // ACTION: ADD DEALER
        else if (action === 'add_dealer') {
            const { dealerName } = data;
            if (!dealerName) throw new Error('Dealer name required');

            const r1c = await addOptionToProperty(hubspotClient, 'contact', 'concesionarios_simpa', dealerName, dealerName);
            const r1d = await addOptionToProperty(hubspotClient, 'deal', 'concesionarios_simpa', dealerName, dealerName);

            results.push({ property: 'concesionarios_simpa', contact: r1c, deal: r1d });
        }
        else {
            return res.status(400).json({ error: 'Unknown action' });
        }

        return res.status(200).json({ success: true, results });

    } catch (error) {
        console.error('HubSpot Sync Error:', error);
        return res.status(500).json({ error: error.message });
    }
};
