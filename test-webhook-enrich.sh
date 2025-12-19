#!/bin/bash

# Script para probar el endpoint webhook-enrich
# Uso: ./test-webhook-enrich.sh [portalId] [objectId] [vercel-url]

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# URL base de Vercel (actualizar con tu URL real)
VERCEL_URL="${3:-https://simpa-workflow-action-e6uzq0cbb-pablo-lorenzattis-projects.vercel.app}"
ENDPOINT="${VERCEL_URL}/api/webhook-enrich"

# Valores por defecto (actualizar con valores reales)
PORTAL_ID="${1:-50104303}"
OBJECT_ID="${2:-123}"

echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  TEST WEBHOOK-ENRICH ENDPOINT${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "Endpoint: ${YELLOW}${ENDPOINT}${NC}"
echo -e "Portal ID: ${YELLOW}${PORTAL_ID}${NC}"
echo -e "Object ID: ${YELLOW}${OBJECT_ID}${NC}"
echo ""

# Payload de ejemplo
PAYLOAD=$(cat <<EOF
{
  "appId": 23432893,
  "eventId": 100,
  "subscriptionId": 4688180,
  "portalId": ${PORTAL_ID},
  "occurredAt": $(date +%s)000,
  "subscriptionType": "deal.propertyChange",
  "attemptNumber": 0,
  "objectId": ${OBJECT_ID},
  "changeSource": "CRM",
  "propertyName": "dealstage",
  "propertyValue": "appointmentscheduled"
}
EOF
)

echo -e "${BLUE}1. Probando Health Check (GET)...${NC}"
echo ""
HTTP_CODE=$(curl -s -o /tmp/webhook-response.json -w "%{http_code}" "${ENDPOINT}" || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Endpoint está disponible${NC}"
    cat /tmp/webhook-response.json | jq '.' 2>/dev/null || cat /tmp/webhook-response.json
else
    echo -e "${RED}❌ Endpoint retornó código: ${HTTP_CODE}${NC}"
    if [ "$HTTP_CODE" = "401" ]; then
        echo -e "${YELLOW}⚠️  Esto puede ser protección de Vercel. El endpoint puede estar desplegado.${NC}"
    fi
    cat /tmp/webhook-response.json 2>/dev/null || echo "Sin respuesta"
fi

echo ""
echo -e "${BLUE}2. Probando con Webhook de Ejemplo (POST)...${NC}"
echo ""
echo "Payload:"
echo "$PAYLOAD" | jq '.' 2>/dev/null || echo "$PAYLOAD"
echo ""

HTTP_CODE=$(curl -s -o /tmp/webhook-response.json -w "%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "${ENDPOINT}" || echo "000")

echo "HTTP Code: $HTTP_CODE"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Webhook procesado exitosamente${NC}"
    echo ""
    echo "Respuesta:"
    cat /tmp/webhook-response.json | jq '.' 2>/dev/null || cat /tmp/webhook-response.json
elif [ "$HTTP_CODE" = "500" ]; then
    echo -e "${RED}❌ Error del servidor${NC}"
    echo ""
    echo "Respuesta:"
    cat /tmp/webhook-response.json | jq '.' 2>/dev/null || cat /tmp/webhook-response.json
    echo ""
    echo -e "${YELLOW}💡 Revisa los logs en Vercel Dashboard${NC}"
elif [ "$HTTP_CODE" = "401" ]; then
    echo -e "${YELLOW}⚠️  Error de autenticación (401)${NC}"
    echo ""
    echo -e "${YELLOW}Posibles causas:${NC}"
    echo "  1. Vercel Protection está activado"
    echo "  2. Token no configurado en variables de entorno"
    echo "  3. PortalId no encontrado en razones-sociales.json"
    echo ""
    echo -e "${YELLOW}💡 Verifica:${NC}"
    echo "  - Variables de entorno en Vercel Dashboard"
    echo "  - Logs del deployment en Vercel"
else
    echo -e "${RED}❌ Error: HTTP ${HTTP_CODE}${NC}"
    cat /tmp/webhook-response.json 2>/dev/null || echo "Sin respuesta"
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Para usar con diferentes valores:${NC}"
echo "  ./test-webhook-enrich.sh [portalId] [objectId] [vercel-url]"
echo ""
echo -e "${YELLOW}Ejemplo:${NC}"
echo "  ./test-webhook-enrich.sh 50104303 456"
echo ""

# Limpiar
rm -f /tmp/webhook-response.json

