# DEPLOYMENT_API.md — Setup du déploiement de l'API sur le VPS Hostinger

Ce document explique comment configurer le déploiement automatique de
`apps/api/` vers un VPS Ubuntu Hostinger. À faire **une fois**, après quoi
chaque push sur `main` qui touche l'API déclenche un déploiement via GitHub
Actions.

**Pipeline :**
```
push main → GitHub Actions → npm ci + tests → rsync via SSH → pm2 reload → VPS
```

Stack côté VPS : **Ubuntu** + **Node 20** + **PM2** + **Redis** + **nginx** + **certbot** (Let's Encrypt).

---

## 1. Côté Hostinger : récupérer l'accès root au VPS

1. hPanel → VPS → ton VPS → onglet **Accès**
2. Note l'IP et le mot de passe root (ou la clé SSH si tu en as déjà configuré une)
3. Première connexion :
   ```bash
   ssh root@<IP_DU_VPS>
   ```

---

## 2. Provisionner le VPS (une seule fois)

Le script `scripts/vps-provision.sh` installe tout le stack système.
Il est **idempotent** : tu peux le relancer sans risque.

Depuis ta machine locale :
```bash
# Option A — pipe le script directement
ssh root@<IP_DU_VPS> 'bash -s' < scripts/vps-provision.sh

# Option B — copie puis exécute sur le serveur
scp scripts/vps-provision.sh root@<IP_DU_VPS>:/tmp/
ssh root@<IP_DU_VPS> 'bash /tmp/vps-provision.sh'
```

Le script :
- installe Node 20, PM2, Redis, nginx, certbot, fail2ban
- installe les libs système nécessaires à Playwright (rendu PDF des rapports)
- crée un user **`deploy`** non-root qui possédera `/srv/smartanalyst-api/`
- configure UFW (ports 22, 80, 443 uniquement)
- prépare le startup systemd pour PM2

À la fin, il affiche les étapes suivantes — celles ci-dessous.

---

## 3. Générer une clé SSH dédiée au déploiement

> Pas ta clé SSH perso. On génère une clé **dédiée** à GitHub Actions, révocable.

Sur ta machine locale :
```bash
ssh-keygen -t ed25519 \
  -C "github-actions-deploy@smartanalyst-api" \
  -f ~/.ssh/smartanalyst_vps_deploy \
  -N ""
```

Deux fichiers :
- `~/.ssh/smartanalyst_vps_deploy` (clé privée → GitHub secret)
- `~/.ssh/smartanalyst_vps_deploy.pub` (clé publique → VPS)

---

## 4. Autoriser la clé sur le VPS pour l'user `deploy`

```bash
# Copie la clé publique
cat ~/.ssh/smartanalyst_vps_deploy.pub | \
  ssh root@<IP_DU_VPS> 'cat >> /home/deploy/.ssh/authorized_keys'

# Vérifie que ça marche en se connectant directement en tant que deploy
ssh -i ~/.ssh/smartanalyst_vps_deploy deploy@<IP_DU_VPS> 'whoami && pwd'
# Doit imprimer:  deploy  /home/deploy
```

---

## 5. Pointer le DNS

Crée un enregistrement **A** chez ton registrar :

| Type | Nom | Valeur |
|---|---|---|
| `A` | `api` | `<IP_DU_VPS>` |

Vérifie la propagation : `dig +short api.smartanalyst.io` doit retourner l'IP.

---

## 6. Configurer nginx + HTTPS

```bash
ssh root@<IP_DU_VPS>

# Drop le site config
sed 's/__DOMAIN__/api.smartanalyst.io/g' \
  /tmp/vps-nginx-api.conf.template \
  > /etc/nginx/sites-available/smartanalyst-api
# (Si tu n'as pas le template sur le serveur, copie-le depuis le repo:
#   scp scripts/vps-nginx-api.conf.template root@<IP_DU_VPS>:/tmp/  )

ln -s /etc/nginx/sites-available/smartanalyst-api /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# TLS via Let's Encrypt — certbot rewrite le site config pour ajouter le bloc HTTPS
certbot --nginx -d api.smartanalyst.io
# Choisis "2" (redirect HTTP → HTTPS)
```

certbot installe aussi un timer systemd pour le renouvellement automatique (rien à faire).

---

## 7. Préparer le fichier `.env` de production

L'API a besoin de pas mal de variables (cf. `apps/api/.env.example`). Deux options :

### Option A — Pousser le .env via GitHub Actions (recommandé)

Ajoute le secret GitHub **`API_ENV_FILE`** (Settings → Secrets and variables → Actions) avec **le contenu complet** du fichier `.env` de production. À chaque deploy, le workflow l'écrit dans `/srv/smartanalyst-api/apps/api/.env` (mode 600).

> Avantage : tout est en un endroit (GitHub secrets), réversible, auditable.
> Inconvénient : nécessite que tu rotates le secret GitHub si tu changes une valeur.

### Option B — Maintenir le .env manuellement sur le VPS

Édite directement `/srv/smartanalyst-api/apps/api/.env` sur le VPS (en tant qu'user `deploy`). Ne crée **pas** le secret `API_ENV_FILE` côté GitHub — le workflow saute alors cette étape.

---

## 8. Configurer les secrets GitHub

Va sur **GitHub → Settings → Secrets and variables → Actions → New repository secret**.

| Nom du secret | Valeur |
|---|---|
| `VPS_SSH_HOST` | IP du VPS (ex. `2.24.9.186`) |
| `VPS_SSH_PORT` | `22` (ou ton port custom) |
| `VPS_SSH_USER` | `deploy` |
| `VPS_SSH_PRIVATE_KEY` | **contenu complet** de `~/.ssh/smartanalyst_vps_deploy` (de `-----BEGIN` à `-----END` inclus) |
| `API_ENV_FILE` *(optionnel)* | contenu complet du `.env` de production — cf. §7 option A |

Pour copier la clé privée proprement :
```bash
cat ~/.ssh/smartanalyst_vps_deploy | pbcopy   # macOS
cat ~/.ssh/smartanalyst_vps_deploy | xclip    # Linux
```

---

## 9. Créer l'environnement protégé GitHub (recommandé)

Settings → Environments → New environment → `production-api`.
Le workflow référence déjà ce nom. Tu peux y ajouter :
- **Required reviewers** : approbation humaine avant chaque deploy
- **Deployment branches** : limite à `main`

---

## 10. Premier déploiement

**A. Manuelle** (recommandée pour le premier) :
GitHub → Actions → "Deploy API to VPS" → Run workflow → branche `main`

**B. Auto** : merge n'importe quel PR qui touche `apps/api/` vers `main`.

---

## 11. Vérifier que ça tourne

```bash
# Le workflow GH Actions doit être vert

# Sur le VPS, en tant que deploy
ssh deploy@<IP_DU_VPS>
pm2 status                                # 2 process en "online" : api + worker
pm2 logs smartanalyst-api --lines 20      # logs Pino JSON
curl http://127.0.0.1:3000/health         # ou la route de health check

# Depuis l'extérieur
curl https://api.smartanalyst.io/health
```

---

## Troubleshooting

**`Permission denied (publickey)` au step "Rsync source to VPS"**
→ La clé privée dans `VPS_SSH_PRIVATE_KEY` est mal copiée (saut de ligne perdu, espace en fin). Recopie depuis `cat ~/.ssh/smartanalyst_vps_deploy | pbcopy` sans modifier.

**`Host key verification failed`**
→ Vérifie `VPS_SSH_HOST` et `VPS_SSH_PORT`. Si tu as réinstallé le VPS, l'ancienne empreinte SSH ne marche plus côté GH Actions — pas un souci (le step `ssh-keyscan` la re-récupère à chaque run), sauf si l'IP a changé entre temps.

**`pm2: command not found` au step PM2**
→ PM2 n'est pas dans le PATH de l'user `deploy`. Vérifie : `ssh deploy@<vps> 'which pm2'`. S'il manque, ré-installe : `sudo npm install -g pm2`.

**L'API démarre puis crash en boucle**
→ `pm2 logs smartanalyst-api` — généralement une variable d'env manquante. Vérifie `/srv/smartanalyst-api/apps/api/.env` et compare avec `apps/api/.env.example`. Cf. `src/lib/env-validator.js` pour la liste exacte des variables requises en prod.

**`502 Bad Gateway` sur `https://api.smartanalyst.io`**
→ L'API n'écoute pas sur `127.0.0.1:3000`. Vérifie `pm2 status` (process down ?) ou que `PORT=3000` dans le `.env`.

**Le worker n'exécute pas les jobs**
→ Redis : `redis-cli ping` doit répondre `PONG`. Vérifie aussi que `REDIS_URL=redis://localhost:6379` dans le `.env`.

**Playwright lance une erreur `Host system is missing dependencies`**
→ Le script de provisioning installe ces deps, mais si Playwright met à jour Chromium plus tard, il peut redemander des libs. Ré-exécute : `sudo npx playwright install-deps chromium`.

---

## Rollback

Pas de pipeline de rollback automatique pour l'instant. En cas de bug en prod :

```bash
# Option 1 — git revert le commit fautif sur main → relance le deploy
git revert <sha-fautif> && git push

# Option 2 — re-run un ancien workflow vert
# GitHub → Actions → "Deploy API to VPS" → ouvrir un run précédent vert → "Re-run all jobs"
```

Une bascule "release atomique avec symlink" peut être ajoutée plus tard si on veut un rollback en une commande sur le VPS.

---

## Sécurité — checklist post-setup

- [ ] Login root SSH **désactivé** une fois la clé `deploy` opérationnelle :
      ```bash
      sudo sed -i 's/^#*PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config
      sudo systemctl restart ssh
      ```
- [ ] Login par mot de passe désactivé (uniquement clé SSH) :
      ```bash
      sudo sed -i 's/^#*PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
      sudo systemctl restart ssh
      ```
- [ ] Mises à jour de sécurité automatiques :
      ```bash
      sudo apt-get install -y unattended-upgrades
      sudo dpkg-reconfigure -plow unattended-upgrades
      ```
- [ ] Backup régulier du `.env` de prod hors du VPS (déjà dans GitHub si tu utilises §7 option A)
- [ ] Snapshot du VPS via Hostinger avant chaque deploy majeur (hPanel → VPS → Snapshots)
