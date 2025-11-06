# 🔧 Soluzione: "Non è stato possibile caricare la progressione" (File Piccoli)

## Problema
Anche con file piccoli (4MB), phpMyAdmin mostra: **"Non è stato possibile caricare la progressione del processo di importazione"**

## Cause Possibili
1. **Timeout della connessione HTTP** - Il browser si disconnette durante l'import
2. **Problema con la sessione PHP** - La sessione scade durante l'operazione
3. **Problema con AJAX/JavaScript** - Il meccanismo di progresso non funziona correttamente
4. **Configurazione phpMyAdmin** - Problemi con `$cfg['ExecTimeLimit']` o altre impostazioni

## ✅ Soluzione Immediata: Import Diretto (Bypassa phpMyAdmin)

**Questa è la soluzione più affidabile**, anche per file piccoli:

### Passo 1: Carica il file SQL sul server

```powershell
# Da Windows PowerShell
scp C:\percorso\file.sql utente@unlimitedgo.it:/tmp/file.sql
```

### Passo 2: Connettiti via SSH

```bash
ssh utente@unlimitedgo.it
```

### Passo 3: Importa usando lo script

```bash
cd /srv/stack/infra-deploy
chmod +x scripts/import_sql_direct.sh
./scripts/import_sql_direct.sh /tmp/file.sql
```

**Oppure importa direttamente con MySQL:**

```bash
# Carica le variabili d'ambiente
cd /srv/stack/infra-deploy
source ../.env  # o source .env se è nella stessa directory

# Importa direttamente
docker exec -i db mysql -u root -p"$MYSQL_ROOT_PASSWORD" gestionale < /tmp/file.sql
```

## ✅ Soluzione Alternativa: Configurazione phpMyAdmin Avanzata

Se vuoi continuare a usare phpMyAdmin, possiamo creare un file di configurazione personalizzato:

### Crea file di configurazione phpMyAdmin

Sulla VPS, crea il file `/srv/stack/infra-deploy/phpmyadmin/config.user.inc.php`:

```php
<?php
// Configurazione personalizzata per phpMyAdmin
// Risolve problemi di timeout e progresso

// Aumenta il tempo di esecuzione
$cfg['ExecTimeLimit'] = 3600;

// Disabilita il timeout per le operazioni lunghe
$cfg['LoginCookieValidity'] = 14400; // 4 ore

// Aumenta i limiti di memoria
ini_set('memory_limit', '512M');

// Configurazione per import grandi
$cfg['UploadDir'] = '';
$cfg['SaveDir'] = '';

// Disabilita il limite di tempo per l'import
$cfg['MaxSizeForInputField'] = 500 * 1024 * 1024; // 500MB
```

### Aggiorna docker-compose.yml

Aggiungi il volume per montare la configurazione:

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
    - UPLOAD_LIMIT=500M
    - MAX_EXECUTION_TIME=3600
    - MEMORY_LIMIT=512M
  volumes:
    - ./phpmyadmin/config.user.inc.php:/etc/phpmyadmin/config.user.inc.php:ro
  depends_on:
    - db
  networks:
    - stack
```

## ✅ Soluzione Rapida: Import via Pannello (Se disponibile)

Se hai accesso al pannello di controllo, potresti avere un'opzione per importare direttamente tramite SSH senza usare phpMyAdmin.

## 🔍 Diagnostica

Per capire meglio il problema, controlla i log:

```bash
# Log di phpMyAdmin
docker logs phpmyadmin | tail -50

# Log del database
docker logs db | tail -50

# Verifica la configurazione PHP di phpMyAdmin
docker exec phpmyadmin php -i | grep -E "upload_max_filesize|post_max_size|max_execution_time|memory_limit"
```

## 💡 Raccomandazione

**Per file di 4MB**, il problema è probabilmente legato a:
- Un bug noto di phpMyAdmin con il meccanismo di progresso
- Problemi di rete/connessione instabile
- Timeout del browser

**La soluzione migliore è usare l'import diretto via SSH/Docker**, che è:
- ✅ Più veloce
- ✅ Più affidabile
- ✅ Mostra errori chiari se qualcosa va storto
- ✅ Non dipende dalla connessione HTTP

## 📋 Comando Rapido (Copia e Incolla)

```bash
# 1. Carica il file (da Windows)
scp file.sql utente@server:/tmp/file.sql

# 2. Importa (sulla VPS)
ssh utente@server
cd /srv/stack/infra-deploy
source ../.env
docker exec -i db mysql -u root -p"$MYSQL_ROOT_PASSWORD" gestionale < /tmp/file.sql
```

