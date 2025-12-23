const ConfigService = require('../services/config-service');
const LeadProcessor = require('../services/lead-processor');

// Simulate Endpoint
module.exports = async (req, res) => {
    // Basic Auth Check (reuse existing robust auth if possible, or simple check here)
    // For simplicity in this demo, strict checks similar to admin/index.js
    const user = process.env.ADMIN_USER || 'admin';
    const pass = process.env.ADMIN_PASS || 'simpa2025';
    const auth = req.headers.authorization;
    const expectedAuth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

    if (!auth || auth !== expectedAuth) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { dealerName, brandName, pipelineInput, stageInput } = req.body;

    if (!dealerName) {
        return res.status(400).json({ error: 'Dealer Name is required' });
    }

    try {
        // 1. Load Config (Force fresh load logic from service)
        const razonesConfig = await ConfigService.getRazonesSociales();

        // 2. Run Inference Logic
        const inference = LeadProcessor.inferRazonSocial(razonesConfig, dealerName, brandName);

        const result = {
            inputs: { dealerName, brandName },
            inference: inference,
            configFound: false,
            details: {}
        };

        if (inference.razonSocial) {
            result.configFound = true;
            const rsConfig = razonesConfig[inference.razonSocial];

            // 3. Token Check
            result.details.token = LeadProcessor.determineTokenEnv(rsConfig, inference.razonSocial);

            // 4. Pipeline Check
            result.details.pipeline = LeadProcessor.determinePipeline(rsConfig, brandName, pipelineInput, stageInput);

            // 5. Custom Properties
            result.details.customProperties = LeadProcessor.determineCustomProperties(rsConfig, brandName);

            // 6. Config Snapshot (what the system sees)
            result.details.rawConfigSnapshot = {
                brands: rsConfig.brands,
                dealers: rsConfig.dealers?.filter(d => d.toLowerCase().includes(dealerName.toLowerCase())), // Show relevant dealers only
                pipelineMapping: rsConfig.pipelineMapping
            };

            // 7. Validation Logic
            // Simulate minimal lead data for validation
            const simulatedLeadData = {
                dealerName: dealerName,
                // Email/firstname are simulated as present if not provided for now, 
                // OR we can ask user to input them in simulator for full check.
                // For now we assume strict check on dealer/pipeline.
                email: 'test@simulation.com',
                firstname: 'Test',
                phone: '123456'
            };

            const validation = LeadProcessor.validateLeadData(simulatedLeadData);
            result.validation = validation;

            // Add specific check for pipeline configuration
            if (result.details.pipeline.pipeline === 'default' && result.details.pipeline.source === 'input_default') {
                // Check if mapping exists but was missed
                if (rsConfig.pipelineMapping && Object.keys(rsConfig.pipelineMapping).length > 0) {
                    result.validation.warnings.push('Se usó pipeline "default" pero existen mapeos configurados. ¿Es correcto?');
                }
            }
        }

        res.status(200).json(result);

    } catch (error) {
        console.error('Simulation Error:', error);
        res.status(500).json({ error: error.message });
    }
};
