#!/bin/bash
# Script completo per verificare e correggere il file .env sulla VPS

set -e

echo "=========================================="
echo "Verifica Completa File .env VPS"
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
DOMAIN="unlimitedgo.it"

# Trova il file .env
echo "🔍 [1/5] Cerca file .env..."
for path in "${ENV_PATHS[@]}"; do
    if [ -f "$path" ]; then
        echo -e "${GREEN}✅ Trovato: $path${NC}"
        ENV_FILE="$path"
        break
    else
        echo "   ⚠️  Non trovato: $path"
    fi
done

if [ -z "$ENV_FILE" ]; then
    echo -e "${RED}❌ Nessun file .env trovato!${NC}"
    echo ""
    echo "Crea il file .env in uno di questi percorsi:"
    for path in "${ENV_PATHS[@]}"; do
        echo "   - $path"
    done
    exit 1
fi

echo ""
echo "📋 [2/5] Analisi file .env: $ENV_FILE"
echo ""

# Verifica domini
echo "🔍 Verifica domini configurati:"
echo ""

APP_DOMAIN=$(grep "^APP_DOMAIN=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" | xargs || echo "")
BOT_DOMAIN=$(grep "^BOT_DOMAIN=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" | xargs || echo "")
N8N_DOMAIN=$(grep "^N8N_DOMAIN=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" | xargs || echo "")
PANEL_DOMAIN=$(grep "^PANEL_DOMAIN=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'" | xargs || echo "")

PROBLEMS=0

if [ -z "$APP_DOMAIN" ]; then
    echo -e "${RED}❌ APP_DOMAIN non configurato${NC}"
    PROBLEMS=$((PROBLEMS + 1))
elif [[ "$APP_DOMAIN" == *"tuodominio.it"* ]]; then
    echo -e "${RED}❌ APP_DOMAIN contiene 'tuodominio.it' (valore di esempio): $APP_DOMAIN${NC}"
    PROBLEMS=$((PROBLEMS + 1))
elif [[ "$APP_DOMAIN" != *"$DOMAIN"* ]]; then
    echo -e "${YELLOW}⚠️  APP_DOMAIN non contiene '$DOMAIN': $APP_DOMAIN${NC}"
else
    echo -e "${GREEN}✅ APP_DOMAIN: $APP_DOMAIN${NC}"
fi

if [ -n "$BOT_DOMAIN" ]; then
    if [[ "$BOT_DOMAIN" == *"tuodominio.it"* ]]; then
        echo -e "${RED}❌ BOT_DOMAIN contiene 'tuodominio.it' (valore di esempio): $BOT_DOMAIN${NC}"
        PROBLEMS=$((PROBLEMS + 1))
    elif [[ "$BOT_DOMAIN" != *"$DOMAIN"* ]]; then
        echo -e "${YELLOW}⚠️  BOT_DOMAIN non contiene '$DOMAIN': $BOT_DOMAIN${NC}"
    else
        echo -e "${GREEN}✅ BOT_DOMAIN: $BOT_DOMAIN${NC}"
    fi
fi

if [ -n "$N8N_DOMAIN" ]; then
    if [[ "$N8N_DOMAIN" == *"tuodominio.it"* ]]; then
        echo -e "${RED}❌ N8N_DOMAIN contiene 'tuodominio.it' (valore di esempio): $N8N_DOMAIN${NC}"
        PROBLEMS=$((PROBLEMS + 1))
    elif [[ "$N8N_DOMAIN" != *"$DOMAIN"* ]]; then
        echo -e "${YELLOW}⚠️  N8N_DOMAIN non contiene '$DOMAIN': $N8N_DOMAIN${NC}"
    else
        echo -e "${GREEN}✅ N8N_DOMAIN: $N8N_DOMAIN${NC}"
    fi
fi

