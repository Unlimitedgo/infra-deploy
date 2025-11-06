#!/bin/bash
# Script alternativo: carica il file SQL sul server e importalo
# Utile quando il file è sul tuo computer locale

set -e

echo "=========================================="
echo "Import SQL - Caricamento e Importazione"
echo "=========================================="
echo ""

if [ -z "$1" ]; then
    echo "❌ ERRORE: File SQL non specificato!"
    echo ""
    echo "USAGE:"
    echo "  ./import_sql_via_panel.sh /path/to/file.sql"
    echo ""
    echo "Questo script:"
    echo "  1. Copia il file SQL nel container"
    echo "  2. Lo importa direttamente nel database"
    echo "  3. Mostra il progresso in tempo reale"
    exit 1
fi

SQL_FILE="$1"

if [ ! -f "$SQL_FILE" ]; then
    echo "❌ ERRORE: File SQL non trovato: $SQL_FILE"
    exit 1
fi

# Carica le variabili d'ambiente
if [ -f "../.env" ]; then
    source ../.env
elif [ -f ".env" ]; then
    source .env
fi

MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-}"
MYSQL_DATABASE="${MYSQL_DATABASE:-gestionale}"

echo "📋 Configurazione:"
echo "   File SQL: $SQL_FILE"
echo "   Database: $MYSQL_DATABASE"
echo "   Dimensione: $(du -h "$SQL_FILE" | cut -f1)"
echo ""

read -p "Vuoi continuare? (s/N): " -r response
if [[ ! "$response" =~ ^[sS]$ ]]; then
    echo "Operazione annullata."
    exit 0
fi

echo ""
echo "🔄 [1/3] Copia file nel container..."
TEMP_PATH="/tmp/import_$(basename "$SQL_FILE")"
docker cp "$SQL_FILE" db:"$TEMP_PATH"
echo "   ✅ File copiato in: $TEMP_PATH"

echo ""
echo "🔄 [2/3] Eliminazione e creazione database..."
if [ -z "$MYSQL_ROOT_PASSWORD" ]; then
    docker exec db mysql -u root -e "DROP DATABASE IF EXISTS \`$MYSQL_DATABASE\`; CREATE DATABASE \`$MYSQL_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
else
    docker exec db mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "DROP DATABASE IF EXISTS \`$MYSQL_DATABASE\`; CREATE DATABASE \`$MYSQL_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
fi
echo "   ✅ Database pronto"

echo ""
echo "🔄 [3/3] Importazione file SQL..."
echo "   ⏳ Questo può richiedere diversi minuti..."
echo ""

if [ -z "$MYSQL_ROOT_PASSWORD" ]; then
    docker exec db mysql -u root "$MYSQL_DATABASE" < "$(docker exec db sh -c "echo $TEMP_PATH")"
    docker exec db mysql -u root "$MYSQL_DATABASE" -e "source $TEMP_PATH" 2>&1 | head -20
    # Metodo alternativo più affidabile
    docker exec -i db sh -c "mysql -u root $MYSQL_DATABASE" < "$SQL_FILE"
else
    docker exec -i db sh -c "mysql -u root -p'$MYSQL_ROOT_PASSWORD' $MYSQL_DATABASE" < "$SQL_FILE"
fi

# Pulisci il file temporaneo
docker exec db rm -f "$TEMP_PATH" 2>/dev/null || true

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "✅ SUCCESSO: Database importato!"
    echo "=========================================="
else
    echo ""
    echo "=========================================="
    echo "❌ ERRORE: Importazione fallita!"
    echo "=========================================="
    exit 1
fi

