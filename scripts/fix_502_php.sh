#!/bin/bash
# Script per risolvere errore 502 Bad Gateway - Caddy non può connettersi a PHP

set -e

echo "=========================================="
echo "Fix Errore 502 - Caddy → PHP"
echo "=========================================="
echo ""

# Colori
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "📋 [1/6] Verifica container PHP..."
if docker ps | grep -q "php"; then
    echo -e "${GREEN}✅ Container PHP in esecuzione${NC}"
    PHP_STATUS=$(docker ps | grep php | awk '{print $7}')
    echo "   Stato: $PHP_STATUS"
else
    echo -e "${RED}❌ Container PHP NON in esecuzione!${NC}"
    echo ""
    echo "🔄 Avvio container PHP..."
    cd /srv/stack/infra-deploy
    docker compose up -d php
    sleep 5
fi

echo ""
echo "📋 [2/6] Verifica container Caddy..."
if docker ps | grep -q "caddy"; then
    echo -e "${GREEN}✅ Container Caddy in esecuzione${NC}"
else
    echo -e "${RED}❌ Container Caddy NON in esecuzione!${NC}"
    exit 1
fi

echo ""
echo "📋 [3/6] Verifica che PHP-FPM stia ascoltando..."
if docker exec php ps aux | grep -q "php-fpm"; then
    echo -e "${GREEN}✅ PHP-FPM in esecuzione nel container${NC}"
else
    echo -e "${RED}❌ PHP-FPM NON in esecuzione!${NC}"
    echo ""
    echo "🔄 Riavvio container PHP..."
    docker compose restart php
    sleep 5
fi

echo ""
echo "📋 [4/6] Verifica connessione Caddy → PHP..."
# Test se Caddy può raggiungere PHP sulla porta 9000
if docker exec caddy nc -z php 9000 2>/dev/null || docker exec caddy sh -c "timeout 2 sh -c '</dev/tcp/php/9000'" 2>/dev/null; then
    echo -e "${GREEN}✅ Caddy può raggiungere PHP sulla porta 9000${NC}"
else
    echo -e "${RED}❌ Caddy NON può raggiungere PHP sulla porta 9000${NC}"
    echo ""
    echo "🔍 Verifica rete Docker..."
    docker network inspect stack | grep -A 5 "php\|caddy" || echo "Errore nella verifica rete"
fi

echo ""
echo "📋 [5/6] Verifica log PHP..."
echo "Ultimi errori PHP:"
docker logs php --tail 20 2>&1 | grep -iE "(error|fatal|warning)" | tail -10 || echo "Nessun errore recente"

echo ""
echo "📋 [6/6] Verifica log Caddy..."
echo "Ultimi errori Caddy:"
docker logs caddy --tail 20 2>&1 | grep -iE "(502|error|php)" | tail -10 || echo "Nessun errore recente"

echo ""
echo "=========================================="
echo "🔧 SOLUZIONI PROPOSTE:"
echo "=========================================="
echo ""

# Verifica se i container sono sulla stessa rete
if docker network inspect stack >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Rete 'stack' esiste${NC}"
    
    # Verifica se PHP è sulla rete
    if docker network inspect stack | grep -q "php"; then
        echo -e "${GREEN}✅ Container PHP è sulla rete 'stack'${NC}"
    else
        echo -e "${RED}❌ Container PHP NON è sulla rete 'stack'${NC}"
        echo ""
        echo "🔧 Soluzione: Riavvia tutti i container"
        echo "   cd /srv/stack/infra-deploy"
        echo "   docker compose down"
        echo "   docker compose up -d"
    fi
    
    # Verifica se Caddy è sulla rete
    if docker network inspect stack | grep -q "caddy"; then
        echo -e "${GREEN}✅ Container Caddy è sulla rete 'stack'${NC}"
    else
        echo -e "${RED}❌ Container Caddy NON è sulla rete 'stack'${NC}"
    fi
else
    echo -e "${RED}❌ Rete 'stack' non esiste!${NC}"
    echo ""
    echo "🔧 Soluzione: Riavvia tutti i container"
    echo "   cd /srv/stack/infra-deploy"
    echo "   docker compose down"
    echo "   docker compose up -d"
fi

echo ""
echo "🔄 Riavvio consigliato:"
echo "   cd /srv/stack/infra-deploy"
echo "   docker compose restart php caddy"
echo ""

