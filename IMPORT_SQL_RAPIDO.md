# 🚀 Guida Rapida: Import SQL (Bypass phpMyAdmin)

## Problema
phpMyAdmin mostra: **"Non è stato possibile caricare la progressione del processo di importazione"**

## ✅ Soluzione Veloce (3 Passi)

### Passo 1: Carica il file SQL sul server

**Opzione A - Via SFTP/SCP (raccomandato):**
```bash
# Da Windows (PowerShell)
scp C:\percorso\file.sql utente@server:/tmp/file.sql

# Sostituisci:
# - C:\percorso\file.sql → percorso del tuo file SQL
# - utente → il tuo username SSH
# - server → l'IP o dominio del server (es: unlimitedgo.it)
```

**Opzione B - Via pannello di controllo:**
- Usa FileZilla o WinSCP
- Connettiti via SFTP al server
- Carica il file in `/tmp/`

### Passo 2: Connettiti via SSH al server

```bash
# Da Windows (PowerShell o PuTTY)
ssh utente@server

# Oppure se usi una chiave SSH
ssh -i C:\percorso\chiave.pem utente@server
```

### Passo 3: Esegui lo script di import

```bash
# Vai nella directory infra-deploy
cd /srv/stack/infra-deploy

# Rendi eseguibile lo script (solo la prima volta)
chmod +x scripts/import_sql_direct.sh

# Importa il file SQL
./scripts/import_sql_direct.sh /tmp/file.sql
```

Lo script:
- ✅ Elimina il database esistente
- ✅ Crea un nuovo database
- ✅ Importa il file SQL
- ✅ Mostra il progresso in tempo reale
- ✅ Gestisce automaticamente i timeout

## 📋 Esempio Completo

```bash
# 1. Carica il file (dal tuo computer)
scp C:\Users\TuoNome\Downloads\gestionale.sql root@unlimitedgo.it:/tmp/gestionale.sql

# 2. Connettiti al server
ssh root@unlimitedgo.it

# 3. Importa
cd /srv/stack/infra-deploy
chmod +x scripts/import_sql_direct.sh
./scripts/import_sql_direct.sh /tmp/gestionale.sql
```

## 🔍 Verifica Importazione

Dopo l'import, verifica che tutto sia andato a buon fine:

```bash
# Conta le tabelle importate
docker exec db mysql -u root -p${MYSQL_ROOT_PASSWORD} -e "USE gestionale; SHOW TABLES;" | wc -l

# Oppure accedi a phpMyAdmin e verifica manualmente
```

## ⚠️ Note Importanti

- ⏱️ L'import può richiedere **diversi minuti** per file grandi (>100MB)
- 💾 Assicurati di avere **spazio su disco sufficiente**
- 🔒 Lo script chiede **conferma** prima di eliminare il database esistente
- 📊 Se hai `pv` installato, vedrai il progresso in tempo reale

## 🆘 Problemi?

### "Permission denied"
```bash
chmod +x scripts/import_sql_direct.sh
```

### "Container db non è in esecuzione"
```bash
cd /srv/stack/infra-deploy
docker compose up -d db
```

### "File SQL non trovato"
Verifica il percorso del file:
```bash
ls -lh /tmp/file.sql
```

### Import fallisce
Controlla i log:
```bash
docker logs db
```

## 📚 Documentazione Completa

Per altre soluzioni e dettagli, vedi: `SOLUZIONE_IMPORT_SQL.md`

