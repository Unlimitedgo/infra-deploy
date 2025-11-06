#!/bin/bash
# Script per creare utente MySQL 'unlimited' con privilegi completi
# Esegui questo script sul VPS

set -e

MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-rootpass123}"
MYSQL_USER="unlimited"
MYSQL_PASSWORD="Boeing.737!!2025"

echo "🔧 =========================================="
echo "   Creazione Utente MySQL 'unlimited'"
echo "=========================================="
echo ""

# Verifica che il container db sia in esecuzione
if ! docker ps | grep -q "db"; then
    echo "❌ ERRORE: Il container 'db' non è in esecuzione!"
    echo "   Avvia il container con: docker compose up -d db"
    exit 1
fi

# Attendi che MySQL sia pronto
echo "⏳ Attendo che MySQL sia pronto..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if docker exec db mysqladmin ping -h localhost --silent 2>/dev/null; then
        echo "✅ MySQL è pronto"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "   Tentativo $RETRY_COUNT/$MAX_RETRIES..."
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "❌ ERRORE: MySQL non è diventato pronto dopo $MAX_RETRIES tentativi"
    exit 1
fi

echo ""
echo "🔍 Verifica utenti esistenti..."
docker exec db mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "SELECT User, Host FROM mysql.user WHERE User='$MYSQL_USER';" 2>/dev/null || echo "   Nessun utente '$MYSQL_USER' trovato"

echo ""
echo "🔐 Creazione utente '$MYSQL_USER'..."

# Crea l'utente con host %
echo "   Creazione utente con host '%'..."
docker exec db mysql -u root -p"$MYSQL_ROOT_PASSWORD" <<EOF 2>&1
CREATE USER IF NOT EXISTS '$MYSQL_USER'@'%' IDENTIFIED BY '$MYSQL_PASSWORD';
GRANT ALL PRIVILEGES ON *.* TO '$MYSQL_USER'@'%' WITH GRANT OPTION;
EOF

# Crea l'utente con host localhost
echo "   Creazione utente con host 'localhost'..."
docker exec db mysql -u root -p"$MYSQL_ROOT_PASSWORD" <<EOF 2>&1
CREATE USER IF NOT EXISTS '$MYSQL_USER'@'localhost' IDENTIFIED BY '$MYSQL_PASSWORD';
GRANT ALL PRIVILEGES ON *.* TO '$MYSQL_USER'@'localhost' WITH GRANT OPTION;
EOF

# Flush privilegi
echo "   Applicazione privilegi..."
docker exec db mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "FLUSH PRIVILEGES;" 2>&1

echo ""
echo "✅ Verifica utente creato..."
docker exec db mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "SELECT User, Host FROM mysql.user WHERE User='$MYSQL_USER';"

echo ""
echo "✅ Verifica privilegi..."
docker exec db mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "SHOW GRANTS FOR '$MYSQL_USER'@'%';"

echo ""
echo "🧪 Test connessione..."
if docker exec db mysql -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" -e "SELECT 1;" 2>/dev/null; then
    echo "   ✅ Connessione riuscita!"
else
    echo "   ❌ Connessione fallita!"
    exit 1
fi

echo ""
echo "🧪 Test creazione database..."
TEST_DB="test_unlimited_$(date +%s)"
if docker exec db mysql -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" -e "CREATE DATABASE \`$TEST_DB\`;" 2>/dev/null; then
    echo "   ✅ Database creato con successo!"
    docker exec db mysql -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" -e "DROP DATABASE \`$TEST_DB\`;" 2>/dev/null
    echo "   ✅ Database eliminato (test completato)"
else
    echo "   ❌ Errore nella creazione database!"
    exit 1
fi

echo ""
echo "✅ =========================================="
echo "   Utente '$MYSQL_USER' creato con successo!"
echo "=========================================="
echo ""
echo "📋 Credenziali:"
echo "   Username: $MYSQL_USER"
echo "   Password: $MYSQL_PASSWORD"
echo ""
echo "💡 Ora puoi:"
echo "   - Accedere a phpMyAdmin con queste credenziali"
echo "   - Creare database"
echo "   - Importare file SQL"
echo ""

