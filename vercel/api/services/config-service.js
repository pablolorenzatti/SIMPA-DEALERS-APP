const { createClient } = require('@vercel/kv'); // Usar createClient para flexibilidad
const fs = require('fs');
const path = require('path');

// Cache simple en memoria para reducir latencia (opcional, cuidado en serverless)
// let inMemoryCache = { ... }; // Comentado por ahora

// Rutas a archivos locales de respaldo
const RAZONES_SOCIALES_PATH = path.join(process.cwd(), 'src/config/razones-sociales.json');
const MODELS_BY_BRAND_PATH = path.join(process.cwd(), 'src/config/models-by-brand.json');
const RAZONES_SOCIALES_PATH_ALT = path.join(__dirname, '../../src/config/razones-sociales.json');
const MODELS_BY_BRAND_PATH_ALT = path.join(__dirname, '../../src/config/models-by-brand.json');
// Nuevos paths de respaldo para Vercel structure
const RAZONES_SOCIALES_PATH_API = path.join(__dirname, '../config/razones-sociales.json');
const MODELS_BY_BRAND_PATH_API = path.join(__dirname, '../config/models-by-brand.json');
const SIMPA_PIPELINES_PATH = path.join(process.cwd(), 'src/config/simpa-pipelines.json');
const SIMPA_PIPELINES_PATH_ALT = path.join(__dirname, '../../src/config/simpa-pipelines.json');
const SIMPA_PIPELINES_PATH_API = path.join(__dirname, '../config/simpa-pipelines.json');

// Helper para detectar credenciales y filtrar URLs incorrectas (TCP vs REST)
function getKvCredentials() {
    const possibleUrls = [
        process.env.KV_REST_API_URL,
        process.env.UPSTASH_REDIS_REST_URL,
        process.env.UPSTASH_REDIS_REST_KV_REST_API_URL
    ];

    const possibleTokens = [
        process.env.KV_REST_API_TOKEN,
        process.env.UPSTASH_REDIS_REST_TOKEN,
        process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN
    ];

    // Buscar una URL válida (https://...)
    const url = possibleUrls.find(u => u && (u.startsWith('https://') || u.startsWith('http://')));

    // Si no encontramos token específico, usamos el primero que exista
    const token = possibleTokens.find(t => t && t.length > 0);

    if (url) {
        console.log(`[ConfigService] Configurando KV con URL: ${url.substring(0, 20)}...`);
    } else {
        console.warn('[ConfigService] ⚠️ No se encontró una URL REST válida (https://) en las variables de entorno.');
        // Debug de lo que se encontró (censurado)
        possibleUrls.forEach((u, i) => {
            if (u) console.warn(`[ConfigService] Var ${i}: ${u.split(':')[0]}://... (Scheme check)`);
        });
    }

    return { url, token };
}

// Cliente KV dinámico
let kvClient = null;
const { url: kvUrl, token: kvToken } = getKvCredentials();

if (kvUrl && kvToken) {
    try {
        kvClient = createClient({
            url: kvUrl,
            token: kvToken
        });
        console.log('[ConfigService] ✅ Cliente KV inicializado correctamente');
    } catch (e) {
        console.error('[ConfigService] ❌ Error inicializando cliente KV:', e);
    }
} else {
    console.warn('[ConfigService] ⚠️ No se encontraron credenciales KV/Redis en variables de entorno');
}

