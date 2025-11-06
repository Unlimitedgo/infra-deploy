# 🔧 Fix Domini nel File .env

## ⚠️ Problema Rilevato

Nei log di Caddy vedo che sta cercando certificati per:
- `bot.tuodominio.it` ❌
- `n8n.tuodominio.it` ❌

Questi sono valori di esempio! Il file `.env` sulla VPS contiene ancora i domini di esempio invece di quelli reali.

## ✅ Soluzione

### 1. Verifica il file .env sulla VPS

```bash
cat /srv/stack/.env | grep -E "(APP_DOMAIN|BOT_DOMAIN|N8N_DOMAIN|PANEL_DOMAIN)"
```

**Dovrebbe mostrare:**
```
APP_DOMAIN=app.unlimitedgo.it
BOT_DOMAIN=bot.unlimitedgo.it
N8N_DOMAIN=n8n.unlimitedgo.it
PANEL_DOMAIN=panel.unlimitedgo.it
```

### 2. Se vedi `tuodominio.it`, correggi il file

```bash
nano /srv/stack/.env
```

**Sostituisci tutti i `tuodominio.it` con `unlimitedgo.it`:**

```env
APP_DOMAIN=app.unlimitedgo.it
BOT_DOMAIN=bot.unlimitedgo.it
N8N_DOMAIN=n8n.unlimitedgo.it
PANEL_DOMAIN=panel.unlimitedgo.it
```

Salva: `Ctrl+X`, `Y`, `Enter`

### 3. Riavvia tutti i container

```bash
cd /srv/stack/infra-deploy
docker compose --env-file /srv/stack/.env down
docker compose --env-file /srv/stack/.env up -d
```

### 4. Verifica i log di Caddy

```bash
docker logs caddy --tail 20
```

Ora dovresti vedere che Caddy sta cercando certificati per `app.unlimitedgo.it` invece di `bot.tuodominio.it`.

## 🔍 Altro Problema: Redirect a `//login`

Il curl mostra:
```
location: //login
```

Questo è un redirect relativo che potrebbe causare problemi. Dovrebbe essere `/login` o `https://app.unlimitedgo.it/login`.

Questo è un problema nel codice PHP del gestionale, non nella configurazione di Caddy.

## ✅ Test Finale

Dopo aver corretto il `.env`:

1. **Pulisci la cache DNS su Windows:**
   ```powershell
   ipconfig /flushdns
   ```

2. **Prova in modalità incognito:**
   - Apri una finestra in incognito
   - Vai a `https://app.unlimitedgo.it`

3. **Se vedi ancora l'errore DNS:**
   - Attendi 5-10 minuti (propagazione DNS)
   - Prova con un altro browser
   - Verifica: `nslookup app.unlimitedgo.it` da Windows

## 📊 Verifica che Funzioni

```bash
# Sulla VPS
curl -I https://app.unlimitedgo.it
```

Dovresti vedere `HTTP/2 200` o `HTTP/2 302` (non errore).

