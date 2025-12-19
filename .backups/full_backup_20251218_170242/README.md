# SIMPA - HubSpot Application

Aplicación privada de HubSpot para gestión de leads y configuración de propiedades en múltiples cuentas de concesionarios (razones sociales).

## 📋 Panorama General

SIMPA es una aplicación privada de HubSpot que permite:

1. **Enviar leads** desde una cuenta central a cuentas de concesionarios específicos
2. **Verificar el estado** de leads enviados a concesionarios (etapa, actividades, información)
3. **Configurar propiedades** (modelos, marcas, concesionarios) en cuentas externas
4. **Actualizar modelos en bulk** en todas las razones sociales que tengan una marca específica
5. **Gestionar pipelines** de negocios por marca

## 🎯 Custom Actions Disponibles

### 1. Forward Lead To Dealer (`workflow-action-forward-lead`)

**Descripción:** Envía un lead (contacto + negocio) desde la cuenta central al portal HubSpot del concesionario especificado.

**Objetos soportados:** Contactos y Negocios (Deals)

**Inputs principales:**
- `razon_social` (requerido): Razón social del concesionario destino
- `dealer_name` (requerido): Nombre del concesionario
- `contact_firstname`, `contact_lastname`, `contact_email`, `contact_phone`, `contact_city`
- `contact_brand`, `contact_model`: Marca y modelo de interés
- `origin_contact_id`, `origin_deal_id`: IDs del contacto/negocio en SIMPA (se guardan en propiedades personalizadas)
- `deal_pipeline`, `deal_stage`: Pipeline y etapa destino (opcionales)

**Outputs:**
- `success`: Estado de la operación
- `message`: Mensaje descriptivo
- `dealerContactId`, `dealerDealId`: IDs creados en la cuenta del concesionario
- `contactAction`, `dealAction`: Acción realizada (created/updated)

**Funcionalidad:**
- Resuelve automáticamente el token de acceso desde `razones-sociales.json`
- Crea o actualiza contacto en la cuenta destino
- Crea negocio asociado al contacto
- Guarda los IDs de SIMPA en propiedades personalizadas (`id_contacto_simpa`, `id_negocio_simpa`)

---

### 2. Configure External Account Properties (`workflow-action-custom`)

**Descripción:** Configura propiedades y pipelines en cuentas externas según marca y concesionario.

**Objetos soportados:** Contactos y Negocios (Deals)

**Tipos de proceso disponibles:**

#### a) Crear Todas las Propiedades (Primera Vez)
- Crea todas las propiedades base definidas en `properties-config.json`
- Incluye: `id_contacto_simpa`, `id_negocio_simpa`, `marca_simpa`, `modelo_simpa`, `modelo_{marca}`, `concesionarios_simpa`
- Pobla opciones iniciales según la marca y concesionario especificados

#### b) Crear/Actualizar Propiedades de Modelos
- **Modo individual:** Agrega un modelo a una razón social específica
- **Modo bulk:** Agrega un modelo a todas las razones sociales que tengan la marca configurada
  - Dejar `razon_social` vacío activa el modo bulk
  - Actualiza `modelo_simpa` y `modelo_{marca}` en contactos y negocios

#### c) Crear/Actualizar Propiedades de Concesionarios
- Agrega un nuevo concesionario a la propiedad `concesionarios_simpa`
- Solo requiere `razon_social` y `dealer`

#### d) Crear/Configurar Pipeline de Negocio
- Crea o configura pipelines de negocios por marca (pendiente de implementación completa)

**Inputs principales:**
- `tipo_proceso` (requerido): Tipo de proceso a ejecutar
- `razon_social` (requerido, excepto para bulk de modelos): Razón social destino
- `marca` (requerido para modelos y todas las propiedades): Marca a procesar
- `modelo` (requerido para propiedades de modelos): Modelo a agregar
- `dealer` (requerido para concesionarios y todas las propiedades): Nombre del concesionario

**Outputs:**
- `success`: Estado de la operación
- `message`: Mensaje descriptivo con estadísticas
- `propertiesCreated`, `propertiesUpdated`, `optionsAdded`: Contadores
- `bulkTotal`, `bulkExitosas`, `bulkFallidas`: Estadísticas de bulk (si aplica)
- `bulkErroresDetalle`: Detalle de errores en modo bulk

---

### 3. Bulk Update Models (`workflow-action-bulk-models`)

**Descripción:** Agrega una nueva opción de modelo a todas las razones sociales que tengan la marca especificada configurada.

**Objetos soportados:** Contactos y Negocios (Deals)

