const AuthHelper = require('../_utils/auth-helper');

module.exports = (req, res) => {
    // Check Auth via Cookie
    const userSession = AuthHelper.verifyRequest(req);

    // If NOT authenticated, show Login Page
    if (!userSession) {
        const loginHtml = `
<!DOCTYPE html>
        <html lang="es">
            <head>
                <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Login - SIMPA Admin</title>
                        <script src="https://cdn.tailwindcss.com"></script>
                        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">
                        </head>
                        <body class="bg-gray-100 h-screen flex items-center justify-center font-['Inter']">
                            <div class="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full text-center">
                                <div class="mb-6 flex justify-center">
                                    <div class="w-16 h-16 bg-black rounded-xl flex items-center justify-center text-white text-2xl font-bold">S</div>
                                </div>
                                <h1 class="text-2xl font-bold text-gray-900 mb-2">SIMPA Admin</h1>
                                <p class="text-sm text-gray-500 mb-8">Acceso exclusivo para administradores del portal HubSpot.</p>

                                <a href="/api/auth" class="block w-full bg-[#ff7a59] hover:bg-[#ff8f73] text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2">
                                    <span>Iniciar Sesión con HubSpot</span>
                                </a>
                            </div>
                        </body>
                    </html>
                    `;
        return res.send(loginHtml);
    }

    // If authenticated, proceed to render Dashboard
    // userSession contains {portalId, userEmail, ... }


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
                                                        fontFamily: {sans: ['Inter', 'sans-serif'], mono: ['JetBrains Mono', 'monospace'] },
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
                                                <script>
                                                    window.onerror = function(msg, url, line) {
            // Ignorar errores de ResizeObserver que son benignos
            if(msg.includes('ResizeObserver')) return;
                                                    console.error('Global Error:', msg, line);
                                                    // Solo alertar si es crítico para la inicialización
                                                    if(msg.includes('App') || msg.includes('petite-vue')) alert('Error crítico: ' + msg);
        };
                                                </script>
                                                <style>
                                                    [v-cloak] {display: none !important; }
                                                    .hidden-force {display: none !important; }
                                                    body {background - color: #F5F5F7; }
                                                    .sidebar-link.active {background - color: white; color: black; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
                                                    .glass {background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(0,0,0,0.05); }
                                                    .code-block {background: #1e1e1e; color: #d4d4d4; font-family: 'JetBrains Mono', monospace; font-size: 13px; padding: 16px; border-radius: 12px; overflow-x: auto; }
                                                    .json-key {color: #9cdcfe; } .json-string {color: #ce9178; } .json-number {color: #b5cea8; } .json-boolean {color: #569cd6; }
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
                                                        <i v-if="saving" class="ph ph-spinner animate-spin"></i> {{ saving? 'Guardando...': 'Guardar Cambios' }}
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
                                        <a @click="currentView = 'webhooks'" :class="['sidebar-link px-3 py-2.5 rounded-lg flex items-center gap-3 text-sm font-medium cursor-pointer text-gray-500 hover:bg-white/50 transition-all', currentView === 'webhooks' ? 'active text-black' : '']">
                                        <i class="ph ph-broadcast text-lg"></i> Webhooks
                                    </a>

                                    <p class="text-xs font-semibold text-apple-400 uppercase tracking-wider mb-3 mt-6 px-3">Herramientas</p>
                                    <a @click="currentView = 'simulator'" :class="['sidebar-link px-3 py-2.5 rounded-lg flex items-center gap-3 text-sm font-medium cursor-pointer text-gray-500 hover:bg-white/50 transition-all', currentView === 'simulator' ? 'active text-black' : '']">
                                    <i class="ph ph-flask text-lg"></i> Simulador
                                </a>
                            </nav>

                            <main class="flex-1 overflow-y-auto p-8 md:p-10 relative min-w-0">

                                <!-- DASHBOARD -->
                                <div v-if="currentView === 'dashboard'" class="max-w-7xl mx-auto space-y-8">
                                    <!-- Removed top-right period selector -->

                                    <!-- Dashboard Header with Controls -->
                                    <div class="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-2">
                                        <div>
                                            <h2 class="text-2xl font-bold text-black tracking-tight">Resumen General</h2>
                                            <p class="text-sm text-gray-500">Métricas de procesamiento de leads.</p>
                                        </div>
                                        <div class="bg-white p-2 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
                                            <label class="flex items-center gap-2 cursor-pointer px-2 py-1 hover:bg-gray-50 rounded-lg transition-colors">
                                                <input type="checkbox" v-model="includeHistory" @change="fetchDashboardStats" class="rounded border-gray-300 text-black shadow-sm focus:ring-0">
                                                <span class="text-xs text-gray-600 font-medium">Historial Completo</span>
                                            </label>
                                            <div class="w-px h-4 bg-gray-200"></div>
                                            <button @click="resetHistory" class="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors" title="Limpiar logs y estadísticas">
                                            <i class="ph ph-trash text-lg"></i>
                                        </button>
                                    </div>
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

                                <!-- REPORT CHARTS SECTION -->
                                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    <!-- Chart: Distribution by Brand -->
                                    <div class="bg-white p-5 rounded-2xl shadow-card border border-gray-100 flex flex-col">
                                        <h3 class="text-sm font-semibold text-gray-500 mb-4">Leads por Marca</h3>
                                        <div class="flex-1 min-h-[200px] relative">
                                            <canvas id="chartBrands"></canvas>
                                        </div>
                                    </div>

                                    <!-- Chart: Top Razones -->
                                    <div class="bg-white p-5 rounded-2xl shadow-card border border-gray-100 flex flex-col">
                                        <h3 class="text-sm font-semibold text-gray-500 mb-4">Top Razones Sociales</h3>
                                        <div class="flex-1 min-h-[200px] relative">
                                            <canvas id="chartRazones"></canvas>
                                        </div>
                                    </div>

                                    <!-- Chart: Daily Trend -->
                                    <div class="bg-white p-5 rounded-2xl shadow-card border border-gray-100 flex flex-col lg:col-span-2">
                                        <h3 class="text-sm font-semibold text-gray-500 mb-4">Tendencia Diaria</h3>
                                        <div class="flex-1 min-h-[200px] relative">
                                            <canvas id="chartTrend"></canvas>
                                        </div>
                                    </div>
                                </div>

                                <!-- Collapsible Top Errors Analysis -->
                                <div v-if="topErrors.length > 0" class="bg-white rounded-3xl shadow-soft border border-gray-100 overflow-hidden transition-all duration-300">
                                    <div class="p-6 flex justify-between items-center bg-gray-50/50">
                                        <div @click="showErrors = !showErrors" class="flex-1 cursor-pointer flex items-center gap-2">
                                        <h3 class="font-semibold text-black flex items-center gap-2">
                                            <i class="ph ph-warning-circle text-red-500"></i> Análisis de Errores (Top 5)
                                        </h3>
                                        <i :class="['ph text-lg text-gray-400 transition-transform duration-300', showErrors ? 'ph-caret-up' : 'ph-caret-down']"></i>
                                </div>
                            </div>
                            <div v-show="showErrors" class="px-6 pb-6 space-y-3">
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
                            <!-- Unified Filters Bar -->
                            <div class="flex flex-col lg:flex-row gap-3 lg:items-center">
                                <!-- Period Group -->
                                <div class="flex items-center justify-between lg:justify-start gap-2 lg:border-r border-gray-200 lg:pr-3 shrink-0">
                                    <span class="text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Período</span>
                                    <select v-model="selectedPeriod" @change="fetchDashboardStats" class="bg-gray-100 border-transparent rounded-lg text-xs py-1.5 px-3 font-semibold text-gray-700 cursor-pointer focus:ring-0 w-32 lg:w-auto">
                                    <option value="today">Hoy</option>
                                    <option value="yesterday">Ayer</option>
                                    <option value="7d">Últimos 7 días</option>
                                    <option value="30d">Últimos 30 días</option>
                                </select>
                            </div>

                            <!-- Main Filters Grid -->
                            <div class="grid grid-cols-2 lg:flex lg:flex-nowrap gap-2 w-full lg:w-auto flex-1">
                                <select v-model="filterRazon" class="bg-gray-50 border-gray-200 rounded-lg text-xs py-1.5 px-3 w-full lg:w-40 xl:w-56 truncate">
                                    <option value="">Todas las Razones</option>
                                    <option v-for="rs in uniqueRazonesInLogs" :value="rs">{{ rs }}</option>
                            </select>
                            <select v-model="filterBrand" class="bg-gray-50 border-gray-200 rounded-lg text-xs py-1.5 px-3 w-full lg:w-32 truncate">
                                <option value="">Todas las Marcas</option>
                                <option v-for="b in uniqueBrandsInLogs" :value="b">{{ b }}</option>
                        </select>
                        <select v-model="filterModel" class="bg-gray-50 border-gray-200 rounded-lg text-xs py-1.5 px-3 w-full lg:w-36 truncate">
                            <option value="">Todos los Modelos</option>
                            <option v-for="m in catalogModelsForFilter" :value="m">{{ m }}</option>
                    </select>
                    <input v-model="filterDealer" placeholder="Buscar Dealer..." class="bg-gray-50 border-gray-200 rounded-lg text-xs py-1.5 px-3 w-full lg:flex-1 min-w-[100px]">
                        <select v-model="filterStatus" class="bg-gray-50 border-gray-200 rounded-lg text-xs py-1.5 px-3 w-full lg:w-32 col-span-2 lg:col-span-1">
                            <option value="">Estado: Todos</option>
                            <option value="success">Exitosos</option>
                            <option value="error">Errores</option>
                        </select>
                    </div>
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
                    </div >
                </div >
                
                <!-- OTHER VIEWS(Razones, Modelos, Simulator) - Kept same as before but minimal updates -->
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
                        </div >
                    </div >
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
                            </div >
                        </div >
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
                             </div >
                         </div >
                    </div >
                </div >

    <div v-if="currentView === 'modelos'" class="h-full flex gap-6">
        <div class="w-64 bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden flex flex-col">
            <div class="overflow-y-auto flex-1 p-2">
                <div v-for="(data, key) in modelsByBrand" @click="selectedBrandKey = key" :class="['px-4 py-3 rounded-xl cursor-pointer text-sm font-medium mb-1', selectedBrandKey === key ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-50']">
                {{ key }} <span class="float-right opacity-60 text-xs">{{ (data.models || []).length}}</span>
            </div>
        </div>
        <div class="p-4 border-t border-gray-100 bg-gray-50/50">
            <button @click="addNewBrand" class="w-full bg-white border border-gray-200 text-black px-4 py-2 rounded-xl text-sm font-semibold hover:bg-gray-50 shadow-sm transition-all">+ Nueva Marca</button>
    </div>
                    </div >
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
                        </div >
    <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div v-for="(m, idx) in modelsByBrand[selectedBrandKey].models" class="group bg-white border border-gray-100 hover:border-apple-200 p-4 rounded-xl shadow-sm flex justify-between items-center text-sm font-medium">
            {{ m }} <button @click="removeModel(idx)" class="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><i class="ph ph-trash"></i></button>
    </div>
                        </div >
                    </div >
                </div >

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

                <!-- Webhooks / Monitor View -->
                <div v-if="currentView === 'webhooks'" class="max-w-5xl mx-auto space-y-8">
                     
                    <!-- Config Section -->
                    <div class="bg-white rounded-3xl shadow-card border border-gray-100 p-8">
                        <div class="flex justify-between items-start mb-6">
                            <div>
                                <h2 class="text-2xl font-bold text-black mb-2">Monitoreo de Propiedades</h2>
                                <p class="text-sm text-gray-500">Configura qué propiedades de HubSpot supervisar para cambios en sus opciones.</p>
                            </div>
                            <button @click="checkMonitorNow" class="bg-black text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-gray-800 transition-colors">
                                <i class="ph ph-arrow-clockwise"></i> Verificar Ahora
                            </button>
                        </div>
                        
                        <div class="mb-8">
                             <div class="flex gap-2 max-w-md mb-4">
                                 <input v-model="newPropertyMonitor" @keyup.enter="addMonitoredProperty" placeholder="Nombre interno (ej: modelo_simpa)" class="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm focus:ring-2 ring-black/5 outline-none font-mono">
                                 <button @click="addMonitoredProperty" class="bg-gray-200 text-gray-700 hover:bg-gray-300 px-4 py-2 rounded-xl text-sm font-bold transition-colors">Agregar</button>
                             </div>
                             
                             <div class="grid grid-cols-1 gap-4">
                                <div v-for="prop in monitoredProperties" class="bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
                                    <div @click="togglePropDetail(prop)" class="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-100/50 transition-colors">
                                        <div class="flex items-center gap-3">
                                            <span class="font-bold text-sm text-black">{{ prop }}</span>
                                            <!-- Check snapshot for stats -->
                                            <span v-if="getSnapshotCount(prop) > 0" class="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Synced: {{ getSnapshotCount(prop) }}</span>
                                            <span v-else class="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Pending / Validating</span>
                                        </div>
                                        <div class="flex items-center gap-3">
                                             <button @click.stop="removeMonitoredProperty(prop)" class="text-gray-400 hover:text-red-500 transition-colors"><i class="ph ph-trash text-lg"></i></button>
                                             <i :class="['ph text-gray-400 transition-transform', expandedProp === prop ? 'ph-caret-up' : 'ph-caret-down']"></i>
                                        </div>
                                    </div>
                                    <div v-if="expandedProp === prop" class="px-4 pb-4 border-t border-gray-100 bg-white p-4">
                                        
                                    <div v-if="expandedProp === prop" class="px-4 pb-4 border-t border-gray-100 bg-white p-4">
                                        
                                        <!-- APP COMPARISON ALERTS -->
                                        <div v-if="getMissingInHS(prop, 'deals').length > 0" class="mb-4 bg-red-50 border border-red-100 p-3 rounded-xl flex items-start gap-3">
                                            <i class="ph ph-warning-circle text-red-500 text-lg mt-0.5"></i>
                                            <div class="flex-1">
                                                <h4 class="text-sm font-bold text-red-800">Faltantes en HubSpot Deals (vs App Config)</h4>
                                                <p class="text-xs text-red-600 mb-2">Las siguientes opciones están en la configuración de la App de SIMPA pero NO existen en la propiedad de HubSpot Deals:</p>
                                                <div class="flex flex-wrap gap-1">
                                                    <span v-for="m in getMissingInHS(prop, 'deals')" class="px-1.5 py-0.5 bg-white border border-red-200 rounded text-[10px] text-red-700 font-mono">{{ m.value }}</span>
                                                </div>
                                            </div>
                                        </div>

                                         <div v-if="getMissingInHS(prop, 'contacts').length > 0" class="mb-4 bg-orange-50 border border-orange-100 p-3 rounded-xl flex items-start gap-3">
                                            <i class="ph ph-warning-circle text-orange-500 text-lg mt-0.5"></i>
                                            <div class="flex-1">
                                                <h4 class="text-sm font-bold text-orange-800">Faltantes en HubSpot Contacts (vs App Config)</h4>
                                                <div class="flex flex-wrap gap-1 mt-1">
                                                    <span v-for="m in getMissingInHS(prop, 'contacts')" class="px-1.5 py-0.5 bg-white border border-orange-200 rounded text-[10px] text-orange-700 font-mono">{{ m.value }}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            
                                            <!-- DEALS COLUMN -->
                                            <div class="bg-gray-50 rounded-xl border border-gray-200 p-3 flex flex-col h-96">
                                                <div class="flex justify-between items-center mb-2 pb-2 border-b border-gray-200">
                                                    <h5 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Deals Options ({{ getSnapshotCount(prop, 'deals') }})</h5>
                                                </div>
                                                
                                                <!-- List -->
                                                <div class="flex-1 overflow-y-auto space-y-1 p-1">
                                                    <div v-for="opt in getSnapshotOptions(prop, 'deals')" 
                                                        class="flex items-center gap-2 p-1.5 rounded-lg text-xs font-mono border bg-white border-transparent hover:bg-gray-100">
                                                        <span class="flex-1 truncate" :title="opt.value">{{ opt.value }}</span>
                                                        
                                                        <!-- Indicators -->
                                                        <span v-if="!hasOption(prop, 'contacts', opt.value)" title="Falta en Contactos" class="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-[9px] font-bold">MISSING IN CONTACTS</span>
                                                    </div>
                                                    <div v-if="getSnapshotCount(prop, 'deals') === 0" class="text-gray-400 text-center italic py-10 text-xs">Sin opciones registradas</div>
                                                </div>
                                            </div>

                                            <!-- CONTACTS COLUMN -->
                                            <div class="bg-gray-50 rounded-xl border border-gray-200 p-3 flex flex-col h-96">
                                                <div class="flex justify-between items-center mb-2 pb-2 border-b border-gray-200">
                                                    <h5 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Contacts Options ({{ getSnapshotCount(prop, 'contacts') }})</h5>
                                                </div>
                                                
                                                <!-- List -->
                                                <div class="flex-1 overflow-y-auto space-y-1 p-1">
                                                    <div v-for="opt in getSnapshotOptions(prop, 'contacts')" 
                                                        class="flex items-center gap-2 p-1.5 rounded-lg text-xs font-mono border bg-white border-transparent hover:bg-gray-100">
                                                        <span class="flex-1 truncate" :title="opt.value">{{ opt.value }}</span>
                                                        
                                                        <!-- Indicators -->
                                                         <span v-if="!hasOption(prop, 'deals', opt.value)" title="Falta en Negocios" class="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[9px] font-bold">MISSING IN DEALS</span>
                                                    </div>
                                                    <div v-if="getSnapshotCount(prop, 'contacts') === 0" class="text-gray-400 text-center italic py-10 text-xs">Sin opciones registradas</div>
                                                </div>
                                            </div>

                                        </div>

                                        <div class="mt-4 pt-4 border-t border-gray-100 flex justify-end text-xs text-gray-400 italic">
                                            Edición y eliminación de opciones deshabilitada en esta vista. Realizar cambios directamente en HubSpot.
                                        </div>
                                    </div >
                                </div >
                             </div >
                        </div >
                    </div >

                    <!-- Logs Section -->
    <div class="bg-white rounded-3xl shadow-card border border-gray-100 overflow-hidden">
        <div class="p-6 border-b border-gray-50 flex justify-between items-center">
            <h3 class="font-bold text-lg text-black">Historial de Cambios Detectados</h3>
        </div>
        <table class="w-full text-sm">
            <thead class="bg-gray-50/50 text-gray-500 font-medium">
                <tr>
                    <th class="px-6 py-3 text-left">Fecha</th>
                    <th class="px-6 py-3 text-left">Propiedad</th>
                    <th class="px-6 py-3 text-left">Tipo Cambio</th>
                    <th class="px-6 py-3 text-left">Detalles</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-50">
                <tr v-if="monitorLogs.length === 0">
                    <td colspan="4" class="px-6 py-8 text-center text-gray-400 italic">No hay cambios registrados recientemente.</td>
                </tr>
                <tr v-for="log in monitorLogs" class="hover:bg-gray-50/50 transition-colors">
                    <td class="px-6 py-4 font-mono text-xs text-gray-500">{{ formatTime(log.timestamp) }}</td>
                    <td class="px-6 py-4 font-mono font-medium text-black">{{ log.property }}</td>
                    <td class="px-6 py-4">
                        <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-600">{{ log.type }}</span>
                    </td>
                    <td class="px-6 py-4">
                        <div class="text-xs text-gray-600">
                            <span class="font-bold text-gray-900">{{ log.count }}</span> opciones nuevas:
                            <span class="font-mono text-gray-500 ml-1">{{ (log.changes || []).join(', ')}}</span>
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
                
                </div >
            </main >
        </div >
        
        <!-- LOG DETAILS MODAL -->
        <!-- Added hidden-force class to ensure it is hidden if Vue fails or before load. :class logic removes it. -->
    <div :class="['fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm', selectedLog ? '' : 'hidden-force']" v-if="selectedLog" @click.self="selectedLog = null">
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
                    <!-- ... Details ... -->
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
                    </div >

        <!-- Raw Payload -->
    <div v-if="selectedLog.details">
        <h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Extended Execution Data</h4>
        <div class="bg-[#1e1e1e] rounded-xl p-4 overflow-x-auto text-[11px] font-mono text-blue-300 leading-relaxed">
            <pre>{{ JSON.stringify(selectedLog.details, null, 2) }}</pre>
        </div>
    </div>
                </div >
            </div >
        </div >

    </div >

    <script>
        function App() {
            return {
            currentView: 'dashboard',
        loading: true,
        saving: false,
        unsavedChanges: false,
        selectedLog: null,

        razonesSociales: { },
        modelsByBrand: { },
        dashboardStats: {summary: {stats: {total: 0, error: 0 } }, history: [], recentLogs: [] },

        selectedPeriod: 'today',
        includeHistory: false,
        charts: { },

        searchQuery: '',
        selectedRazonKey: null,
        selectedBrandKey: null,
        isNewRazon: false,
        pendingNewKey: '',
        newModelInput: '',
        newDealerInput: '',
        simDealer: '', simBrand: '', simResult: null,
        showErrors: true,

        // Webhooks
        monitoredProperties: [],
        monitorLogs: [],
        monitorSnapshot: { }, // New snapshot data
        newPropertyMonitor: '',
        expandedProp: null,

        // Client-side Filters
        filterRazon: '',
        filterBrand: '',
        filterModel: '',
        filterDealer: '',
        filterStatus: '',

        mounted() {
            this.fetchConfig();
        this.fetchDashboardStats();
        this.fetchMonitorData();
                },

        // Getters
        get filteredRazones() {
                    const q = this.searchQuery.toLowerCase();
        const res = { };
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
        const errorCounts = { };
                    logs.forEach(l => {
                        if(l.status === 'error' && l.error) {
            // Simplify error message for cloud grouping (remove detailed IDs/timestamps if possible)
            let msg = l.error.length > 60 ? l.error.substring(0, 60) + '...' : l.error;
        errorCounts[msg] = (errorCounts[msg] || 0) + 1;
                        }
                    });
        return Object.entries(errorCounts)
                        .map(([msg, count]) => ({msg, count}))
                        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
                },

        async fetchConfig() {
                    try {
                        const res = await fetch('/api/admin/api?action=config');
        const data = await res.json();
        this.razonesSociales = data.razonesSociales || { };
        this.modelsByBrand = data.modelsByBrand || { };
        const brands = Object.keys(this.modelsByBrand);
                        if(brands.length > 0) this.selectedBrandKey = brands[0];
                    } catch(e) {console.error(e); }
                },

        async fetchDashboardStats() {
                    try {
                        const res = await fetch('/api/admin/api?action=stats&period=' + this.selectedPeriod + '&includeHistory=' + this.includeHistory);
        if(res.ok) {
            this.dashboardStats = await res.json();
                            this.$nextTick(() => {this.renderCharts(); });
                        }
                    } catch(e) { }
                },

        async fetchMonitorData() {
                    try {
                        const res = await fetch('/api/admin/api?action=monitor');
        if (res.ok) {
                            const data = await res.json();
        this.monitoredProperties = data.monitoredProperties || [];
        this.monitorLogs = data.logs || [];
        this.monitorSnapshot = data.snapshot || { };
                        }
                    } catch(e) {console.error('Monitor fetch error', e); }
                },

        async addMonitoredProperty() {
                    if(!this.newPropertyMonitor) return;
        try {
            await fetch('/api/admin/api?action=monitor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subAction: 'add', property: this.newPropertyMonitor })
            });
        this.newPropertyMonitor = '';
        this.fetchMonitorData();
                    } catch(e) { }
                },

        async removeMonitoredProperty(prop) {
                    if(!confirm('¿Dejar de monitorear ' + prop + '?')) return;
        try {
            await fetch('/api/admin/api?action=monitor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subAction: 'remove', property: prop })
            });
        this.fetchMonitorData();
                    } catch(e) { }
                },

        togglePropDetail(prop) {
            this.expandedProp = this.expandedProp === prop ? null : prop;
                },

        getSnapshotCount(prop, objType) {
                    const key = prop + ':' + objType;
        if(this.monitorSnapshot && this.monitorSnapshot[key]) return this.monitorSnapshot[key].length;
        return 0;
                },

        getSnapshotOptions(prop, objType) {
                    const key = prop + ':' + objType;
        return (this.monitorSnapshot && this.monitorSnapshot[key]) ? this.monitorSnapshot[key] : [];
                },

        // --- OPTION MANAGEMENT ---

        hasOption(prop, objType, val) {
                    const key = prop + ':' + objType;
        const opts = this.monitorSnapshot[key];
        if (!opts) return false;
                    return opts.some(o => o.value === val);
                },

        // (Selection and Action methods removed as per request for read-only visual comparison)


        // --- APP CONFIG VALIDATION ---
        getAppConfigComparison(prop) {
            prop = prop.toLowerCase();

        // 1. Dealers (Concesionarios)
        // Matches 'concesionarios' or 'concesionarios_simpa'
        if (prop.includes('concesionarios')) {
                         const appDealers = new Set();
        if (this.razonesSociales) {
            Object.values(this.razonesSociales).forEach(groupConfig => {
                if (groupConfig.dealers && Array.isArray(groupConfig.dealers)) {
                    groupConfig.dealers.forEach(d => appDealers.add(d));
                }
            });
                         }
        return {type: 'Dealers (Razones Sociales)', values: appDealers };
                     }

        // 2. Brands (Marca)
        // Matches 'marca' or 'marca_simpa'
        if (prop.includes('marca')) {
                         const appBrands = new Set();
        if (this.razonesSociales) {
            Object.values(this.razonesSociales).forEach(groupConfig => {
                if (groupConfig.brands && Array.isArray(groupConfig.brands)) {
                    groupConfig.brands.forEach(b => appBrands.add(b));
                }
            });
                         }
        // Also checking modelsByBrand keys as a secondary source of truth for brands
        if (this.modelsByBrand) {
            Object.keys(this.modelsByBrand).forEach(b => appBrands.add(b));
                         }
        return {type: 'Brands (from Razones + Models)', values: appBrands };
                     }

        // 3. Models (Modelos)
        // Matches 'modelos', 'modelo_simpa'
        if (prop.includes('model') && !prop.includes('anio')) {
                         const appModels = new Set();
        if (this.modelsByBrand) {
            Object.values(this.modelsByBrand).forEach(brandData => {
                if (brandData.models && Array.isArray(brandData.models)) {
                    brandData.models.forEach(m => appModels.add(m));
                }
            });
                         }
        return {type: 'Models (Catalogo)', values: appModels };
                     }

        return null;
                },

        getMissingInApp(prop, objType) {
                     const comparison = this.getAppConfigComparison(prop);
        if (!comparison) return [];
        const options = this.getSnapshotOptions(prop, objType);
                     // Find options in HS that are NOT in App Config
                     return options.filter(o => !comparison.values.has(o.value));
                },

        getMissingInHS(prop, objType) {
                     const comparison = this.getAppConfigComparison(prop);
        if (!comparison) return [];
                     const options = new Set(this.getSnapshotOptions(prop, objType).map(o=>o.value));
                     // Find values in App Config that are NOT in HS
                     return Array.from(comparison.values).filter(v => !options.has(v)).map(v => ({value: v, label: v }));
                },


        async checkMonitorNow() {
                    try {
            alert('Iniciando verificación...');
        const res = await fetch('/api/admin/api?action=monitor', {
            method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({subAction: 'check' })
                        });
        const data = await res.json();

        // Update local data immediately if returned
        if(data.result && data.result.snapshot) {
            this.monitorSnapshot = data.result.snapshot;
                        } else {
            this.fetchMonitorData();
                        }

        if(data.result) {
                            if (data.result.error) {
            alert('Error de Configuración: ' + data.result.error);
                            } else {
            let msg = 'Verificación completa.\\nRevisados: ' + (data.result.checked || 0);
                                if(data.result.changes && data.result.changes.length > 0) msg += '\\nCambios detectados: ' + data.result.changes.length;
                                if(data.result.errors && data.result.errors.length > 0) msg += '\\nErrores: ' + data.result.errors.length;
        if(data.result.portalId) msg += '\\nHubSpot Portal ID: ' + data.result.portalId;
        console.log('[Monitor Check Result]', data.result);
        alert(msg);
                            }
                        } else {
            alert('Verificación finalizada.');
                        }
                    } catch(e) {console.error(e); alert('Error: ' + e.message); }
                },

        async syncPropertyOptions(prop) {
                    if(!confirm('¿Estás seguro de sincronizar las opciones de "' + prop + '" hacia HubSpot ? Esto agregará las opciones faltantes definidas en SIMPA.')) return;

        try {
                        const res = await fetch('/api/admin/api?action=monitor', {
            method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({subAction: 'sync', property: prop })
                        });
        const data = await res.json();
        console.log('[Sync Result]', data);
        if (data.result && data.result.success) {
            alert('Sincronización Exitosa.\\nAgregadas: ' + data.result.totalSynced + '\\nErrores: ' + data.result.errors.length);
                            if (data.result.errors.length > 0) console.error('Sync Errors:', data.result.errors);
        this.checkMonitorNow(); // Refresh
                        } else {
            alert('Error sincronizando: ' + (data.error || (data.result && data.result.error) || 'Unknown error'));
                        }
                    
                    } catch(e) {
            alert('Error de red/servidor: ' + e.message);
                    }
                },

        renderCharts() {
                    if (typeof Chart === 'undefined') return;

        const ctxBrands = document.getElementById('chartBrands');
        const ctxRazones = document.getElementById('chartRazones');
        const ctxTrend = document.getElementById('chartTrend');

        // --- Helpers for aggregation ---
        const logs = this.filteredLogs || [];

        // 1. Brands Distribution
        const brandCounts = { };
                    logs.forEach(l => { 
                        const b = l.brand || 'N/A';
        brandCounts[b] = (brandCounts[b] || 0) + 1; 
                    });
        const brandsLabels = Object.keys(brandCounts);
        const brandsData = Object.values(brandCounts);

        // 2. Razones Social Distribution
        const razonCounts = { };
                    logs.forEach(l => {
                        const r = l.razon || 'N/A';
        razonCounts[r] = (razonCounts[r] || 0) + 1;
                    });
                     // Sort top 5
                    const sortedRazones = Object.entries(razonCounts).sort((a,b) => b[1] - a[1]).slice(0, 5);
                    const razonLabels = sortedRazones.map(i => i[0]);
                    const razonData = sortedRazones.map(i => i[1]);

        // 3. Trend Data
        const history = this.dashboardStats.history || [];
                    // Ensure chronological
                    // history is usually [{date: 'YYYY-MM-DD', data: {...}}]
                    const trendLabels = history.map(h => h.date ? h.date.split('T')[0].slice(5) : '-'); // MM-DD
                    const trendTotal = history.map(h => parseInt(h.data.total||0));
                    const trendError = history.map(h => parseInt(h.data.error||0));

                    // --- Chart Creation/Update ---
                    const createOrUpdate = (ctx, id, type, data, options) => {
                         if(!ctx) return;
        if(this.charts[id]) {
            this.charts[id].destroy();
                         }
        this.charts[id] = new Chart(ctx, {type, data, options});
                    };

        // Brands Doughnut
        createOrUpdate(ctxBrands, 'brands', 'doughnut', {
            labels: brandsLabels,
        datasets: [{
            data: brandsData,
        backgroundColor: ['#000000', '#FF3B30', '#34C759', '#007AFF', '#FF9500', '#AF52DE', '#5856D6'],
        borderWidth: 0
                        }]
                    }, {responsive: true, maintainAspectRatio: false, plugins: {legend: {position: 'bottom', labels: {boxWidth: 10, font: {size: 10} } } } });

        // Razones Bar
        createOrUpdate(ctxRazones, 'razones', 'bar', {
            labels: razonLabels,
        datasets: [{
            label: 'Leads',
        data: razonData,
        backgroundColor: '#000000',
        borderRadius: 6
                        }]
                    }, {responsive: true, maintainAspectRatio: false, scales: {y: {beginAtZero: true, grid: {display: false } }, x: {grid: {display: false }, ticks: {font: {size: 10} } } }, plugins: {legend: {display: false } } });

        // Trend Line
        createOrUpdate(ctxTrend, 'trend', 'line', {
            labels: trendLabels,
        datasets: [
        {label: 'Total', data: trendTotal, borderColor: '#000000', backgroundColor: 'rgba(0,0,0,0.05)', fill: true, tension: 0.3, pointRadius: 3 },
        {label: 'Errores', data: trendError, borderColor: '#FF3B30', backgroundColor: 'transparent', borderDash: [5, 5], tension: 0.3, pointRadius: 0 }
        ]
                    }, {responsive: true, maintainAspectRatio: false, scales: {y: {beginAtZero: true, grid: {color: '#f3f4f6' } }, x: {grid: {display: false } } }, plugins: {legend: {position: 'top', align: 'end', labels: {boxWidth: 10, usePointStyle: true } } } });
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

        async resetHistory() {
                    if(!confirm('¿Estás seguro de resetear el historial? Esto creará un backup.')) return;
        try {
                        const res = await fetch('/api/admin/stats', {
            method: 'POST',
        headers: {'Content-Type': 'application/json' },
        body: JSON.stringify({action: 'clear' })
                        });
        const data = await res.json();
        if(data.success) {
            alert('Reset exitoso. Backup ID: ' + data.backupId);
        this.fetchDashboardStats();
                        } else {
            alert('Error: ' + (data.error || 'Desconocido'));
                        }
                    } catch(e) {alert('Error de red'); }
                },

        // Razones & Models Logic
        selectRazon(key) {this.selectedRazonKey = key; this.isNewRazon = false; },
        createNewRazon() {this.isNewRazon = true; this.selectedRazonKey = 'NEW'; this.razonesSociales['NEW'] = {brands: [], dealers: [], pipelineMapping: { } }; },
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
        if(!this.selectedRazon.pipelineMapping) this.selectedRazon.pipelineMapping = { };
        this.selectedRazon.pipelineMapping[brand] = {pipeline: '', stage: '' };
                    }
        this.markDirty();
                },
        getPipeline(brand, field) { return this.selectedRazon.pipelineMapping?.[brand]?.[field] || ''; },
        setPipeline(brand, field, value) {
                     if(!this.selectedRazon.pipelineMapping) this.selectedRazon.pipelineMapping = { };
        if(!this.selectedRazon.pipelineMapping[brand]) this.selectedRazon.pipelineMapping[brand] = { };
        this.selectedRazon.pipelineMapping[brand][field] = value;
        this.markDirty();
                },
        addDealer() { if(!this.newDealerInput) return; this.selectedRazon.dealers = this.selectedRazon.dealers || []; this.selectedRazon.dealers.push(this.newDealerInput); this.newDealerInput = ''; this.markDirty(); },
        removeDealer(idx) {this.selectedRazon.dealers.splice(idx, 1); this.markDirty(); },
        addModel() { if(!this.newModelInput) return; this.modelsByBrand[this.selectedBrandKey].models.push(this.newModelInput); this.newModelInput = ''; this.markDirty(); },
        removeModel(idx) {this.modelsByBrand[this.selectedBrandKey].models.splice(idx, 1); this.markDirty(); },


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

        this.modelsByBrand[name] = {models: [] };
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
        markDirty() {this.unsavedChanges = true; },
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
            await fetch('/api/admin/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ razonesSociales: this.razonesSociales, modelsByBrand: this.modelsByBrand }) });
        this.unsavedChanges = false;
                        setTimeout(() => this.saving = false, 500);
                    } catch(e) {alert('Error: ' + e.message); this.saving = false; }
                },
        async runSimulation() {
                     try {
                        const res = await fetch('/api/admin/simulate', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({dealerName: this.simDealer, brandName: this.simBrand }) });
        this.simResult = await res.json();
                     } catch(e) {this.simResult = { error: e.message }; }
                }
            }
        }
    </script>
</body >
</html >
    `;
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
};