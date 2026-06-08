# Deploy server VPS — setup one-time

Ce document décrit la procédure **à exécuter UNE FOIS** sur le VPS pour
basculer `deploy-api.yml` du pattern SSH/rsync vers le pattern
webhook (`curl POST → 127.0.0.1:3001 → bash deploy-api.sh`).

Une fois ce setup en place, les futurs déploiements n'utilisent **plus
aucune connexion SSH entrante** depuis GitHub Actions vers le VPS. Plus
de risque de fail2ban / Anti-DDoS Hostinger / firewall réseau qui ferme
le port 22.

---

## Pré-requis

- Accès SSH `root` au VPS (`ssh root@2.24.9.186`).
- Nginx déjà en place et servant `api.smartanalyst.io` via HTTPS.
- PM2 déjà en place pour `smartanalyst-api`.
- Repo GitHub : `inn-aroche/smartanalyst.io`.

---

## 1. Créer une deploy key SSH dédiée

La deploy key est une **clé SSH lecture-seule** liée à un repo unique
(plus restreinte qu'un PAT classique qui donne accès à tous tes repos).

```bash
# Sur le VPS, en root
ssh-keygen -t ed25519 -C "deploy@smartanalyst-vps" -f /root/.ssh/github_deploy -N ""

# Affiche la pubkey à copier dans GitHub
cat /root/.ssh/github_deploy.pub
```

Sur GitHub :
1. `https://github.com/inn-aroche/Smartanalyst.io/settings/keys`
2. **Add deploy key** → Title : `vps-deploy`. Key : colle le contenu de `github_deploy.pub`.
3. **Ne PAS** cocher "Allow write access" (lecture-seule, c'est tout ce qu'il faut).
4. Add key.

Configure SSH pour utiliser cette clé pour GitHub :

```bash
cat >> /root/.ssh/config <<'EOF'

Host github.com
  HostName github.com
  User git
  IdentityFile /root/.ssh/github_deploy
  IdentitiesOnly yes
EOF

chmod 600 /root/.ssh/config /root/.ssh/github_deploy

# Test
ssh -T git@github.com
# → "Hi inn-aroche/Smartanalyst.io! You've successfully authenticated, but GitHub does not provide shell access."
```

---

## 2. Cloner le repo sur le VPS

```bash
# Sur le VPS, en root
mkdir -p /srv/smartanalyst-repo
chown root:root /srv/smartanalyst-repo
cd /srv
git clone git@github.com:inn-aroche/Smartanalyst.io.git smartanalyst-repo
cd smartanalyst-repo
git checkout main
```

---

## 3. Installer les deps Node du deploy-server

```bash
cd /srv/smartanalyst-repo
npm ci  # installe tous les workspaces, dont deploy-server
```

---

## 4. Configurer le deploy-server

### 4.1. Générer le `DEPLOY_TOKEN`

```bash
# Token de 64 chars (≥ 32 requis par le service)
DEPLOY_TOKEN=$(openssl rand -base64 48 | tr -d '\n')
echo "$DEPLOY_TOKEN"
```

**Copie cette valeur** — tu vas en avoir besoin 2 fois :
- Dans le `.env` du deploy-server sur le VPS (étape 4.2).
- Dans le secret GitHub `DEPLOY_TOKEN` (étape 6).

### 4.2. Créer le `.env` côté VPS

```bash
mkdir -p /etc/smartanalyst
cat > /etc/smartanalyst/deploy-server.env <<EOF
DEPLOY_SERVER_HOST=127.0.0.1
DEPLOY_SERVER_PORT=3001
DEPLOY_TOKEN=$DEPLOY_TOKEN
REPO_PATH=/srv/smartanalyst-repo
LOG_LEVEL=info
EOF
chmod 600 /etc/smartanalyst/deploy-server.env
```

### 4.3. Lancer le service avec PM2

```bash
cd /srv/smartanalyst-repo
pm2 start apps/deploy-server/src/server.js \
  --name deploy-server \
  --update-env \
  --env $(cat /etc/smartanalyst/deploy-server.env | xargs -I{} echo {} | xargs)
# Plus simple :
pm2 delete deploy-server 2>/dev/null || true
env $(cat /etc/smartanalyst/deploy-server.env) \
  pm2 start apps/deploy-server/src/server.js --name deploy-server

pm2 save
pm2 status

# Test local depuis le VPS
curl http://127.0.0.1:3001/health
# → {"ok":true,"service":"deploy-server","ts":"..."}
```

---

## 5. Exposer via Nginx

Édite `/etc/nginx/sites-available/api.smartanalyst.io` (ou équivalent) et
ajoute le `location /admin/deploy/` AVANT le `location /` qui proxy l'API
elle-même :

```nginx
server {
    listen 443 ssl http2;
    server_name api.smartanalyst.io;

    # ... ssl_certificate, ssl_certificate_key déjà en place ...

    # Deploy webhook — limité au sous-chemin /admin/deploy/
    location /admin/deploy/ {
        proxy_pass http://127.0.0.1:3001/deploy/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Le deploy peut prendre 5 min (npm ci + build) — augmente les timeouts.
        proxy_read_timeout 480s;
        proxy_send_timeout 480s;

        # Limite la taille du body pour ce endpoint (pas besoin de uploads).
        client_max_body_size 8k;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;  # ou le port de ton API
        # ... config existante ...
    }
}
```

```bash
nginx -t && systemctl reload nginx
```

Test depuis ton Mac :

```bash
curl -X POST https://api.smartanalyst.io/admin/deploy/api \
  -H "X-Deploy-Token: WRONG_TOKEN"
# → {"error":"forbidden"}  (preuve que Nginx + service + auth fonctionnent)
```

---

## 6. Mettre `DEPLOY_TOKEN` dans les secrets GitHub

1. `https://github.com/inn-aroche/Smartanalyst.io/settings/secrets/actions`
2. **New repository secret** → Name : `DEPLOY_TOKEN`. Value : la même valeur
   que celle dans `/etc/smartanalyst/deploy-server.env` (étape 4.1).
3. Save.

⚠️ Si tu fais ça AVANT que le PR webhook soit mergé, ton prochain
`deploy-api` plantera (la route `/admin/deploy/api` n'existe pas encore
sur le VPS car le `git pull` côté VPS n'a pas encore eu lieu). Donc le
bon ordre c'est : **setup VPS jusqu'à l'étape 5 → secret GitHub → merge
de la PR → test E2E**.

---

## 7. Test end-to-end

Une fois la PR `claude/webhook-deploy-server` mergée dans `main` :

1. Le push trigger automatique de `deploy-api.yml`.
2. Le workflow fait `npm test` puis `curl POST /admin/deploy/api`.
3. Le service VPS reçoit, lance `bash scripts/deploy-api.sh`.
4. Le script : `git pull origin main`, `rsync` vers `/srv/smartanalyst-api`,
   `npm ci --omit=dev`, `pm2 reload`.
5. Le step "Verify deploy" curl `https://api.smartanalyst.io/health` et
   vérifie le header `Strict-Transport-Security`.

Si vert → tu n'as **plus jamais besoin de SSH** dans la CI pour les
déploiements API.

---

## Rollback rapide

Si un deploy casse la prod :

```bash
ssh root@2.24.9.186
cd /srv/smartanalyst-repo
git log --oneline -10           # trouve le commit OK
git checkout <commit-ok>
bash scripts/deploy-api.sh       # redéploie à la main
git checkout main               # remet la branche par défaut
```

Pour un revert plus propre, lance `git revert <bad-commit>` côté Mac et
push — le workflow le déploiera automatiquement.

---

## Sécurité — récap

- **Bind 127.0.0.1** : le port 3001 n'est jamais exposé direct sur Internet.
- **Token ≥ 32 chars** + comparaison à durée constante (anti-timing attack).
- **Deploy key SSH lecture-seule** : si la clé fuit, l'attaquant peut lire
  le repo mais pas push.
- **`DEPLOY_TOKEN` jamais loggé**.
- **Scripts shell versionnés** dans le repo — pas d'eval dynamique.
- **Logs structurés** : chaque tentative d'auth ratée ou succès loggé en JSON.

---

## Côté `deploy-web.yml`

Pour l'instant `app.smartanalyst.io` est sur le **shared hosting Hostinger**
(port 65002), pas sur le VPS. Le workflow `deploy-web.yml` n'est donc
**pas modifié** par cette PR — il continue d'utiliser SSH+rsync vers
Hostinger shared (qui n'est pas concerné par le souci VPS Anti-DDoS).

Si plus tard tu décides de migrer `app.smartanalyst.io` vers le VPS :
- Le endpoint `POST /admin/deploy/web` du deploy-server est déjà prêt.
- Le script `scripts/deploy-web.sh` est déjà écrit (pull, build, atomic swap).
- Il suffira d'ajuster `deploy-web.yml` pour appeler le webhook.
