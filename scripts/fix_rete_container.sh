#!/bin/bash
# Script per risolvere problemi di rete Docker e file .env

set -e

echo "=========================================="
echo "Fix Rete Docker e File .env"
echo "=========================================="
echo ""

ENV_FILE="/srv/stack/.env"

# Verifica file .env
echo "📋 [1/4] Verifica file .env..."
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ File .env non trovato in $ENV_FILE"
    echo ""
    echo "Crea il file .env con questa struttura minima:"
    echo "APP_DOMAIN=app.unlimitedgo.it"
    echo "PANEL_DOMAIN=panel.unlimitedgo.it"
    echo "MYSQL_ROOT_PASSWORD=..."
    echo "MYSQL_DATABASE=..."
    echo "MYSQL_USER=..."
    echo "MYSQL_PASSWORD=..."
    exit 1
fi

echo "✅ File .env trovato"
echo ""
echo "Verifica variabili essenziali:"
grep -E "^(APP_DOMAIN|MYSQL_)" "$ENV_FILE" | head -5 || echo "⚠️  Alcune variabili mancanti"

echo ""
echo "📋 [2/4] Ferma tutti i container..."
cd /srv/stack/infra-deploy
docker compose --env-file "$ENV_FILE" down

echo ""
echo "📋 [3/4] Verifica rete Docker..."
if docker network ls | grep -q "stack"; then
    echo "✅ Rete 'stack' esiste"
else
    echo "⚠️  Rete 'stack' non esiste, verrà creata"
fi

echo ""
echo "📋 [4/4] Avvia tutti i container con file .env corretto..."
docker compose --env-file "$ENV_FILE" up -d

echo ""
echo "⏳ Attendi 15 secondi che i container si avviino..."
sleep 15

echo ""
echo "📋 Verifica stato container..."
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Networks}}" | grep -E "(NAMES|php|caddy|db)"

echo ""
echo "📋 Verifica rete..."
docker network inspect stack 2>/dev/null | grep -A 3 "Containers" | head -20 || echo "Errore nella verifica rete"

echo ""
echo "✅ Completato!"
echo ""
echo "🔍 Test connessione:"
echo "   curl -I https://app.unlimitedgo.it"
echo ""

