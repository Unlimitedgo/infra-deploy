#!/bin/bash
# Diagnostica completa per capire perché il gestionale non si carica

set -e

echo "=========================================="
echo "DIAGNOSTICA COMPLETA GESTIONALE"
echo "=========================================="
echo ""

# Colori
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ENV_FILE="/srv/stack/.env"
GESTIONALE_PATH="/srv/stack/gestionale"

echo "📋 [1/8] Verifica file .env..."
if [ -f "$ENV_FILE" ]; then
    echo -e "${GREEN}✅ File .env trovato: $ENV_FILE${NC}"
    echo ""
    echo "Configurazione domini:"
    grep -E "(APP_DOMAIN|BASE_PATH|DB_)" "$ENV_FILE" | head -10
else
    echo -e "${RED}❌ File .env non trovato!${NC}"
fi

echo ""
echo "📋 [2/8] Verifica file .env nella cartella gestionale..."
if [ -f "$GESTIONALE_PATH/.env" ]; then
    echo -e "${GREEN}✅ File .env trovato in gestionale${NC}"
    echo ""
    echo "Contenuto:"
    cat "$GESTIONALE_PATH/.env" | head -20
else
    echo -e "${YELLOW}⚠️  File .env non trovato in $GESTIONALE_PATH${NC}"
    echo "   Il gestionale potrebbe usare il file .env principale"
fi

echo ""
echo "📋 [3/8] Verifica funzione redirect() nel codice..."
if [ -f "$GESTIONALE_PATH/helpers.php" ]; then
    echo "Cerca funzione redirect:"
    grep -A 5 "function redirect" "$GESTIONALE_PATH/helpers.php" || echo "Non trovata"
fi

echo ""
echo "📋 [4/8] Verifica BASE_PATH nel codice..."
if [ -f "$GESTIONALE_PATH/helpers.php" ]; then
    echo "Cerca base_path:"
    grep -A 10 "function base_path" "$GESTIONALE_PATH/helpers.php" | head -15 || echo "Non trovata"
fi

echo ""
echo "📋 [5/8] Test connessione HTTP diretta..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://app.unlimitedgo.it" 2>&1 || echo "000")
if [ "$HTTP_CODE" != "000" ]; then
    echo -e "${GREEN}✅ HTTP risponde: $HTTP_CODE${NC}"
    
    # Test redirect
    echo ""
    echo "Test redirect:"
    curl -I "http://app.unlimitedgo.it" 2>&1 | grep -i "location" || echo "Nessun redirect"
else
    echo -e "${RED}❌ HTTP non risponde${NC}"
fi

echo ""
echo "📋 [6/8] Test connessione HTTPS..."
HTTPS_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "https://app.unlimitedgo.it" 2>&1 || echo "000")
if [ "$HTTPS_CODE" != "000" ]; then
    echo -e "${GREEN}✅ HTTPS risponde: $HTTPS_CODE${NC}"
    
    # Test redirect e header
    echo ""
    echo "Header completi:"
    curl -I "https://app.unlimitedgo.it" 2>&1 | head -15
else
    echo -e "${RED}❌ HTTPS non risponde${NC}"
fi

echo ""
echo "📋 [7/8] Verifica log Caddy (ultime 30 righe)..."
echo "Cerca errori o problemi:"
docker logs caddy --tail 30 2>&1 | grep -iE "(error|warn|app.unlimitedgo)" || echo "Nessun errore recente"

echo ""
echo "📋 [8/8] Verifica log PHP..."
if [ -f "$GESTIONALE_PATH/logs/error.log" ]; then
    echo "Ultimi errori PHP:"
    tail -20 "$GESTIONALE_PATH/logs/error.log" 2>/dev/null || echo "Nessun log PHP"
else
    echo -e "${YELLOW}⚠️  File di log PHP non trovato${NC}"
fi

echo ""
echo "=========================================="
echo "🔍 PROBLEMA PROBABILE:"
echo "=========================================="
echo ""
echo "Il redirect a '//login' suggerisce che:"
echo "  1. base_path() restituisce una stringa vuota o '/'"
echo "  2. redirect() fa: base_path() + '/login' = '//login'"
echo ""
echo "🔧 SOLUZIONE:"
echo "  1. Verifica che BASE_PATH non sia vuoto nel .env"
echo "  2. In produzione, BASE_PATH dovrebbe essere '/' o vuoto"
echo "  3. Controlla la funzione redirect() in helpers.php"
echo ""
echo "📋 Prossimi passi:"
echo "  1. Verifica il file .env: cat $ENV_FILE | grep BASE_PATH"
echo "  2. Se BASE_PATH è vuoto o mancante, aggiungi: BASE_PATH=/"
echo "  3. Riavvia PHP: docker compose restart php"
echo ""

