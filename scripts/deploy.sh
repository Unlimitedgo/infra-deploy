#!/usr/bin/env bash
set -euo pipefail

cd /srv/stack/infra-deploy

echo "==> Aggiornamento repository"
git pull || true

echo "==> Deploy con Docker Compose"
docker compose --env-file /srv/stack/.env up -d

echo "==> Pulizia risorse inutilizzate"
docker system prune -f || true

date -u +"%Y-%m-%dT%H:%M:%SZ" > /srv/stack/.last_deploy || true
echo "✅ Deploy completato"


