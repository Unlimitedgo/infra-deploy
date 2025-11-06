#!/bin/bash
# Script semplificato per importare file SQL piccoli/medi
# Bypassa completamente phpMyAdmin

set -e

if [ -z "$1" ]; then
    echo "❌ ERRORE: File SQL non specificato!"
    echo ""
    echo "USAGE: ./import_sql_simple.sh /path/to/file.sql"
    exit 1
fi

SQL_FILE="$1"

if [ ! -f "$SQL_FILE" ]; then
    echo "❌ ERRORE: File non trovato: $SQL_FILE"
    exit 1
fi

# Carica variabili d'ambiente
if [ -f "../.env" ]; then
    source ../.env
elif [ -f ".env" ]; then
    source .env
fi

MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-}"
MYSQL_DATABASE="${MYSQL_DATABASE:-gestionale}"

echo "📋 Import SQL - File: $SQL_FILE"
echo "   Database: $MYSQL_DATABASE"
echo "   Dimensione: $(du -h "$SQL_FILE" | cut -f1)"
echo ""

# Import diretto
if [ -z "$MYSQL_ROOT_PASSWORD" ]; then
    echo "🔄 Importazione in corso..."
    docker exec -i db mysql -u root "$MYSQL_DATABASE" < "$SQL_FILE"
else
    echo "🔄 Importazione in corso..."
    docker exec -i db mysql -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" < "$SQL_FILE"
fi

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ SUCCESSO: Database importato correttamente!"
else
    echo ""
    echo "❌ ERRORE: Importazione fallita!"
    exit 1
fi

