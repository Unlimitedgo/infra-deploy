# 🔧 Risolvi DNS_PROBE_FINISHED_NXDOMAIN per app.unlimitedgo.it

## ⚠️ Problema
Errore: **DNS_PROBE_FINISHED_NXDOMAIN** quando accedi a `app.unlimitedgo.it`
- Vedi "login/" nel browser (quindi il server risponde)
- Ma poi ottieni l'errore DNS

## ✅ Soluzione Rapida (Sulla VPS)

Esegui questo script di diagnostica e fix automatico:

```bash
cd /srv/stack/infra-deploy
chmod +x scripts/fix_dns_app.sh
./scripts/fix_dns_app.sh
```

Lo script:
- ✅ Verifica la configurazione `.env`
- ✅ Controlla la risoluzione DNS
- ✅ Verifica che Caddy sia in esecuzione
- ✅ Controlla il firewall
- ✅ Riavvia Caddy con la configurazione corretta

## 📋 Passi Manuali

### 1. Verifica Configurazione .env

```bash
# Sulla VPS
cat /srv/stack/.env | grep APP_DOMAIN
```

**Deve mostrare:**
```
APP_DOMAIN=app.unlimitedgo.it
```

**Se non è corretto:**
```bash
nano /srv/stack/.env
# Aggiungi o modifica:
APP_DOMAIN=app.unlimitedgo.it
# Salva: Ctrl+X, Y, Enter
```

### 2. Verifica DNS

**Da Windows (PowerShell):**
```powershell
nslookup app.unlimitedgo.it
```

**Dovrebbe mostrare:**
```
Nome:    app.unlimitedgo.it
Address:  136.144.242.149
```

**Se mostra "Non-existent domain" o non trova l'IP:**
→ Il record DNS A non è configurato o non è ancora propagato

### 3. Configura Record DNS A

Vai al pannello DNS del provider di `unlimitedgo.it` e aggiungi:

```
Tipo: A
Nome: app
Valore: 136.144.242.149
TTL: 3600
```

**Provider comuni:**
- **Cloudflare**: DNS → Records → Add record
- **Namecheap**: Advanced DNS → Add New Record
- **GoDaddy**: DNS Management → Add
- **Aruba**: Gestione DNS → Aggiungi record

### 4. Riavvia Caddy

```bash
cd /srv/stack/infra-deploy
docker compose --env-file /srv/stack/.env restart caddy
```

### 5. Verifica Log Caddy

```bash
docker logs caddy --tail 30
```

Cerca errori o messaggi relativi a `app.unlimitedgo.it`.

### 6. Attendi Propagazione DNS

La propagazione DNS può richiedere:
- **5-15 minuti** se usi Cloudflare
- **1-24 ore** per altri provider

**Verifica online:**
- https://www.whatsmydns.net/#A/app.unlimitedgo.it
- https://dnschecker.org/#A/app.unlimitedgo.it

## 🔍 Diagnostica Avanzata

### Verifica che Caddy stia ascoltando

```bash
# Sulla VPS
docker ps | grep caddy
netstat -tlnp | grep -E ":(80|443)"
```

### Test connessione HTTP

```bash
# Sulla VPS
curl -I http://app.unlimitedgo.it
curl -I https://app.unlimitedgo.it
```

### Verifica certificato SSL

```bash
# Sulla VPS
docker logs caddy | grep -i "certificate\|acme\|letsencrypt"
```

## ⚠️ Problemi Comuni

### 1. DNS non propagato
**Sintomo**: `nslookup` non trova il dominio
**Soluzione**: Attendi 15-60 minuti e riprova

### 2. Record DNS errato
**Sintomo**: DNS risolve ma a un IP diverso
**Soluzione**: Verifica che il record A punti a `136.144.242.149`

### 3. Cloudflare Proxy attivo
**Sintomo**: DNS risolve ma Caddy non ottiene il certificato
**Soluzione**: Disabilita temporaneamente il proxy Cloudflare (icona grigia, non arancione)

### 4. Firewall blocca porte
**Sintomo**: DNS risolve ma il sito non risponde
**Soluzione**: 
```bash
ufw allow 80/tcp
ufw allow 443/tcp
```

### 5. Caddy non in esecuzione
**Sintomo**: DNS risolve ma nessuna risposta
**Soluzione**:
```bash
cd /srv/stack/infra-deploy
docker compose --env-file /srv/stack/.env up -d caddy
```

## ✅ Checklist

- [ ] Record DNS A configurato: `app` → `136.144.242.149`
- [ ] File `/srv/stack/.env` contiene `APP_DOMAIN=app.unlimitedgo.it`
- [ ] DNS propagato (verificato con nslookup)
- [ ] Container Caddy in esecuzione
- [ ] Porte 80 e 443 aperte sul firewall
- [ ] Caddy riavviato dopo le modifiche
- [ ] Atteso 10-15 minuti per la propagazione

## 🎯 Test Finale

Dopo aver completato tutti i passaggi:

1. **Verifica DNS:**
   ```powershell
   nslookup app.unlimitedgo.it
   ```

2. **Prova ad accedere:**
   - https://app.unlimitedgo.it
   - http://app.unlimitedgo.it (dovrebbe reindirizzare a HTTPS)

3. **Se funziona:** ✅ Problema risolto!

4. **Se non funziona:** Controlla i log:
   ```bash
   docker logs caddy --tail 50
   ```