**Inputs:**
- `marca` (requerido): Marca (ej: "QJ Motor", "KTM", "Royal Enfield")
- `modelo` (requerido): Nombre del modelo a agregar

**Funcionalidad:**
- Busca automáticamente todas las razones sociales con la marca configurada en `razones-sociales.json`
- Para cada razón social:
  - Obtiene el token de acceso correspondiente
  - Agrega el modelo a `modelo_simpa` (contactos y negocios)
  - Agrega el modelo a `modelo_{marca}` (contactos y negocios)
  - Crea las propiedades si no existen (con opción inicial)
- Maneja errores parciales: si algunas razones sociales fallan pero otras tienen éxito, no marca todo como fallido

**Outputs:**
- `success`: Estado de la operación
- `message`: Resumen del proceso bulk
- `bulkTotal`: Total de razones sociales procesadas
- `bulkExitosas`: Razones sociales actualizadas exitosamente
- `bulkFallidas`: Razones sociales que fallaron
- `bulkErroresDetalle`: Detalle de errores (si los hay)
- `propertiesCreated`, `propertiesUpdated`, `optionsAdded`: Estadísticas de propiedades

**Ventajas sobre el modo bulk de `workflow-action-custom`:**
- Endpoint dedicado y simplificado
- Código más limpio y mantenible
- Mejor manejo de errores
- Sin problemas de sintaxis

---

### 4. Check Lead Status (`workflow-action-check-lead-status`)

**Descripción:** Verifica el estado de un lead enviado a un concesionario. Obtiene la etapa del negocio, actividades de venta (reuniones, llamadas, notas, emails, tareas) e información del contacto desde la cuenta HubSpot del concesionario.

**Objetos soportados:** Contactos y Negocios (Deals)

**Inputs:**
- `razon_social` (requerido): Razón social del concesionario donde se envió el lead
- `dealer_deal_id` (requerido): **ID del negocio en la cuenta HubSpot del concesionario** (NO el ID de SIMPA)
  - ⚠️ **IMPORTANTE:** Debe ser el ID retornado por "Forward Lead To Dealer" (`dealerDealId`)
  - Este es el ID del negocio generado en la cuenta del dealer, no el ID original de SIMPA
- `dealer_contact_id` (opcional): ID del contacto en la cuenta del concesionario (recomendado para información completa)
- `origin_deal_id` (opcional): ID original del negocio en SIMPA (solo para referencia, no se usa en la búsqueda)

**Funcionalidad:**
- Resuelve automáticamente el token de acceso desde `razones-sociales.json`
- Valida la conexión con la cuenta HubSpot del concesionario
- **Usa SIEMPRE el `dealer_deal_id` del input** para buscar el negocio en la cuenta del dealer
- Obtiene información completa del negocio:
  - Nombre, etapa, monto, fecha de cierre
  - Pipeline y probabilidad de la etapa (obtenida del deal encontrado)
  - Marca y modelo asociados
- Obtiene información del contacto (si se proporciona el ID):
  - Datos personales (nombre, email, teléfono, ciudad)
  - Marca, modelo y concesionario asociados
- Obtiene todas las actividades relacionadas usando el `dealer_deal_id`:
  - Reuniones (meetings)
  - Llamadas (calls)
  - Notas (notes)
  - Emails
  - Tareas (tasks)
- Retorna toda la información estructurada para uso en workflows

**⚠️ Nota Importante:**
- La acción **NO** busca por `id_negocio_simpa` como fallback
- Debe proporcionarse el `dealer_deal_id` correcto (el ID del negocio en la cuenta del dealer)
- Si el `dealer_deal_id` no existe, la acción retornará un error descriptivo

**Outputs:**
- `success`: Estado de la operación
- `message`: Mensaje descriptivo
- `dealInfo`: Información completa del negocio (JSON)
- `dealName`, `dealStage`, `dealStageLabel`, `dealStageProbability`: Información de la etapa
- `dealAmount`, `dealCloseDate`, `dealPipeline`: Información financiera y pipeline
- `dealMarca`, `dealModelo`: Marca y modelo del negocio
- `contactInfo`: Información completa del contacto (JSON, si se proporcionó ID)
- `contactFirstName`, `contactLastName`, `contactEmail`, `contactPhone`: Datos del contacto
- `activitiesTotal`: Total de actividades encontradas
- `activitiesMeetings`, `activitiesCalls`, `activitiesNotes`, `activitiesEmails`, `activitiesTasks`: Contadores por tipo
- `activitiesDetails`: Detalle completo de todas las actividades (JSON)

