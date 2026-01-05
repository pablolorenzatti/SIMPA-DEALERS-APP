const ConfigService = require('./config-service');

/**
 * Servicio centralizado para la lógica de negocio de Leads.
 * Comparte lógica entre el endpoint de producción (forward-lead) y el simulador (admin/simulate).
 */
const LeadProcessor = {

    /**
     * Normaliza una cadena para comparaciones (lowercase, sin caracteres especiales)
     */
    normalizeKey(value) {
        if (typeof value !== 'string') return '';
        return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents (á -> a)
            .toLowerCase()
            .replace(/[^a-z0-9]/g, ''); // Remove special chars
    },

    /**
     * Limpia un valor de entrada básicos
     */
    sanitize(value) {
        return typeof value === 'string' ? value.trim() : value;
    },

    /**
     * Infiere la Razón Social basada en el Dealer y la Marca
     * @param {Object} razonesSocialesConfig - Configuración completa de Razones Sociales
     * @param {string} dealerName - Nombre del concesionario
     * @param {string} brandName - Nombre de la marca (opcional)
     */
    inferRazonSocial(razonesSocialesConfig, dealerName, brandName) {
        if (!razonesSocialesConfig) return { razonSocial: null, reason: 'No config loaded' };
        if (!dealerName) return { razonSocial: null, reason: 'Dealer name missing' };

        const dealerNormalized = this.normalizeKey(dealerName);
        const brandNormalized = this.normalizeKey(brandName);

        // Estrategia 1: Búsqueda exacta por Dealer AND Brand (si Brand existe)
        if (brandName) {
            const matched = Object.keys(razonesSocialesConfig).find(key => {
                const config = razonesSocialesConfig[key];
                const hasDealer = config.dealers && config.dealers.some(d => this.normalizeKey(d) === dealerNormalized);
                const hasBrand = config.brands && config.brands.some(b => this.normalizeKey(b) === brandNormalized);
                return hasDealer && hasBrand;
            });

            if (matched) return { razonSocial: matched, method: 'exact_match', confidence: 'high' };
        }

        // Estrategia 2: Búsqueda flexible solo por Dealer (útil si Brand no coincide o no provider)
        // Buscamos todas las RS que tengan ese dealer
        const matchedDealers = Object.keys(razonesSocialesConfig).filter(key => {
            const config = razonesSocialesConfig[key];
            return config.dealers && config.dealers.some(d => this.normalizeKey(d) === dealerNormalized);
        });

        if (matchedDealers.length === 1) {
            // Caso ideal: El dealer es exclusivo de una sola RS
            return { razonSocial: matchedDealers[0], method: 'dealer_exclusive', confidence: 'high' };
        } else if (matchedDealers.length > 1) {
            // Ambigüedad: El dealer existe en múltiples RS
            // Si tenemos marca, intentamos desempatar aunque no haya match exacto "listado"
            // (ej: si la marca es una sub-marca no listada explícitamente pero es lógica)
            // Por ahora devolvemos el primero, pero con warning
            return {
                razonSocial: matchedDealers[0],
                method: 'dealer_ambiguous_first_match',
                confidence: 'low',
                alternatives: matchedDealers
            };
        }

        return { razonSocial: null, reason: 'No match found' };
    },

    /**
     * Determina el Token de variable de entorno a usar
     */
    determineTokenEnv(razonSocialConfig, razonSocialName) {
        if (razonSocialConfig && razonSocialConfig.tokenEnv) {
            return { tokenEnv: razonSocialConfig.tokenEnv, source: 'config' };
        }
        // Fallback construct
        const fallback = `${razonSocialName.toUpperCase().replace(/\s+/g, '_')}_TOKEN`;
        return { tokenEnv: fallback, source: 'fallback_convention' };
    },

    /**
     * Determina el Pipeline y Stage correctos
     */
    determinePipeline(razonSocialConfig, brandName, inputPipeline, inputStage, dealerName) {
        const result = {
            pipeline: this.sanitize(inputPipeline) || 'default',
            stage: this.sanitize(inputStage) || 'appointmentscheduled', // Default Hubspot stage
            source: 'input_default',
            debug: [] // Array to store decision log
        };

        if (!razonSocialConfig || !razonSocialConfig.pipelineMapping) {
            result.debug.push('No pipelineMapping found in config');
            return result;
        }

        const mapping = razonSocialConfig.pipelineMapping;
        // 0. Inferir Marca si no se proporciona (Brand Inference)
        let effectiveBrandName = brandName;
        if (!effectiveBrandName && razonSocialConfig.brands) {
            // Caso A: Solo hay una marca configurada -> Asumir esa
            if (razonSocialConfig.brands.length === 1) {
                effectiveBrandName = razonSocialConfig.brands[0];
                result.debug.push(`Brand inferred (single option): ${effectiveBrandName}`);
            }
            // Caso B: Intentar buscar la marca en el nombre del Dealer
            else if (dealerName) {
                const dealerNorm = this.normalizeKey(dealerName);
                const foundBrand = razonSocialConfig.brands.find(b => dealerNorm.includes(this.normalizeKey(b)));
                if (foundBrand) {
                    effectiveBrandName = foundBrand;
                    result.debug.push(`Brand inferred from dealer name: ${effectiveBrandName}`);
                }
            }
        }

        const brandNormalized = this.normalizeKey(effectiveBrandName);
        let brandMapping = null;

        // 1. Buscar mapping específico para la marca
        if (effectiveBrandName) {
            // Intentar match exacto
            if (mapping[effectiveBrandName]) {
                brandMapping = mapping[effectiveBrandName];
                result.sourceMatch = 'brand_exact';
                result.debug.push(`Exact match for brand: ${effectiveBrandName}`);
            } else {
                // Intentar match normalizado
                const mappingKeys = Object.keys(mapping);
                const matchingKey = mappingKeys.find(key => this.normalizeKey(key) === brandNormalized);
                if (matchingKey) {
                    brandMapping = mapping[matchingKey];
                    result.sourceMatch = 'brand_normalized';
                    result.debug.push(`Normalized match: ${matchingKey} for input ${effectiveBrandName}`);
                }
            }
        } else {
            result.debug.push('No brandName provided (and could not be inferred) for mapping lookup');
        }

        // 2. Aplicar mapping si se encontró
        if (brandMapping) {
            if (brandMapping.pipeline) {
                result.pipeline = brandMapping.pipeline;
                result.source = 'mapping_brand';
            }
            if (brandMapping.stage) {
                result.stage = brandMapping.stage;
            }
            result.debug.push(`Applied brand mapping: pipeline=${brandMapping.pipeline}, stage=${brandMapping.stage}`);
        } else if (mapping.default) {
            // 3. Fallback a mapping 'default'
            if (mapping.default.pipeline) {
                result.pipeline = mapping.default.pipeline;
                result.source = 'mapping_default';
            }
            if (mapping.default.stage) {
                result.stage = mapping.default.stage;
            }
            result.debug.push(`Applied default mapping: pipeline=${mapping.default.pipeline}, stage=${mapping.default.stage}`);
        } else {
            result.debug.push('No matching brand mapping and no default mapping found');
        }

        return result;
    },

    /**
    * Valida los datos del lead simulando las restricciones de HubSpot y lógica de negocio
    */
    validateLeadData(leadData) {
        const errors = [];
        const warnings = [];

        // Hubspot Basic Requirement: Email OR Firstname (usually)
        if (!leadData.email && !leadData.firstname) {
            errors.push('HubSpot requiere al menos un Email o un Nombre para crear un contacto.');
        }

        // Business Logic Warnings
        if (!leadData.phone) {
            warnings.push('Falta el teléfono del contacto.');
        }

        if (!leadData.dealerName) {
            errors.push('Falta el nombre del Dealer (Concesionario).');
        }

        return { isValid: errors.length === 0, errors, warnings };
    },

    /**
     * Calcula las propiedades personalizadas a aplicar (Custom Properties)
     */
    /**
     * Calcula las propiedades personalizadas a aplicar (Custom Properties)
     */
    determineCustomProperties(razonSocialConfig, brandName, dealerName) {
        const result = {};

        if (!razonSocialConfig || !razonSocialConfig.customProperties) {
            return result;
        }

        const customConfig = razonSocialConfig.customProperties;

        // Helper para procesar valores (seleccionar random si hay comas)
        const processValue = (val) => {
            if (typeof val === 'string' && val.includes(',')) {
                const options = val.split(',').map(s => s.trim()).filter(s => s.length > 0);
                if (options.length > 0) {
                    // Selección aleatoria simple
                    return options[Math.floor(Math.random() * options.length)];
                }
            }
            return val;
        };

        // 1. Propiedades base (nivel superior)
        for (const [key, value] of Object.entries(customConfig)) {
            if (key === 'default') continue;
            // Ignorar objetos (marcas)
            if (typeof value !== 'object' || value === null) {
                result[key] = processValue(value);
            }
        }

        // 2. Propiedades default (bloque 'default')
        if (customConfig.default && typeof customConfig.default === 'object') {
            for (const [key, value] of Object.entries(customConfig.default)) {
                result[key] = processValue(value);
            }
        }

        // 2.5 Overrides Globales por Dealer
        if (customConfig._overrides && dealerName) {
            const dealerNormalized = this.normalizeKey(dealerName);
            const overrideKey = Object.keys(customConfig._overrides).find(k => this.normalizeKey(k) === dealerNormalized);

            if (overrideKey) {
                const globalDealerProps = customConfig._overrides[overrideKey];
                for (const [key, value] of Object.entries(globalDealerProps)) {
                    result[key] = processValue(value);
                }
            }
        }

        // 3. Propiedades específicas de marca
        let brandProps = null;
        if (brandName) {
            const brandNormalized = this.normalizeKey(brandName);
            const brandKey = Object.keys(customConfig).find(k => this.normalizeKey(k) === brandNormalized);

            if (brandKey && typeof customConfig[brandKey] === 'object') {
                brandProps = customConfig[brandKey];
                // Aplicar props de marca (excluyendo _overrides y otros objetos anidados)
                for (const [key, value] of Object.entries(brandProps)) {
                    if (key === '_overrides') continue;
                    if (typeof value !== 'object') {
                        result[key] = processValue(value);
                    }
                }
            }
        }

        // 4. Overrides por Dealer
        if (brandProps && brandProps._overrides && dealerName) {
            const dealerNormalized = this.normalizeKey(dealerName);
            const overrideKey = Object.keys(brandProps._overrides).find(k => this.normalizeKey(k) === dealerNormalized);

            if (overrideKey) {
                const dealerProps = brandProps._overrides[overrideKey];
                for (const [key, value] of Object.entries(dealerProps)) {
                    result[key] = processValue(value);
                }
            }
        }

        return result;
    }
};

module.exports = LeadProcessor;
