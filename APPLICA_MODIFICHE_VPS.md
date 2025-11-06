# 🚀 Applica Modifiche docker-compose.yml sulla VPS

## Situazione
Il file `docker-compose.yml` è stato modificato localmente con i nuovi limiti per phpMyAdmin, ma **non è ancora sulla VPS**.

## ✅ Opzione 1: Push su Git (Raccomandato)

### Passo 1: Commit e Push delle modifiche

```powershell
# Da Windows PowerShell, nella directory infra-deploy
cd c:\xampp\htdocs\infra-deploy

# Aggiungi i file modificati
git add docker-compose.yml
git add scripts/import_sql_direct.sh
git add scripts/import_sql_via_panel.sh
git add scripts/fix_phpmyadmin_upload.sh
git add SOLUZIONE_IMPORT_SQL.md
git add IMPORT_SQL_RAPIDO.md

# Commit
git commit -m "Aggiunti limiti upload phpMyAdmin e script import SQL diretto"

# Push su GitHub/GitLab
git push origin main
```

### Passo 2: Pull sulla VPS

```bash
# Connettiti via SSH alla VPS
ssh utente@unlimitedgo.it

# Vai nella directory infra-deploy
cd /srv/stack/infra-deploy

# Pull delle modifiche
git pull origin main

# Riavvia phpMyAdmin con le nuove configurazioni
docker compose restart phpmyadmin
```

## ✅ Opzione 2: Copia Diretta (Veloce)

### Passo 1: Copia il file sulla VPS

```powershell
# Da Windows PowerShell
scp c:\xampp\htdocs\infra-deploy\docker-compose.yml utente@unlimitedgo.it:/srv/stack/infra-deploy/docker-compose.yml
```

### Passo 2: Riavvia phpMyAdmin

```bash
# Connettiti via SSH
ssh utente@unlimitedgo.it

# Vai nella directory
cd /srv/stack/infra-deploy

# Riavvia phpMyAdmin
docker compose restart phpmyadmin
```

## ✅ Opzione 3: Modifica Diretta sulla VPS

Se preferisci modificare direttamente sulla VPS:

```bash
# Connettiti via SSH
ssh utente@unlimitedgo.it

# Vai nella directory
cd /srv/stack/infra-deploy

# Modifica il file (usa nano, vim, o il tuo editor preferito)
nano docker-compose.yml
```

Aggiungi queste righe nella sezione `phpmyadmin` (dopo la riga `MYSQL_ROOT_PASSWORD`):

```yaml
      # Aumenta i limiti di upload per file SQL grandi
      - UPLOAD_LIMIT=500M
      - MAX_EXECUTION_TIME=3600
      - MEMORY_LIMIT=512M
```

Salva e riavvia:
```bash
docker compose restart phpmyadmin
```

## 📋 Verifica

Dopo aver applicato le modifiche, verifica che phpMyAdmin sia riavviato:

```bash
# Controlla lo stato
docker ps | grep phpmyadmin

# Controlla i log
docker logs phpmyadmin | tail -20
```

## 🎯 Cosa Cambia

Dopo queste modifiche, phpMyAdmin avrà:
- ✅ Upload max: **500MB** (invece di ~2MB di default)
- ✅ Tempo massimo: **3600 secondi** (1 ora)
- ✅ Memoria: **512MB**

Questo dovrebbe risolvere il problema del loop durante l'import.

## ⚠️ Nota

Anche con questi limiti aumentati, per file **molto grandi** (>100MB) è comunque **raccomandato** usare lo script di import diretto (`import_sql_direct.sh`) che bypassa completamente phpMyAdmin.

