const fs = require('fs');
const path = require('path');

// Dashboard HTML Template
const getHtml = () => `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SIMPA Admin Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
    <!-- JSON Editor -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jsoneditor/9.10.0/jsoneditor.min.js"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/jsoneditor/9.10.0/jsoneditor.min.css" rel="stylesheet" type="text/css">
    <style>
        .jsoneditor { border-color: #e5e7eb; border-radius: 0.5rem; overflow: hidden; height: 600px; }
        .jsoneditor-menu { background-color: #1f2937; border-bottom: 1px solid #374151; }
    </style>
</head>
<body class="bg-gray-100 min-h-screen text-gray-800 font-sans">
    <div id="app" class="pb-10">
        <!-- Navbar -->
        <nav class="bg-gray-900 text-white shadow-lg">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex items-center justify-between h-16">
                    <div class="flex items-center">
                        <span class="font-bold text-xl tracking-tight text-yellow-500">SIMPA</span>
                        <span class="ml-2 font-light hidden sm:block">Workflow Admin</span>
                    </div>
                    <div class="flex items-center space-x-4">
                        <button @click="logout" class="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium">Salir</button>
                    </div>
                </div>
            </div>
        </nav>

        <!-- Main Content -->
        <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
            <!-- Tabs -->
            <div class="flex space-x-1 rounded-xl bg-gray-200 p-1 mb-6 w-fit">
                <button @click="activeTab = 'razones'" :class="activeTab === 'razones' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'" class="w-40 py-2.5 text-sm font-medium leading-5 rounded-lg transition-all duration-200">
                    Razones Sociales
                </button>
                <button @click="activeTab = 'modelos'" :class="activeTab === 'modelos' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'" class="w-40 py-2.5 text-sm font-medium leading-5 rounded-lg transition-all duration-200">
                    Modelos
                </button>
            </div>

            <!-- Loading State -->
            <div v-if="loading" class="flex justify-center items-center py-20">
                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500"></div>
            </div>

            <!-- Error State -->
            <div v-if="error" class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6" role="alert">
                <p class="font-bold">Error</p>
                <p>{{ error }}</p>
                <button @click="fetchConfig" class="mt-2 text-sm underline">Reintentar</button>
            </div>

            <!-- Editor Container -->
            <div v-show="!loading" class="bg-white rounded-xl shadow-md overflow-hidden p-6">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl font-bold text-gray-800">
                        {{ activeTab === 'razones' ? 'Configuración de Concesionarios' : 'Catálogo de Modelos' }}
                    </h2>
                    <div class="flex space-x-3">
                         <button @click="refresh" class="px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none">
                            Recargar
                        </button>
                        <button @click="save" :disabled="saving" class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none disabled:opacity-50">
                            <svg v-if="saving" class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            {{ saving ? 'Guardando...' : 'Guardar Cambios' }}
                        </button>
                    </div>
                </div>

                <div id="jsoneditor" class="w-full"></div>
                
                <p class="mt-4 text-sm text-gray-500">
                    <span class="font-semibold">Nota:</span> Los cambios se aplican inmediatamente en el entorno de producción tras guardar.
                </p>
            </div>
        </main>
    </div>

    <script>
        const { createApp, ref, onMounted, watch } = Vue;

        createApp({
            setup() {
                const activeTab = ref('razones');
                const loading = ref(true);
                const saving = ref(false);
                const error = ref(null);
                
                // Data stores
                let rawData = { razones: {}, modelos: {} };
                
                // Editor instance
                let editor = null;

                const initEditor = () => {
                    const container = document.getElementById('jsoneditor');
                    if(editor) editor.destroy();
                    
                    editor = new JSONEditor(container, {
                        mode: 'tree',
                        modes: ['code', 'tree', 'view'],
                        onChangeJSON: (json) => {
                            // Sync changes locally needed? No, logic handles on save.
                        }
                    });
                };

                const updateEditorContent = () => {
                   if (!editor) return;
                   const data = activeTab.value === 'razones' ? rawData.razones : rawData.modelos;
                   editor.set(data);
                   editor.expandAll();
                };

                const fetchConfig = async () => {
                    loading.value = true;
                    error.value = null;
                    try {
                        const response = await fetch('/api/admin/config', {
                            headers: { 'Authorization': 'Basic ' + btoa('admin:simpa2025') } // Auto-auth prompt logic fallback
                        });

                        if (response.status === 401) {
                             // Force browser prompt
                             window.location.reload(); 
                             return;
                        }

                        if (!response.ok) throw new Error('Failed to fetch config');

                        const data = await response.json();
                        rawData.razones = data.razonesSociales;
                        rawData.modelos = data.modelsByBrand;
                        
                        updateEditorContent();
                    } catch (e) {
                        error.value = e.message;
                    } finally {
                        loading.value = false;
                    }
                };

                const save = async () => {
                    saving.value = true;
                    try {
                        const currentJson = editor.get();
                        const type = activeTab.value === 'razones' ? 'razonesSociales' : 'modelsByBrand';
                        
                        const response = await fetch('/api/admin/config', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': 'Basic ' + btoa('admin:simpa2025')
                            },
                            body: JSON.stringify({ type, data: currentJson })
                        });

                        if (!response.ok) throw new Error('Error al guardar');
                        
                        // Update local ref
                        if(activeTab.value === 'razones') rawData.razones = currentJson;
                        else rawData.modelos = currentJson;

                        alert('✅ Configuración guardada exitosamente');
                    } catch (e) {
                        alert('❌ Error: ' + e.message);
                    } finally {
                        saving.value = false;
                    }
                };
                
                const refresh = () => fetchConfig();

                watch(activeTab, () => {
                    updateEditorContent();
                });

                onMounted(() => {
                    initEditor();
                    fetchConfig();
                });

                return {
                    activeTab, loading, saving, error,
                    save, refresh, fetchConfig
                };
            }
        }).mount('#app');
    </script>
</body>
</html>
`;

module.exports = (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(getHtml());
};
