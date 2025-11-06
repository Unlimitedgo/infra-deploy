#!/bin/bash
# Script per importare un file SQL direttamente nel database, bypassando phpMyAdmin
# Questo risolve il problema del progresso che non si carica

set -e

echo "=========================================="
echo "Import SQL Diretto - Bypass phpMyAdmin"
echo "=========================================="
echo ""

# Verifica che docker-compose.yml esista
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ ERRORE: docker-compose.yml non trovato!"
    echo "   Esegui questo script dalla directory infra-deploy"
    exit 1
fi

# Verifica che il file SQL sia stato fornito
if [ -z "$1" ]; then
    echo "❌ ERRORE: File SQL non specificato!"
    echo ""
    echo "USAGE:"
    echo "  ./import_sql_direct.sh /path/to/file.sql"
    echo ""
    echo "ESEMPIO:"
    echo "  ./import_sql_direct.sh /tmp/gestionale.sql"
    echo "  ./import_sql_direct.sh ~/Downloads/database.sql"
    exit 1
fi

SQL_FILE="$1"

# Verifica che il file esista
if [ ! -f "$SQL_FILE" ]; then
    echo "❌ ERRORE: File SQL non trovato: $SQL_FILE"
    exit 1
fi

# Verifica che il container db sia in esecuzione
if ! docker ps | grep -q "db"; then
    echo "❌ ERRORE: Container 'db' non è in esecuzione!"
    echo "   Avvia i container con: docker compose up -d"
    exit 1
fi

# Carica le variabili d'ambiente
if [ -f "../.env" ]; then
    source ../.env
elif [ -f ".env" ]; then
    source .env
else
    echo "⚠️  File .env non trovato, uso valori di default"
    MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-}"
    MYSQL_DATABASE="${MYSQL_DATABASE:-gestionale}"
fi

# Valori di default se non specificati
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-}"
MYSQL_DATABASE="${MYSQL_DATABASE:-gestionale}"

echo "📋 Configurazione:"
echo "   File SQL: $SQL_FILE"
echo "   Database: $MYSQL_DATABASE"
echo "   Dimensione file: $(du -h "$SQL_FILE" | cut -f1)"
echo ""

# Chiedi conferma
echo "⚠️  ATTENZIONE: Questo script:"
echo "   1. Eliminerà il database esistente '$MYSQL_DATABASE'"
echo "   2. Creerà un nuovo database vuoto"
echo "   3. Importerà il file SQL"
echo ""
read -p "Vuoi continuare? (s/N): " -r response
if [[ ! "$response" =~ ^[sS]$ ]]; then
    echo "Operazione annullata."
    exit 0
fi

echo ""
echo "🔄 [1/4] Eliminazione database esistente..."
if [ -z "$MYSQL_ROOT_PASSWORD" ]; then
    docker exec db mysql -u root -e "DROP DATABASE IF EXISTS \`$MYSQL_DATABASE\`;" 2>/dev/null || true
else
    docker exec db mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "DROP DATABASE IF EXISTS \`$MYSQL_DATABASE\`;" 2>/dev/null || true
fi
echo "   ✅ Database eliminato"

echo ""
echo "🔄 [2/4] Creazione nuovo database..."
if [ -z "$MYSQL_ROOT_PASSWORD" ]; then
    docker exec db mysql -u root -e "CREATE DATABASE \`$MYSQL_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null || true
else
    docker exec db mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "CREATE DATABASE \`$MYSQL_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null || true
fi
echo "   ✅ Database creato"

echo ""
echo "🔄 [3/4] Aumento max_allowed_packet per file grandi..."
if [ -z "$MYSQL_ROOT_PASSWORD" ]; then
    docker exec db mysql -u root -e "SET GLOBAL max_allowed_packet=1073741824;" 2>/dev/null || true
else
    docker exec db mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "SET GLOBAL max_allowed_packet=1073741824;" 2>/dev/null || true
fi
echo "   ✅ max_allowed_packet aumentato a 1GB"

echo ""
echo "🔄 [4/4] Importazione file SQL..."
echo "   ⏳ Questo può richiedere diversi minuti per file grandi..."
echo "   📊 Il progresso verrà mostrato in tempo reale"
echo ""

# Mostra progresso durante l'import
if [ -z "$MYSQL_ROOT_PASSWORD" ]; then
    if command -v pv >/dev/null 2>&1; then
        # Usa pv per mostrare progresso se disponibile
        pv "$SQL_FILE" | docker exec -i db mysql -u root "$MYSQL_DATABASE"
    else
        # Altrimenti importa normalmente
        docker exec -i db mysql -u root "$MYSQL_DATABASE" < "$SQL_FILE"
    fi
else
    if command -v pv >/dev/null 2>&1; then
        pv "$SQL_FILE" | docker exec -i db mysql -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"
    else
        docker exec -i db mysql -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" < "$SQL_FILE"
    fi
fi

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "✅ SUCCESSO: Database importato correttamente!"
    echo "=========================================="
    echo ""
    echo "📊 Verifica:"
    echo "   Puoi verificare l'importazione accedendo a phpMyAdmin"
    echo "   oppure eseguendo:"
    echo "   docker exec -i db mysql -u root -p'$MYSQL_ROOT_PASSWORD' -e 'SHOW TABLES;' $MYSQL_DATABASE"
else
    echo ""
    echo "=========================================="
    echo "❌ ERRORE: Importazione fallita!"
    echo "=========================================="
    echo ""
    echo "💡 Suggerimenti:"
    echo "   1. Verifica che il file SQL sia valido"
    echo "   2. Controlla i log: docker logs db"
    echo "   3. Verifica che ci sia spazio su disco sufficiente"
    echo "   4. Prova a dividere il file SQL in parti più piccole"
    exit 1
fi

