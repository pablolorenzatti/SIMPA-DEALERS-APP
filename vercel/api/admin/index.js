module.exports = (req, res) => {
    const auth = req.headers.authorization;
    const user = process.env.ADMIN_USER || 'admin';
    const pass = process.env.ADMIN_PASS || 'simpa2025';
    const expectedAuth = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
    if (!auth || auth !== expectedAuth) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Simpa Admin"');
        return res.status(401).send('Authentication required.');
    }

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SIMPA Admin</title>
    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/@phosphor-icons/web"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/petite-vue@0.4.1/dist/petite-vue.iife.js" defer init></script>

    <script>
        tailwind.config = {
            theme: {
                extend: {
                    fontFamily: { sans: ['Inter', 'sans-serif'], mono: ['JetBrains Mono', 'monospace'] },
                    colors: {
                        apple: {
                            50: '#F5F5F7', 100: '#E8E8ED', 200: '#D2D2D7', 400: '#86868B', 600: '#1D1D1F',
                            action: '#0066CC', danger: '#FF3B30', success: '#34C759', warning: '#FF9500'
                        }
                    },
                    boxShadow: {
                        'soft': '0 4px 24px rgba(0,0,0,0.03)',
                        'card': '0 1px 3px rgba(0,0,0,0.05), 0 5px 15px rgba(0,0,0,0.02)',
                        'float': '0 8px 30px rgba(0,0,0,0.12)'
                    }
                }
            }
        }
    </script>
    <style>
        [v-cloak] { opacity: 0; }
        body { background-color: #F5F5F7; }
        .sidebar-link.active { background-color: white; color: black; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
        .glass { background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(0,0,0,0.05); }
        .code-block { background: #1e1e1e; color: #d4d4d4; font-family: 'JetBrains Mono', monospace; font-size: 13px; padding: 16px; border-radius: 12px; overflow-x: auto; }
        .json-key { color: #9cdcfe; } .json-string { color: #ce9178; } .json-number { color: #b5cea8; } .json-boolean { color: #569cd6; }
    </style>
</head>
<body class="text-apple-600 antialiased h-screen flex flex-col overflow-hidden">

    <div v-scope="App()" @vue:mounted="mounted" class="flex-1 flex flex-col h-full transition-opacity duration-500" v-cloak>
        
        <!-- Header -->
        <header class="glass h-16 shrink-0 z-20 flex items-center justify-between px-6 sticky top-0 md:px-8">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white">
                    <i class="ph ph-command text-lg"></i>
                </div>
                <h1 class="font-semibold text-lg tracking-tight text-black">SIMPA <span class="text-apple-400 font-normal">Connect</span></h1>
            </div>
            <div class="flex items-center gap-4">
                <div v-if="unsavedChanges" class="flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-xs font-medium border border-amber-100 animate-pulse">
                    <div class="w-1.5 h-1.5 rounded-full bg-amber-500"></div> Cambios sin guardar
                </div>
                <button @click="saveAll" :disabled="saving" class="bg-black hover:bg-gray-800 text-white px-5 py-2 rounded-full text-sm font-medium transition-all shadow-card flex items-center gap-2 disabled:opacity-50">
                    <i v-if="saving" class="ph ph-spinner animate-spin"></i> {{ saving ? 'Guardando...' : 'Guardar Cambios' }}
                </button>
            </div>
        </header>

        <div class="flex-1 flex overflow-hidden">
            <!-- Sidebar -->
            <nav class="w-64 bg-[#F5F5F7] p-6 flex flex-col gap-1 shrink-0 border-r border-[#E8E8ED]">
                <p class="text-xs font-semibold text-apple-400 uppercase tracking-wider mb-3 px-3">Plataforma</p>
                <a @click="currentView = 'dashboard'" :class="['sidebar-link px-3 py-2.5 rounded-lg flex items-center gap-3 text-sm font-medium cursor-pointer text-gray-500 hover:bg-white/50 transition-all', currentView === 'dashboard' ? 'active text-black' : '']">
                    <i class="ph ph-squares-four text-lg"></i> Dashboard
                </a>
                <a @click="currentView = 'razones'" :class="['sidebar-link px-3 py-2.5 rounded-lg flex items-center gap-3 text-sm font-medium cursor-pointer text-gray-500 hover:bg-white/50 transition-all', currentView === 'razones' ? 'active text-black' : '']">
                    <i class="ph ph-buildings text-lg"></i> Razones Sociales
                </a>
                <a @click="currentView = 'modelos'" :class="['sidebar-link px-3 py-2.5 rounded-lg flex items-center gap-3 text-sm font-medium cursor-pointer text-gray-500 hover:bg-white/50 transition-all', currentView === 'modelos' ? 'active text-black' : '']">
                    <i class="ph ph-motorcycle text-lg"></i> Catálogo Modelos
                </a>
                
                <p class="text-xs font-semibold text-apple-400 uppercase tracking-wider mb-3 mt-6 px-3">Herramientas</p>
                <a @click="currentView = 'simulator'" :class="['sidebar-link px-3 py-2.5 rounded-lg flex items-center gap-3 text-sm font-medium cursor-pointer text-gray-500 hover:bg-white/50 transition-all', currentView === 'simulator' ? 'active text-black' : '']">
                    <i class="ph ph-flask text-lg"></i> Simulador
                </a>
            </nav>

            <main class="flex-1 overflow-y-auto p-8 md:p-10 relative">
                
                <!-- DASHBOARD -->
                <div v-if="currentView === 'dashboard'" class="max-w-7xl mx-auto space-y-8">
                    <div class="flex justify-end mb-2">
                        <select v-model="selectedPeriod" @change="fetchDashboardStats" class="bg-white border-none rounded-xl shadow-sm text-sm font-medium py-2 px-4 focus:ring-0 cursor-pointer">
                            <option value="today">Hoy</option>
                            <option value="yesterday">Ayer</option>
                            <option value="7d">Últimos 7 días</option>
                            <option value="30d">Últimos 30 días</option>
                        </select>
                    </div>

                    <!-- KPI Cards -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div class="bg-white p-6 rounded-2xl shadow-card border border-gray-100 h-32 flex flex-col justify-between">
                            <div class="flex items-center gap-3 text-gray-500 text-sm font-medium">
                                <span class="p-1.5 bg-blue-50 text-blue-600 rounded-md"><i class="ph ph-chart-bar"></i></span> Leads Procesados
                            </div>
                            <div class="text-4xl font-bold text-black tracking-tight">{{ dashboardStats.summary?.stats?.total || 0 }}</div>
                        </div>
                        <div class="bg-white p-6 rounded-2xl shadow-card border border-gray-100 h-32 flex flex-col justify-between">
                            <div class="flex items-center gap-3 text-gray-500 text-sm font-medium">
                                <span class="p-1.5 bg-green-50 text-green-600 rounded-md"><i class="ph ph-check-circle"></i></span> Tasa de Éxito
                            </div>
                            <div class="text-4xl font-bold text-black tracking-tight flex items-baseline gap-2">
                                {{ calculateSuccessRate() }}%
                            </div>
                        </div>
                        <div class="bg-white p-6 rounded-2xl shadow-card border border-gray-100 h-32 flex flex-col justify-between">
                            <div class="flex items-center gap-3 text-gray-500 text-sm font-medium">
                                <span class="p-1.5 bg-red-50 text-red-600 rounded-md"><i class="ph ph-warning"></i></span> Errores
                            </div>
                            <div class="text-4xl font-bold text-red-500 tracking-tight">{{ dashboardStats.summary?.stats?.error || 0 }}</div>
                        </div>
                    </div>
                    
                    <!-- Top Errors Analysis -->
                    <div v-if="topErrors.length > 0" class="bg-white rounded-3xl shadow-soft border border-gray-100 p-6">
                        <h3 class="font-semibold text-black mb-4">Análisis de Errores (Top 5)</h3>
                        <div class="space-y-3">
                            <div v-for="err in topErrors" class="flex items-center justify-between text-sm p-3 bg-red-50/50 rounded-xl border border-red-50">
                                <span class="text-red-700 truncate flex-1 pr-4 font-medium">{{ err.msg }}</span>
                                <span class="bg-red-100 text-red-800 px-2 py-1 rounded-lg text-xs font-bold">{{ err.count }} eventos</span>
                            </div>
                        </div>
                    </div>

                    <!-- Logs Table -->
                    <!-- Logs Table -->
                    <div class="bg-white rounded-3xl shadow-soft border border-gray-100 overflow-hidden">
                        <div class="p-6 border-b border-gray-50">
                            <div class="flex justify-between items-center mb-4">
                                <h3 class="font-semibold text-black">Log de Actividad</h3>
                                <button @click="fetchDashboardStats" class="text-sm text-apple-action font-medium hover:underline">Actualizar</button>
                            </div>
                            <!-- Filters -->
                            <div class="flex gap-4 flex-wrap">
                                <select v-model="filterRazon" class="bg-gray-50 border-gray-200 rounded-lg text-xs py-1.5 px-3">
                                    <option value="">Todas las Razones</option>
                                    <option v-for="rs in uniqueRazonesInLogs" :value="rs">{{ rs }}</option>
                                </select>
                                <select v-model="filterBrand" class="bg-gray-50 border-gray-200 rounded-lg text-xs py-1.5 px-3">
                                    <option value="">Todas las Marcas</option>
                                    <option v-for="b in uniqueBrandsInLogs" :value="b">{{ b }}</option>
                                </select>
                                <select v-model="filterModel" class="bg-gray-50 border-gray-200 rounded-lg text-xs py-1.5 px-3 max-w-[150px]">
                                    <option value="">Todos los Modelos</option>
                                    <option v-for="m in catalogModelsForFilter" :value="m">{{ m }}</option>
                                </select>
                                <input v-model="filterDealer" placeholder="Filtrar por Dealer..." class="bg-gray-50 border-gray-200 rounded-lg text-xs py-1.5 px-3 w-48">
                                <select v-model="filterStatus" class="bg-gray-50 border-gray-200 rounded-lg text-xs py-1.5 px-3">
                                    <option value="">Todos los Estados</option>
                                    <option value="success">Exitosos</option>
                                    <option value="error">Errores</option>
                                </select>
                            </div>
                        </div>
                        <table class="w-full text-sm">
                            <thead class="bg-gray-50/50 text-gray-500 font-medium">
                                <tr>
                                    <th class="px-6 py-3 text-left">Hora (ARG)</th>
                                    <th class="px-6 py-3 text-left">Dealer</th>
                                    <th class="px-6 py-3 text-left">Marca</th>
                                    <th class="px-6 py-3 text-center">Estado</th>
                                    <th class="px-6 py-3 text-right">Acción</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-50">
                                <tr v-for="log in filteredLogs" class="hover:bg-gray-50/50 transition-colors group">
                                    <td class="px-6 py-4 font-mono text-xs text-gray-500">{{ formatTime(log.ts) }}</td>
                                    <td class="px-6 py-4 font-medium text-gray-900">{{ log.dealer }}</td>
                                    <td class="px-6 py-4 text-gray-500">{{ log.brand }}</td>
                                    <td class="px-6 py-4 text-center">
                                        <span v-if="log.status === 'success'" class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700">OK</span>
                                        <span v-else class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600">Fallo</span>
                                    </td>
                                    <td class="px-6 py-4 text-right">
                                        <button @click="openLogDetails(log)" class="text-apple-action hover:bg-blue-50 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
                                            Ver Detalle
                                        </button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <!-- OTHER VIEWS (Razones, Modelos, Simulator) - Kept same as before but minimal updates -->
                <div v-if="currentView === 'razones'" class="h-full flex gap-6">
                    <!-- Sidebar list... (Simplified for brevity, same logic) -->
                    <div class="w-72 flex flex-col gap-4">
                        <div class="bg-white p-2 rounded-xl border border-gray-200 shadow-sm flex items-center gap-2">
                             <input v-model="searchQuery" placeholder="Buscar razón social..." class="w-full text-sm bg-transparent !shadow-none !ring-0 px-2">
                        </div>
                        <button @click="createNewRazon" class="w-full py-3 bg-black text-white rounded-xl font-medium text-sm shadow-lg">+ Nueva</button>
                        <div class="flex-1 overflow-y-auto pr-1 space-y-2">
                             <div v-for="(rs, key) in filteredRazones" @click="selectRazon(key)" 
                                :class="['p-4 rounded-xl cursor-pointer transition-all border', selectedRazonKey === key ? 'bg-white border-apple-action shadow-card ring-1 ring-apple-action/20' : 'bg-white border-transparent hover:border-gray-200 text-gray-500']">
                                <h3 :class="['font-semibold text-sm mb-1', selectedRazonKey === key ? 'text-apple-action' : 'text-gray-900']">{{ key }}</h3>
                                <div class="flex flex-wrap gap-1">
                                    <span v-for="b in (rs.brands || []).slice(0,3)" class="text-[10px] bg-gray-100 px-2 py-0.5 rounded text-gray-500">{{ b }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <!-- Editor... -->
                     <div v-if="selectedRazon" class="flex-1 bg-white rounded-3xl shadow-card border border-gray-100 p-8 overflow-y-auto">
                        <div class="flex justify-between items-start mb-8 pb-4 border-b border-gray-50">
                            <div>
                                <label class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 block">Razón Social ID</label>
                                <input v-if="isNewRazon" v-model="pendingNewKey" class="text-3xl font-bold bg-gray-50 border-b-2 border-apple-action px-2 py-1 rounded-t w-full" placeholder="NOMBRE">
                                <h2 v-else class="text-3xl font-bold text-gray-900">{{ selectedRazonKey }}</h2>
                            </div>
                            <button v-if="!isNewRazon" @click="deleteRazon" class="text-gray-400 hover:text-red-500"><i class="ph ph-trash text-xl"></i></button>
                        </div>
                        <div class="grid grid-cols-2 gap-8 mb-8">
                             <div class="space-y-2">
                                <label class="text-sm font-semibold text-gray-700">Portal ID</label>
                                <input v-model="selectedRazon.portalId" class="w-full bg-gray-50 p-3 rounded-xl text-sm border-0">
                            </div>
                             <div class="space-y-2">
                                <label class="text-sm font-semibold text-gray-700">Env Var Token</label>
                                <input v-model="selectedRazon.tokenEnv" class="w-full bg-gray-50 p-3 rounded-xl text-sm border-0 font-mono">
                            </div>
                        </div>
                        <div class="space-y-6">
                            <h3 class="text-lg font-semibold text-gray-900">Marcas</h3>
                             <div class="flex flex-wrap gap-2 mb-4">
                                <button v-for="brand in availableBrands" @click="toggleBrand(brand)"
                                    :class="['px-4 py-2 rounded-full text-sm font-medium transition-all border', (selectedRazon.brands || []).includes(brand) ? 'bg-black text-white border-black' : 'bg-white border-gray-200 text-gray-500']">
                                    {{ brand }}
                                </button>
                            </div>
                            <div v-if="(selectedRazon.brands || []).length > 0" class="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                                <p class="text-sm font-semibold mb-4 text-gray-500 uppercase">Pipeline Mapping</p>
                                <div v-for="brand in selectedRazon.brands" :key="brand" class="mb-4 last:mb-0 bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
                                    <div class="w-32 font-bold text-sm">{{ brand }}</div>
                                    <input :value="getPipeline(brand, 'pipeline')" @input="setPipeline(brand, 'pipeline', $event.target.value)" placeholder="Pipeline ID" class="flex-1 bg-gray-50 px-3 py-2 rounded-lg text-sm border-0">
                                    <input :value="getPipeline(brand, 'stage')" @input="setPipeline(brand, 'stage', $event.target.value)" placeholder="Stage ID" class="flex-1 bg-gray-50 px-3 py-2 rounded-lg text-sm border-0">
                                </div>
                            </div>
                        </div>
                        <div class="mt-8">
                             <h3 class="text-lg font-semibold text-gray-900 mb-4">Dealers Whitelist</h3>
                             <div class="flex flex-wrap gap-2 mb-3">
                                 <div v-for="(dealer, idx) in (selectedRazon.dealers || [])" class="bg-white border border-gray-200 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2">
                                     {{ dealer }} <button @click="removeDealer(idx)" class="text-gray-400 hover:text-red-500"><i class="ph ph-x"></i></button>
                                 </div>
                             </div>
                             <div class="flex gap-2">
                                 <input v-model="newDealerInput" @keyup.enter="addDealer" placeholder="Dealer..." class="flex-1 bg-gray-50 px-4 py-2 rounded-xl text-sm border-0">
                                 <button @click="addDealer" class="bg-gray-200 text-gray-700 px-4 py-2 rounded-xl text-sm font-semibold">Agregar</button>
                             </div>
                         </div>
                    </div>
                </div>
                
                <div v-if="currentView === 'modelos'" class="h-full flex gap-6">
                    <div class="w-64 bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden flex flex-col">
                        <div class="overflow-y-auto flex-1 p-2">
                            <div v-for="(data, key) in modelsByBrand" @click="selectedBrandKey = key" :class="['px-4 py-3 rounded-xl cursor-pointer text-sm font-medium mb-1', selectedBrandKey === key ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-50']">
                                {{ key }} <span class="float-right opacity-60 text-xs">{{ (data.models || []).length }}</span>
                            </div>
                        </div>
                        <div class="p-4 border-t border-gray-100 bg-gray-50/50">
                            <button @click="addNewBrand" class="w-full bg-white border border-gray-200 text-black px-4 py-2 rounded-xl text-sm font-semibold hover:bg-gray-50 shadow-sm transition-all">+ Nueva Marca</button>
                        </div>
                    </div>
                    <div v-if="selectedBrandKey" class="flex-1 bg-white rounded-3xl shadow-card border border-gray-100 p-8 overflow-y-auto">
                        <div class="flex justify-between items-center mb-6">
                            <h2 class="text-2xl font-bold text-black">{{ selectedBrandKey }}</h2>
                            <button @click="deleteBrand" class="text-gray-400 hover:text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1">
                                <i class="ph ph-trash"></i> Eliminar Marca
                            </button>
                        </div>
                         <div class="flex gap-3 mb-6 bg-gray-50 p-2 rounded-2xl border border-gray-100">
                            <input v-model="newModelInput" @keyup.enter="addModel" class="flex-1 bg-white border-0 rounded-xl px-4 py-3 text-sm focus:ring-0 shadow-sm" placeholder="Nuevo modelo...">
                            <button @click="addModel" class="bg-black text-white px-6 rounded-xl font-medium text-sm">Agregar</button>
                        </div>
                        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
                            <div v-for="(m, idx) in modelsByBrand[selectedBrandKey].models" class="group bg-white border border-gray-100 hover:border-apple-200 p-4 rounded-xl shadow-sm flex justify-between items-center text-sm font-medium">
                                {{ m }} <button @click="removeModel(idx)" class="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><i class="ph ph-trash"></i></button>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-if="currentView === 'simulator'" class="max-w-3xl mx-auto mt-10">
                    <div class="bg-white rounded-3xl shadow-soft border border-gray-100 p-10">
                        <h2 class="text-2xl font-bold text-black text-center mb-10">Simulador de Inferencia</h2>
                        <div class="space-y-6 max-w-lg mx-auto">
                            <input v-model="simDealer" class="w-full bg-gray-50 border-0 p-4 rounded-2xl text-lg focus:bg-white focus:ring-2 ring-blue-100" placeholder="Dealer Name (Input)">
                            <input v-model="simBrand" class="w-full bg-gray-50 border-0 p-4 rounded-2xl text-lg focus:bg-white focus:ring-2 ring-blue-100" placeholder="Brand (Optional)">
                            <button @click="runSimulation" class="w-full bg-apple-action text-white font-bold py-4 rounded-2xl shadow-lg text-lg">Ejecutar Prueba</button>
                        </div>
                        <div v-if="simResult" class="mt-10 bg-[#1e1e1e] rounded-2xl p-6 shadow-float relative">
                            <pre class="text-green-400 font-mono text-xs overflow-x-auto">{{ JSON.stringify(simResult, null, 2) }}</pre>
                        </div>
                    </div>
                </div>
            </main>
        </div>
        
        <!-- LOG DETAILS MODAL -->
        <div v-if="selectedLog" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" @click.self="selectedLog = null">
            <div class="bg-white rounded-3xl shadow-float max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-fade-in">
                <div class="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                    <div>
                        <h3 class="text-lg font-bold text-black flex items-center gap-2">
                            Detalle de Ejecución
                            <span v-if="selectedLog.status === 'success'" class="bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">Success</span>
                            <span v-else class="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">Error</span>
                        </h3>
                        <p class="text-xs text-gray-500 font-mono mt-1">{{ formatTime(selectedLog.ts) }} • {{ selectedLog.id }}</p>
                    </div>
                    <button @click="selectedLog = null" class="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50"><i class="ph ph-x"></i></button>
                </div>
                
                <div class="p-6 overflow-y-auto space-y-6">
                    <!-- Error Info -->
                    <div v-if="selectedLog.error" class="bg-red-50 border border-red-100 rounded-xl p-4">
                        <h4 class="text-red-800 font-bold text-sm mb-1 flex items-center gap-2"><i class="ph ph-warning-circle"></i> Error Reportado</h4>
                        <p class="text-red-700 text-sm leading-relaxed">{{ selectedLog.error }}</p>
                    </div>

                    <!-- Hubspot Info -->
                    <div class="grid grid-cols-2 gap-4">
                        <div class="bg-gray-50 p-4 rounded-xl border border-gray-100">
                             <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Deal Information</h4>
                             <div class="space-y-2 text-sm">
                                 <div class="flex justify-between"><span class="text-gray-500">Deal ID</span> <span class="font-mono text-black">{{ selectedLog.dealId || 'N/A' }}</span></div>
                                 <div class="flex justify-between"><span class="text-gray-500">Pipeline ID</span> <span class="font-mono text-black">{{ selectedLog.details?.pipelineId || 'N/A' }}</span></div>
                                  <div class="flex justify-between"><span class="text-gray-500">Contact ID</span> <span class="font-mono text-black">{{ selectedLog.details?.contactId || 'N/A' }}</span></div>
                             </div>
                             <a v-if="selectedLog.link" :href="selectedLog.link" target="_blank" class="mt-3 block text-center text-xs font-bold text-white bg-apple-action py-2 rounded-lg hover:bg-blue-700 transition-colors">
                                 Abrir en HubSpot ↗
                             </a>
                        </div>
                        <div class="bg-gray-50 p-4 rounded-xl border border-gray-100">
                             <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Context</h4>
                             <div class="space-y-2 text-sm">
                                 <div class="flex justify-between"><span class="text-gray-500">Dealer</span> <span class="font-medium text-black text-right truncate ml-2">{{ selectedLog.dealer }}</span></div>
                                 <div class="flex justify-between"><span class="text-gray-500">Marca</span> <span class="font-medium text-black text-right">{{ selectedLog.brand }}</span></div>
                                 <div class="flex justify-between"><span class="text-gray-500">Razón Social</span> <span class="font-medium text-black text-right truncate ml-2" :title="selectedLog.razon">{{ selectedLog.razon }}</span></div>
                             </div>
                        </div>
                    </div>

                     <!-- Raw Payload -->
                     <div v-if="selectedLog.details">
                        <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Extended Execution Data</h4>
                        <div class="bg-[#1e1e1e] rounded-xl p-4 overflow-x-auto text-[11px] font-mono text-blue-300 leading-relaxed">
                            <pre>{{ JSON.stringify(selectedLog.details, null, 2) }}</pre>
                        </div>
                     </div>
                </div>
            </div>
        </div>

    </div>

    <script>
        function App() {
            return {
                currentView: 'dashboard',
                loading: true,
                saving: false,
                unsavedChanges: false,
                selectedLog: null,
                
                razonesSociales: {},
                modelsByBrand: {},
                dashboardStats: { summary: { stats: { total: 0, error: 0 } }, history: [], recentLogs: [] },
                selectedPeriod: 'today',
                
                searchQuery: '',
                selectedRazonKey: null,
                selectedBrandKey: null,
                isNewRazon: false,
                pendingNewKey: '',
                newModelInput: '',
                newDealerInput: '',
                simDealer: '', simBrand: '', simResult: null,

                // Client-side Filters
                filterRazon: '',
                filterBrand: '',
                filterModel: '',
                filterDealer: '',
                filterStatus: '',

                mounted() {
                    this.fetchConfig();
                    this.fetchDashboardStats();
                },

                // Getters
                get filteredRazones() {
                    const q = this.searchQuery.toLowerCase();
                    const res = {};
                    Object.keys(this.razonesSociales).sort().forEach(k => {
                        if(k.toLowerCase().includes(q)) res[k] = this.razonesSociales[k];
                    });
                    return res;
                },
                get selectedRazon() { return this.selectedRazonKey ? this.razonesSociales[this.selectedRazonKey] : null; },
                get availableBrands() { return Object.keys(this.modelsByBrand).sort(); },
                
                // Analytics Helpers
                get filteredLogs() {
                    let logs = this.dashboardStats.recentLogs || [];
                    if (this.filterRazon) logs = logs.filter(l => l.razon === this.filterRazon);
                    if (this.filterBrand) logs = logs.filter(l => l.brand === this.filterBrand);
                    if (this.filterModel) logs = logs.filter(l => l.details?.inputFields?.contact_model === this.filterModel);
                    if (this.filterDealer) logs = logs.filter(l => l.dealer && l.dealer.toLowerCase().includes(this.filterDealer.toLowerCase()));
                    if (this.filterStatus) logs = logs.filter(l => l.status === this.filterStatus);
                    return logs;
                },
                get uniqueRazonesInLogs() {
                    const logs = this.dashboardStats.recentLogs || [];
                    return [...new Set(logs.map(l => l.razon).filter(Boolean))].sort();
                },
                get uniqueBrandsInLogs() {
                    const logs = this.dashboardStats.recentLogs || [];
                    return [...new Set(logs.map(l => l.brand).filter(Boolean))].sort(); // Could also merge with availableBrands
                },
                get catalogModelsForFilter() {
                    // If brand selected, return only models for that brand
                    if (this.filterBrand && this.modelsByBrand[this.filterBrand]) {
                         return (this.modelsByBrand[this.filterBrand].models || []).sort();
                    }
                    // Otherwise return ALL models from ALL brands in catalog
                    const allModels = new Set();
                    Object.values(this.modelsByBrand).forEach(b => {
                        if(b.models && Array.isArray(b.models)) {
                            b.models.forEach(m => allModels.add(m));
                        }
                    });
                    return [...allModels].sort();
                },
                get topErrors() {
                    const logs = this.filteredLogs || [];
                    const errorCounts = {};
                    logs.forEach(l => {
                        if(l.status === 'error' && l.error) {
                             // Simplify error message for cloud grouping (remove detailed IDs/timestamps if possible)
                             let msg = l.error.length > 60 ? l.error.substring(0, 60) + '...' : l.error;
                             errorCounts[msg] = (errorCounts[msg] || 0) + 1;
                        }
                    });
                    return Object.entries(errorCounts)
                        .map(([msg, count]) => ({ msg, count }))
                        .sort((a, b) => b.count - a.count)
                        .slice(0, 5);
                },

                async fetchConfig() {
                    try {
                        const res = await fetch('/api/admin/config');
                        const data = await res.json();
                        this.razonesSociales = data.razonesSociales || {};
                        this.modelsByBrand = data.modelsByBrand || {};
                        const brands = Object.keys(this.modelsByBrand);
                        if(brands.length > 0) this.selectedBrandKey = brands[0];
                    } catch(e) { console.error(e); }
                },
                
                async fetchDashboardStats() {
                    try {
                        const res = await fetch('/api/admin/stats?period=' + this.selectedPeriod);
                        if(res.ok) this.dashboardStats = await res.json();
                    } catch(e) {}
                },
                
                formatTime(ts) {
                    if(!ts) return '-';
                    try {
                        return new Date(ts).toLocaleString('es-AR', { 
                            timeZone: 'America/Argentina/Buenos_Aires',
                            hour: '2-digit', minute: '2-digit', second: '2-digit',
                            day: '2-digit', month: '2-digit'
                        });
                    } catch(e) { return ts; }
                },
                
                calculateSuccessRate() {
                    const total = this.dashboardStats.summary?.stats?.total || 0;
                    const error = this.dashboardStats.summary?.stats?.error || 0;
                    if(total === 0) return 0;
                    return Math.round(((total - error) / total) * 100);
                },
                
                openLogDetails(log) {
                    this.selectedLog = log;
                },

                // Razones & Models Logic
                selectRazon(key) { this.selectedRazonKey = key; this.isNewRazon = false; },
                createNewRazon() { this.isNewRazon = true; this.selectedRazonKey = 'NEW'; this.razonesSociales['NEW'] = { brands: [], dealers: [], pipelineMapping: {} }; },
                deleteRazon() { if(!confirm('¿Eliminar?')) return; delete this.razonesSociales[this.selectedRazonKey]; this.selectedRazonKey = null; this.markDirty(); },
                toggleBrand(brand) {
                    if(!this.selectedRazon) return;
                    if(!this.selectedRazon.brands) this.selectedRazon.brands = [];
                    const idx = this.selectedRazon.brands.indexOf(brand);
                    if(idx > -1) {
                         this.selectedRazon.brands.splice(idx, 1);
                         if(this.selectedRazon.pipelineMapping) delete this.selectedRazon.pipelineMapping[brand];
                    } else {
                         this.selectedRazon.brands.push(brand);
                         if(!this.selectedRazon.pipelineMapping) this.selectedRazon.pipelineMapping = {};
                         this.selectedRazon.pipelineMapping[brand] = { pipeline: '', stage: '' };
                    }
                    this.markDirty();
                },
                getPipeline(brand, field) { return this.selectedRazon.pipelineMapping?.[brand]?.[field] || ''; },
                setPipeline(brand, field, value) {
                     if(!this.selectedRazon.pipelineMapping) this.selectedRazon.pipelineMapping = {};
                     if(!this.selectedRazon.pipelineMapping[brand]) this.selectedRazon.pipelineMapping[brand] = {};
                     this.selectedRazon.pipelineMapping[brand][field] = value;
                     this.markDirty();
                },
                addDealer() { if(!this.newDealerInput) return; this.selectedRazon.dealers = this.selectedRazon.dealers || []; this.selectedRazon.dealers.push(this.newDealerInput); this.newDealerInput = ''; this.markDirty(); },
                removeDealer(idx) { this.selectedRazon.dealers.splice(idx, 1); this.markDirty(); },
                addModel() { if(!this.newModelInput) return; this.modelsByBrand[this.selectedBrandKey].models.push(this.newModelInput); this.newModelInput = ''; this.markDirty(); },
                removeModel(idx) { this.modelsByBrand[this.selectedBrandKey].models.splice(idx, 1); this.markDirty(); },

                
                // Brand Logic
                addNewBrand() {
                    const name = prompt("Nombre de la nueva marca:");
                    if (!name) return;
                    // Check if exists
                    const exists = Object.keys(this.modelsByBrand).some(k => k.toLowerCase() === name.toLowerCase());
                    if (exists) {
                        alert('Esta marca ya existe.');
                        return;
                    }

                    this.modelsByBrand[name] = { models: [] };
                    this.selectedBrandKey = name;
                    this.markDirty();
                },
                deleteBrand() {
                    if (!confirm('Seguro que deseas eliminar esta marca y sus modelos?')) return;
                    
                    delete this.modelsByBrand[this.selectedBrandKey];
                    // Also remove from any Razon Social that has it assigned
                    Object.values(this.razonesSociales).forEach(rs => {
                        if (rs.brands && Array.isArray(rs.brands)) {
                            rs.brands = rs.brands.filter(b => b !== this.selectedBrandKey);
                        }
                    });
                    this.selectedBrandKey = null;
                    this.markDirty();
                },
                markDirty() { this.unsavedChanges = true; },
                async saveAll() {
                    if(this.isNewRazon && this.pendingNewKey) {
                        const newKey = this.pendingNewKey.toUpperCase().trim();
                        this.razonesSociales[newKey] = JSON.parse(JSON.stringify(this.razonesSociales['NEW']));
                        delete this.razonesSociales['NEW'];
                        this.selectedRazonKey = newKey;
                        this.isNewRazon = false;
                    }
                    this.saving = true;
                    try {
                        await fetch('/api/admin/config', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ razonesSociales: this.razonesSociales, modelsByBrand: this.modelsByBrand }) });
                        this.unsavedChanges = false;
                        setTimeout(() => this.saving = false, 500);
                    } catch(e) { alert('Error: ' + e.message); this.saving = false; }
                },
                async runSimulation() {
                     try {
                        const res = await fetch('/api/admin/simulate', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ dealerName: this.simDealer, brandName: this.simBrand }) });
                        this.simResult = await res.json();
                     } catch(e) { this.simResult = { error: e.message }; }
                }
            }
        }
    </script>
</body>
</html>
    `;
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
};