const hubspot = require('@hubspot/api-client');

class PropertyService {
    constructor(config) {
        this.razonesSocialesConfig = config.razonesSocialesConfig;
        this.propertiesConfig = config.propertiesConfig;
        this.modelsByBrandConfig = config.modelsByBrandConfig;
        this.configUtils = config.configUtils;
    }

    sanitize(value) {
        return typeof value === 'string' ? value.trim() : value;
    }

    normalizeKey(value) {
        return typeof value === 'string' ? value.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    }

    normalizeMarcaToPropertyName(marca) {
        return marca.toLowerCase().trim().replace(/\s+/g, '_');
    }

    getObjectTypeKey(objectType) {
        return objectType === 'deal' ? 'deals' : 'contacts';
    }

    mapTypeToFieldType(type) {
        switch (type) {
            case 'enumeration':
                return 'select';
            case 'number':
                return 'number';
            case 'date':
                return 'date';
            case 'datetime':
                return 'datetime';
            case 'bool':
            case 'boolean':
                return 'booleancheckbox';
            default:
                return 'text';
        }
    }

    getModelsFromModelsByBrand(marcaNormalized) {
        if (!this.modelsByBrandConfig || typeof this.modelsByBrandConfig !== 'object') {
            console.warn(`[PropertyService] ⚠️ modelsByBrandConfig no está disponible`);
            return [];
        }

        const marcaUpper = marcaNormalized.toUpperCase();
        const brandEntry = this.modelsByBrandConfig[marcaUpper];

        if (!brandEntry || !Array.isArray(brandEntry.models)) {
            console.warn(`[PropertyService] ⚠️ No se encontraron modelos para marca "${marcaNormalized}" en models-by-brand.json`);
            return [];
        }

        console.log(`[PropertyService] ✅ Modelos obtenidos desde models-by-brand.json para "${marcaNormalized}": ${brandEntry.models.length} modelos`);
        return brandEntry.models;
    }

    replacePlaceholders(text, marca, isPropertyName = false) {
        if (!text) return text;
        if (isPropertyName && text.includes('{marca}')) {
            return text.replace(/{marca}/g, this.normalizeMarcaToPropertyName(marca));
        }
        return text.replace(/{marca}/g, marca);
    }

    getOptionsFromConfig(propertyName, marcaNormalized, razonSocial, dealer) {
        const options = [];

        if (propertyName === 'modelo_simpa' || propertyName.startsWith('modelo_')) {
            const models = this.getModelsFromModelsByBrand(marcaNormalized);
            models.forEach((model, index) => {
                options.push({
                    label: model,
                    value: model,
                    hidden: false,
                    displayOrder: index
                });
            });
            console.log(`[PropertyService] Opciones obtenidas desde models-by-brand.json para ${propertyName}: ${models.length} opciones`);
            return options;
        }

        if (propertyName === 'concesionarios_simpa') {
            if (razonSocial && this.razonesSocialesConfig && this.razonesSocialesConfig[razonSocial]) {
                const configDealers = this.razonesSocialesConfig[razonSocial].dealers;
                if (Array.isArray(configDealers)) {
                    configDealers.forEach((d, index) => {
                        options.push({
                            label: d,
                            value: d,
                            hidden: false,
                            displayOrder: index
                        });
                    });
                    console.log(`[PropertyService] Opciones de concesionarios obtenidas para ${razonSocial}: ${configDealers.length} opciones`);
                } else {
                    console.warn(`[PropertyService] ⚠️ No se encontraron dealers configurados para ${razonSocial}`);
                }
            } else if (dealer) {
                options.push({
                    label: dealer,
                    value: dealer,
                    hidden: false,
                    displayOrder: 0
                });
                console.log(`[PropertyService] Opción de dealer agregada (fallback) para ${propertyName}: ${dealer}`);
            }
            return options;
        }

        const propertyConfig = this.propertiesConfig.baseProperties.find(p => p.name === propertyName);

        if (propertyConfig && propertyConfig.optionsKey && this.propertiesConfig.optionsConfig && this.propertiesConfig.optionsConfig[propertyConfig.optionsKey]) {
            const configOptions = this.propertiesConfig.optionsConfig[propertyConfig.optionsKey];

            if (propertyName === 'marca_simpa') {
                const marcaOptions = configOptions[marcaNormalized];
                if (Array.isArray(marcaOptions)) {
                    marcaOptions.forEach((option, index) => {
                        options.push({
                            label: option,
                            value: option,
                            hidden: false,
                            displayOrder: index
                        });
                    });
                    console.log(`[PropertyService] Opciones obtenidas desde properties-config.json para ${propertyName}: ${marcaOptions.length} opciones`);
                } else {
                    console.warn(`[PropertyService] ⚠️ No se encontraron opciones para ${propertyName} con marca "${marcaNormalized}" en properties-config.json`);
                }
                return options;
            }

            const optionKeys = Object.keys(configOptions);
            if (optionKeys.length > 0) {
                optionKeys.forEach((key, index) => {
                    const value = key;
                    const label = Array.isArray(configOptions[key]) && configOptions[key].length > 0 ? configOptions[key][0] : key;

                    options.push({
                        label: label,
                        value: value,
                        hidden: false,
                        displayOrder: index
                    });
                });
                console.log(`[PropertyService] Opciones obtenidas desde properties-config.json para ${propertyName}: ${options.length} opciones`);
            } else {
                console.warn(`[PropertyService] ⚠️ No se encontraron opciones en optionsConfig para ${propertyName}`);
            }
            return options;
        }

        console.warn(`[PropertyService] ⚠️ No se encontró configuración para ${propertyName}`);
        return options;
    }

