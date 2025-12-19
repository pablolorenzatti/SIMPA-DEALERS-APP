const hubspot = require('@hubspot/api-client');
const path = require('path');
const fs = require('fs');
const PropertyService = require('../src/services/PropertyService');

// Cargar configuraciones
const razonesSocialesConfig = require('../src/config/razones-sociales.json');
const propertiesConfig = require('../src/config/properties-config.json');
const modelsByBrandConfig = require('../src/config/models-by-brand.json');
const configUtils = require('../src/utils/config.js');

// Configuración del servicio
const config = {
    razonesSocialesConfig,
    propertiesConfig,
    modelsByBrandConfig,
    configUtils
};

const propertyService = new PropertyService(config);

async function runGlobalSync() {
    console.log('[Global Sync] === Iniciando proceso GLOBAL: Crear Todas las Propiedades para TODAS las Razones Sociales ===');

    const razonesSociales = Object.keys(razonesSocialesConfig);
    console.log(`[Global Sync] Se encontraron ${razonesSociales.length} razones sociales configuradas.`);

    let totalCreated = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalOptionsAdded = 0;
    const globalErrors = [];

    for (const rs of razonesSociales) {
        console.log(`[Global Sync] >>> Procesando Razón Social: ${rs} <<<`);
        try {
            const rsConfig = razonesSocialesConfig[rs];
            const brands = rsConfig.brands || [];

            if (brands.length === 0) {
                console.warn(`[Global Sync] ⚠️ La razón social ${rs} no tiene marcas configuradas. Saltando.`);
                globalErrors.push(`${rs}: Sin marcas configuradas`);
                continue;
            }

            console.log(`[Global Sync] Marcas encontradas para ${rs}: ${brands.join(', ')}`);

            // Resolver token
            let rsAccessToken = null;
            const tokenEnv = rsConfig.tokenEnv || `${rs.toUpperCase().replace(/\s+/g, '_')}_TOKEN`;
            rsAccessToken = process.env[tokenEnv];

            if (!rsAccessToken) {
                console.error(`[Global Sync] ❌ No se encontró token para la razón social: ${rs} (variable de entorno: ${tokenEnv})`);
                globalErrors.push(`${rs}: Token no encontrado (${tokenEnv})`);
                continue;
            }

            const rsHubspotClient = new hubspot.Client({ accessToken: rsAccessToken });

            // Iterar sobre cada marca de la razón social
            for (const brand of brands) {
                console.log(`[Global Sync]    > Procesando Marca: ${brand} (Razón Social: ${rs})`);
                try {
                    const rsContext = {
                        razonSocial: rs,
                        marca: brand,
                        dealer: null
                    };

                    const brandStats = {
                        propertiesCreated: 0,
                        propertiesUpdated: 0,
                        propertiesSkipped: 0,
                        optionsAdded: 0,
                        createdProperties: [],
                        updatedProperties: [],
                        skippedProperties: [],
                        optionDetails: []
                    };

                    await propertyService.procesarTodasPropiedades(rsHubspotClient, rsContext, brandStats);

                    totalCreated += brandStats.propertiesCreated;
                    totalUpdated += brandStats.propertiesUpdated;
                    totalSkipped += brandStats.propertiesSkipped;
                    totalOptionsAdded += brandStats.optionsAdded;

                    console.log(`[Global Sync]    < Finalizado ${brand} en ${rs}: Creadas=${brandStats.propertiesCreated}, Actualizadas=${brandStats.propertiesUpdated}`);
                } catch (brandError) {
                    console.error(`[Global Sync] ❌ Error procesando marca ${brand} en ${rs}:`, brandError.message);
                    globalErrors.push(`${rs} (${brand}): ${brandError.message}`);
                }
            }

        } catch (error) {
            console.error(`[Global Sync] ❌ Error procesando ${rs}:`, error.message);
            globalErrors.push(`${rs}: ${error.message}`);
        }
    }

    console.log('[Global Sync] === RESUMEN GLOBAL ===');
    console.log(`Total Creadas: ${totalCreated}`);
    console.log(`Total Actualizadas: ${totalUpdated}`);
    console.log(`Total Omitidas: ${totalSkipped}`);
    console.log(`Total Opciones Agregadas: ${totalOptionsAdded}`);

    if (globalErrors.length > 0) {
        console.warn(`[Global Sync] Se encontraron ${globalErrors.length} errores:`);
        globalErrors.forEach(err => console.warn(` - ${err}`));
    } else {
        console.log('[Global Sync] ✅ Proceso completado sin errores globales.');
    }
}

// Ejecutar script
runGlobalSync().catch(error => {
    console.error('[Global Sync] ❌ Error fatal en el script:', error);
    process.exit(1);
});
