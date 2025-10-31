#!/usr/bin/env bash
set -euo pipefail

echo "==> Aggiornamento sistema"
apt update && apt upgrade -y

echo "==> Installazione prerequisiti"
apt install -y ca-certificates curl gnupg ufw git

echo "==> Installazione Docker Engine e Compose plugin"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

ARCH=$(dpkg --print-architecture)
RELEASE=$(. /etc/os-release && echo "$VERSION_CODENAME")
echo "deb [arch=$ARCH signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $RELEASE stable" > /etc/apt/sources.list.d/docker.list

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "==> Abilitazione UFW (22, 80, 443)"
ufw allow 22/tcp || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
echo "y" | ufw enable || true

echo "==> Preparazione directory stack"
mkdir -p /srv/stack

echo "==> Clonare o copiare il repository infra-deploy"
echo "# Esempio:" 
echo "# git clone https://github.com/<repo>/infra-deploy.git /srv/stack/infra-deploy"

if [ ! -f /srv/stack/.env ]; then
  mkdir -p /srv/stack
  cp -f "$(dirname "$0")/../env/prod.env.example" /srv/stack/.env || true
  echo "==> File /srv/stack/.env creato da template. Modificarlo prima dell'avvio."
fi

echo "==> Avvio dello stack (dopo aver verificato .env)"
cd /srv/stack/infra-deploy
docker compose --env-file /srv/stack/.env up -d

echo "✅ VPS pronta"


