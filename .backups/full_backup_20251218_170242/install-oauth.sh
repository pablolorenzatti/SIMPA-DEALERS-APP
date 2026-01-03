#!/bin/bash
# Script para intercambiar code OAuth por tokens de HubSpot
# Uso: ./install-oauth.sh <CODE> <CLIENT_ID> <CLIENT_SECRET>

set -e

CODE="${1}"
CLIENT_ID="${2}"
CLIENT_SECRET="${3}"
REDIRECT_URI="http://localhost:3000"

if [ -z "$CODE" ] || [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
  echo "❌ Error: Faltan parámetros"
  echo ""
  echo "Uso:"
  echo "  ./install-oauth.sh <CODE> <CLIENT_ID> <CLIENT_SECRET>"
  echo ""
  echo "Ejemplo:"
  echo "  ./install-oauth.sh na1-xxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx CLIENT_ID CLIENT_SECRET"
  echo ""
  echo "Dónde obtener CLIENT_ID y CLIENT_SECRET:"
  echo "  1. Ve a https://app.hubspot.com/developer-projects"
  echo "  2. Abre tu app 'SIMPA-Application'"
  echo "  3. En la sección 'Auth', encontrarás Client ID y Client Secret"
  exit 1
fi

echo "🔄 Intercambiando code por tokens..."
echo "   Code: ${CODE:0:20}..."
echo "   Client ID: ${CLIENT_ID:0:20}..."
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST https://api.hubapi.com/oauth/v1/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "client_id=${CLIENT_ID}" \
  -d "client_secret=${CLIENT_SECRET}" \
  -d "redirect_uri=${REDIRECT_URI}" \
  -d "code=${CODE}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ ¡Éxito! App instalada correctamente"
  echo ""
  echo "Tokens recibidos:"
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
  echo ""
  echo "📝 Guarda el 'refresh_token' para futuras renovaciones"
else
  echo "❌ Error (HTTP $HTTP_CODE):"
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
  echo ""
  echo "Posibles causas:"
  echo "  - Code expirado o ya usado (genera uno nuevo)"
  echo "  - redirect_uri no coincide exactamente"
  echo "  - client_id/client_secret incorrectos"
  exit 1
fi