**Casos de uso:**
- Verificar el progreso de un lead enviado
- Sincronizar información de estado entre cuentas
- Obtener métricas de seguimiento de leads
- Actualizar propiedades en la cuenta principal con información del dealer

---

### 5. Webhook Enrich (`webhook-enrich`)

**Descripción:** Endpoint que recibe webhooks de HubSpot desde cuentas de concesionarios (dealers) cuando cambian propiedades de negocios (deals), enriquece la información del deal y actualiza automáticamente el negocio correspondiente en el portal de SIMPA.

**Tipo:** Endpoint Vercel (no es una custom action, se configura como webhook en HubSpot)

**URL:** `https://simpa-workflow-action-hdf3tglpz-pablo-lorenzattis-projects.vercel.app/api/webhook-enrich`

**Método:** POST (también acepta GET para verificación de salud)

**Payload del Webhook (desde HubSpot):**

El webhook puede venir en dos formatos:
1. **Array con un objeto:** `[{"eventId":..., "portalId":..., ...}]`
2. **Objeto directo:** `{"eventId":..., "portalId":..., ...}`

El endpoint maneja ambos formatos automáticamente.

**Campos del webhook:**
- `portalId`: ID del portal del dealer (cuenta que envía el webhook)
- `objectId`: ID del deal en la cuenta del dealer
- `propertyName`: Nombre de la propiedad que cambió (ej: "dealstage")
- `propertyValue`: Nuevo valor de la propiedad (ej: "appointmentscheduled")
- `subscriptionType`: Tipo de suscripción (ej: "deal.propertyChange")
- `eventId`, `subscriptionId`, `appId`, `occurredAt`, `attemptNumber`: Metadatos del webhook

**Funcionalidad:**

1. **Parsing del Payload:**
   - Detecta si el body es string, Buffer, objeto o array
   - Si es array, extrae el primer elemento
   - Maneja errores de parsing con mensajes descriptivos

2. **Obtención del Deal del Dealer:**
   - Resuelve el token de acceso desde `razones-sociales.json` usando el `portalId`
   - Obtiene información completa del deal desde la cuenta del dealer
   - Extrae `idNegocioSimpa` del deal

3. **Extracción de Información de SIMPA:**
   - Parsea `idNegocioSimpa` que puede venir en dos formatos:
     - **Formato compuesto:** `"4990947-0-3-49633068845"` → portalId SIMPA: `"4990947"`, hs_object_id: `"49633068845"`
     - **Formato simple:** `"49633068845"` → hs_object_id: `"49633068845"` (usa variable de entorno para portalId)

4. **Obtención del Deal de SIMPA:**
   - Obtiene token para el portal de SIMPA (OAuth o PAT)
   - Obtiene información del deal desde SIMPA usando el `hs_object_id` extraído

5. **Enriquecimiento de Datos:**
   - Obtiene información del pipeline y stage del dealer
   - **Importante:** Si el webhook es por cambio de `dealstage`, usa el `propertyValue` (nuevo stage) para obtener su probability
   - Obtiene contactos asociados al deal
   - Construye payload enriquecido con toda la información

6. **Actualización en SIMPA:**
   - Mapea el stage del dealer al stage correspondiente en SIMPA usando la probability
   - Busca en `simpa-pipelines.json` la configuración de pipeline para la marca del deal
   - Encuentra el stage más cercano en SIMPA basado en la probability del stage del dealer
   - Actualiza el deal en SIMPA con:
     - Pipeline y stage mapeados
     - Otras propiedades relevantes (amount, closedate, dealtype)

**Mapeo de Stages:**

El endpoint mapea automáticamente los stages del dealer a los stages de SIMPA basándose en:
- **Marca del deal:** Se obtiene de `marca_simpa` o `marca`
- **Probability del stage del dealer:** Se obtiene del stage indicado en `propertyValue` del webhook
- **Configuración de SIMPA:** Se lee de `src/config/simpa-pipelines.json`

El mapeo encuentra el stage en SIMPA con la probability más cercana a la del dealer.

**Configuración Requerida:**

1. **Variables de Entorno en Vercel:**
   - Tokens de dealers: Variables según `tokenEnv` en `razones-sociales.json`
   - `PORTAL_SIMPA_REFRESH_TOKEN`: Refresh token OAuth para SIMPA (recomendado)
   - `HUBSPOT_CLIENT_ID`: Client ID de la app OAuth
   - `HUBSPOT_CLIENT_SECRET`: Client Secret de la app OAuth
   - `SIMPA_PORTAL_ID`: Portal ID de SIMPA (opcional, se puede extraer de `idNegocioSimpa`)

