module.exports = (req, res) => {
    // 1. Basic Authentication
    const auth = req.headers.authorization;
    // Default credentials if env vars are missing
    const user = process.env.ADMIN_USER || 'admin';
    const pass = process.env.ADMIN_PASS || 'simpa2025';

    const expectedAuth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

    if (!auth || auth !== expectedAuth) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Simpa Admin"');
        return res.status(401).send('Authentication required.');
    }

    // 2. Serve the Dashboard HTML
    // We escape backticks inside the HTML string to avoid breaking the outer template literal
    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SIMPA Admin Dashboard 2.1</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
    <!-- Phosphor Icons -->
    <script src="https://unpkg.com/@phosphor-icons/web"></script>
    <style>
        /* Custom scrollbar for cleanliness */
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #f1f1f1; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        .glass-panel { background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.5); }
        
        /* Animation for fade-in */
        .animate-fade-in {
            animation: fadeIn 0.2s ease-in-out;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-5px); }
            to { opacity: 1; transform: translateY(0); }
        }
    </style>
</head>
<body class="bg-slate-50 text-slate-800 h-screen flex flex-col overflow-hidden">

    <div id="app" class="flex-1 flex flex-col h-full">
        <!-- Top Navbar -->
        <header class="bg-slate-900 text-white shadow-lg z-10 shrink-0">
            <div class="px-6 py-4 flex justify-between items-center">
                <div class="flex items-center gap-3">
                    <div class="bg-blue-600 p-2 rounded-lg">
                        <i class="ph ph-gear-six text-xl"></i>
                    </div>
                    <div>
                        <h1 class="font-bold text-xl tracking-tight">SIMPA <span class="font-light text-blue-400">Admin</span></h1>
                        <p class="text-xs text-slate-400">HubSpot Configuration Manager</p>
                    </div>
                </div>
                <div class="flex items-center gap-4">
                    <span v-if="unsavedChanges" class="text-amber-400 text-sm font-medium flex items-center gap-1 animate-pulse">
                        <i class="ph ph-warning"></i> Cambios sin guardar
                    </span>
                    <button @click="saveAll" :disabled="saving" 
                        class="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                        <i v-if="saving" class="ph ph-spinner animate-spin"></i>
                        <i v-else class="ph ph-floppy-disk"></i>
                        {{ saving ? 'Guardando...' : 'Guardar Todo' }}
                    </button>
                    <button class="text-slate-400 hover:text-white transition-colors" title="Salir">
                        <i class="ph ph-sign-out text-xl"></i>
                    </button>
                </div>
            </div>
        </header>

        <!-- Main Content (Split View) -->
        <main class="flex-1 flex overflow-hidden">
            
            <!-- Sidebar Navigation -->
            <nav class="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 z-0">
                <div class="p-4 space-y-2">
                    <button @click="currentView = 'razones'" 
                        :class="['w-full text-left px-4 py-3 rounded-xl transition-all flex items-center gap-3 font-medium', currentView === 'razones' ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100' : 'text-slate-600 hover:bg-slate-50']">
                        <i class="ph ph-buildings text-lg"></i> Razones Sociales
                    </button>
                    <button @click="currentView = 'modelos'"
                        :class="['w-full text-left px-4 py-3 rounded-xl transition-all flex items-center gap-3 font-medium', currentView === 'modelos' ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100' : 'text-slate-600 hover:bg-slate-50']">
                        <i class="ph ph-motorcycle text-lg"></i> Catalogo Modelos
                    </button>
                    <button @click="currentView = 'raw'"
                        :class="['w-full text-left px-4 py-3 rounded-xl transition-all flex items-center gap-3 font-medium', currentView === 'raw' ? 'bg-purple-50 text-purple-700 shadow-sm ring-1 ring-purple-100' : 'text-slate-600 hover:bg-slate-50']">
                        <i class="ph ph-code text-lg"></i> JSON Crudo
                    </button>
                </div>
                
                <div class="mt-auto p-4 border-t border-slate-100">
                   <div class="text-xs text-slate-400 text-center">
                       v2.1.0 &bull; Powered by Vercel KV
                   </div>
                </div>
            </nav>

            <!-- Loading State -->
            <div v-if="loading" class="flex-1 flex items-center justify-center bg-slate-50">
                <div class="text-center">
                    <i class="ph ph-spinner-gap text-4xl text-blue-600 animate-spin mb-4"></i>
                    <p class="text-slate-500 font-medium">Cargando configuración...</p>
                </div>
            </div>

            <!-- Content Area -->
            <div v-else class="flex-1 flex overflow-hidden relative">
                
                <!-- VIEW: RAZONES SOCIALES -->
                <div v-if="currentView === 'razones'" class="flex flex-1 w-full">
                    <!-- List Sidebar -->
                    <div class="w-72 bg-slate-50 border-r border-slate-200 flex flex-col overflow-hidden">
                        <div class="p-4 border-b border-slate-200 bg-white sticky top-0">
                            <input v-model="searchQuery" type="text" placeholder="Buscar..." class="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none mb-3">
                            <button @click="createNewRazonSocial" class="w-full bg-slate-800 text-white py-2 rounded-lg text-sm font-medium hover:bg-slate-700 flex justify-center items-center gap-2">
                                <i class="ph ph-plus-circle"></i> Nueva Razon Social
                            </button>
                        </div>
                        <div class="overflow-y-auto flex-1 p-2 space-y-1">
                            <div v-for="(rs, key) in filteredRazones" :key="key" 
                                @click="selectRazon(key)"
                                :class="['p-3 rounded-lg cursor-pointer transition-colors border', selectedRazonKey === key ? 'bg-white border-blue-200 shadow-sm ring-1 ring-blue-100' : 'bg-transparent border-transparent hover:bg-slate-100 text-slate-600']">
                                <h3 class="font-bold text-sm truncate" :class="selectedRazonKey === key ? 'text-blue-700' : 'text-slate-700'">{{ key }}</h3>
                                <div class="flex items-center gap-2 mt-1">
                                    <span class="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded text-slate-600">{{ rs.brands?.length || 0 }} Marcas</span>
                                    <span class="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded text-slate-600">{{ rs.dealers?.length || 0 }} Dealers</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Editor Panel -->
                    <div class="flex-1 overflow-y-auto bg-white p-8" v-if="selectedRazonKey && selectedRazon">
                        
                        <!-- Header / ID Edit -->
                        <div class="flex flex-col mb-6 pb-4 border-b border-slate-100">
                             <div class="flex justify-between items-start">
                                <div>
                                    <label class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">ID de Razón Social (Key)</label>
                                    <div class="flex items-center gap-2">
                                        <input v-if="isNewRazon" v-model="pendingNewKey" class="text-2xl font-bold text-slate-900 bg-slate-50 border-b-2 border-blue-500 focus:outline-none px-2 py-1 w-96 placeholder-slate-300" placeholder="NOMBRE_EMPRESA">
                                        <h2 v-else class="text-2xl font-bold text-slate-900">{{ selectedRazonKey }}</h2>
                                        
                                        <button v-if="!isNewRazon" @click="deleteRazon(selectedRazonKey)" class="text-red-400 hover:text-red-600 ml-4 p-2 rounded-full hover:bg-red-50" title="Eliminar Razón Social">
                                            <i class="ph ph-trash"></i>
                                        </button>
                                    </div>
                                </div>
                                <div v-if="!isNewRazon && selectedRazon.tokenEnv">
                                    <button @click="syncProperties" :disabled="isSyncing" class="bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-indigo-700 text-xs font-bold uppercase tracking-wide flex items-center gap-2 transition-all">
                                        <i class="ph" :class="isSyncing ? 'ph-spinner animate-spin' : 'ph-cloud-arrow-up'"></i>
                                        {{ isSyncing ? 'Sincronizando...' : 'Sincronizar Hubspot' }}
                                    </button>
                                </div>
                             </div>

                             <!-- Help Text for New Razon Social -->
                             <div v-if="isNewRazon" class="mt-4 text-sm text-blue-800 bg-blue-50 p-4 rounded-lg flex items-start gap-3 border border-blue-100">
                                <i class="ph ph-info text-xl shrink-0 mt-0.5"></i>
                                <div>
                                    <p class="font-bold mb-1">Pasos Importantes:</p>
                                    <ol class="list-decimal list-inside space-y-1 ml-1">
                                        <li>Cree las <strong>Propiedades</strong> en el portal de HubSpot destino para recibir los datos.</li>
                                        <li>Genere un <strong>Token de Private App</strong> en HubSpot.</li>
                                        <li>Agregue ese token como <strong>Variable de Entorno</strong> en Vercel (Settings).</li>
                                    </ol>
                                </div>
                            </div>
                        </div>

                        <!-- Basic Config Grid -->
                        <div class="grid grid-cols-2 gap-6 mb-8">
                            <div class="space-y-2">
                                <label class="text-sm font-semibold text-slate-700 flex items-center gap-1 group relative w-fit">
                                    HubSpot Portal ID
                                    <i class="ph ph-question text-slate-400 cursor-help"></i>
                                    <!-- Tooltip -->
                                    <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-slate-800 text-white text-xs p-2 rounded hidden group-hover:block z-10 transition-opacity">
                                        El ID numérico único de la cuenta de HubSpot.
                                    </div>
                                </label>
                                <input v-model="selectedRazon.portalId" type="text" class="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none" placeholder="e.g. 12345678">
                            </div>
                            <div class="space-y-2">
                                <label class="text-sm font-semibold text-slate-700 flex items-center gap-1 group relative w-fit">
                                    Token Environment Variable
                                    <i class="ph ph-warning text-amber-500 cursor-help"></i>
                                     <!-- Tooltip -->
                                     <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-amber-900 text-white text-xs p-2 rounded hidden group-hover:block z-10">
                                        IMPORTANTE: Esta variable debe ser creada manualmente en la configuración de Vercel.
                                    </div>
                                </label>
                                <div class="flex flex-col gap-1">
                                    <div class="flex items-center gap-2">
                                        <code class="bg-slate-100 text-slate-600 px-3 py-2 rounded-lg border border-slate-200 font-mono text-sm flex-1 truncate">process.env.</code>
                                        <input v-model="selectedRazon.tokenEnv" type="text" class="flex-[2] px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono text-sm" placeholder="EMPRESA_TOKEN">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Brands Selection -->
                        <div class="mb-8 p-6 bg-slate-50 rounded-xl border border-slate-200">
                            <h3 class="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                                <i class="ph ph-tag"></i> Marcas Asociadas
                            </h3>
                            <div class="flex flex-wrap gap-2">
                                <button v-for="brand in availableBrands" :key="brand" 
                                    @click="toggleBrand(brand)"
                                    :class="['px-3 py-1.5 rounded-full text-sm font-medium transition-all border', hasBrand(brand) ? 'bg-blue-100 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300']">
                                    {{ brand }}
                                    <i v-if="hasBrand(brand)" class="ph ph-check ml-1"></i>
                                </button>
                            </div>
                        </div>

                        <!-- Dealers Manager -->
                        <div class="mb-8">
                            <h3 class="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                                <i class="ph ph-storefront"></i> Concesionarios (Dealers)
                            </h3>
                            <div class="border rounded-xl p-4 bg-white shadow-sm">
                                <div class="flex flex-wrap gap-2 mb-3">
                                    <span v-for="(dealer, idx) in selectedRazon.dealers" :key="idx" class="bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-sm flex items-center gap-2 group border border-slate-200">
                                        {{ dealer }}
                                        <button @click="removeDealer(idx)" class="text-slate-400 hover:text-red-500 rounded-full p-0.5"><i class="ph ph-x"></i></button>
                                    </span>
                                </div>
                                <div class="flex gap-2">
                                    <input v-model="newDealerInput" @keydown.enter="addDealer" type="text" class="flex-1 px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm" placeholder="Escriba nombre del dealer y presione Enter...">
                                    <div class="flex items-center gap-2 px-2 border-l">
                                         <input type="checkbox" v-model="syncDealerToHubSpot" id="syncDealer" class="w-4 h-4 text-blue-600 rounded">
                                         <label for="syncDealer" class="text-xs text-slate-600 cursor-pointer select-none">Crear en HubSpot</label>
                                    </div>
                                    <button @click="addDealer" class="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm">Agregar</button>
                                </div>
                            </div>
                        </div>

                        <!-- Pipeline & Properties Tabs -->
                        <div class="mb-8">
                            <div class="flex border-b border-slate-200 mb-4">
                                <button @click="configTab = 'pipelines'" :class="['px-4 py-2 font-medium text-sm border-b-2 transition-colors', configTab === 'pipelines' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700']">
                                    Pipeline Mapping
                                </button>
                                <button @click="configTab = 'properties'" :class="['px-4 py-2 font-medium text-sm border-b-2 transition-colors', configTab === 'properties' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700']">
                                    Propiedades por Defecto (Custom)
                                </button>
                            </div>

                            <!-- Pipeline Config -->
                            <div v-if="configTab === 'pipelines'" class="space-y-4 animate-fade-in">
                                <div v-if="!selectedRazon.pipelineMapping">
                                    <button @click="initPipelineMapping" class="text-blue-600 hover:underline text-sm">+ Inicializar Configuración de Pipelines</button>
                                </div>
                                <div v-else class="space-y-3">
                                    <div v-for="(mapping, brandKey) in selectedRazon.pipelineMapping" :key="brandKey" class="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                                        <div class="w-32 font-bold text-sm text-slate-700">{{ brandKey }}</div>
                                        <div class="flex-1 grid grid-cols-2 gap-2">
                                            <input v-model="mapping.pipeline" placeholder="Pipeline ID" class="px-3 py-1.5 rounded border border-slate-300 text-sm">
                                            <input v-model="mapping.stage" placeholder="Stage ID" class="px-3 py-1.5 rounded border border-slate-300 text-sm">
                                        </div>
                                        <button @click="removePipelineMapping(brandKey)" class="text-slate-400 hover:text-red-500"><i class="ph ph-trash"></i></button>
                                    </div>
                                    <!-- Add new pipeline mapping -->
                                    <div class="flex gap-2 items-center mt-2">
                                        <select v-model="newPipelineBrand" class="px-3 py-1.5 rounded border border-slate-300 text-sm bg-white">
                                            <option value="" disabled>Seleccionar Marca o 'default'</option>
                                            <option value="default">default</option>
                                            <option v-for="b in selectedRazon.brands" :key="b" :value="b">{{ b }}</option>
                                        </select>
                                        <button @click="addPipelineMapping" class="text-blue-600 text-sm font-medium hover:bg-blue-50 px-3 py-1 rounded">+ Agregar Mapping</button>
                                    </div>
                                </div>
                            </div>

                            <!-- Properties Config (Simplified JSON Edit for now) -->
                           <div v-if="configTab === 'properties'" class="animate-fade-in">
                                <p class="text-xs text-slate-500 mb-2">Configure las propiedades predeterminadas que se enviarán a HubSpot para cada negocio creado bajo esta marca.</p>
                                <textarea 
                                    :value="JSON.stringify(selectedRazon.customProperties || {}, null, 2)"
                                    @input="updateCustomProperties($event.target.value)"
                                    class="w-full h-48 font-mono text-xs bg-slate-900 text-green-400 p-4 rounded-lg focus:outline-none"
                                ></textarea>
                                <p class="text-xs text-slate-400 mt-1">Edite el JSON directamente. Asegúrese de que la sintaxis sea válida.</p>
                            </div>
                        </div>

                    </div>
                    <div v-else class="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50">
                        <i class="ph ph-arrow-left text-3xl mb-2"></i>
                        <p>Seleccione una Razón Social para editar</p>
                    </div>
                </div>

                <!-- VIEW: CATALOGO MODELOS -->
                <div v-else-if="currentView === 'modelos'" class="flex flex-1 w-full">
                     <!-- Brand Sidebar -->
                     <div class="w-64 bg-slate-50 border-r border-slate-200 flex flex-col">
                        <div class="p-4 border-b border-slate-200">
                             <button @click="showAddBrandModal = true" class="w-full bg-white border border-slate-300 text-slate-700 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 shadow-sm">
                                + Agregar Marca
                            </button>
                        </div>
                        <div class="overflow-y-auto flex-1 p-2 space-y-1">
                            <div v-for="(data, brandKey) in modelsByBrand" :key="brandKey"
                                @click="selectBrandModel(brandKey)"
                                :class="['p-3 rounded-lg cursor-pointer transition-colors border flex justify-between items-center', selectedBrandKey === brandKey ? 'bg-white border-blue-200 shadow-sm ring-1 ring-blue-100' : 'bg-transparent border-transparent hover:bg-slate-100 text-slate-600']">
                                <span class="font-bold text-sm">{{ brandKey }}</span>
                                <span class="text-xs bg-slate-200 px-2 py-0.5 rounded-full">{{ data.models?.length || 0 }}</span>
                            </div>
                        </div>
                     </div>

                     <!-- Models List -->
                     <div class="flex-1 overflow-y-auto bg-white p-8" v-if="selectedBrandKey && selectedBrandModels">
                         <div class="mb-6 flex justify-between items-end">
                             <div>
                                 <h2 class="text-2xl font-bold text-slate-900">{{ selectedBrandModels.label || selectedBrandKey }}</h2>
                                 <p class="text-slate-500 text-sm">Key: {{ selectedBrandKey }}</p>
                             </div>
                             <div class="flex gap-2">
                                <input v-model="newModelInput" @keydown.enter="addModel" type="text" class="w-64 px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-purple-500 focus:outline-none text-sm shadow-sm" placeholder="Nombre nuevo modelo...">
                                <button @click="addModel" class="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg font-medium text-sm shadow-md">
                                    <i class="ph ph-plus"></i> Agregar
                                </button>
                                <button @click="showSyncModelModal = true" class="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg font-medium text-sm shadow-sm hover:bg-slate-50 flex items-center gap-2">
                                    <i class="ph ph-cloud-arrow-up"></i> Sync
                                </button>
                             </div>
                         </div>

                         <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                             <div v-for="(model, idx) in selectedBrandModels.models" :key="idx" 
                                class="group bg-slate-50 hover:bg-white border border-slate-100 hover:border-purple-200 p-3 rounded-lg flex justify-between items-center transition-all shadow-sm">
                                 <span class="font-medium text-slate-700">{{ model }}</span>
                                 <button @click="removeModel(idx)" class="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                     <i class="ph ph-trash text-lg"></i>
                                 </button>
                             </div>
                         </div>
                     </div>
                     <div v-else class="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50">
                        <i class="ph ph-motorcycle text-4xl mb-3 text-slate-300"></i>
                        <p>Seleccione una Marca para ver sus modelos</p>
                    </div>
                </div>

                <!-- VIEW: RAW JSON -->
                <div v-else-if="currentView === 'raw'" class="flex-1 p-8 bg-slate-900 text-slate-300 font-mono text-sm overflow-auto">
                    <h3 class="text-white font-bold mb-4">Debug RAW Data</h3>
                    <div class="grid grid-cols-2 gap-4 h-full">
                        <div class="flex flex-col">
                            <label class="mb-2 text-xs uppercase tracking-widest text-slate-500">Razones Sociales</label>
                            <textarea readonly class="flex-1 bg-slate-800 p-4 rounded-lg focus:outline-none resize-none text-xs leading-relaxed opacity-70 hover:opacity-100 transition-opacity">{{ JSON.stringify(razonesSociales, null, 2) }}</textarea>
                        </div>
                        <div class="flex flex-col">
                            <label class="mb-2 text-xs uppercase tracking-widest text-slate-500">Modelos</label>
                            <textarea readonly class="flex-1 bg-slate-800 p-4 rounded-lg focus:outline-none resize-none text-xs leading-relaxed opacity-70 hover:opacity-100 transition-opacity">{{ JSON.stringify(modelsByBrand, null, 2) }}</textarea>
                        </div>
                    </div>
                </div>
            </div>
        </main>
        
        <!-- Generic Modal for Adding Brand -->
        <div v-if="showAddBrandModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div class="bg-white rounded-xl shadow-xl p-6 w-96 transform transition-all scale-100">
                <h3 class="text-lg font-bold mb-4">Nueva Marca de Vehículos</h3>
                <input v-model="newBrandKeyInput" class="w-full border p-2 rounded mb-2 uppercase" placeholder="KEY (e.g. DUCATI)">
                <input v-model="newBrandLabelInput" class="w-full border p-2 rounded mb-4" placeholder="Label (e.g. Ducati)">
                <div class="flex justify-end gap-2">
                    <button @click="showAddBrandModal = false" class="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded">Cancelar</button>
                    <button @click="addNewBrandCatalog" class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">Crear</button>
                </div>
            </div>
        </div>

        <!-- Sync Model Modal -->
        <div v-if="showSyncModelModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
             <div class="bg-white rounded-xl shadow-xl p-6 w-[500px] transform transition-all scale-100">
                <h3 class="text-lg font-bold mb-2">Sincronizar Modelos con HubSpot</h3>
                <p class="text-xs text-slate-500 mb-4">Esto agregará el modelo más reciente ({{ newModelInput || '...' }}) o seleccionará uno existente para agregar a las listas desplegables de HubSpot.</p>
                
                <div class="mb-4">
                     <label class="text-sm font-semibold mb-1 block">Modelo a Sincronizar</label>
                     <select v-model="modelToSync" class="w-full border p-2 rounded text-sm bg-slate-50">
                         <option v-for="m in selectedBrandModels.models" :key="m" :value="m">{{ m }}</option>
                     </select>
                </div>

                <div class="mb-4">
                     <label class="text-sm font-semibold mb-1 block">Razones Sociales (Destino)</label>
                     <p class="text-xs text-slate-400 mb-2">Se seleccionaron automáticamente las R.S. que venden {{ selectedBrandKey }}</p>
                     <div class="max-h-40 overflow-y-auto border rounded p-2 text-sm space-y-1">
                         <div v-for="rs in applicableRazonesForSync" :key="rs" class="flex items-center gap-2">
                             <input type="checkbox" :id="'sync-'+rs" v-model="selectedRazonesForSync" :value="rs">
                             <label :for="'sync-'+rs">{{ rs }}</label>
                         </div>
                     </div>
                </div>

                <div class="flex justify-end gap-2 pt-2 border-t">
                    <button @click="showSyncModelModal = false" class="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded text-sm">Cancelar</button>
                    <button @click="confirmSyncModel" :disabled="isSyncing || !modelToSync || selectedRazonesForSync.length === 0" 
                        class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm flex items-center gap-2 disabled:opacity-50">
                        <i v-if="isSyncing" class="ph ph-spinner animate-spin"></i>
                        {{ isSyncing ? 'Sincronizando...' : 'Sincronizar' }}
                    </button>
                </div>
            </div>
        </div>

    </div>

    <script>
        const { createApp, ref, computed, onMounted, watch } = Vue;

        createApp({
            setup() {
                // State
                const loading = ref(true);
                const saving = ref(false);
                const isSyncing = ref(false);
                const unsavedChanges = ref(false);
                const currentView = ref('razones'); // razones, modelos, raw
                
                // Data
                const razonesSociales = ref({});
                const modelsByBrand = ref({});

                // Razones View State
                const searchQuery = ref('');
                const selectedRazonKey = ref(null);
                const isNewRazon = ref(false);
                const pendingNewKey = ref('');
                const newDealerInput = ref('');
                const syncDealerToHubSpot = ref(false);
                const configTab = ref('pipelines'); // pipelines, properties
                const newPipelineBrand = ref('');

                // Models View State
                const selectedBrandKey = ref(null);
                const newModelInput = ref('');
                const showAddBrandModal = ref(false);
                const newBrandKeyInput = ref('');
                const newBrandLabelInput = ref('');
                
                // Sync Modal State
                const showSyncModelModal = ref(false);
                const modelToSync = ref('');
                const selectedRazonesForSync = ref([]);

                // Computed
                const sortedRazonKeys = computed(() => Object.keys(razonesSociales.value).sort());
                
                const filteredRazones = computed(() => {
                    const q = searchQuery.value.toLowerCase();
                    const keys = sortedRazonKeys.value.filter(k => k.toLowerCase().includes(q));
                    const result = {};
                    keys.forEach(k => result[k] = razonesSociales.value[k]);
                    return result;
                });
                
                const selectedRazon = computed(() => {
                    if (!selectedRazonKey.value) return null;
                    return razonesSociales.value[selectedRazonKey.value];
                });

                const availableBrands = computed(() => Object.keys(modelsByBrand.value));

                const selectedBrandModels = computed(() => {
                    if (!selectedBrandKey.value) return null;
                    return modelsByBrand.value[selectedBrandKey.value]; 
                });

                const applicableRazonesForSync = computed(() => {
                    if (!selectedBrandKey.value) return [];
                    return Object.keys(razonesSociales.value).filter(rsKey => {
                        const rs = razonesSociales.value[rsKey];
                        return rs.brands && rs.brands.includes(selectedBrandKey.value);
                    });
                });

                // Watchers
                watch(showSyncModelModal, (val) => {
                    if (val) {
                         // Auto select all valid RS
                        selectedRazonesForSync.value = applicableRazonesForSync.value;
                        // Auto select model if input has value
                        if (newModelInput.value) {
                             modelToSync.value = newModelInput.value;
                        } else if (selectedBrandModels.value?.models?.length > 0) {
                             modelToSync.value = selectedBrandModels.value.models[selectedBrandModels.value.models.length - 1];
                        }
                    }
                });

                // Methods
                const fetchConfig = async () => {
                    try {
                        loading.value = true;
                        const res = await fetch('/api/admin/config');
                        if (!res.ok) throw new Error('Failed to fetch');
                        const data = await res.json();
                        razonesSociales.value = data.razonesSociales || {};
                        modelsByBrand.value = data.modelsByBrand || {};
                        unsavedChanges.value = false;
                    } catch (e) {
                        alert('Error cargando configuración: ' + e.message);
                    } finally {
                        loading.value = false;
                    }
                };

                const saveAll = async () => {
                    // Finalize new creation if pending
                    if (isNewRazon.value && pendingNewKey.value) {
                        const oldKey = selectedRazonKey.value;
                        const newKey = pendingNewKey.value.trim().toUpperCase();
                        if (newKey && newKey !== oldKey) {
                            razonesSociales.value[newKey] = razonesSociales.value[oldKey];
                            delete razonesSociales.value[oldKey];
                            selectedRazonKey.value = newKey;
                            isNewRazon.value = false;
                            pendingNewKey.value = '';
                        }
                    }

                    try {
                        saving.value = true;
                        const payload = {
                            razonesSociales: razonesSociales.value,
                            modelsByBrand: modelsByBrand.value
                        };
                        
                        const res = await fetch('/api/admin/config', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify(payload)
                        });
                        
                        if (!res.ok) {
                            const err = await res.json();
                            throw new Error(err.error || 'Error al guardar');
                        }
                        unsavedChanges.value = false;
                    } catch (e) {
                        alert('Error guardando: ' + e.message);
                    } finally {
                        saving.value = false;
                    }
                };

                const markDirty = () => { unsavedChanges.value = true; };

                // --- Razones Logic ---
                const createNewRazonSocial = () => {
                    const tempKey = 'NUEVA_RAZON_' + Date.now();
                    razonesSociales.value[tempKey] = {
                        portalId: '',
                        tokenEnv: '',
                        brands: [],
                        dealers: [],
                        pipelineMapping: {},
                        customProperties: {}
                    };
                    isNewRazon.value = true;
                    pendingNewKey.value = '';
                    selectedRazonKey.value = tempKey;
                    markDirty();
                };

                const selectRazon = (key) => {
                    if (isNewRazon.value && selectedRazonKey.value && pendingNewKey.value) {
                        const oldKey = selectedRazonKey.value;
                        const newKey = pendingNewKey.value.trim().toUpperCase();
                        if (newKey && newKey !== oldKey && !razonesSociales.value[newKey]) {
                            razonesSociales.value[newKey] = razonesSociales.value[oldKey];
                            delete razonesSociales.value[oldKey];
                            if (key === oldKey) {
                                key = newKey;
                            }
                        }
                        isNewRazon.value = false;
                        pendingNewKey.value = '';
                    }
                    selectedRazonKey.value = key;
                    if (!key.startsWith('NUEVA_RAZON_')) {
                        isNewRazon.value = false;
                    }
                };
                
                const deleteRazon = (key) => {
                    if(confirm(\`¿Está seguro de eliminar \${key}?\`)) {
                        delete razonesSociales.value[key];
                        selectedRazonKey.value = null;
                        markDirty();
                    }
                };

                const hasBrand = (brand) => selectedRazon.value?.brands?.includes(brand) || false;
                
                const toggleBrand = (brand) => {
                    if (!selectedRazon.value) return;
                    if (!selectedRazon.value.brands) selectedRazon.value.brands = [];
                    const idx = selectedRazon.value.brands.indexOf(brand);
                    if (idx > -1) {
                        selectedRazon.value.brands.splice(idx, 1);
                    } else {
                        selectedRazon.value.brands.push(brand);
                    }
                    markDirty();
                };

                const addDealer = async () => {
                    if (!selectedRazon.value) return;
                    const val = newDealerInput.value.trim();
                    if (!val) return;
                    
                    if (!selectedRazon.value.dealers) selectedRazon.value.dealers = [];
                    selectedRazon.value.dealers.push(val);
                    
                    markDirty();
                    
                    // Sync to HubSpot if requested
                    if (syncDealerToHubSpot.value) {
                         if (!selectedRazon.value.tokenEnv) {
                             alert('No se puede sincronizar: Falta tokenEnv');
                         } else {
                             try {
                                 isSyncing.value = true;
                                 const res = await fetch('/api/admin/hubspot-sync', {
                                     method: 'POST',
                                     headers: {'Content-Type': 'application/json'},
                                     body: JSON.stringify({
                                         action: 'add_dealer',
                                         razonKey: selectedRazonKey.value,
                                         data: { dealerName: val }
                                     })
                                 });
                                 if(!res.ok) throw new Error('Falló sincronización con HS');
                                 // Optional: show success toast
                             } catch(e) {
                                 alert('Error sincronizando dealer con HubSpot: ' + e.message);
                             } finally {
                                 isSyncing.value = false;
                             }
                         }
                    }

                    newDealerInput.value = '';
                    syncDealerToHubSpot.value = false;
                };

                const removeDealer = (idx) => {
                    if (!selectedRazon.value) return;
                    selectedRazon.value.dealers.splice(idx, 1);
                    markDirty();
                };

                const initPipelineMapping = () => {
                    if (!selectedRazon.value) return;
                    selectedRazon.value.pipelineMapping = {
                        default: { pipeline: '', stage: '' }
                    };
                    markDirty();
                };
                
                const addPipelineMapping = () => {
                    if (!newPipelineBrand.value || !selectedRazon.value) return;
                    if (!selectedRazon.value.pipelineMapping) initPipelineMapping();
                    selectedRazon.value.pipelineMapping[newPipelineBrand.value] = { pipeline: '', stage: '' };
                    newPipelineBrand.value = '';
                    markDirty();
                };

                const removePipelineMapping = (key) => {
                    if (!selectedRazon.value) return;
                    delete selectedRazon.value.pipelineMapping[key];
                    markDirty();
                };
                
                const updateCustomProperties = (jsonString) => {
                    if (!selectedRazon.value) return;
                    try {
                         // Validate but assign string only if structure is valid? 
                         // For now simplified
                        const parsed = JSON.parse(jsonString);
                        selectedRazon.value.customProperties = parsed;
                        markDirty();
                    } catch(e) {}
                };

                const syncProperties = async () => {
                    if (!selectedRazonKey.value || !selectedRazon.value.tokenEnv) {
                        alert('Falta configurar Token Env');
                        return;
                    }
                    if(!confirm('Esto creará/verificará todas las propiedades estándar en HubSpot. ¿Continuar?')) return;

                    try {
                        isSyncing.value = true;
                        const res = await fetch('/api/admin/hubspot-sync', {
                             method: 'POST',
                             headers: {'Content-Type': 'application/json'},
                             body: JSON.stringify({
                                 action: 'sync_properties',
                                 razonKey: selectedRazonKey.value
                             })
                        });
                        const data = await res.json();
                        if(!res.ok) throw new Error(data.error || 'Failed');
                        
                        alert('Sincronización Completada. Revisar consola para detalles.');
                        console.log('Sync result:', data);
                    } catch(e) {
                        alert('Error: ' + e.message);
                    } finally {
                        isSyncing.value = false;
                    }
                };

                // --- Models Logic ---
                const selectBrandModel = (key) => { selectedBrandKey.value = key; };
                
                const addModel = () => {
                    if (!newModelInput.value.trim()) return;
                    if (!selectedBrandModels.value) return;
                    if (!selectedBrandModels.value.models) selectedBrandModels.value.models = [];
                    selectedBrandModels.value.models.push(newModelInput.value.trim());
                    // Don't clear input yet, helpful for sync
                    markDirty();
                };

                const removeModel = (idx) => {
                    if (!selectedBrandModels.value) return;
                    selectedBrandModels.value.models.splice(idx, 1);
                    markDirty();
                };

                const addNewBrandCatalog = () => {
                    const key = newBrandKeyInput.value.toUpperCase().trim();
                    if (!key) return;
                    if (modelsByBrand.value[key]) return;
                    
                    modelsByBrand.value[key] = {
                        label: newBrandLabelInput.value || key,
                        models: []
                    };
                    showAddBrandModal.value = false;
                    newBrandKeyInput.value = '';
                    newBrandLabelInput.value = '';
                    selectedBrandKey.value = key;
                    markDirty();
                };

                const confirmSyncModel = async () => {
                    if (!modelToSync.value || selectedRazonesForSync.value.length === 0) return;
                    
                    isSyncing.value = true;
                    // Serial execution to avoid rate limits? Parallel is fine for small numbers
                    const results = [];
                    try {
                        for(const razonKey of selectedRazonesForSync.value) {
                             const res = await fetch('/api/admin/hubspot-sync', {
                                 method: 'POST',
                                 headers: {'Content-Type': 'application/json'},
                                 body: JSON.stringify({
                                     action: 'add_model',
                                     razonKey: razonKey,
                                     data: {
                                         modelName: modelToSync.value,
                                         brandName: selectedBrandKey.value
                                     }
                                 })
                             });
                             results.push({ razon: razonKey, success: res.ok });
                        }
                        
                        const failures = results.filter(r => !r.success);
                        if(failures.length > 0) {
                            alert(\`Hubo problemas sincronizando con \${failures.length} razones sociales.\`);
                        } else {
                            alert('Modelo sincronizado exitosamente en todas las cuentas seleccionadas');
                            showSyncModelModal.value = false;
                            newModelInput.value = ''; // NOW clear it
                        }
                    } catch(e) {    
                        alert('Error fatal durante sync: ' + e.message);
                    } finally {
                        isSyncing.value = false;
                    }
                };

                // Watch for unsaved changes warning before leaving
                watch([razonesSociales, modelsByBrand], () => {
                    // Deep watch would be needed for full reactivity
                }, { deep: true });

                onMounted(() => {
                    fetchConfig();
                });

                return {
                    loading, saving, isSyncing, unsavedChanges, currentView,
                    razonesSociales, searchQuery,
                    // Razones
                    filteredRazones, selectedRazonKey, selectedRazon, isNewRazon, pendingNewKey,
                    selectRazon, createNewRazonSocial, deleteRazon, saveAll,
                    availableBrands, hasBrand, toggleBrand,
                    newDealerInput, addDealer, removeDealer, syncDealerToHubSpot,
                    configTab, newPipelineBrand, initPipelineMapping, addPipelineMapping, removePipelineMapping,
                    updateCustomProperties, syncProperties,
                    // Models
                    modelsByBrand, selectedBrandKey, selectedBrandModels, selectBrandModel,
                    newModelInput, addModel, removeModel,
                    showAddBrandModal, newBrandKeyInput, newBrandLabelInput, addNewBrandCatalog,
                    // Sync Models Modal
                    showSyncModelModal, modelToSync, selectedRazonesForSync, applicableRazonesForSync, confirmSyncModel
                };
            }
        }).mount('#app');
    </script>
</body>
</html>
 `;

    // 3. Send Response
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
};