    async getExistingProperties(hubspotClient, objectType) {
        try {
            const objectTypeKey = this.getObjectTypeKey(objectType);
            const response = await hubspotClient.crm.properties.coreApi.getAll(objectTypeKey, false);
            const properties = response.results || [];
            const propertiesMap = {};
            properties.forEach(prop => {
                propertiesMap[prop.name] = prop;
            });
            return propertiesMap;
        } catch (error) {
            console.error(`[PropertyService] Error obteniendo propiedades de ${objectType}:`, error.message);
            return {};
        }
    }

    async createOrUpdateProperty(hubspotClient, propertyConfig, objectType, existingProperties, context, stats) {
        const { marca, razonSocial, dealer } = context;
        const marcaNormalized = this.normalizeMarcaToPropertyName(marca);
        const objectTypeKey = this.getObjectTypeKey(objectType);

        const propertyName = this.replacePlaceholders(propertyConfig.name, marca, true);
        const propertyLabel = this.replacePlaceholders(propertyConfig.label, marca, false);
        const propertyDescription = this.replacePlaceholders(propertyConfig.description, marca, false);

        const existingProperty = existingProperties[propertyName];
        const propertyExists = !!existingProperty;

        try {
            if (propertyExists) {
                console.log(`[PropertyService] 🔄 La propiedad ${propertyName} ya existe en ${objectType}, actualizando opciones...`);

                if (propertyConfig.type === 'enumeration' && propertyConfig.hasVariableOptions) {
                    const newOptions = this.getOptionsFromConfig(propertyName, marcaNormalized, razonSocial, dealer);

                    if (newOptions.length > 0) {
                        const existingOptions = Array.isArray(existingProperty.options)
                            ? existingProperty.options.map(opt => ({ ...opt }))
                            : [];

                        const existingValues = new Set(
                            existingOptions.map(opt => this.normalizeKey(opt.value || opt.label || '')).filter(Boolean)
                        );

                        let addedCount = 0;
                        const maxDisplayOrder = existingOptions.length > 0
                            ? Math.max(...existingOptions.map(opt => opt.displayOrder ?? -1))
                            : -1;

                        newOptions.forEach((newOption, index) => {
                            const normalizedValue = this.normalizeKey(newOption.value || newOption.label || '');
                            if (!existingValues.has(normalizedValue)) {
                                existingOptions.push({
                                    ...newOption,
                                    displayOrder: maxDisplayOrder + 1 + addedCount
                                });
                                existingValues.add(normalizedValue);
                                addedCount++;
                            }
                        });

                        if (addedCount > 0) {
                            const updateDefinition = {
                                options: existingOptions
                            };

                            try {
                                await hubspotClient.crm.properties.coreApi.update(
                                    objectTypeKey,
                                    propertyName,
                                    updateDefinition
                                );

                                console.log(`[PropertyService] ✅ Propiedad ${propertyName} actualizada en ${objectType} con ${addedCount} nuevas opciones`);
                                stats.propertiesUpdated++;
                                stats.updatedProperties.push(`${objectType}:${propertyName}`);
                                stats.optionsAdded += addedCount;

                                const addedOptions = [];
                                newOptions.forEach(opt => {
                                    const normalizedValue = this.normalizeKey(opt.value || opt.label || '');
                                    if (!existingValues.has(normalizedValue)) {
                                        addedOptions.push(opt);
                                    }
                                });
                                addedOptions.forEach(opt => {
                                    stats.optionDetails.push(`${objectType}:${propertyName} (agregada): ${opt.label}`);
                                });
                                return { created: false, updated: true, name: propertyName, optionsAdded: addedCount };
                            } catch (updateError) {
                                console.error(`[PropertyService] ❌ Error actualizando ${propertyName}:`, updateError.message);
                                throw updateError;
                            }
                        } else {
                            console.log(`[PropertyService] ℹ️ Todas las opciones ya existen en ${propertyName} para ${objectType}`);
                            stats.propertiesSkipped++;
                            stats.skippedProperties.push(`${objectType}:${propertyName}`);
                            return { created: false, updated: false, skipped: true, name: propertyName };
                        }
                    }
                }

                stats.propertiesSkipped++;
                stats.skippedProperties.push(`${objectType}:${propertyName}`);
                return { created: false, skipped: true, name: propertyName };
            }

            console.log(`[PropertyService] ➕ Creando nueva propiedad ${propertyName} en ${objectType}...`);

            let groupName = propertyConfig.groupName;
            if (!groupName) {
                groupName = objectType === 'deal' ? 'dealinformation' : 'contactinformation';
            } else if (objectType === 'deal' && groupName === 'contactinformation') {
                groupName = 'dealinformation';
            }

            const propertyDefinition = {
                name: propertyName,
                label: propertyLabel,
                description: propertyDescription || '',
                groupName: groupName,
                type: propertyConfig.type,
                fieldType: this.mapTypeToFieldType(propertyConfig.type)
            };

            if (propertyConfig.type === 'enumeration' && propertyConfig.hasVariableOptions) {
                const initialOptions = this.getOptionsFromConfig(propertyName, marcaNormalized, razonSocial, dealer);
                if (initialOptions.length > 0) {
                    propertyDefinition.options = initialOptions;
                    console.log(`[PropertyService] Agregando ${initialOptions.length} opciones iniciales a ${propertyName}`);
                }
            }

            try {
                const createdProperty = await hubspotClient.crm.properties.coreApi.create(
                    objectTypeKey,
                    propertyDefinition
                );

                console.log(`[PropertyService] ✅ Propiedad ${propertyName} creada exitosamente en ${objectType}`);
                stats.propertiesCreated++;
                stats.createdProperties.push(`${objectType}:${propertyName}`);

                if (propertyDefinition.options && propertyDefinition.options.length > 0) {
                    stats.optionsAdded += propertyDefinition.options.length;
                    propertyDefinition.options.forEach(opt => {
                        stats.optionDetails.push(`${objectType}:${propertyName} (inicial): ${opt.label}`);
                    });
                }

                return { created: true, skipped: false, name: propertyName, definition: createdProperty };
            } catch (createError) {
                console.error(`[PropertyService] ❌ Error creando ${propertyName}:`, createError.message);
                throw createError;
            }

        } catch (error) {
            console.error(`[PropertyService] ❌ Error procesando propiedad ${propertyName} en ${objectType}:`, error.message);
            throw new Error(`Error al procesar propiedad ${propertyName} en ${objectType}: ${error.message}`);
        }
    }