2. **Archivos de Configuración:**
   - `src/config/razones-sociales.json`: Configuración de dealers y tokens
   - `src/config/simpa-pipelines.json`: Configuración de pipelines y stages por marca

**Estructura de `simpa-pipelines.json`:**

```json
{
  "GASGAS": {
    "pipelineId": "61078965",
    "pipelineLabel": "GASGAS Pipeline",
    "stages": [
      {
        "stageId": "119903131",
        "stageLabel": "Etapa 1",
        "probability": 0.1
      },
      {
        "stageId": "119903135",
        "stageLabel": "Etapa 5",
        "probability": 1.0
      }
    ]
  }
}
```

**Respuesta del Endpoint:**

```json
{
  "status": "success",
  "message": "Webhook enriquecido exitosamente",
  "enrichedPayload": {
    "originalWebhook": { /* payload original del webhook */ },
    "enrichedData": {
      "dealInfo": { /* información del deal del dealer */ },
      "pipelineStage": { /* información del pipeline/stage */ },
      "associatedContacts": [ /* contactos asociados */ ],
      "propertyChanged": { /* información del cambio */ }
    },
    "enrichmentMetadata": { /* metadatos del enriquecimiento */ }
  },
  "simpaUpdate": {
    "success": true,
    "message": "Deal actualizado en SIMPA",
    "updatedProperties": ["pipeline", "dealstage"],
    "simpaStage": {
      "pipelineId": "61078965",
      "stageId": "119903135"
    }
  }
}
```

**Configuración en HubSpot:**

1. Ve a **Settings → Integrations → Private Apps** (o **Webhooks**)
2. Crea una nueva suscripción de webhook para `deal.propertyChange`
3. URL: `https://simpa-workflow-action-hdf3tglpz-pablo-lorenzattis-projects.vercel.app/api/webhook-enrich`
4. Selecciona las propiedades que quieres monitorear (ej: `dealstage`)
5. Selecciona el portal del dealer como origen

**Casos de Uso:**
- Sincronización automática de stages entre dealer y SIMPA
- Actualización de información de negocios en tiempo real
- Tracking de cambios en deals de concesionarios
- Integración bidireccional entre SIMPA y dealers

**Notas Importantes:**
- El endpoint usa el `propertyValue` del webhook para obtener la probability del **nuevo** stage, no del stage actual
- Si el deal no tiene `idNegocioSimpa`, el endpoint enriquece los datos pero no actualiza SIMPA
- El mapeo de stages funciona solo si la marca está configurada en `simpa-pipelines.json`
- Si no se encuentra configuración de pipeline para la marca, se omite la actualización de stage pero se actualizan otras propiedades

---

### 6. Test HubSpot Connection (`workflow-action-test`)

**Descripción:** Acción de prueba para verificar la conexión con la API de HubSpot usando un token privado.

**Objetos soportados:** Contactos y Negocios (Deals)

**Inputs:**
- `llave` (requerido): Private Access Token de HubSpot
- `marca`, `dealer` (opcionales): Para logging

**Outputs:**
- `success`: Estado de la conexión
- `message`: Mensaje descriptivo
- `contactPropertiesCount`, `dealPropertiesCount`: Cantidad de propiedades encontradas

---

## 📁 Estructura del Proyecto

```
SIMPA/
├── .env                          # Variables de entorno (credenciales, NO subir a git)
├── .env.example                  # Plantilla de variables de entorno
├── .gitignore                    # Archivos ignorados por git
├── hsproject.json                # Configuración del proyecto HubSpot (platformVersion 2025.2)
├── README.md                     # Este documento
├── DOCUMENTACION_TECNICA.md      # Documentación técnica detallada
├── deploy-all.sh                 # Script de despliegue completo (Vercel + HubSpot + Publicación)
├── deploy.sh                     # Script de despliegue básico
├── publish-action.js             # Script para publicar custom actions automáticamente
│
├── dev-redirect/                 # Servidor local para instalación OAuth
│   ├── index.html
│   ├── server.js
│   ├── start.sh
│   ├── package.json
│   └── .env.example
│
├── vercel/                       # Endpoints serverless en Vercel
│   ├── api/
│   │   ├── workflow-action.js   # Endpoint para configuración de propiedades
│   │   ├── forward-lead.js      # Endpoint para envío de leads
│   │   ├── check-lead-status.js # Endpoint para verificar estado de leads
│   │   ├── bulk-models.js        # Endpoint para actualización masiva de modelos
│   │   ├── webhook-enrich.js     # Endpoint para enriquecer webhooks y actualizar SIMPA
│   │   └── test-action.js        # Endpoint de prueba
│   ├── package.json
│   ├── vercel.json               # Configuración de Vercel
│   └── .vercel/                  # Configuración local de Vercel (no subir a git)
│
└── src/
    ├── app/
    │   ├── app-hsmeta.json       # Metadatos de la app (scopes, OAuth, distribución)
    │   ├── workflow-actions/
    │   │   ├── custom-action-hsmeta.json      # Metadata: Configure External Account Properties
    │   │   ├── forward-lead-hsmeta.json       # Metadata: Forward Lead To Dealer
    │   │   ├── check-lead-status-hsmeta.json  # Metadata: Check Lead Status
    │   │   ├── bulk-models-hsmeta.json        # Metadata: Bulk Update Models
    │   │   ├── test-action-hsmeta.json        # Metadata: Test HubSpot Connection
    │   │   └── properties-config.json         # Configuración de propiedades base
    │   └── functions/
    │       ├── index.js          # Funciones auxiliares
    │       └── package.json      # Dependencias (@hubspot/api-client)
    │
    └── config/
        ├── razones-sociales.json  # Configuración de razones sociales, marcas y tokens
        ├── models-by-brand.json  # Mapeo de marcas a modelos disponibles
        └── simpa-pipelines.json   # Configuración de pipelines y stages por marca para SIMPA
```

