# Infra Deploy – VPS Gestionale

Questo repository prepara una VPS Ubuntu 22.04 per ospitare:
- Gestionale PHP/MySQL (codice montato da `/srv/stack/gestionale`)
- Bot WhatsApp (Node.js, Venom) – predisposto ma disabilitato
- n8n per automazioni
- MariaDB, Redis
- Pannello admin DEV per monitoraggio

## Struttura
```
infra-deploy/
├─ docker-compose.yml
├─ Caddyfile
├─ env/
│  └─ prod.env.example
├─ scripts/
│  ├─ install.sh
│  ├─ deploy.sh
│  └─ wizard.sh
├─ panel/
│  ├─ index.js
│  └─ package.json
└─ README.md
```

## Installazione VPS nuova
Eseguire sulla VPS (Ubuntu 22.04):

```bash
ssh root@IP
apt update && apt install -y git
git clone https://github.com/<repo>/infra-deploy.git /srv/stack/infra-deploy
cd /srv/stack/infra-deploy/scripts
bash install.sh
```

Al termine verrà creato `/srv/stack/.env` da modificare con i propri valori e verrà avviato lo stack.

## Prima configurazione

```bash
cd /srv/stack/infra-deploy/scripts
bash wizard.sh
```

Il wizard chiede domini e credenziali, genera `/srv/stack/.env` e avvia automaticamente lo stack.

## Deploy futuro

```bash
cd /srv/stack/infra-deploy/scripts
bash deploy.sh
```

Esegue `git pull`, aggiorna i servizi e pulisce risorse inutilizzate.

## Accessi
- Gestionale → `https://${APP_DOMAIN}`
- n8n → `https://${N8N_DOMAIN}` (basic auth)
- Pannello VPS → `https://${PANEL_DOMAIN}` (credenziali `PANEL_USER`/`PANEL_PASS`)

## Abilitare il Bot WhatsApp in futuro
1. Modificare `.env`: `WA_BOT_ENABLED=true`
2. In `docker-compose.yml`, rimuovere `deploy.replicas: 0` dal servizio `bot` o impostarlo a 1
3. Avviare: `docker compose up -d bot`

## Sicurezza
- Tutti i servizi dietro Caddy con HTTPS automatico (Let’s Encrypt)
- Pannello protetto da Basic Auth forte
- Firewall UFW: porte 22, 80, 443
- File `.env` fuori dal repo (usare `/srv/stack/.env`)

## Note operative
- Il codice del gestionale deve essere montato in `/srv/stack/gestionale`
- Il codice del bot (quando pronto) in `/srv/stack/bot`
- Il pannello è DEV e accede in sola lettura a `docker.sock` per mostrare lo stato dei container

## Estensioni future
- Provisioning nuovi spazi cliente
- Gestione domini e virtual host
- Attivazione bot WhatsApp per singolo cliente
- Monitoraggio multi-tenant