if [ -n "$PANEL_DOMAIN" ]; then
    if [[ "$PANEL_DOMAIN" == *"tuodominio.it"* ]]; then
        echo -e "${RED}❌ PANEL_DOMAIN contiene 'tuodominio.it' (valore di esempio): $PANEL_DOMAIN${NC}"
        PROBLEMS=$((PROBLEMS + 1))
    elif [[ "$PANEL_DOMAIN" != *"$DOMAIN"* ]]; then
        echo -e "${YELLOW}⚠️  PANEL_DOMAIN non contiene '$DOMAIN': $PANEL_DOMAIN${NC}"
    else
        echo -e "${GREEN}✅ PANEL_DOMAIN: $PANEL_DOMAIN${NC}"
    fi
fi

echo ""
echo "📋 [3/5] Verifica risoluzione DNS..."
echo ""

if [ -n "$APP_DOMAIN" ]; then
    if command -v dig >/dev/null 2>&1; then
        DNS_RESULT=$(dig +short "$APP_DOMAIN" 2>&1 | head -1)
    else
        DNS_RESULT=$(nslookup "$APP_DOMAIN" 2>&1 | grep -A1 "Name:" | tail -1 | awk '{print $2}' || echo "")
    fi
    
    if [ -z "$DNS_RESULT" ] || [ "$DNS_RESULT" = "NXDOMAIN" ]; then
        echo -e "${RED}❌ DNS non risolve: $APP_DOMAIN${NC}"
        echo "   Configura il record DNS A:"
        echo "   Tipo: A"
        echo "   Nome: app"
        echo "   Valore: 136.144.242.149"
        PROBLEMS=$((PROBLEMS + 1))
    else
        echo -e "${GREEN}✅ DNS risolve: $APP_DOMAIN → $DNS_RESULT${NC}"
    fi
fi

echo ""
echo "📋 [4/5] Verifica container Docker..."
echo ""

if docker ps | grep -q "caddy"; then
    echo -e "${GREEN}✅ Container Caddy in esecuzione${NC}"
else
    echo -e "${RED}❌ Container Caddy non in esecuzione${NC}"
    PROBLEMS=$((PROBLEMS + 1))
fi

if docker ps | grep -q "php"; then
    echo -e "${GREEN}✅ Container PHP in esecuzione${NC}"
else
    echo -e "${YELLOW}⚠️  Container PHP non in esecuzione${NC}"
fi

if docker ps | grep -q "db"; then
    echo -e "${GREEN}✅ Container DB in esecuzione${NC}"
else
    echo -e "${YELLOW}⚠️  Container DB non in esecuzione${NC}"
fi

echo ""
echo "📋 [5/5] Test connessione HTTP..."
echo ""

if [ -n "$APP_DOMAIN" ]; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://$APP_DOMAIN" 2>&1 || echo "000")
    if [ "$HTTP_CODE" = "000" ] || [ "$HTTP_CODE" = "000" ]; then
        echo -e "${RED}❌ Impossibile connettersi a http://$APP_DOMAIN${NC}"
        PROBLEMS=$((PROBLEMS + 1))
    else
        echo -e "${GREEN}✅ HTTP risponde: $HTTP_CODE${NC}"
    fi
fi

echo ""
echo "=========================================="
if [ $PROBLEMS -eq 0 ]; then
    echo -e "${GREEN}✅ Nessun problema rilevato!${NC}"
    echo ""
    echo "Se vedi ancora l'errore DNS_PROBE_FINISHED_NXDOMAIN:"
    echo "  1. Pulisci la cache DNS del browser"
    echo "  2. Prova in modalità incognito"
    echo "  3. Attendi 10-15 minuti per la propagazione DNS"
else
    echo -e "${RED}❌ Trovati $PROBLEMS problema/i${NC}"
    echo ""
    echo "🔧 Soluzione:"
    echo ""
    if grep -q "tuodominio.it" "$ENV_FILE"; then
        echo "1. Correggi il file .env:"
        echo "   nano $ENV_FILE"
        echo ""
        echo "   Sostituisci tutti i 'tuodominio.it' con 'unlimitedgo.it'"
        echo ""
        echo "2. Riavvia i container:"
        echo "   cd /srv/stack/infra-deploy"
        echo "   docker compose --env-file $ENV_FILE restart caddy"
    fi
fi
echo "=========================================="