## 🔧 Requisitos

### Software
- **Node.js 18+** (recomendado 20+)
- **HubSpot CLI**: `npm install -g @hubspot/cli`
- **Vercel CLI**: `npm install -g vercel` (opcional, para despliegues manuales)

### Cuentas y Accesos
1. **Cuenta de desarrollador HubSpot** con acceso a proyectos
2. **Cuenta destino** donde instalar la app (puede ser la misma cuenta developer)
3. **Cuenta Vercel** para desplegar los endpoints serverless
4. **Developer API Key** para publicar custom actions automáticamente

### Scopes Requeridos (app-hsmeta.json)

La aplicación solicita los siguientes scopes:

- `oauth`: Autenticación OAuth
- `automation`: **Indispensable** para que las acciones aparezcan en Workflows
- `crm.objects.contacts.read`: Leer contactos
- `crm.objects.contacts.write`: Crear/actualizar contactos
- `crm.objects.deals.read`: Leer negocios
- `crm.objects.deals.write`: Crear/actualizar negocios
- `crm.schemas.contacts.read`: Leer esquemas de contactos
- `crm.schemas.contacts.write`: Crear/actualizar esquemas de contactos
- `crm.schemas.deals.read`: Leer esquemas de negocios
- `crm.schemas.deals.write`: Crear/actualizar esquemas de negocios

## 🚀 Instalación y Configuración

### 1. Clonar/Descargar el Proyecto

```bash
cd "/Users/pablolorenzatti/Library/CloudStorage/OneDrive-Personal/Documentos/Trabajo/GitHub/HubSpot Projects/SIMPA"
```

### 2. Instalar Dependencias

```bash
# Dependencias de Vercel (endpoints serverless)
cd vercel
npm install
cd ..

# Dependencias de funciones HubSpot (si es necesario)
cd src/app/functions
npm install
cd ../../..
```

### 3. Configurar Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto:

```bash
cp .env.example .env
```

Edita `.env` y configura:

```bash
# ID de la aplicación en HubSpot
HUBSPOT_APP_ID=23431355

# Developer API Key del Developer Account
# Obtener en: Developer Account → Settings → Integrations → Developer API key
HUBSPOT_DEV_API_KEY=tu_developer_api_key_aqui

# Opcional: Personal Access Token (alternativa a API Key)
# HUBSPOT_DEV_PAT=pat-na1-xxxx
```

**⚠️ IMPORTANTE:**
- El archivo `.env` está en `.gitignore` y NO se subirá al repositorio
- Usa la **Developer API Key** del Developer Account, NO de una cuenta instalada
- Esta key se usa solo para publicar custom actions, no para operaciones en cuentas instaladas

### 4. Configurar Razones Sociales

Edita `src/config/razones-sociales.json` y configura todas las razones sociales con:

- `tokenEnv`: Nombre de la variable de entorno en Vercel que contiene el token
- `brands`: Array de marcas asociadas a esta razón social
- `dealers`: Array de concesionarios asociados

Ejemplo:
```json
{
  "SPORTADVENTURE": {
    "tokenEnv": "SPORTADVENTURE_TOKEN",
    "brands": ["Moto Morini", "Royal Enfield", "KTM", "QJ Motor", "CF Moto"],
    "dealers": ["CFMOTO Rosario", "QJ Motor Rosario", "Royal Enfield Rosario"]
  }
}
```

