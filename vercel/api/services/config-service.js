const { kv } = require('@vercel/kv');
const fs = require('fs');
const path = require('path');

// Cache simple en memoria para reducir latencia (opcional, cuidado en serverless)
let inMemoryCache = {
    razonesSociales: null,
    modelsByBrand: null,
    timestamp: 0
};

// Rutas a archivos locales de respaldo
const RAZONES_SOCIALES_PATH = path.join(process.cwd(), 'src/config/razones-sociales.json');
const MODELS_BY_BRAND_PATH = path.join(process.cwd(), 'src/config/models-by-brand.json');
const RAZONES_SOCIALES_PATH_ALT = path.join(__dirname, '../../src/config/razones-sociales.json');
const MODELS_BY_BRAND_PATH_ALT = path.join(__dirname, '../../src/config/models-by-brand.json');

// Helper para leer archivo local intentando varias rutas
function readLocalJson(filePath, altPath) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } else if (fs.existsSync(altPath)) {
            return JSON.parse(fs.readFileSync(altPath, 'utf8'));
        }
    } catch (error) {
        console.warn(`[ConfigService] ⚠️ Error leyendo archivo local ${filePath}:`, error.message);
    }
    return null;
}

const ConfigService = {

    /**
     * Obtiene la configuración de Razones Sociales
     * Prioridad: 1. Redis, 2. Local JSON
     */
    async getRazonesSociales() {
        try {
            // Intentar leer de KV
            if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
                const cached = await kv.get('config:razones-sociales');
                if (cached) {
                    console.log('[ConfigService] ✅ Configuración cargada desde Redis KV');
                    return cached;
                }
            }
        } catch (error) {
            console.error('[ConfigService] ⚠️ Error leyendo KV Razones Sociales:', error);
        }

        // Fallback local
        console.log('[ConfigService] 📂 Usando configuración local (fallback)');
        return readLocalJson(RAZONES_SOCIALES_PATH, RAZONES_SOCIALES_PATH_ALT) || {};
    },

    /**
     * Guarda la configuración de Razones Sociales en KV
     */
    async saveRazonesSociales(data) {
        if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
            throw new Error('KV no configurado. No se puede guardar.');
        }
        await kv.set('config:razones-sociales', data);
        console.log('[ConfigService] 💾 Razones Sociales guardadas en KV');
        return true;
    },

    /**
     * Obtiene la configuración de Modelos por Marca
     */
    async getModelsByBrand() {
        try {
            if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
                const cached = await kv.get('config:models-by-brand');
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
     * Guarda Modelos en KV
     */
    async saveModelsByBrand(data) {
        if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
            throw new Error('KV no configurado');
        }
        await kv.set('config:models-by-brand', data);
        console.log('[ConfigService] 💾 Modelos guardados en KV');
        return true;
    }
};

module.exports = ConfigService;
