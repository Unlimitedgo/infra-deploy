#!/bin/bash
# Script semplificato per commentare BOT_DOMAIN e N8N_DOMAIN nel file .env

set -e

echo "=========================================="
echo "Disabilita BOT e N8N"
echo "=========================================="
echo ""

ENV_FILE="/srv/stack/.env"

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ File .env non trovato: $ENV_FILE"
    exit 1
fi

# Backup
cp "$ENV_FILE" "${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"

# Commenta BOT_DOMAIN e N8N_DOMAIN
sed -i 's/^BOT_DOMAIN=/#BOT_DOMAIN=/' "$ENV_FILE"
sed -i 's/^N8N_DOMAIN=/#N8N_DOMAIN=/' "$ENV_FILE"

echo "✅ BOT_DOMAIN e N8N_DOMAIN commentati nel file .env"
echo ""
echo "🔄 Riavvio Caddy..."
cd /srv/stack/infra-deploy
docker compose --env-file "$ENV_FILE" restart caddy

echo ""
echo "✅ Completato! Caddy non cercherà più certificati per bot.* e n8n.*"

