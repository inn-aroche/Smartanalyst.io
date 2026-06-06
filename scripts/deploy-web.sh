#!/bin/bash
# Deploy script — Web SPA.
#
# Exécuté par apps/deploy-server (POST /deploy/web). Pull la dernière version
# de main, build le frontend, atomic swap du dist/ servi par Nginx.
#
# Variables d'env attendues :
#   REPO_PATH         /srv/smartanalyst-repo (par défaut)
#   WEB_PUBLIC_ROOT   /srv/smartanalyst-web (par défaut)

set -euo pipefail

REPO_DIR="${REPO_PATH:-/srv/smartanalyst-repo}"
WEB_ROOT="${WEB_PUBLIC_ROOT:-/srv/smartanalyst-web}"
BRANCH="${DEPLOY_BRANCH:-main}"

echo "▶ Pull origin/${BRANCH} dans ${REPO_DIR}"
cd "$REPO_DIR"
git fetch origin "$BRANCH"
git reset --hard "origin/${BRANCH}"
COMMIT=$(git rev-parse --short HEAD)
echo "  commit=${COMMIT}"

echo "▶ npm ci + build web"
npm ci
npm run build --workspace=@smartanalyst/web

echo "▶ Atomic swap dist → ${WEB_ROOT}/dist"
mkdir -p "$WEB_ROOT"
NEW_DIST=$(mktemp -d "${WEB_ROOT}/dist.new-XXXX")
rsync -a --delete apps/web/dist/ "$NEW_DIST/"

if [ -d "$WEB_ROOT/dist" ]; then
  OLD_DIST="${WEB_ROOT}/dist.old-$(date +%s)"
  mv "$WEB_ROOT/dist" "$OLD_DIST"
  mv "$NEW_DIST" "$WEB_ROOT/dist"
  # Garde l'ancien 10 min pour rollback express si problème (manuellement).
  (sleep 600 && rm -rf "$OLD_DIST") &
else
  mv "$NEW_DIST" "$WEB_ROOT/dist"
fi

echo "✔ deploy-web OK (commit ${COMMIT})"
