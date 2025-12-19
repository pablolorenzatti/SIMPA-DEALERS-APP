#!/bin/bash
# Script para iniciar el servidor OAuth automático

cd "$(dirname "$0")"

# Detener servidor Python si está corriendo en el puerto 3000
echo "🛑 Deteniendo servidor anterior (si existe)..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 1

# Verificar si existe .env
if [ ! -f .env ]; then
  echo "⚠️  Archivo .env no encontrado"
  echo ""
  echo "Crea un archivo .env con:"
  echo "  CLIENT_ID=tu_client_id"
  echo "  CLIENT_SECRET=tu_client_secret"
  echo ""
  echo "O ejecuta con variables de entorno:"
  echo "  CLIENT_ID=xxx CLIENT_SECRET=xxx node server.js"
  echo ""
  exit 1
fi

# Cargar variables de entorno desde .env
export $(cat .env | grep -v '^#' | xargs)

# Verificar que las variables estén configuradas
if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
  echo "❌ Error: CLIENT_ID y CLIENT_SECRET deben estar en .env"
  exit 1
fi

echo "✅ Credenciales cargadas desde .env"
echo "🚀 Iniciando servidor OAuth..."
echo ""

# Iniciar servidor Node.js
node server.js