### 5. Configurar Tokens en Vercel

Para cada razón social, debes crear una variable de entorno en Vercel:

1. Ve a tu proyecto en Vercel
2. Settings → Environment Variables
3. Agrega variables con el nombre especificado en `tokenEnv` (ej: `SPORTADVENTURE_TOKEN`)
4. Valor: Private Access Token de la cuenta HubSpot correspondiente

**Ejemplo de variables en Vercel:**
- `SPORTADVENTURE_TOKEN` → `pat-na1-xxxx...`
- `TEST_ACCOUNT_KEY` → `pat-na1-yyyy...`
- etc.

## 📤 Despliegue

### Despliegue Completo Automático (Recomendado)

El script `deploy-all.sh` automatiza todo el proceso:

```bash
cd SIMPA
chmod +x deploy-all.sh
./deploy-all.sh
```

**Este script:**
1. Despliega en Vercel (producción)
2. Sube el proyecto a HubSpot
3. Despliega en HubSpot
4. Publica automáticamente todas las custom actions (si `.env` está configurado)

### Despliegue Manual Paso a Paso

#### Paso 1: Desplegar en Vercel

```bash
cd vercel
vercel --prod --yes
cd ..
```

**Nota:** La primera vez, Vercel pedirá configuración. Las siguientes veces usará la configuración guardada.

#### Paso 2: Actualizar URLs en Metadata

Después de desplegar en Vercel, obtén la nueva URL y actualiza los archivos de metadata:

```bash
# La URL será algo como: https://simpa-workflow-action-XXXXX.vercel.app
# Actualiza manualmente en:
# - src/app/workflow-actions/custom-action-hsmeta.json
# - src/app/workflow-actions/forward-lead-hsmeta.json
# - src/app/workflow-actions/bulk-models-hsmeta.json
# - src/app/workflow-actions/test-action-hsmeta.json
```

#### Paso 3: Subir y Desplegar en HubSpot

```bash
hs project upload
hs project deploy
```

#### Paso 4: Publicar Custom Actions

Las custom actions se crean en estado "unpublished" por defecto. Debes publicarlas:

```bash
# Opción 1: Publicar todas las acciones no publicadas (recomendado)
node publish-action.js 23431355 <TU_DEVELOPER_API_KEY>

# Opción 2: Usando variables de entorno desde .env
source .env
node publish-action.js "$HUBSPOT_APP_ID" "$HUBSPOT_DEV_API_KEY"
```

**El script `publish-action.js`:**
- Por defecto publica TODAS las acciones no publicadas
- Muestra el estado de cada acción (publicada/no publicada)
- Publica automáticamente las que no estén publicadas

### Verificar Despliegue

1. Ve a tu Developer Project en HubSpot
2. Verifica que el build se completó exitosamente
3. Verifica que todos los componentes se desplegaron:
   - `app-SIMPA`
   - `workflow-action-custom`
   - `workflow-action-forward-lead`
   - `workflow-action-bulk-models`
   - `workflow-action-test`

## 🔐 Instalación de la App en Cuenta Destino

### Método 1: Instalación Manual

1. Ve a tu Developer Project → Settings → Distribution
2. Copia la "URL de instalación de muestra"
3. Abre la URL en una ventana de incógnito (o cierra sesión de HubSpot)
4. Inicia sesión con la cuenta destino
5. Acepta todos los scopes solicitados
6. La app se instalará automáticamente

### Método 2: Servidor Local (Recomendado)

El servidor local en `dev-redirect/` automatiza el proceso OAuth:

1. Configura las credenciales:
   ```bash
   cd dev-redirect
   cp .env.example .env
   # Edita .env con CLIENT_ID y CLIENT_SECRET de tu app
   ```

2. Inicia el servidor:
   ```bash
   ./start.sh
   ```

3. Visita `http://localhost:3000` y sigue las instrucciones
4. El servidor intercambiará automáticamente el código por tokens

## ✅ Verificar que las Custom Actions Aparecen

Después de instalar la app:

1. Ve a **Automation → Workflows** en HubSpot
2. Crea o edita un workflow
3. Agrega una acción
4. Busca "SIMPA" o los nombres de las acciones:
   - "Forward Lead To Dealer" / "Enviar Lead al Concesionario"
   - "Configure External Account Properties" / "Configurar Propiedades de Cuenta Externa"
   - "Bulk Update Models" / "Actualización Masiva de Modelos"
   - "Test HubSpot Connection" / "Probar Conexión HubSpot"

