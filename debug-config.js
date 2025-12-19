const ConfigService = require('./vercel/api/services/config-service');

async function test() {
    console.log('--- Testing Config Service Fallback ---');
    try {
        const razones = await ConfigService.getRazonesSociales();
        const modelos = await ConfigService.getModelsByBrand();

        console.log('Razones loaded:', Object.keys(razones).length);
        console.log('Sample Razon:', Object.keys(razones)[0]);
        console.log('Modelos loaded:', Object.keys(modelos).length);

        if (Object.keys(razones).length > 0 && Object.keys(modelos).length > 0) {
            console.log('✅ Fallback working correctly!');
        } else {
            console.error('❌ Fallback returned empty data');
        }

    } catch (error) {
        console.error('❌ Error testing config service:', error);
    }
}

test();
