#!/bin/bash
# Script per correggere TUTTI i domini nel file .env da tuodominio.it a unlimitedgo.it

set -e

echo "=========================================="
echo "Correzione Domini nel File .env"
echo "=========================================="
echo ""

# Colori
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Possibili percorsi del file .env
ENV_PATHS=(
    "/srv/stack/.env"
    "/srv/stack/gestionale/.env"
    "/srv/stack/infra-deploy/.env"
)

ENV_FILE=""
DOMAIN_OLD="tuodominio.it"
DOMAIN_NEW="unlimitedgo.it"

# Trova il file .env
echo "🔍 Cerca file .env..."
for path in "${ENV_PATHS[@]}"; do
    if [ -f "$path" ]; then
        echo -e "${GREEN}✅ Trovato: $path${NC}"
        ENV_FILE="$path"
        break
    fi
done

if [ -z "$ENV_FILE" ]; then
    echo -e "${RED}❌ Nessun file .env trovato!${NC}"
    exit 1
fi

# Backup del file
BACKUP_FILE="${ENV_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
cp "$ENV_FILE" "$BACKUP_FILE"
echo -e "${GREEN}✅ Backup creato: $BACKUP_FILE${NC}"
echo ""

# Verifica se ci sono domini da correggere
if ! grep -q "$DOMAIN_OLD" "$ENV_FILE"; then
    echo -e "${GREEN}✅ Nessun dominio '$DOMAIN_OLD' trovato nel file${NC}"
    echo "   Il file .env è già configurato correttamente!"
    exit 0
fi

echo "🔍 Domini da correggere:"
grep "$DOMAIN_OLD" "$ENV_FILE" || true
echo ""

# Chiedi conferma
read -p "Vuoi correggere tutti i '$DOMAIN_OLD' in '$DOMAIN_NEW'? (s/N): " -r response
if [[ ! "$response" =~ ^[sS]$ ]]; then
    echo "Operazione annullata."
    exit 0
fi

# Correggi tutti i domini
echo ""
echo "🔄 Correzione in corso..."

# Sostituisci tuodominio.it con unlimitedgo.it
sed -i "s/$DOMAIN_OLD/$DOMAIN_NEW/g" "$ENV_FILE"

# Verifica il risultato
echo ""
echo "✅ Correzione completata!"
echo ""
echo "📋 Domini corretti:"
grep -E "(APP_DOMAIN|BOT_DOMAIN|N8N_DOMAIN|PANEL_DOMAIN|PHPMYADMIN_DOMAIN)=" "$ENV_FILE" || true

echo ""
echo "🔄 Riavvio container Caddy..."
cd /srv/stack/infra-deploy
docker compose --env-file "$ENV_FILE" restart caddy

echo ""
echo -e "${GREEN}✅ Completato!${NC}"
echo ""
echo "📋 Prossimi passi:"
echo "   1. Attendi 30 secondi che Caddy si riavvii"
echo "   2. Verifica i log: docker logs caddy --tail 20"
echo "   3. Prova ad accedere a: https://app.unlimitedgo.it"
echo ""

