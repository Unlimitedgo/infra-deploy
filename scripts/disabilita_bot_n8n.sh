#!/bin/bash
# Script per commentare/disabilitare BOT_DOMAIN e N8N_DOMAIN nel file .env

set -e

echo "=========================================="
echo "Disabilita BOT e N8N nel File .env"
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

# Verifica stato attuale
echo "📋 Stato attuale:"
if grep -q "^BOT_DOMAIN=" "$ENV_FILE"; then
    BOT_LINE=$(grep "^BOT_DOMAIN=" "$ENV_FILE")
    if [[ "$BOT_LINE" == \#* ]]; then
        echo -e "${YELLOW}   BOT_DOMAIN: già commentato${NC}"
    else
        echo -e "${GREEN}   BOT_DOMAIN: attivo${NC}"
    fi
else
    echo -e "${YELLOW}   BOT_DOMAIN: non trovato${NC}"
fi

if grep -q "^N8N_DOMAIN=" "$ENV_FILE"; then
    N8N_LINE=$(grep "^N8N_DOMAIN=" "$ENV_FILE")
    if [[ "$N8N_LINE" == \#* ]]; then
        echo -e "${YELLOW}   N8N_DOMAIN: già commentato${NC}"
    else
        echo -e "${GREEN}   N8N_DOMAIN: attivo${NC}"
    fi
else
    echo -e "${YELLOW}   N8N_DOMAIN: non trovato${NC}"
fi

echo ""

# Chiedi conferma
read -p "Vuoi commentare BOT_DOMAIN e N8N_DOMAIN? (s/N): " -r response
if [[ ! "$response" =~ ^[sS]$ ]]; then
    echo "Operazione annullata."
    exit 0
fi

# Commenta BOT_DOMAIN se non è già commentato
if grep -q "^BOT_DOMAIN=" "$ENV_FILE"; then
    sed -i 's/^BOT_DOMAIN=/#BOT_DOMAIN=/' "$ENV_FILE"
    echo -e "${GREEN}✅ BOT_DOMAIN commentato${NC}"
fi

# Commenta N8N_DOMAIN se non è già commentato
if grep -q "^N8N_DOMAIN=" "$ENV_FILE"; then
    sed -i 's/^N8N_DOMAIN=/#N8N_DOMAIN=/' "$ENV_FILE"
    echo -e "${GREEN}✅ N8N_DOMAIN commentato${NC}"
fi

echo ""
echo "📋 File .env aggiornato:"
grep -E "^(#)?(BOT_DOMAIN|N8N_DOMAIN)=" "$ENV_FILE" || true

# Commenta anche nel Caddyfile
CADDYFILE="/srv/stack/infra-deploy/Caddyfile"
if [ -f "$CADDYFILE" ]; then
    echo ""
    echo "📋 Aggiornamento Caddyfile..."
    
    # Commenta il blocco BOT_DOMAIN se non è già commentato
    if grep -q "^{$BOT_DOMAIN}" "$CADDYFILE"; then
        sed -i 's/^{$BOT_DOMAIN}/#{$BOT_DOMAIN}/' "$CADDYFILE"
        sed -i '/^#{$BOT_DOMAIN}/,/^}$/s/^/#/' "$CADDYFILE"
        sed -i 's/^#}$/}/' "$CADDYFILE"  # Rimuovi # dall'ultima }
        echo -e "${GREEN}✅ Blocco BOT_DOMAIN commentato nel Caddyfile${NC}"
    fi
    
    # Commenta il blocco N8N_DOMAIN se non è già commentato
    if grep -q "^{$N8N_DOMAIN}" "$CADDYFILE"; then
        sed -i 's/^{$N8N_DOMAIN}/#{$N8N_DOMAIN}/' "$CADDYFILE"
        sed -i '/^#{$N8N_DOMAIN}/,/^}$/s/^/#/' "$CADDYFILE"
        sed -i 's/^#}$/}/' "$CADDYFILE"  # Rimuovi # dall'ultima }
        echo -e "${GREEN}✅ Blocco N8N_DOMAIN commentato nel Caddyfile${NC}"
    fi
fi

echo ""
echo "🔄 Riavvio container Caddy..."
cd /srv/stack/infra-deploy
docker compose --env-file "$ENV_FILE" restart caddy

echo ""
echo -e "${GREEN}✅ Completato!${NC}"
echo ""
echo "📋 Caddy ora:"
echo "   ✅ Non cercherà più certificati per bot.* e n8n.*"
echo "   ✅ Si concentrerà solo su app.unlimitedgo.it e panel.unlimitedgo.it"
echo ""
echo "💡 Per riabilitarli in futuro:"
echo "   1. Rimuovi il # dalle righe nel file .env"
echo "   2. Rimuovi il # dal Caddyfile"
echo "   3. Riavvia Caddy"
echo ""

