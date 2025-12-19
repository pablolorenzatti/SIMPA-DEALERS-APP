#!/bin/bash
# Script para limpiar información sensible antes de subir a GitHub
# Uso: ./cleanup-before-git.sh

set -e

echo "🔒 Limpieza de Seguridad Pre-GitHub"
echo "===================================="
echo ""

# Crear backup de los archivos que se van a modificar
BACKUP_DIR=".backup/pre-git-cleanup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "📦 Creando backup en: $BACKUP_DIR"
echo ""

# Lista de archivos a limpiar
FILES_TO_CLEAN=(
  "src/app/workflow-actions/forward-lead-hsmeta.json"
  "src/app/workflow-actions/custom-action-hsmeta.json"
  "src/app/workflow-actions/bulk-models-hsmeta.json"
  "src/app/workflow-actions/check-lead-status-hsmeta.json"
  "src/app/workflow-actions/test-action-hsmeta.json"
  "update-action-urls.js"
)

# Backup de archivos
echo "📋 Haciendo backup de archivos..."
for file in "${FILES_TO_CLEAN[@]}"; do
  if [ -f "$file" ]; then
    mkdir -p "$BACKUP_DIR/$(dirname "$file")"
    cp "$file" "$BACKUP_DIR/$file"
    echo "   ✅ Backup: $file"
  else
    echo "   ⚠️  No encontrado: $file"
  fi
done
echo ""

# Bypass token a remover
BYPASS_TOKEN="e4f3b1c6a9d8e7f0123456789abcdef0"
BYPASS_PARAM="?x-vercel-protection-bypass=${BYPASS_TOKEN}"

# Función para limpiar URLs en archivos JSON
clean_json_file() {
  local file="$1"
  if [ ! -f "$file" ]; then
    return
  fi
  
  echo "🧹 Limpiando: $file"
  
  # Remover el parámetro bypass de las URLs
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s|${BYPASS_PARAM}||g" "$file"
  else
    # Linux
    sed -i "s|${BYPASS_PARAM}||g" "$file"
  fi
  
  echo "   ✅ Limpieza completada"
}

# Función para limpiar update-action-urls.js
clean_update_script() {
  local file="update-action-urls.js"
  if [ ! -f "$file" ]; then
    return
  fi
  
  echo "🧹 Limpiando: $file"
  
  # Remover la constante BYPASS_TOKEN y su uso
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "/const BYPASS_TOKEN = /d" "$file"
    sed -i '' "s|\${BYPASS_TOKEN}||g" "$file"
    sed -i '' "s|?x-vercel-protection-bypass=\${BYPASS_TOKEN}||g" "$file"
  else
    # Linux
    sed -i "/const BYPASS_TOKEN = /d" "$file"
    sed -i "s|\${BYPASS_TOKEN}||g" "$file"
    sed -i "s|?x-vercel-protection-bypass=\${BYPASS_TOKEN}||g" "$file"
  fi
  
  echo "   ✅ Limpieza completada"
}

# Limpiar archivos JSON
echo "🔍 Limpiando archivos JSON de metadata..."
for file in "${FILES_TO_CLEAN[@]}"; do
  if [[ "$file" == *.json ]]; then
    clean_json_file "$file"
  fi
done
echo ""

# Limpiar update-action-urls.js
echo "🔍 Limpiando update-action-urls.js..."
clean_update_script
echo ""

# Verificar que el token fue removido
echo "🔍 Verificando que el token fue removido..."
if grep -r "$BYPASS_TOKEN" src/ vercel/ update-action-urls.js 2>/dev/null | grep -v node_modules | grep -v ".backup"; then
  echo "   ⚠️  ADVERTENCIA: Aún se encontró el token en algunos archivos"
  echo "   Revisa manualmente los archivos listados arriba"
else
  echo "   ✅ Token removido exitosamente"
fi
echo ""

# Verificar archivos sensibles
echo "🔍 Verificando archivos sensibles..."
SENSITIVE_FILES=(
  ".env"
  "dev-redirect/.env"
  "hubspot.config.yml"
)

FOUND_SENSITIVE=false
for file in "${SENSITIVE_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "   ⚠️  ADVERTENCIA: Archivo sensible encontrado: $file"
    echo "      Este archivo debe estar en .gitignore"
    FOUND_SENSITIVE=true
  fi
done

if [ "$FOUND_SENSITIVE" = false ]; then
  echo "   ✅ No se encontraron archivos sensibles en la raíz"
fi
echo ""

# Verificar .gitignore
echo "🔍 Verificando .gitignore..."
if [ -f ".gitignore" ]; then
  if grep -q "\.env" .gitignore && grep -q "\.backup" .gitignore; then
    echo "   ✅ .gitignore está correctamente configurado"
  else
    echo "   ⚠️  ADVERTENCIA: .gitignore puede estar incompleto"
  fi
else
  echo "   ⚠️  ADVERTENCIA: No se encontró .gitignore"
fi
echo ""

echo "✅ Limpieza completada"
echo ""
echo "📝 PRÓXIMOS PASOS:"
echo "   1. Revisa los cambios con: git diff"
echo "   2. Verifica que los archivos modificados sean correctos"
echo "   3. Los backups están en: $BACKUP_DIR"
echo "   4. Si todo está bien, puedes hacer commit"
echo ""
echo "⚠️  IMPORTANTE:"
echo "   - Los endpoints en Vercel seguirán funcionando"
echo "   - Necesitarás actualizar las URLs en HubSpot después del despliegue"
echo "   - O implementar HubSpot Signature Validation para mayor seguridad"
echo ""

