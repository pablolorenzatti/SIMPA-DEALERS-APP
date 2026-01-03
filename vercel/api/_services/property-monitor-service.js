const hubspot = require('@hubspot/api-client');
const { createClient } = require('@vercel/kv');
const path = require('path');
const fs = require('fs');
const ConfigService = require('./config-service');

// Initialize KV Client
function getKvClient() {
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token && url.startsWith('http')) return createClient({ url, token });
    return null;
}

const kv = getKvClient();
const SNAPSHOT_KEY = 'monitor:properties:snapshot';
const CONFIG_KEY = 'monitor:properties:config';
const LOGS_KEY = 'monitor:properties:logs';



const PropertyMonitorService = {

    /**
     * Get list of properties to monitor.
     */
    async getMonitoredProperties() {
        if (!kv) return ['modelo_simpa', 'marca_simpa', 'concesionarios_simpa']; // Fallback default
        const config = await kv.get(CONFIG_KEY);
        return config && Array.isArray(config) ? config : ['modelo_simpa', 'marca_simpa', 'concesionarios_simpa'];
    },

    /**
     * Add a property to the monitor list.
     */
    async addProperty(name) {
        if (!kv) return false;
        const current = await this.getMonitoredProperties();
        if (!current.includes(name)) {
            current.push(name);
            await kv.set(CONFIG_KEY, current);
            return true;
        }
        return false;
    },

    /**
     * Remove a property from the monitor list.
     */
    async removeProperty(name) {
        if (!kv) return false;
        const current = await this.getMonitoredProperties();
        const updated = current.filter(p => p !== name);
        if (updated.length !== current.length) {
            await kv.set(CONFIG_KEY, updated);
            return true;
        }
        return false;
    },

    /**
     * Get logs of detected changes.
     */
    async getLogs(limit = 20) {
        if (!kv) return [];
        return await kv.lrange(LOGS_KEY, 0, limit - 1);
    },

    async getSnapshot() {
        if (!kv) return {};
        // Clean snapshot keys for UI helper
        const raw = await kv.get(SNAPSHOT_KEY) || {};
        // Just return raw structure { "prop:obj": [options], ... }
        return raw;
    },

    /**
     * Checks for changes.
     */
    async checkProperties(propertiesOverride = null) {
        if (!kv) return { error: 'KV not configured', changes: [], errors: [], checked: 0 };
        // Use override or fetch config
        let propertiesToMonitor = propertiesOverride || await this.getMonitoredProperties();



        // PRIORITY 1: SIMPA Private App Token (Direct)
        // This is the specific token for the SIMPA Main Account.
        let token = process.env.SIMPA_HUBSPOT_API_TOKEN;

        // PRIORITY 2: Static Access Token (Env - Backward Compatibility)
        if (!token) {
            token = process.env.HUBSPOT_ACCESS_TOKEN || process.env.SIMPA_API_TOKEN;
            if (token) console.log('[PropertyMonitor] Using static ENV Access Token');
        }

        // PRIORITY 3: Fallback to Razones Sociales config (Legacy/Dealer)
        // Only if no main token is defined.
        if (!token) {
            console.log('[PropertyMonitor] Main SIMPA tokens missing. Searching in Razones Sociales config (Dealer fallback)...');
            try {
                const razones = await ConfigService.getRazonesSociales();
                for (const key in razones) {
                    const envVarName = razones[key].tokenEnv;
                    if (envVarName && process.env[envVarName]) {
                        token = process.env[envVarName];
                        console.log(`[PropertyMonitor] Found valid token from ${key} (${envVarName})`);
                        break;
                    }
                }
            } catch (e) {
                console.error('[PropertyMonitor] Error searching fallback token:', e);
            }
        }

        if (!token) return { error: 'No access token found in ENV or Razones Sociales', changes: [], errors: [], checked: 0 };

        const hubspotClient = new hubspot.Client({ accessToken: token });

        const results = { checked: 0, changes: [], errors: [], portalId: 'Unknown' };

        // Try to get Portal ID to confirm identity
        try {
            console.log(`[PropertyMonitor] Using token ending in ...${token.slice(-5)}`);

            // Attempt 1: Account Info V3 (Needs account-info.read)
            try {
                const accountInfo = await hubspotClient.apiRequest({ method: 'GET', path: '/account-info/v3/details' });
                const info = await accountInfo.json();
                results.portalId = info.portalId;
                console.log(`[PropertyMonitor] Connected to Portal: ${info.portalId}`);
            } catch (e) {
                // Attempt 2: Integrations V1 Me (Often available)
                try {
                    const meReq = await hubspotClient.apiRequest({ method: 'GET', path: '/integrations/v1/me' });
                    const me = await meReq.json();
                    results.portalId = me.portalId;
                    console.log(`[PropertyMonitor] Connected to Portal (Fallback): ${me.portalId}`);
                } catch (e2) {
                    console.warn('[PropertyMonitor] Could not fetch Portal ID', e2.message);
                }
            }
        } catch (e) {
            results.errors.push({ error: 'Token Validation Error: ' + e.message });
        }

        let snapshot = await kv.get(SNAPSHOT_KEY) || {};
        let snapshotUpdated = false;

        for (const propName of propertiesToMonitor) {
            // Check both Deals and Contacts
            const objectTypes = ['deals', 'contacts'];

            for (const objType of objectTypes) {
                const snapshotKey = `${propName}:${objType}`;

                try {
                    const propDef = await hubspotClient.crm.properties.coreApi.getByName(objType, propName);

                    const currentOptions = propDef.options.map(o => ({
                        label: o.label,
                        value: o.value,
                        hidden: o.hidden
                    }));

                    // Normalize snapshot options
                    // Backward compatibility: check if old key exists (without :objType) and migrate if needed
                    let storedOptionsRaw = snapshot[snapshotKey];
                    if (!storedOptionsRaw && objType === 'deals' && snapshot[propName]) {
                        storedOptionsRaw = snapshot[propName]; // Migration from old structure
                    }
                    storedOptionsRaw = storedOptionsRaw || [];

                    const storedOptions = storedOptionsRaw.map(o => ({ value: o.value }));

                    // Check for ADDED options
                    const newOptions = currentOptions.filter(o => !storedOptions.find(so => so.value === o.value));

                    // Logic for detecting changes
                    if (newOptions.length > 0) {
                        const isInit = storedOptionsRaw.length === 0;

                        if (isInit) {
                            // Initialization phase
                            snapshot[snapshotKey] = currentOptions;
                            snapshotUpdated = true;

                            results.changes.push({
                                type: 'MONITOR_INITIALIZED',
                                property: propName,
                                objectType: objType,
                                count: currentOptions.length,
                                message: `Monitoring started for ${propName} on ${objType}. Identified ${currentOptions.length} existing options.`
                            });
                            console.log(`[PropertyMonitor] Initialized ${snapshotKey} with ${currentOptions.length} options.`);
                        } else {
                            // Real change detected
                            const event = {
                                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                                type: 'OPTIONS_ADDED',
                                property: propName,
                                objectType: objType,
                                changes: newOptions.map(o => o.label || o.value),
                                count: newOptions.length,
                                timestamp: new Date().toISOString()
                            };

                            results.changes.push(event);

                            // Log to KV History
                            await kv.lpush(LOGS_KEY, event);
                            await kv.ltrim(LOGS_KEY, 0, 99);

                            // Update snapshot
                            snapshot[snapshotKey] = currentOptions;
                            snapshotUpdated = true;
                            console.log(`[PropertyMonitor] Change detected for ${snapshotKey}. Added: ${newOptions.map(o => o.value).join(', ')}`);
                        }
                    }
                    else if (storedOptionsRaw.length === 0 && currentOptions.length === 0) {
                        // Edge case: Empty property initialized
                        snapshot[snapshotKey] = [];
                        snapshotUpdated = true;
                    }

                    results.checked++;
                } catch (error) {
                    if (error.code === 404 || (error.response && error.response.status === 404)) {
                        let msg = `Property '${propName}' not found on ${objType}.`;
                        if (!propName.includes('_simpa')) msg += ` Did you mean '${propName}_simpa'?`;
                        results.errors.push({ property: propName, objectType: objType, error: msg });
                    } else {
                        console.error(`[PropertyMonitor] Error processing ${propName} on ${objType}: ${error.message}`);
                        results.errors.push({ property: propName, objectType: objType, error: error.message });
                    }
                }
            }
        }

        if (snapshotUpdated) {
            console.log('[PropertyMonitor] Saving updated snapshot to KV...');
            try {
                await kv.set(SNAPSHOT_KEY, snapshot);
                console.log('[PropertyMonitor] Snapshot saved successfully.');
            } catch (e) {
                console.error('[PropertyMonitor] Error saving snapshot to KV:', e);
                results.errors.push({ error: 'Failed to persist snapshot to KV: ' + e.message });
            }
        } else {
            console.log('[PropertyMonitor] No snapshot updates required.');
        }

        results.snapshot = snapshot;
        return results;
    },



    /**
     * Sync local options config TO HubSpot property.
     */
    async syncOptionsToHubSpot(propertyName) {
        // Broad safety net
        try {
            // 1. Get Token
            // 1. Get Token
            let token = process.env.SIMPA_HUBSPOT_API_TOKEN || process.env.HUBSPOT_ACCESS_TOKEN || process.env.SIMPA_API_TOKEN;

            if (!token) {
                try {
                    const razones = await ConfigService.getRazonesSociales();
                    for (const key in razones) {
                        const envVarName = razones[key].tokenEnv;
                        if (envVarName && process.env[envVarName]) {
                            token = process.env[envVarName];
                            break;
                        }
                    }
                } catch (e) { }
            }
            if (!token) return { success: false, error: 'No access token available' };

            // 2. Use Loaded Config
            let configData = {};
            let propertiesConfig = {}; // Declare propertiesConfig outside try block
            try {
                // Require the JS module directly (bundled by default)
                propertiesConfig = require('../_config/properties-config');
            } catch (e) {
                console.error('[Sync] Failed to load config:', e);
                return { success: false, error: 'Config Load Error: ' + e.message };
            }

            const optionsConfig = propertiesConfig.optionsConfig || {}; // Use propertiesConfig here
            // Find config for this property
            // The config keys might be "marca_simpa" etc.
            const targetConfig = optionsConfig[propertyName];
            if (!targetConfig) {
                return { success: false, error: `No options configuration found for '${propertyName}' in properties-config.json` };
            }

            // targetConfig structure: { "INTERNAL_VALUE": ["Label 1", "Label 2"] } or similar?
            // Based on "CFMOTO ROSARIO": ["CFMOTO ROSARIO"] -> Key is Value, Array[0] is Label.
            const optionsToSync = [];
            for (const [val, labels] of Object.entries(targetConfig)) {
                optionsToSync.push({
                    label: labels[0] || val,
                    value: val,
                    hidden: false
                });
            }

            const hubspotClient = new hubspot.Client({ accessToken: token });
            const results = { added: [], errors: [], totalSynced: 0 };

            // 3. Sync for Deals and Contacts
            for (const objType of ['deals', 'contacts']) {
                try {
                    // Get current
                    const propDef = await hubspotClient.crm.properties.coreApi.getByName(objType, propertyName);
                    const existingValues = new Set(propDef.options.map(o => o.value));

                    const missingOptions = optionsToSync.filter(o => !existingValues.has(o.value));

                    if (missingOptions.length > 0) {
                        console.log(`[Sync] Found ${missingOptions.length} missing options for ${propertyName} on ${objType}`);
                        // Push options
                        // Use standard create option endpoint if possible, but hubspot client usually has property update.
                        // coreApi.create does property creation.
                        // There isn't a simple "add options" method in basic wrapper sometimes, need to update property.

                        const inputs = {
                            options: [...propDef.options, ...missingOptions]
                        };

                        // We must send ALL options (existing + new) to update endpoint mostly, 
                        // OR use the specific endpoint: POST /crm/v3/properties/{objectType}/{propertyName}/options
                        // The client library might expose this. 
                        // Let's try raw fetch or client specific method.
                        // client.crm.properties.optionsApi ? No.
                        // We will update the property definition with the merged list.

                        await hubspotClient.crm.properties.coreApi.update(objType, propertyName, inputs);
                        results.added.push(...missingOptions.map(o => `${o.value} (${objType})`));
                    }

                } catch (e) {
                    results.errors.push(`Error on ${objType}: ${e.message}`);
                }
            }

            results.totalSynced = results.added.length;
            results.success = results.errors.length === 0;
            return results;
        } catch (globalError) {
            console.error('[Sync] Critical Error:', globalError);
            return { success: false, error: 'Internal Error: ' + globalError.message };
        }
    },

    /**
     * Devuelve el estado de las propiedades configuradas para una Razón Social específica.
     */
    async getPropertiesStatus(razonSocial) {
        try {
            // 1. Obtener Token
            const razones = await ConfigService.getRazonesSociales();
            const rsConfig = razones[razonSocial];
            if (!rsConfig) return { success: false, error: 'Razón Social no encontrada' };

            const tokenEnv = rsConfig.tokenEnv;
            const token = process.env[tokenEnv];

            if (!token) return { success: false, error: 'Token no encontrado en variables de entorno' };

            // 2. Cargar Configuración de Propiedades
            let propertiesConfig = {};
            try {
                propertiesConfig = require('../_config/properties-config');
            } catch (e) {
                return { success: false, error: 'Error cargando config de propiedades' };
            }

            const hubspotClient = new hubspot.Client({ accessToken: token });

            // 3. Obtener Propiedades Existentes de HubSpot
            const [contactsProps, dealsProps] = await Promise.all([
                hubspotClient.crm.properties.coreApi.getAll('contacts').catch(e => ({ results: [] })),
                hubspotClient.crm.properties.coreApi.getAll('deals').catch(e => ({ results: [] }))
            ]);

            const existingContacts = new Set((contactsProps.results || []).map(p => p.name));
            const existingDeals = new Set((dealsProps.results || []).map(p => p.name));

            // 4. Comparar
            const report = [];

            for (const prop of propertiesConfig.baseProperties) {
                // Determinar target objects
                let targets = prop.targetObjects || ['contact', 'deal'];
                if (prop.name === 'id_negocio_simpa') targets = ['deal'];

                // Fallback group logic
                if (!prop.targetObjects && prop.groupName === 'dealinformation') targets = ['deal'];

                for (const objType of targets) {
                    const isMissing = objType === 'contact' ? !existingContacts.has(prop.name) : !existingDeals.has(prop.name);

                    report.push({
                        name: prop.name,
                        label: prop.label,
                        type: prop.type,
                        fieldType: prop.fieldType || 'text',
                        objectType: objType,
                        status: isMissing ? 'MISSING' : 'OK',
                        group: prop.groupName
                    });
                }
            }

            return { success: true, report };

        } catch (error) {
            console.error('[PropertyMonitor] Error en getPropertiesStatus:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Crea una propiedad faltante para una Razón Social.
     */
    async createMissingProperty(razonSocial, propertyName, objectType) {
        try {
            const razones = await ConfigService.getRazonesSociales();
            const rsConfig = razones[razonSocial];
            if (!rsConfig) return { success: false, error: 'Razón Social no encontrada' };
            const token = process.env[rsConfig.tokenEnv];
            if (!token) return { success: false, error: 'Token no disponible/configurado' };

            let propertiesConfig = {};
            try {
                propertiesConfig = require('../_config/properties-config');
            } catch (e) { return { success: false, error: 'Error cargando config' }; }

            const propDef = propertiesConfig.baseProperties.find(p => p.name === propertyName);
            if (!propDef) return { success: false, error: 'Definición de propiedad no encontrada' };

            const hubspotClient = new hubspot.Client({ accessToken: token });

            const fieldTypeMap = {
                'string': 'text',
                'number': 'number',
                'date': 'date',
                'datetime': 'text',
                'enumeration': 'select',
                'bool': 'booleancheckbox',
                'richtext': 'html'
            };

            let fieldType = propDef.fieldType;
            if (fieldType === 'richtext') fieldType = 'html'; // HubSpot API requires 'html' for rich text

            if (!fieldType) {
                fieldType = fieldTypeMap[propDef.type] || 'text';
            }

            let groupName = propDef.groupName;
            // Si es deal y el grupo es contactinformation, mover a dealinformation (fallback)
            // HubSpot requiere grupos existentes. 'dealinformation' y 'contactinformation' son standard.
            if (objectType === 'deal' && groupName === 'contactinformation') {
                groupName = 'dealinformation';
            }

            const payload = {
                name: propDef.name,
                label: propDef.label,
                description: propDef.description,
                groupName: groupName,
                type: propDef.type,
                fieldType: fieldType
            };

            // Solo agregamos opciones si es 'enumeration'. Si hasVariableOptions, inicializar vacio o ver si queremos defaults.
            // Para simplicidad, creamos sin opciones, el sync global se encargará.
            // O podemos intentar agregar defaults si existen en optionsConfig, pero es complejo aqui.
            // HubSpot requiere al menos 1 opción si es 'select' y no se define external options.
            // PERO si hasVariableOptions es true, probablemente queramos opciones vacías o las del config.

            // Para 'select', aseguremos options array
            if (payload.fieldType === 'select' || payload.fieldType === 'radio' || payload.fieldType === 'checkbox') {
                payload.options = [];
            }

            await hubspotClient.crm.properties.coreApi.create(objectType, payload);
            console.log(`[PropertyMonitor] Propiedad ${propertyName} creada en ${objectType} para ${razonSocial}`);

            return { success: true };

        } catch (error) {
            console.error('[PropertyMonitor] Error creando propiedad:', error);
            return { success: false, error: error.message };
        }
    }
};

module.exports = PropertyMonitorService;
