#!/bin/bash
# Script per diagnosticare e risolvere il problema DNS di app.unlimitedgo.it

set -e

echo "=========================================="
echo "Diagnostica DNS - app.unlimitedgo.it"
echo "=========================================="
echo ""

ENV_PATH="/srv/stack/.env"
IP_VPS="136.144.242.149"
DOMAIN="app.unlimitedgo.it"

# Colori
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Verifica file .env
echo "📋 [1/6] Verifica configurazione .env..."
if [ ! -f "$ENV_PATH" ]; then
    echo -e "${RED}❌ File .env non trovato in $ENV_PATH${NC}"
    exit 1
fi

APP_DOMAIN=$(grep "^APP_DOMAIN=" "$ENV_PATH" | cut -d'=' -f2 | tr -d '"' | tr -d "'")
if [ -z "$APP_DOMAIN" ]; then
    echo -e "${RED}❌ APP_DOMAIN non configurato nel .env${NC}"
    echo ""
    echo "Aggiungi questa riga al file $ENV_PATH:"
    echo "APP_DOMAIN=$DOMAIN"
    exit 1
fi

if [ "$APP_DOMAIN" != "$DOMAIN" ]; then
    echo -e "${YELLOW}⚠️  APP_DOMAIN nel .env è: $APP_DOMAIN${NC}"
    echo -e "${YELLOW}   Dovrebbe essere: $DOMAIN${NC}"
    echo ""
    read -p "Vuoi correggere? (s/N): " -r response
    if [[ "$response" =~ ^[sS]$ ]]; then
        # Backup
        cp "$ENV_PATH" "$ENV_PATH.backup.$(date +%Y%m%d_%H%M%S)"
        # Sostituisci o aggiungi APP_DOMAIN
        if grep -q "^APP_DOMAIN=" "$ENV_PATH"; then
            sed -i "s|^APP_DOMAIN=.*|APP_DOMAIN=$DOMAIN|" "$ENV_PATH"
        else
            echo "APP_DOMAIN=$DOMAIN" >> "$ENV_PATH"
        fi
        echo -e "${GREEN}✅ APP_DOMAIN aggiornato a $DOMAIN${NC}"
        APP_DOMAIN="$DOMAIN"
    fi
else
    echo -e "${GREEN}✅ APP_DOMAIN configurato correttamente: $APP_DOMAIN${NC}"
fi

# 2. Verifica DNS
echo ""
echo "📋 [2/6] Verifica risoluzione DNS..."
if command -v dig >/dev/null 2>&1; then
    DNS_RESULT=$(dig +short "$DOMAIN" 2>&1 | head -1)
else
    DNS_RESULT=$(nslookup "$DOMAIN" 2>&1 | grep -A1 "Name:" | tail -1 | awk '{print $2}' || echo "")
fi

if [ -z "$DNS_RESULT" ] || [ "$DNS_RESULT" = "NXDOMAIN" ]; then
    echo -e "${RED}❌ DNS non risolve: $DOMAIN${NC}"
    echo ""
    echo "🔧 SOLUZIONE: Configura il record DNS A:"
    echo "   Tipo: A"
    echo "   Nome: app"
    echo "   Valore: $IP_VPS"
    echo "   TTL: 3600"
    echo ""
    echo "   Vai al pannello DNS del provider di unlimitedgo.it"
    echo "   e aggiungi questo record."
    echo ""
    read -p "Premi Enter quando hai configurato il DNS..."
else
    if [ "$DNS_RESULT" = "$IP_VPS" ]; then
        echo -e "${GREEN}✅ DNS risolve correttamente: $DOMAIN → $DNS_RESULT${NC}"
    else
        echo -e "${YELLOW}⚠️  DNS risolve a: $DNS_RESULT (dovrebbe essere $IP_VPS)${NC}"
    fi
fi

# 3. Verifica container Caddy
echo ""
echo "📋 [3/6] Verifica container Caddy..."
if docker ps | grep -q "caddy"; then
    echo -e "${GREEN}✅ Container Caddy in esecuzione${NC}"
else
    echo -e "${RED}❌ Container Caddy non in esecuzione${NC}"
    echo ""
    read -p "Vuoi avviare Caddy? (s/N): " -r response
    if [[ "$response" =~ ^[sS]$ ]]; then
        cd /srv/stack/infra-deploy
        docker compose --env-file "$ENV_PATH" up -d caddy
        echo -e "${GREEN}✅ Caddy avviato${NC}"
    fi
fi

# 4. Verifica Caddyfile
echo ""
echo "📋 [4/6] Verifica Caddyfile..."
CADDYFILE="/srv/stack/infra-deploy/Caddyfile"
if grep -q "{\$APP_DOMAIN}" "$CADDYFILE"; then
    echo -e "${GREEN}✅ Caddyfile contiene {\$APP_DOMAIN}${NC}"
else
    echo -e "${YELLOW}⚠️  Caddyfile potrebbe non essere configurato correttamente${NC}"
fi

# 5. Verifica porte firewall
echo ""
echo "📋 [5/6] Verifica porte firewall..."
if command -v ufw >/dev/null 2>&1; then
    if ufw status | grep -q "80/tcp.*ALLOW" && ufw status | grep -q "443/tcp.*ALLOW"; then
        echo -e "${GREEN}✅ Porte 80 e 443 aperte${NC}"
    else
        echo -e "${YELLOW}⚠️  Porte 80/443 potrebbero essere chiuse${NC}"
        read -p "Vuoi aprire le porte? (s/N): " -r response
        if [[ "$response" =~ ^[sS]$ ]]; then
            ufw allow 80/tcp
            ufw allow 443/tcp
            echo -e "${GREEN}✅ Porte aperte${NC}"
        fi
    fi
else
    echo -e "${YELLOW}⚠️  UFW non installato, verifica manualmente il firewall${NC}"
fi

# 6. Riavvia Caddy
echo ""
echo "📋 [6/6] Riavvio Caddy con nuova configurazione..."
cd /srv/stack/infra-deploy
docker compose --env-file "$ENV_PATH" restart caddy
echo -e "${GREEN}✅ Caddy riavviato${NC}"

# 7. Mostra log
echo ""
echo "=========================================="
echo "📊 Log Caddy (ultime 20 righe):"
echo "=========================================="
docker logs caddy --tail 20 2>&1 | grep -i "$DOMAIN" || docker logs caddy --tail 20

echo ""
echo "=========================================="
echo "✅ Diagnostica completata!"
echo "=========================================="
echo ""
echo "🔍 Prossimi passi:"
echo "   1. Verifica che il DNS sia configurato: nslookup $DOMAIN"
echo "   2. Attendi 5-10 minuti per la propagazione DNS"
echo "   3. Prova ad accedere a: https://$DOMAIN"
echo "   4. Se non funziona, controlla i log: docker logs caddy"
echo ""