Si no aparecen, revisa los logs de Vercel y verifica que las custom actions estén publicadas.

## 📚 Archivos de Configuración Clave

### `src/config/razones-sociales.json`

Configuración central de todas las razones sociales, sus tokens y marcas asociadas.

**Estructura:**
```json
{
  "RAZON_SOCIAL": {
    "tokenEnv": "NOMBRE_VARIABLE_VERCEL",
    "brands": ["Marca 1", "Marca 2"],
    "dealers": ["Dealer 1", "Dealer 2"]
  }
}
```

**Uso:**
- Las custom actions leen este archivo para resolver tokens automáticamente
- El modo bulk de modelos usa este archivo para encontrar razones sociales por marca

### `src/config/models-by-brand.json`

Mapeo de marcas a modelos disponibles. Se usa al crear todas las propiedades por primera vez.

### `src/config/simpa-pipelines.json`

Configuración de pipelines y stages de SIMPA por marca. Se usa por el endpoint `webhook-enrich` para mapear stages del dealer a stages de SIMPA basándose en la probability.

**Estructura:**
```json
{
  "MARCA": {
    "pipelineId": "id_del_pipeline",
    "pipelineLabel": "Nombre del Pipeline",
    "stages": [
      {
        "stageId": "id_del_stage",
        "stageLabel": "Nombre del Stage",
        "probability": 0.5
      }
    ]
  }
}
```

**Uso:**
- El endpoint `webhook-enrich` lee este archivo para mapear stages
- Busca la marca del deal (normalizada a mayúsculas)
- Encuentra el stage con la probability más cercana a la del dealer
- Actualiza el deal en SIMPA con el pipeline y stage correctos

### `src/app/workflow-actions/properties-config.json`

Configuración de propiedades base que se crean en el proceso "Crear Todas las Propiedades".

**Propiedades incluidas:**
- `id_contacto_simpa`: ID del contacto en SIMPA
- `id_negocio_simpa`: ID del negocio en SIMPA
- `marca_simpa`: Marca (enumeration)
- `modelo_simpa`: Modelo (enumeration)
- `modelo_{marca}`: Modelo específico por marca (enumeration)
- `concesionarios_simpa`: Concesionarios (enumeration)

## 🔄 Flujo de Trabajo Recomendado

### Para Agregar un Nuevo Modelo a Todas las Razones Sociales

1. Usa la custom action **"Bulk Update Models"**
2. Inputs:
   - `marca`: "QJ Motor" (ejemplo)
   - `modelo`: "Nuevo Modelo XYZ"
3. La acción:
   - Busca todas las razones sociales con "QJ Motor" en `razones-sociales.json`
   - Para cada una, obtiene su token y agrega el modelo
   - Retorna estadísticas detalladas

### Para Enviar un Lead a un Concesionario

1. Usa la custom action **"Forward Lead To Dealer"**
2. Inputs:
   - `razon_social`: "SPORTADVENTURE"
   - `dealer_name`: "QJ Motor Rosario"
   - Datos del contacto y negocio
3. La acción:
   - Resuelve el token desde `razones-sociales.json`
   - Crea/actualiza contacto en la cuenta destino
   - Crea negocio asociado
   - Guarda IDs de SIMPA en propiedades personalizadas

### Para Verificar el Estado de un Lead Enviado

1. Usa la custom action **"Check Lead Status"**
2. Inputs:
   - `razon_social`: "SPORTADVENTURE"
   - `dealer_deal_id`: **ID del negocio en la cuenta del concesionario** (retornado por "Forward Lead To Dealer")
   - `dealer_contact_id`: ID del contacto (opcional pero recomendado)
3. La acción:
   - Resuelve el token desde `razones-sociales.json`
   - Valida la conexión con la cuenta del concesionario
   - **Busca el negocio usando el `dealer_deal_id` del input** (ID en cuenta del dealer, NO el ID de SIMPA)
   - Obtiene información completa del negocio (etapa, monto, pipeline)
   - Obtiene información del contacto (si se proporciona ID)
   - Obtiene todas las actividades relacionadas usando el `dealer_deal_id` correcto
   - Retorna toda la información estructurada para uso en workflows

**⚠️ Importante:** El `dealer_deal_id` debe ser el ID retornado por "Forward Lead To Dealer" (`dealerDealId`), no el ID original del negocio en SIMPA.

### Para Configurar Propiedades en una Cuenta Externa

1. Usa la custom action **"Configure External Account Properties"**
2. Selecciona el tipo de proceso:
   - **Primera vez:** Crea todas las propiedades base
   - **Modelos:** Agrega un modelo (individual o bulk)
   - **Concesionarios:** Agrega un concesionario
