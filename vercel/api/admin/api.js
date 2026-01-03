const AnalyticsService = require('../_services/analytics-service');
const ConfigService = require('../_services/config-service');
const PropertyMonitorService = require('../_services/property-monitor-service');
const LeadProcessor = require('../_services/lead-processor');

const AuthHelper = require('../_utils/auth-helper');

module.exports = async (req, res) => {
    // Check Auth via Cookie
    const userSession = AuthHelper.verifyRequest(req); // Reuses the same token logic
    if (!userSession) {
        return res.status(401).json({ error: 'Unauthorized: Please login via /api/admin' });
    }


    try {
        const { action } = req.query; // e.g. /api/admin/api?action=stats

        // --- DASHBOARD STATS ---
        if (action === 'stats') {
            if (req.method === 'POST') {
                const { action: postAction } = req.body;
                if (postAction === 'clear') return res.json(await AnalyticsService.clearHistory());
                if (postAction === 'restore') return res.json(await AnalyticsService.restoreHistory());
            }
            // GET
            const { period, includeHistory } = req.query;
            return res.json(await AnalyticsService.getDashboardStats(period, includeHistory === 'true'));
        }

        // --- CONFIG (Razones/Modelos) ---
        if (action === 'config') {
            if (req.method === 'POST') {
                const { type, data, razonesSociales, modelsByBrand } = req.body;

                // Support both old format (type + data) and new format (direct objects)
                if (razonesSociales !== undefined || modelsByBrand !== undefined) {
                    // New format: save both at once
                    if (razonesSociales !== undefined) {
                        await ConfigService.saveRazonesSociales(razonesSociales);
                    }
                    if (modelsByBrand !== undefined) {
                        await ConfigService.saveModelsByBrand(modelsByBrand);
                    }
                    return res.json({ success: true });
                }

                // Old format: type-based
                if (type === 'razones') {
                    await ConfigService.saveRazonesSociales(data);
                    return res.json({ success: true });
                }
                if (type === 'modelos') {
                    await ConfigService.saveModelsByBrand(data);
                    return res.json({ success: true });
                }
                return res.status(400).json({ error: 'Invalid config type' });
            }
            // GET
            const razonesSociales = await ConfigService.getRazonesSociales();
            const modelsByBrand = await ConfigService.getModelsByBrand();
            return res.json({ razonesSociales, modelsByBrand });
        }

        // --- RESET CONFIG FROM FILE ---
        if (action === 'reset-config') {
            if (req.method === 'POST') {
                const razonesLocal = await ConfigService.getRazonesSocialesLocal();
                const modelsLocal = await ConfigService.getModelsByBrandLocal();

                await ConfigService.saveRazonesSociales(razonesLocal);
                await ConfigService.saveModelsByBrand(modelsLocal);

                return res.json({ success: true, message: 'Configuration reset to local file defaults' });
            }
            return res.status(405).json({ error: 'Method not allowed' });
        }

        // --- PROPERTY HEALTH CHECK ---
        if (action === 'check-properties') {
            if (req.method === 'POST') {
                const { razonSocial } = req.body;
                if (!razonSocial) return res.status(400).json({ success: false, error: 'razonSocial is required' });
                const result = await PropertyMonitorService.getPropertiesStatus(razonSocial);
                return res.json(result);
            }
            return res.status(405).json({ error: 'Method not allowed' });
        }

        if (action === 'create-property') {
            if (req.method === 'POST') {
                const { razonSocial, propertyName, objectType } = req.body;
                if (!razonSocial || !propertyName || !objectType) return res.status(400).json({ success: false, error: 'Missing parameters' });
                const result = await PropertyMonitorService.createMissingProperty(razonSocial, propertyName, objectType);
                return res.json(result);
            }
            return res.status(405).json({ error: 'Method not allowed' });
        }

        // --- SIMULATOR ---
        if (action === 'simulate') {
            if (req.method === 'POST') {
                const leadData = req.body;
                // Extract common fields for simulation convenience
                const { dealerName, brand, firstname, lastname, email, phone, ...otherProps } = leadData;

                // 1. Load Config
                const razonesSociales = await ConfigService.getRazonesSociales();

                // 2. Infer Razon Social
                const razonInfo = LeadProcessor.inferRazonSocial(razonesSociales, dealerName, brand);

                let result = {
                    success: true,
                    timestamp: new Date().toISOString(),
                    input: leadData,
                    inference: razonInfo,
                    validation: {
                        hasDealer: !!dealerName,
                        hasBrand: !!brand,
                        hasConfig: !!razonesSociales
                    },
                    properties: {},
                    env: {},
                    logs: []
                };

                if (razonInfo.razonSocial) {
                    const razonConfig = razonesSociales[razonInfo.razonSocial];

                    // 3. Token Environment
                    const tokenInfo = LeadProcessor.determineTokenEnv(razonConfig, razonInfo.razonSocial);
                    result.env = tokenInfo;

                    // 4. Pipeline & Stage
                    const pipelineInfo = LeadProcessor.determinePipeline(
                        razonConfig, brand,
                        leadData.pipeline, leadData.dealstage, dealerName
                    );
                    result.inference.pipelineInfo = pipelineInfo;

                    // 5. Custom Properties (Global & Brand specific)
                    const customProps = LeadProcessor.determineCustomProperties(razonConfig, brand, dealerName);

                    // 6. Build Final Predicted Properties Object
                    // This simulates what forward-lead sends to HubSpot Deal API
                    result.properties = {
                        dealname: `${firstname || 'Sim'} ${lastname || 'Lead'} - ${brand || 'Generic'} - ${dealerName || 'Direct'}`,
                        dealstage: pipelineInfo.stage,
                        pipeline: pipelineInfo.pipeline,
                        amount: leadData.amount || '0',
                        closedate: new Date().toISOString(),
                        ...customProps
                    };

                    // Add standard mappings if they were part of the input
                    if (email) result.properties.email = email;
                    if (phone) result.properties.phone = phone;
                    if (dealerName) result.properties.dealer_name = dealerName; // Assuming mapped
                    if (brand) result.properties.brand_name = brand; // Assuming mapped
                } else {
                    result.logs.push({ level: 'warn', message: 'Could not infer Razón Social. No properties calculated.' });
                }

                return res.json(result);
            }
            return res.status(405).json({ error: 'Method not allowed' });
        }

        // --- MONITOR ---
        if (action === 'monitor') {
            if (req.method === 'POST') {
                const { subAction, property } = req.body;
                if (subAction === 'add' && property) {
                    const success = await PropertyMonitorService.addProperty(property);
                    return res.json({ success });
                }
                if (subAction === 'remove' && property) {
                    const success = await PropertyMonitorService.removeProperty(property);
                    return res.json({ success });
                }
                if (subAction === 'check') {
                    const result = await PropertyMonitorService.checkProperties();
                    return res.json({ success: true, result });
                }
                if (subAction === 'sync' && property) {
                    const result = await PropertyMonitorService.syncOptionsToHubSpot(property);
                    return res.json({ success: true, result });
                }
                /*
                if (subAction === 'copy-options' && property) {
                    const { sourceObj, targetObj, values } = req.body;
                    const result = await PropertyMonitorService.copyOptionsBetweenObjects(property, sourceObj, targetObj, values);
                    return res.json(result);
                }
                if (subAction === 'delete-options' && property) {
                    const { objectType, values } = req.body;
                    const result = await PropertyMonitorService.deleteOptionsFromProperty(property, objectType, values);
                    return res.json(result);
                }
                */
            }
            // GET
            const config = await PropertyMonitorService.getMonitoredProperties();
            const logs = await PropertyMonitorService.getLogs();
            const snapshot = await PropertyMonitorService.getSnapshot();
            return res.json({ monitoredProperties: config, logs, snapshot });
        }

        return res.status(400).json({ error: 'Unknown action' });

    } catch (error) {
        console.error('Admin API Error:', error);
        res.status(500).json({ error: error.message });
    }
};