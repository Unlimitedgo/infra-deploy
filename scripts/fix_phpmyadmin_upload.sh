#!/bin/bash
# Script per aumentare i limiti di upload di phpMyAdmin e risolvere problemi di import SQL

echo "=========================================="
echo "Fix phpMyAdmin Upload Limits"
echo "=========================================="
echo ""

# Verifica che docker-compose.yml esista
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ ERRORE: docker-compose.yml non trovato!"
    echo "   Esegui questo script dalla directory infra-deploy"
    exit 1
fi

echo "✅ File docker-compose.yml trovato"
echo ""

# Verifica se le variabili sono già presenti
if grep -q "UPLOAD_LIMIT" docker-compose.yml; then
    echo "⚠️  Le variabili UPLOAD_LIMIT sono già presenti nel docker-compose.yml"
    echo "   Vuoi riavviare comunque phpMyAdmin? (s/n)"
    read -r response
    if [[ ! "$response" =~ ^[sS]$ ]]; then
        echo "Operazione annullata."
        exit 0
    fi
else
    echo "⚠️  Le variabili UPLOAD_LIMIT non sono presenti nel docker-compose.yml"
    echo "   Assicurati di aver aggiornato il file con le nuove configurazioni"
    echo ""
    echo "   Variabili da aggiungere:"
    echo "   - UPLOAD_LIMIT=500M"
    echo "   - MAX_EXECUTION_TIME=3600"
    echo "   - MEMORY_LIMIT=512M"
    echo ""
    echo "   Vuoi continuare comunque? (s/n)"
    read -r response
    if [[ ! "$response" =~ ^[sS]$ ]]; then
        echo "Operazione annullata."
        exit 0
    fi
fi

echo ""
echo "🔄 Riavvio del container phpMyAdmin..."
docker compose restart phpmyadmin

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ phpMyAdmin riavviato con successo!"
    echo ""
    echo "📋 Prossimi passi:"
    echo "   1. Attendi 10-15 secondi che il container si avvii completamente"
    echo "   2. Ricarica la pagina di phpMyAdmin nel browser"
    echo "   3. Vai su 'Impostazioni' → 'Caratteristiche' per verificare i nuovi limiti:"
    echo "      - Upload max filesize: dovrebbe essere 500M"
    echo "      - Max execution time: dovrebbe essere 3600 secondi"
    echo "   4. Prova a importare di nuovo il file SQL"
    echo ""
    echo "💡 Se il problema persiste, considera di usare l'import tramite SSH:"
    echo "   Vedi SOLUZIONE_IMPORT_SQL.md per dettagli"
else
    echo ""
    echo "❌ ERRORE: Impossibile riavviare phpMyAdmin"
    echo "   Verifica i log con: docker logs phpmyadmin"
    exit 1
fi

echo ""
echo "=========================================="