3. Proporciona los inputs requeridos según el tipo de proceso

## 🛠️ Scripts Disponibles

### `deploy-all.sh`

Script completo de despliegue que automatiza:
- Deploy en Vercel
- Upload y deploy en HubSpot
- Publicación automática de custom actions (si `.env` está configurado)

**Uso:**
```bash
./deploy-all.sh
```

### `publish-action.js`

Script para publicar custom actions usando la API de HubSpot.

**Uso:**
```bash
# Publicar todas las acciones no publicadas
node publish-action.js 23431355 <DEVELOPER_API_KEY>

# Publicar solo una acción específica
ACTION_URL_FILTER=bulk-models node publish-action.js 23431355 <DEVELOPER_API_KEY>

# Con Personal Access Token
node publish-action.js 23431355 <PAT_TOKEN> --bearer
```

**Nota:** Requiere credenciales del Developer Account, no de cuentas instaladas.

## 🔍 Troubleshooting

### Las Custom Actions No Aparecen

1. **Verifica que estén publicadas:**
   ```bash
   node publish-action.js 23431355 <DEVELOPER_API_KEY>
   ```

2. **Reinstala la app** en la cuenta destino

3. **Verifica los scopes:** La app debe tener el scope `automation`

4. **Espera unos minutos:** Puede tardar en aparecer después de publicar

5. **Revisa los logs de Vercel** para más detalles

### Error "Token no encontrado"

- Verifica que la razón social esté en `razones-sociales.json`
- Verifica que la variable de entorno exista en Vercel con el nombre correcto (`tokenEnv`)
- Verifica que el token sea válido y tenga los scopes necesarios

### Error en Modo Bulk

- Verifica que la marca esté correctamente escrita (case-sensitive)
- Verifica que al menos una razón social tenga la marca configurada en `razones-sociales.json`
- Revisa los logs de Vercel para detalles de errores específicos

## 📖 Documentación Adicional

- **`DOCUMENTACION_TECNICA.md`**: Documentación técnica detallada del proyecto, arquitectura, flujos de datos y APIs

## 🔒 Seguridad

### Archivos Protegidos

Los siguientes archivos están en `.gitignore` y NO deben subirse al repositorio:

- `.env`: Variables de entorno con credenciales
- `dev-redirect/.env`: Credenciales OAuth
- `.vercel/`: Configuración local de Vercel
- `*.log`: Archivos de log
- `.backup/`: Backups del proyecto

### Buenas Prácticas

1. **Nunca subas tokens o API keys al repositorio**
2. **Usa variables de entorno en Vercel** para tokens de razones sociales
3. **Rota los tokens periódicamente**
4. **Usa Personal Access Tokens** en lugar de API keys cuando sea posible
5. **Revisa los logs de Vercel** regularmente para detectar accesos no autorizados

## 📝 Notas de Desarrollo

### Agregar una Nueva Custom Action

1. Crea el endpoint en `vercel/api/nueva-action.js`
2. Crea el metadata en `src/app/workflow-actions/nueva-action-hsmeta.json`
3. Agrega el endpoint a `vercel/vercel.json`
4. Actualiza este README con la documentación

### Modificar Configuración de Propiedades

Edita `src/app/workflow-actions/properties-config.json` para agregar/modificar propiedades base.

### Agregar una Nueva Razón Social

1. Agrega la entrada en `src/config/razones-sociales.json`
2. Crea la variable de entorno en Vercel con el token correspondiente
3. El nombre de la variable debe coincidir con `tokenEnv`

## 🤝 Soporte

Para problemas o preguntas:

1. Revisa los logs de Vercel para detalles de errores
2. Verifica que todas las custom actions estén publicadas en HubSpot
3. Verifica la configuración en `razones-sociales.json`
4. Consulta `DOCUMENTACION_TECNICA.md` para detalles técnicos

## 📄 Licencia

Aplicación privada para uso interno.

---

## 📦 Backups

Los backups del proyecto se almacenan en `.backup/` con formato:
```
.backup/backup-YYYYMMDD-HHMMSS/
```

**Último backup:** `backup-20251117-163627`

Para crear un nuevo backup:
```bash
BACKUP_DIR=".backup/backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
rsync -av --exclude='node_modules' --exclude='.git' --exclude='.backup' --exclude='.env' --exclude='*.log' --exclude='.DS_Store' . "$BACKUP_DIR/"
```

---

**Última actualización:** Noviembre 2025  
**Versión de plataforma HubSpot:** 2025.2  
**Build más reciente:** #173
