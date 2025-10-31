#!/usr/bin/env bash
set -euo pipefail

ENV_PATH=/srv/stack/.env
TEMPLATE_PATH="$(dirname "$0")/../env/prod.env.example"

echo "==> Wizard di configurazione iniziale"

mkdir -p /srv/stack
if [ ! -f "$ENV_PATH" ]; then
  cp -f "$TEMPLATE_PATH" "$ENV_PATH"
fi

read -rp "Dominio APP (es. app.tuodominio.it): " APP_DOMAIN
read -rp "Dominio BOT (es. bot.tuodominio.it): " BOT_DOMAIN
read -rp "Dominio N8N (es. n8n.tuodominio.it): " N8N_DOMAIN
read -rp "Dominio PANEL (es. panel.tuodominio.it): " PANEL_DOMAIN

read -rp "MYSQL ROOT PASSWORD: " MYSQL_ROOT_PASSWORD
read -rp "MYSQL DATABASE: " MYSQL_DATABASE
read -rp "MYSQL USER: " MYSQL_USER
read -rp "MYSQL PASSWORD: " MYSQL_PASSWORD

read -rp "N8N BASIC AUTH USER: " N8N_BASIC_AUTH_USER
read -rp "N8N BASIC AUTH PASSWORD: " N8N_BASIC_AUTH_PASSWORD

read -rp "PANEL USER: " PANEL_USER
read -rp "PANEL PASS: " PANEL_PASS

read -rp "Abilitare il Bot WhatsApp ora? (true/false) [false]: " WA_BOT_ENABLED
WA_BOT_ENABLED=${WA_BOT_ENABLED:-false}

WA_BOT_API_KEY_DEFAULT=$(openssl rand -hex 16)
WA_BOT_HMAC_KEY_DEFAULT=$(openssl rand -hex 16)
read -rp "WA_BOT_API_KEY [generato]: " WA_BOT_API_KEY
read -rp "WA_BOT_HMAC_KEY [generato]: " WA_BOT_HMAC_KEY
WA_BOT_API_KEY=${WA_BOT_API_KEY:-$WA_BOT_API_KEY_DEFAULT}
WA_BOT_HMAC_KEY=${WA_BOT_HMAC_KEY:-$WA_BOT_HMAC_KEY_DEFAULT}

tmp=$(mktemp)
cp "$ENV_PATH" "$tmp"

sed -i "s#^APP_DOMAIN=.*#APP_DOMAIN=$APP_DOMAIN#" "$tmp"
sed -i "s#^BOT_DOMAIN=.*#BOT_DOMAIN=$BOT_DOMAIN#" "$tmp"
sed -i "s#^N8N_DOMAIN=.*#N8N_DOMAIN=$N8N_DOMAIN#" "$tmp"
sed -i "s#^PANEL_DOMAIN=.*#PANEL_DOMAIN=$PANEL_DOMAIN#" "$tmp"

sed -i "s#^MYSQL_ROOT_PASSWORD=.*#MYSQL_ROOT_PASSWORD=$MYSQL_ROOT_PASSWORD#" "$tmp"
sed -i "s#^MYSQL_DATABASE=.*#MYSQL_DATABASE=$MYSQL_DATABASE#" "$tmp"
sed -i "s#^MYSQL_USER=.*#MYSQL_USER=$MYSQL_USER#" "$tmp"
sed -i "s#^MYSQL_PASSWORD=.*#MYSQL_PASSWORD=$MYSQL_PASSWORD#" "$tmp"

sed -i "s#^N8N_BASIC_AUTH_USER=.*#N8N_BASIC_AUTH_USER=$N8N_BASIC_AUTH_USER#" "$tmp"
sed -i "s#^N8N_BASIC_AUTH_PASSWORD=.*#N8N_BASIC_AUTH_PASSWORD=$N8N_BASIC_AUTH_PASSWORD#" "$tmp"

sed -i "s#^PANEL_USER=.*#PANEL_USER=$PANEL_USER#" "$tmp"
sed -i "s#^PANEL_PASS=.*#PANEL_PASS=$PANEL_PASS#" "$tmp"

sed -i "s#^WA_BOT_ENABLED=.*#WA_BOT_ENABLED=$WA_BOT_ENABLED#" "$tmp"
sed -i "s#^WA_BOT_API_KEY=.*#WA_BOT_API_KEY=$WA_BOT_API_KEY#" "$tmp"
sed -i "s#^WA_BOT_HMAC_KEY=.*#WA_BOT_HMAC_KEY=$WA_BOT_HMAC_KEY#" "$tmp"

mv "$tmp" "$ENV_PATH"

echo "==> Avvio dello stack"
cd "$(dirname "$0")/.."
docker compose --env-file /srv/stack/.env up -d

echo "✅ Setup completato. Accessi:"
echo "- Gestionale: https://$APP_DOMAIN"
echo "- n8n: https://$N8N_DOMAIN"
echo "- Panel: https://$PANEL_DOMAIN"


