# @smartanalyst/deploy-server

Mini service HTTP qui tourne **sur le VPS** et reçoit les triggers de
déploiement de GitHub Actions. Évite de garder une connexion SSH entrante
dans la CI.

## Pourquoi ?

Le workflow `deploy-api.yml` rsync via SSH au port 22 du VPS. Si Hostinger
(ou n'importe quel hébergeur) déclenche un blocage Anti-DDoS, ferme le port
22 par erreur ou ban l'IP du runner GHA via fail2ban, **tous les
déploiements plantent silencieusement** avec un `ssh-keyscan exit 1` sans
stderr utile. Vécu sur ce projet en juin 2026, ~3h de debug.

Le pattern webhook supprime toute connexion entrante autre que HTTPS :
- Le runner GHA fait juste `curl -X POST https://api.smartanalyst.io/admin/deploy/api`.
- Le serveur reçoit, vérifie un token, lance le script bash de déploiement
  (git pull, npm ci, pm2 reload).
- Si le VPS répond aux ports 80/443 il répond au deploy. Pas de SSH.

## Architecture

```
GitHub Actions runner
        │
        │ POST https://api.smartanalyst.io/admin/deploy/api
        │ X-Deploy-Token: ${{ secrets.DEPLOY_TOKEN }}
        ▼
   Nginx (443/TCP, déjà en place)
        │
        │ proxy_pass http://127.0.0.1:3001/deploy/api
        ▼
   deploy-server (ce service)
        │
        │ execFile('/bin/bash', ['scripts/deploy-api.sh'])
        ▼
   scripts/deploy-api.sh
        │  git fetch + reset --hard origin/main
        │  rsync vers /srv/smartanalyst-api
        │  npm ci --omit=dev
        │  pm2 reload smartanalyst-api
        ▼
   API rebooted with new code
```

## Sécurité

- **Bind sur 127.0.0.1 uniquement** — jamais exposé direct sur Internet.
  L'accès se fait via Nginx proxy.
- **Auth par token** (`X-Deploy-Token` header) avec comparaison à durée
  constante (anti-timing attack). Token ≥ 32 chars obligatoire.
- **Pas d'eval dynamique** — les scripts shell sont versionnés dans le
  repo (`scripts/deploy-*.sh`).
- **Logs structurés JSON** (pino) — chaque auth ratée et chaque deploy
  réussi/raté est tracé.

## Setup (à faire UNE FOIS sur le VPS)

Voir `docs/05b_VPS_DEPLOY_SERVER.md`.

## Variables d'environnement

| Var | Défaut | Description |
|---|---|---|
| `DEPLOY_SERVER_HOST` | `127.0.0.1` | Bind interne uniquement |
| `DEPLOY_SERVER_PORT` | `3001` | Port d'écoute interne |
| `DEPLOY_TOKEN` | _(required)_ | ≥ 32 chars, identique au secret GitHub `DEPLOY_TOKEN` |
| `REPO_PATH` | `/srv/smartanalyst-repo` | Chemin du repo cloné côté VPS |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |

## Routes

| Method | Path | Auth | Action |
|---|---|---|---|
| GET | `/health` | non | Renvoie `{ok:true, service, ts}` |
| POST | `/deploy/api` | `X-Deploy-Token` | Exécute `scripts/deploy-api.sh` |
| POST | `/deploy/web` | `X-Deploy-Token` | Exécute `scripts/deploy-web.sh` (ready, pas câblé tant que web pas sur VPS) |

Tous les autres paths → 404.

## Limites connues

- **Concurrence** : aucun lock. Si deux deploy/api se déclenchent en parallèle,
  les deux scripts shell tourneront — peuvent se piler dessus. Le workflow
  GHA a `concurrency: group: deploy-api, cancel-in-progress: false` qui les
  enfile côté GitHub, mais côté serveur rien n'empêche un appel manuel
  concurrent. Acceptable au début.
- **Pas de queue persistante** — si le service crash pendant un deploy, le
  workflow GHA verra un timeout 504. Suffisant pour MVP, on rajoutera
  une queue BullMQ si besoin (Lot 3 Observabilité).
- **Timeout 8 min** sur l'execFile — un build web particulièrement lourd
  pourrait dépasser. À ajuster si besoin.
