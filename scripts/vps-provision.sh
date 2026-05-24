#!/usr/bin/env bash
# Provision a fresh Ubuntu VPS to host the SmartAnalyst API + worker.
#
# Idempotent: safe to re-run. Skips installs that are already in place.
#
# Run ONCE as root on the VPS (e.g. via `ssh root@<vps-ip> bash` piping this file,
# or by copying the script over and running `sudo bash vps-provision.sh`).
#
# See docs/DEPLOYMENT_API.md for the full setup procedure.

set -euo pipefail

NODE_MAJOR=20
DEPLOY_USER=deploy
APP_DIR=/srv/smartanalyst-api

log() { printf "\n\033[1;34m▶ %s\033[0m\n" "$*"; }
ok()  { printf "\033[1;32m✓ %s\033[0m\n" "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Must run as root (try: sudo bash $0)" >&2
  exit 1
fi

# ─── 1. System update + base packages ────────────────────────────────────────
log "Updating apt and installing base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y \
  curl ca-certificates gnupg git ufw \
  build-essential \
  nginx \
  redis-server \
  certbot python3-certbot-nginx \
  fail2ban
ok "Base packages installed"

# ─── 2. Node.js 20 (NodeSource) ──────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null)" != v${NODE_MAJOR}* ]]; then
  log "Installing Node.js ${NODE_MAJOR}.x via NodeSource"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
ok "Node $(node -v) / npm $(npm -v)"

# ─── 3. PM2 (global) ─────────────────────────────────────────────────────────
if ! command -v pm2 >/dev/null 2>&1; then
  log "Installing PM2 globally"
  npm install -g pm2@latest
fi
ok "PM2 $(pm2 -v)"

# ─── 4. Playwright system dependencies (Chromium) ────────────────────────────
# The API uses Playwright for report rendering — Chromium needs ~30 system libs.
log "Installing Playwright Chromium system dependencies"
npx --yes playwright@latest install-deps chromium || true
ok "Playwright deps installed"

# ─── 5. Redis: ensure enabled and listening locally only ─────────────────────
log "Configuring Redis (localhost-only, persistent)"
sed -i 's/^# *bind .*/bind 127.0.0.1 ::1/' /etc/redis/redis.conf || true
sed -i 's/^bind .*/bind 127.0.0.1 ::1/' /etc/redis/redis.conf || true
sed -i 's/^# *requirepass .*/# requirepass left empty: redis is localhost-only/' /etc/redis/redis.conf || true
systemctl enable redis-server
systemctl restart redis-server
ok "Redis running on 127.0.0.1:6379"

# ─── 6. Deploy user ──────────────────────────────────────────────────────────
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  log "Creating user '$DEPLOY_USER'"
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
  usermod -aG www-data "$DEPLOY_USER"
fi
# Ensure .ssh dir is ready for the public key the user will add manually
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
touch "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
ok "User '$DEPLOY_USER' ready"

# ─── 7. App directory ────────────────────────────────────────────────────────
install -d -m 755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR"
install -d -m 755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR/logs"
ok "App directory at $APP_DIR (owner: $DEPLOY_USER)"

# ─── 8. PM2 startup script for the deploy user ───────────────────────────────
log "Configuring PM2 startup for $DEPLOY_USER"
# This generates a systemd unit so PM2 (and its apps) come back after reboot.
env PATH=$PATH pm2 startup systemd -u "$DEPLOY_USER" --hp "/home/$DEPLOY_USER" >/dev/null
ok "PM2 systemd unit installed (you'll run 'pm2 save' as $DEPLOY_USER after first deploy)"

# ─── 9. UFW firewall ─────────────────────────────────────────────────────────
log "Configuring UFW (allow 22, 80, 443; deny everything else)"
ufw --force reset >/dev/null
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp comment 'SSH' >/dev/null
ufw allow 80/tcp comment 'HTTP' >/dev/null
ufw allow 443/tcp comment 'HTTPS' >/dev/null
ufw --force enable >/dev/null
ok "UFW active"

# ─── 10. Fail2ban (default jails are fine for SSH) ───────────────────────────
systemctl enable fail2ban
systemctl restart fail2ban
ok "fail2ban running"

# ─── 11. Nginx: enable + ready for site config ───────────────────────────────
systemctl enable nginx
systemctl restart nginx
ok "nginx running (default page on :80)"

cat <<EOF

═══════════════════════════════════════════════════════════════════
✓ VPS provisioning complete

Next steps (see docs/DEPLOYMENT_API.md for details):

  1. Add your GitHub Actions deploy key to:
     /home/$DEPLOY_USER/.ssh/authorized_keys

  2. Point DNS:  api.smartanalyst.io  A  $(curl -fsSL -4 ifconfig.me 2>/dev/null || echo '<this-vps-ip>')

  3. Drop the nginx site config from scripts/vps-nginx-api.conf.template
     into /etc/nginx/sites-available/smartanalyst-api  and enable it.

  4. Run:  certbot --nginx -d api.smartanalyst.io

  5. Push to main — GitHub Actions will deploy the API.

═══════════════════════════════════════════════════════════════════
EOF