    async procesarTodasPropiedades(hubspotClient, context, stats) {
        console.log('[PropertyService] === Procesando TODAS LAS PROPIEDADES ===');

        const { marca } = context;

        if (!marca) {
            throw new Error('El parámetro "marca" es requerido para crear todas las propiedades');
        }

        if (!this.propertiesConfig || !this.propertiesConfig.baseProperties) {
            throw new Error('No se pudo cargar la configuración de propiedades desde properties-config.json');
        }

        const existingContactProperties = await this.getExistingProperties(hubspotClient, 'contact');
        const existingDealProperties = await this.getExistingProperties(hubspotClient, 'deal');

        console.log(`[PropertyService] Propiedades existentes - Contactos: ${Object.keys(existingContactProperties).length}, Deals: ${Object.keys(existingDealProperties).length}`);
        console.log(`[PropertyService] Propiedades base a procesar: ${this.propertiesConfig.baseProperties.length}`);

        const contactProperties = this.propertiesConfig.baseProperties.filter(prop => prop.name !== 'id_negocio_simpa');
        const dealProperties = this.propertiesConfig.baseProperties;

        console.log(`[PropertyService] Procesando ${contactProperties.length} propiedades para contactos...`);
        for (const propertyConfig of contactProperties) {
            await this.createOrUpdateProperty(hubspotClient, propertyConfig, 'contact', existingContactProperties, context, stats);
        }

        console.log(`[PropertyService] Procesando ${dealProperties.length} propiedades para deals...`);
        for (const propertyConfig of dealProperties) {
            await this.createOrUpdateProperty(hubspotClient, propertyConfig, 'deal', existingDealProperties, context, stats);
        }

        console.log(`[PropertyService] 📊 Stats FINALES después de procesar todas las propiedades:`, JSON.stringify({
            propertiesCreated: stats.propertiesCreated,
            propertiesSkipped: stats.propertiesSkipped,
            optionsAdded: stats.optionsAdded,
            createdProperties: stats.createdProperties,
            skippedProperties: stats.skippedProperties,
            optionDetails: stats.optionDetails
        }));
    }
}

module.exports = PropertyService;
