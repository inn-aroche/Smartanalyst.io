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
# Checkout main propre (au cas où le repo serait sur une autre branche
# après un debug manuel) puis reset hard à la dernière version origin.
git checkout "$BRANCH" 2>/dev/null || git checkout -B "$BRANCH" "origin/${BRANCH}"
git reset --hard "origin/${BRANCH}"
COMMIT=$(git rev-parse --short HEAD)
echo "  commit=${COMMIT}"

echo "▶ Sync vers ${APP_DIR}"
mkdir -p "$APP_DIR/apps/api" "$APP_DIR/packages"

# apps/api/ → APP_DIR/apps/api/ (trailing slash = contenu, pas le dossier).
# --exclude='.env' CRITIQUE : sans ça, --delete supprime le .env de prod
# (gitignored donc absent du repo source → diff côté dest → delete).
rsync -a --delete \
  --exclude='.env' \
  --exclude='node_modules/' \
  --exclude='coverage/' \
  --exclude='test-results/' \
  --exclude='playwright-report/' \
  --exclude='logs/' \
  apps/api/ "$APP_DIR/apps/api/"

# packages/ → APP_DIR/packages/ (pas de .env dans packages partagés)
rsync -a --delete \
  --exclude='node_modules/' \
  packages/ "$APP_DIR/packages/"

# Root files. Pas de --delete pour ne pas virer d'autres fichiers à la racine.
rsync -a \
  package.json package-lock.json .nvmrc \
  "$APP_DIR/"

echo "▶ npm ci (prod only)"
cd "$APP_DIR"
npm ci --omit=dev --workspaces --include-workspace-root

echo "▶ pm2 reload"
pm2 reload apps/api/ecosystem.config.cjs --update-env || \
  pm2 start apps/api/ecosystem.config.cjs
pm2 save

echo "✔ deploy-api OK (commit ${COMMIT})"
