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
if docker exec db mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "CREATE USER IF NOT EXISTS '$MYSQL_USER'@'%' IDENTIFIED BY '$MYSQL_PASSWORD';" 2>&1; then
    echo "   ✅ Utente creato con host '%'"
else
    echo "   ⚠️  Errore nella creazione utente con host '%' (potrebbe già esistere)"
fi

# Assegna privilegi
echo "   Assegnazione privilegi..."
if docker exec db mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "GRANT ALL PRIVILEGES ON *.* TO '$MYSQL_USER'@'%' WITH GRANT OPTION;" 2>&1; then
    echo "   ✅ Privilegi assegnati"
else
    echo "   ⚠️  Errore nell'assegnazione privilegi"
fi

# Crea l'utente con host localhost
echo "   Creazione utente con host 'localhost'..."
if docker exec db mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "CREATE USER IF NOT EXISTS '$MYSQL_USER'@'localhost' IDENTIFIED BY '$MYSQL_PASSWORD';" 2>&1; then
    echo "   ✅ Utente creato con host 'localhost'"
else
    echo "   ⚠️  Errore nella creazione utente con host 'localhost' (potrebbe già esistere)"
fi

# Assegna privilegi per localhost
if docker exec db mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "GRANT ALL PRIVILEGES ON *.* TO '$MYSQL_USER'@'localhost' WITH GRANT OPTION;" 2>&1; then
    echo "   ✅ Privilegi assegnati per localhost"
fi

# Flush privilegi
echo "   Applicazione privilegi..."
docker exec db mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "FLUSH PRIVILEGES;" 2>&1

echo ""
echo "✅ Verifica utente creato..."
USERS=$(docker exec db mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "SELECT User, Host FROM mysql.user WHERE User='$MYSQL_USER';" 2>&1)
if echo "$USERS" | grep -q "$MYSQL_USER"; then
    echo "$USERS"
    echo "   ✅ Utente trovato!"
else
    echo "   ❌ Utente NON trovato!"
    echo "   Output: $USERS"
    exit 1
fi

echo ""
echo "✅ Verifica privilegi..."
GRANTS=$(docker exec db mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "SHOW GRANTS FOR '$MYSQL_USER'@'%';" 2>&1)
if echo "$GRANTS" | grep -q "GRANT ALL PRIVILEGES"; then
    echo "$GRANTS"
    echo "   ✅ Privilegi corretti!"
else
    echo "   ⚠️  Privilegi non corretti o utente non esiste"
    echo "   Output: $GRANTS"
    echo ""
    echo "   Tentativo di correzione..."
    docker exec db mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "GRANT ALL PRIVILEGES ON *.* TO '$MYSQL_USER'@'%' WITH GRANT OPTION; FLUSH PRIVILEGES;" 2>&1
    docker exec db mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "SHOW GRANTS FOR '$MYSQL_USER'@'%';" 2>&1
fi

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

