# Soluzione Problema Import SQL su phpMyAdmin

## Problema
Quando si tenta di importare un file SQL tramite phpMyAdmin:
- Il caricamento rimane in loop e non completa l'operazione
- **"Non è stato possibile caricare la progressione del processo di importazione"**
- Il browser si disconnette durante l'upload
- Timeout della connessione HTTP

## Cause Comuni
1. **File troppo grande**: I limiti di upload PHP sono troppo bassi
2. **Timeout**: Il tempo massimo di esecuzione è insufficiente
3. **Memoria insufficiente**: Il file richiede più memoria di quella disponibile

## Soluzioni

### ✅ Soluzione 1: Aumentare i Limiti di phpMyAdmin (Raccomandato)

Modifica il `docker-compose.yml` per aggiungere variabili d'ambiente che aumentano i limiti:

```yaml
phpmyadmin:
  image: phpmyadmin/phpmyadmin:latest
  container_name: phpmyadmin
  restart: unless-stopped
  environment:
    - PMA_HOST=db
    - PMA_PORT=3306
    - PMA_USER=${MYSQL_USER}
    - PMA_PASSWORD=${MYSQL_PASSWORD}
    - MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD}
    # Aumenta i limiti di upload
    - UPLOAD_LIMIT=500M
    - MAX_EXECUTION_TIME=3600
    - MEMORY_LIMIT=512M
  depends_on:
    - db
  networks:
    - stack
```

Poi riavvia il container:
```bash
docker compose restart phpmyadmin
```

### ✅ Soluzione 2: Script di Import Diretto (RACCOMANDATO - Bypassa phpMyAdmin)

**Questa è la soluzione migliore per file grandi!**

Ho creato uno script che importa direttamente nel database, bypassando completamente phpMyAdmin:

```bash
# Sul server VPS, dalla directory infra-deploy
cd /srv/stack/infra-deploy

# Rendi eseguibile lo script
chmod +x scripts/import_sql_direct.sh

# Importa il file SQL (il file deve essere già sul server)
./scripts/import_sql_direct.sh /path/to/file.sql
```

**Se il file è sul tuo computer locale**, caricalo prima sul server:

```bash
# Da Windows (PowerShell o CMD)
scp C:\percorso\file.sql utente@server:/tmp/file.sql

# Poi sul server
cd /srv/stack/infra-deploy
./scripts/import_sql_direct.sh /tmp/file.sql
```

**Oppure usa docker cp per copiare il file:**

```bash
# Dal tuo computer (se hai accesso Docker)
docker cp C:\percorso\file.sql server:/tmp/file.sql

# Poi sul server
cd /srv/stack/infra-deploy
./scripts/import_sql_direct.sh /tmp/file.sql
```

### ✅ Soluzione 3: Import Tramite SSH (Alternativa)

Se hai accesso SSH al server, puoi importare il file direttamente:

1. **Carica il file SQL sul server** (tramite SFTP o SCP)
2. **Connettiti via SSH** al server
3. **Importa usando MySQL direttamente**:

```bash
# Se il file è già sul server
mysql -h db -u root -p${MYSQL_ROOT_PASSWORD} gestionale < /path/to/file.sql

# Oppure se devi caricarlo prima
scp file.sql user@server:/tmp/
ssh user@server
mysql -h db -u root -p${MYSQL_ROOT_PASSWORD} gestionale < /tmp/file.sql
```

### ✅ Soluzione 4: Import Tramite Docker Exec (Manuale)

Se hai accesso al container Docker:

```bash
# Copia il file SQL nel container
docker cp /path/to/file.sql db:/tmp/file.sql

# Importa usando mysql
docker exec -i db mysql -u root -p${MYSQL_ROOT_PASSWORD} gestionale < /tmp/file.sql

# Oppure direttamente
docker exec -i db mysql -u root -p${MYSQL_ROOT_PASSWORD} gestionale < /path/to/file.sql
```

### ✅ Soluzione 5: Usare lo Script PHP CLI

Se hai accesso SSH e il file è nella directory del gestionale:

```bash
cd /srv/stack/gestionale
php import_database.php /path/to/file.sql
```

### ✅ Soluzione 6: Dividere il File SQL

Se il file è molto grande, puoi dividerlo in parti più piccole:

```bash
# Su Linux/Mac
split -l 1000 file.sql file_part_

# Poi importa ogni parte separatamente
```

## Verifica Configurazione Attuale

Per verificare i limiti attuali di phpMyAdmin:

1. Accedi a phpMyAdmin
2. Vai su "Impostazioni" → "Caratteristiche"
3. Controlla i valori di:
   - **Upload max filesize**
   - **Max execution time**
   - **Memory limit**

## Configurazione PHP Personalizzata (Avanzato)

Se le variabili d'ambiente non funzionano, puoi creare un file `php.ini` personalizzato:

1. Crea un file `phpmyadmin/php.ini`:
```ini
upload_max_filesize = 500M
post_max_size = 500M
max_execution_time = 3600
max_input_time = 3600
memory_limit = 512M
```

2. Monta il file nel docker-compose.yml:
```yaml
phpmyadmin:
  volumes:
    - ./phpmyadmin/php.ini:/usr/local/etc/php/conf.d/uploads.ini:ro
```

## Note Importanti

- ⚠️ **Backup**: Prima di importare, fai sempre un backup del database esistente
- ⚠️ **Timeout**: File molto grandi (>100MB) possono richiedere diversi minuti
- ✅ **Raccomandato**: Usa la Soluzione 2 o 3 per file grandi (>50MB)
- ✅ **Sicurezza**: Non esporre mai le password nei comandi se altri utenti possono vedere la cronologia

## ⚠️ Problema Specifico: "Non è stato possibile caricare la progressione"

Questo errore significa che phpMyAdmin non riesce a mostrare il progresso dell'importazione. **La soluzione migliore è usare lo script di import diretto (Soluzione 2)** che bypassa completamente phpMyAdmin.

**Passi rapidi:**
1. Carica il file SQL sul server (via SFTP/SCP)
2. Connettiti via SSH al server
3. Esegui: `cd /srv/stack/infra-deploy && ./scripts/import_sql_direct.sh /path/to/file.sql`

## Troubleshooting

### Il file si carica ma l'import fallisce
- Controlla i log di phpMyAdmin: `docker logs phpmyadmin`
- Verifica che il file SQL sia valido
- Controlla che ci sia spazio su disco sufficiente

### Errore "MySQL server has gone away"
- Aumenta `max_allowed_packet` in MySQL:
```sql
SET GLOBAL max_allowed_packet=1073741824; -- 1GB
```

### Errore di memoria
- Aumenta `MEMORY_LIMIT` nella configurazione PHP
- Considera di dividere il file SQL in parti più piccole

