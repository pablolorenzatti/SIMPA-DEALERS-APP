# Servidor OAuth Automático para SIMPA

Este servidor automatiza el intercambio de código OAuth por tokens.

## Configuración

### Opción 1: Archivo .env (Recomendado)

1. Copia `.env.example` a `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edita `.env` y completa tus credenciales:
   ```
   CLIENT_ID=tu_client_id_real
   CLIENT_SECRET=tu_client_secret_real
   REDIRECT_URI=http://localhost:3000
   PORT=3000
   ```

3. Ejecuta el servidor:
   ```bash
   node server.js
   ```

### Opción 2: Variables de entorno

```bash
CLIENT_ID=tu_client_id CLIENT_SECRET=tu_client_secret node server.js
```

### Opción 3: Variables de entorno del sistema

```bash
export CLIENT_ID=tu_client_id
export CLIENT_SECRET=tu_client_secret
node server.js
```

## Uso

1. Inicia el servidor con las credenciales configuradas
2. Abre http://localhost:3000
3. Instala la app desde HubSpot
4. El intercambio se hace automáticamente, sin intervención manual

## Dónde obtener Client ID y Client Secret

1. Ve a https://app.hubspot.com/developer-projects
2. Abre "SIMPA-Application"
3. En la sección "Auth", encontrarás:
   - Client ID
   - Client Secret (haz clic en "Show" si está oculto)
