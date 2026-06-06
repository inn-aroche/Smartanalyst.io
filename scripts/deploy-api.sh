#!/bin/bash
# Deploy script — API.
#
# Exécuté par apps/deploy-server (POST /deploy/api). Pull la dernière version
# de main depuis GitHub (via deploy key SSH), sync les fichiers nécessaires
# vers /srv/smartanalyst-api, npm ci, pm2 reload.
#
# Variables d'env attendues (passées par le deploy-server) :
#   REPO_PATH   /srv/smartanalyst-repo (par défaut)

set -euo pipefail

REPO_DIR="${REPO_PATH:-/srv/smartanalyst-repo}"
APP_DIR="/srv/smartanalyst-api"
BRANCH="${DEPLOY_BRANCH:-main}"

echo "▶ Pull origin/${BRANCH} dans ${REPO_DIR}"
cd "$REPO_DIR"
git fetch origin "$BRANCH"
git reset --hard "origin/${BRANCH}"
COMMIT=$(git rev-parse --short HEAD)
echo "  commit=${COMMIT}"

echo "▶ Sync vers ${APP_DIR}"
mkdir -p "$APP_DIR"
rsync -a --delete \
  --exclude='node_modules/' \
  --exclude='.git/' \
  --exclude='coverage/' \
  --exclude='test-results/' \
  --exclude='playwright-report/' \
  --exclude='logs/' \
  apps/api packages package.json package-lock.json .nvmrc \
  "$APP_DIR/"

echo "▶ Préserve le .env de prod (le deploy-server ne doit jamais l'écraser)"
# Le .env est maintenu manuellement / via API_ENV_FILE GHA → on ne touche pas.

echo "▶ npm ci (prod only)"
cd "$APP_DIR"
npm ci --omit=dev --workspaces --include-workspace-root

echo "▶ pm2 reload"
pm2 reload apps/api/ecosystem.config.cjs --update-env || \
  pm2 start apps/api/ecosystem.config.cjs
pm2 save

echo "✔ deploy-api OK (commit ${COMMIT})"
