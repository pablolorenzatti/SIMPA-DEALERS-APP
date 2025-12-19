#!/bin/bash
set -e

# Cargar variables de entorno desde .env si existe
if [ -f .env ]; then
  echo "📋 Cargando variables de entorno desde .env..."
  export $(grep -v '^#' .env | xargs)
  echo "✅ Variables de entorno cargadas"
  echo ""
fi

echo "🚀 Iniciando despliegue completo..."
echo ""

# Paso 1: Desplegar en Vercel
echo "📦 Paso 1: Desplegando en Vercel..."
cd vercel
vercel --prod --yes --force
cd ..

echo ""
echo "✅ Despliegue en Vercel completado"
echo ""

# Paso 2: Subir proyecto a HubSpot
echo "📤 Paso 2: Subiendo proyecto a HubSpot..."
hs project upload

echo ""
echo "✅ Proyecto subido a HubSpot"
echo ""

# Paso 3: Desplegar en HubSpot
# echo "🚀 Paso 3: Desplegando en HubSpot..."
# hs project deploy

echo ""
echo "✅ Proyecto desplegado en HubSpot"
echo ""

# Paso 4: Publicar automáticamente todas las custom actions
if [ -n "$HUBSPOT_APP_ID" ] && ([ -n "$HUBSPOT_DEV_API_KEY" ] || [ -n "$HUBSPOT_DEV_PAT" ]); then
  echo "📤 Paso 4: Publicando todas las custom actions automáticamente..."
  echo "   APP_ID: $HUBSPOT_APP_ID"
  echo "   Usando credenciales de variables de entorno"
  echo ""
  
  # Usar PAT si está disponible, sino usar API Key
  if [ -n "$HUBSPOT_DEV_PAT" ]; then
    ACTION_URL_FILTER=all node publish-action.js "$HUBSPOT_APP_ID" "$HUBSPOT_DEV_PAT" --bearer
  else
    ACTION_URL_FILTER=all node publish-action.js "$HUBSPOT_APP_ID" "$HUBSPOT_DEV_API_KEY"
  fi
  
  echo ""
  echo "✅ Custom actions publicadas automáticamente"
else
  echo "📝 Paso 4: Para publicar las custom actions automáticamente, crea un archivo .env con:"
  echo "   HUBSPOT_APP_ID=23431355"
  echo "   HUBSPOT_DEV_API_KEY=tu_developer_api_key"
  echo ""
  echo "   O configura las variables de entorno:"
  echo "   export HUBSPOT_APP_ID=23431355"
  echo "   export HUBSPOT_DEV_API_KEY=tu_developer_api_key"
  echo ""
  echo "   O ejecuta manualmente:"
  echo "   ACTION_URL_FILTER=all node publish-action.js <APP_ID> <HAPIKEY>"
fi

echo ""
echo "🎉 ¡Despliegue completo finalizado!"