// Helper para leer archivo local loggeando debug si falla
function readLocalJson(filePath, altPath) {
    try {
        if (fs.existsSync(filePath)) {
            console.log(`[ConfigService] ✅ Encontrado en ${filePath}`);
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
        console.log(`[ConfigService] ⚠️ No encontrado en ${filePath}. Probando alt: ${altPath}`);

        if (fs.existsSync(altPath)) {
            console.log(`[ConfigService] ✅ Encontrado en ${altPath}`);
            return JSON.parse(fs.readFileSync(altPath, 'utf8'));
        }

        // DEBUG SI TODO FALLA
        console.warn('[ConfigService] ❌ No se encontró el archivo de configuración. Debug Info:');
        console.warn('__dirname:', __dirname);
        console.warn('CWD:', process.cwd());
        try {
            console.warn('LS __dirname:', fs.readdirSync(__dirname));
            console.warn('LS ../..:', fs.readdirSync(path.join(__dirname, '../../')));
            console.warn('LS ../../src/config:', fs.readdirSync(path.join(__dirname, '../../src/config')));
        } catch (e) { console.warn('LS Error:', e.message); }

    } catch (error) {
        console.warn(`[ConfigService] ⚠️ Error leyendo archivo local ${filePath}:`, error.message);
    }
    return null;
}

const ConfigService = {

    /**
     * Obtiene la configuración de Razones Sociales
     */
    async getRazonesSociales() {
        // Cargar local siempre como base
        const localConfig = readLocalJson(RAZONES_SOCIALES_PATH, RAZONES_SOCIALES_PATH_ALT) || readLocalJson(RAZONES_SOCIALES_PATH_API, RAZONES_SOCIALES_PATH_API) || {};

        try {
            if (kvClient) {
                const cached = await kvClient.get('config:razones-sociales');
                if (cached) {
                    console.log('[ConfigService] ✅ Configuración cargada desde Redis KV (Smart Merge)');

                    // Merge inteligente: Usamos Redis como verdad, pero rellenamos huecos con Local
                    // Esto arregla el problema donde Redis tiene el objeto pero le falta una propiedad nueva (ej: pipelineMapping)
                    const merged = { ...localConfig };

                    for (const [key, val] of Object.entries(cached)) {
                        if (merged[key]) {
                            // Si existe en ambos, mezclar propiedades (Redis gana en conflictos, Local aporta faltantes)
                            // Usamos spread para que val (Redis) sobrescriba merged[key] (Local), 
                            // pero PERO necesitamos que properties faltantes en Redis se mantengan de Local.
                            // Así que: { ...local, ...redis }
                            merged[key] = { ...merged[key], ...val };
                        } else {
                            // Si solo está en Redis (ej: creado dinámicamente), usar Redis
                            merged[key] = val;
                        }
                    }
                    return merged;
                }
            }
        } catch (error) {
            console.error('[ConfigService] ⚠️ Error leyendo KV Razones Sociales:', error);
        }

        // Fallback local puro
        console.log('[ConfigService] 📂 Usando configuración local (fallback)');
        return localConfig;
    },

    /**
     * Obtiene la configuración de Razones Sociales DIRECTAMENTE del archivo local (bypassing KV)
     */
    async getRazonesSocialesLocal() {
        console.log('[ConfigService] 📂 Forzando lectura desde archivo local');
        return readLocalJson(RAZONES_SOCIALES_PATH, RAZONES_SOCIALES_PATH_ALT) || readLocalJson(RAZONES_SOCIALES_PATH_API, RAZONES_SOCIALES_PATH_API) || {};
    },

    /**
     * Guarda la configuración de Razones Sociales en KV
     */
    async saveRazonesSociales(data) {
        if (!kvClient) {
            const { url, token } = getKvCredentials();
            const errorMsg = `KV no configurado. Credenciales encontradas: { url: ${!!url}, token: ${!!token} }`;
            console.error('[ConfigService]', errorMsg);
            // Validar qué variables están presentes para debug
            if (!url) console.error('MISSING URL VARS. Checked: KV_REST_API_URL, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_KV_REST_API_URL');
            if (!token) console.error('MISSING TOKEN VARS. Checked: KV_REST_API_TOKEN, UPSTASH_REDIS_REST_TOKEN, UPSTASH_REDIS_REST_KV_REST_API_TOKEN');

            throw new Error(errorMsg);
        }
        await kvClient.set('config:razones-sociales', data);
        console.log('[ConfigService] 💾 Razones Sociales guardadas en KV');
        return true;
    },

    /**
     * Obtiene la configuración de Modelos por Marca
     */
    async getModelsByBrand() {
        try {
            if (kvClient) {
                const cached = await kvClient.get('config:models-by-brand');
                if (cached) {
                    console.log('[ConfigService] ✅ Modelos cargados desde Redis KV');
                    return cached;
                }
            }
        } catch (error) {
            console.error('[ConfigService] ⚠️ Error leyendo KV Modelos:', error);
        }

        console.log('[ConfigService] 📂 Usando modelos locales (fallback)');
        return readLocalJson(MODELS_BY_BRAND_PATH, MODELS_BY_BRAND_PATH_ALT) || {};
    },

    /**
     * Obtiene la configuración de Modelos DIRECTAMENTE del archivo local (bypassing KV)
     */
    async getModelsByBrandLocal() {
        console.log('[ConfigService] 📂 Forzando lectura de modelos desde archivo local');
        return readLocalJson(MODELS_BY_BRAND_PATH, MODELS_BY_BRAND_PATH_ALT) || readLocalJson(MODELS_BY_BRAND_PATH_API, MODELS_BY_BRAND_PATH_API) || {};
    },

    /**
     * Guarda Modelos en KV
     */
    async saveModelsByBrand(data) {
        if (!kvClient) {
            const { url, token } = getKvCredentials();
            const errorMsg = `KV no configurado (Modelos). Credenciales encontradas: { url: ${!!url}, token: ${!!token} }`;
            throw new Error(errorMsg);
        }
        await kvClient.set('config:models-by-brand', data);
        console.log('[ConfigService] 💾 Modelos guardados en KV');
        return true;
    },

    /**
     * Obtiene la configuración de Pipelines de SIMPA
     */
    async getSimpaPipelines() {
        try {
            if (kvClient) {
                const cached = await kvClient.get('config:simpa-pipelines');
                if (cached) {
                    console.log('[ConfigService] ✅ Pipelines SIMPA cargados desde Redis KV');
                    return cached;
                }
            }
        } catch (error) {
            console.error('[ConfigService] ⚠️ Error leyendo KV Pipelines SIMPA:', error);
        }

        console.log('[ConfigService] 📂 Usando pipelines SIMPA locales (fallback)');
        return readLocalJson(SIMPA_PIPELINES_PATH, SIMPA_PIPELINES_PATH_ALT) || readLocalJson(SIMPA_PIPELINES_PATH_API, SIMPA_PIPELINES_PATH_API) || {};
    },

    /**
     * Guarda la configuración de Pipelines de SIMPA en KV
     */
    async saveSimpaPipelines(data) {
        if (!kvClient) {
            const { url, token } = getKvCredentials();
            const errorMsg = `KV no configurado. Credenciales encontradas: { url: ${!!url}, token: ${!!token} }`;
            throw new Error(errorMsg);
        }
        await kvClient.set('config:simpa-pipelines', data);
        console.log('[ConfigService] 💾 Pipelines SIMPA guardados en KV');
        return true;
    }
};

module.exports = ConfigService;
