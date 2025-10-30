# 🚗 SIMPA Dealers App - HubSpot Integration

Aplicación moderna de integración OAuth 2.0 con HubSpot para SIMPA Dealers. Actualizada con el SDK oficial de HubSpot y las mejores prácticas de 2024.

## ✨ Mejoras sobre la versión original

- ✅ **SDK Oficial de HubSpot** (`@hubspot/api-client`) en lugar de peticiones HTTP manuales
- ✅ **Axios** en lugar de la biblioteca deprecada `request`
- ✅ **Interfaz web moderna** con diseño responsive y gradientes
- ✅ **Manejo de errores mejorado** con mensajes claros
- ✅ **Webhooks configurados** para eventos de contactos
- ✅ **TypeScript-ready** estructura preparada para migración a TS

_**Nota:** Esta app almacena tokens en memoria. Para producción, usar base de datos._

## What the app does

1. **Redirect to HubSpot's OAuth 2.0 server**

   When you open your browser to `http://localhost:3000/install`, the app will redirect you to the authorization page on
   HubSpot's server. Here you will choose which account you'd like to install the app in and give consent for it to act
   on your behalf. When this is complete, HubSpot will redirect you back to the app.

2. **Exchange an authorization code for access tokens**

   Now that you're back in the app, it will retrieve an access token and refresh token from HubSpot's server, using an
   authorization code that was supplied by HubSpot when you granted access to the app.

3. **Retrieve a contact**

   When the app has received an access token, it will redirect you to `http://localhost:3000/`. It will then use the access token to
   make a query to HubSpot's Contacts API, and display the retrieved contact's name on the page.
   
## Prerequisites

Before running the quickstart app, make sure you have:

1. The tools required to run using the method of your choice:
   - Option 1: Running locally using Node.js: [Node.js (>=6)](https://nodejs.org) and [yarn](https://yarnpkg.com/en/docs/install)
   - Option 2: Running in a Docker container: [Docker (>=1.13)](https://docs.docker.com/install/)
2. A free HubSpot developer account ([sign up](https://app.hubspot.com/signup/developers))
3. An app associated with your developer account ([create an app](https://developers.hubspot.com/docs/faq/how-do-i-create-an-app-in-hubspot))
4. A HubSpot account to install the app in (you can use an existing one, or [create a test account](https://developers.hubspot.com/docs/faq/how-do-i-create-a-test-account))

_**Note:** You must be a super-admin for the account that you want to install the app in._

## 🚀 Instalación y Configuración

### 1. Clonar el repositorio

```bash
git clone https://github.com/pablolorenzatti/SIMPA-DEALERS-APP.git
cd SIMPA-DEALERS-APP
```

### 2. Configurar credenciales de HubSpot

1. Crea una cuenta de desarrollador en [HubSpot](https://developers.hubspot.com/)
2. Crea una nueva app en el [panel de desarrolladores](https://app.hubspot.com/developers)
3. Copia el archivo `.env.example` y renómbralo a `.env`:
   ```bash
   cp .env.example .env
   ```
4. Edita `.env` y agrega tus credenciales:
   ```env
   CLIENT_ID=tu-client-id-de-hubspot
   CLIENT_SECRET=tu-client-secret-de-hubspot
   SCOPE=crm.objects.contacts.read
   PORT=3000
   ```

**Importante:** En la configuración de tu app de HubSpot, agrega esta URL de redirección:
```
http://localhost:3000/oauth-callback
```

### 3. Instalar dependencias

```bash
npm install
# o con yarn
yarn install
```

### 4. Iniciar la aplicación

```bash
npm start
# Para desarrollo con auto-reload:
npm run dev
```

La aplicación se abrirá automáticamente en `http://localhost:3000`

### 5. Autorizar la aplicación

1. Visita `http://localhost:3000/install` o haz clic en el botón "Conectar con HubSpot"
2. Autoriza la aplicación en HubSpot
3. Serás redirigido de vuelta y verás los datos de tu primer contacto

## 🐳 Docker (Opcional)

También puedes ejecutar la aplicación con Docker:

```bash
# Construir la imagen
docker build -t simpa-dealers-app .

# Ejecutar el contenedor
docker run --init -it -p 3000:3000 \
  -e CLIENT_ID=tu-client-id \
  -e CLIENT_SECRET=tu-client-secret \
  -e SCOPE=crm.objects.contacts.read \
  simpa-dealers-app
```

## 📚 Características Principales

- **OAuth 2.0**: Flujo completo de autorización con HubSpot
- **SDK Oficial**: Uso del cliente oficial `@hubspot/api-client`
- **Gestión de Tokens**: Refresh automático de access tokens
- **Interfaz Moderna**: UI responsive con gradientes y diseño atractivo
- **Webhooks**: Endpoint configurado para recibir eventos de HubSpot
- **Logs Claros**: Mensajes informativos en consola para debugging
- **Auto-reload**: Modo desarrollo con `nodemon`

## 🛠️ Tecnologías

- Node.js
- Express.js
- HubSpot API Client SDK v11
- Axios
- Node-Cache
- Express-Session

## 📖 Documentación Adicional

- [HubSpot OAuth 2.0 Documentation](https://developers.hubspot.com/docs/api/oauth)
- [HubSpot API Client SDK](https://github.com/HubSpot/hubspot-api-nodejs)
- [HubSpot Developer Portal](https://developers.hubspot.com/)

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor, abre un issue o pull request.

## 📄 Licencia

MIT License - ver archivo LICENSE para más detalles

## 👨‍💻 Autor

Pablo Lorenzatti - [GitHub](https://github.com/pablolorenzatti)
