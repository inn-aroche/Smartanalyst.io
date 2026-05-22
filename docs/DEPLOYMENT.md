# DEPLOYMENT.md — Setup du déploiement vitrine

Ce document explique comment configurer le déploiement automatique de
`apps/marketing/` vers Hostinger Cloud Hosting. À faire **une fois**, après
quoi chaque push sur `main` qui touche la vitrine déclenche un deploy.

**Pipeline :**
```
push main → GitHub Actions → npm ci → astro build → rsync via SSH → Hostinger
```

---

## 1. Côté Hostinger : activer SSH

1. Connecte-toi à **hPanel** → Hosting → ton plan Cloud
2. Va dans **Avancé → Accès SSH**
3. Active SSH si pas déjà fait
4. Note ces 3 valeurs (tu les utiliseras à l'étape 4) :
   - **Adresse SSH** (ex: `145.223.xxx.xxx` ou un hostname)
   - **Port SSH** (Hostinger utilise **65002** par défaut, pas 22)
   - **Utilisateur SSH** (ex: `u123456789`)

5. Note aussi le **chemin du document root** du domaine `smartanalyst.io`.
   Tu le trouves dans hPanel → Domaines → `smartanalyst.io` → "Document root".
   Format typique :
   ```
   /home/u123456789/domains/smartanalyst.io/public_html
   ```

---

## 2. Générer une clé SSH dédiée

> Ne réutilise **pas** ta clé SSH perso. On génère une clé jetable
> dédiée à GitHub Actions, qu'on pourra révoquer si compromise.

Sur ta machine locale :

```bash
ssh-keygen -t ed25519 \
  -C "github-actions-deploy@smartanalyst.io" \
  -f ~/.ssh/smartanalyst_deploy \
  -N ""
```

Ça crée deux fichiers :
- `~/.ssh/smartanalyst_deploy` (clé privée — **secret**, va dans GitHub)
- `~/.ssh/smartanalyst_deploy.pub` (clé publique — va sur Hostinger)

---

## 3. Autoriser la clé sur Hostinger

Option A — via la commande (la plus rapide) :

```bash
ssh-copy-id -i ~/.ssh/smartanalyst_deploy.pub \
  -p 65002 \
  u123456789@145.223.xxx.xxx
```

(Remplace par tes vraies valeurs. Le mot de passe demandé est celui de ton
compte Hostinger SSH.)

Option B — manuellement :
1. `cat ~/.ssh/smartanalyst_deploy.pub` — copie tout le contenu (commence par `ssh-ed25519 …`)
2. Connecte-toi via hPanel → SSH ou directement :
   `ssh -p 65002 u123456789@145.223.xxx.xxx`
3. Sur le serveur :
   ```bash
   mkdir -p ~/.ssh
   chmod 700 ~/.ssh
   echo "<colle ta clé publique ici>" >> ~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys
   ```

**Vérifie que ça marche :**
```bash
ssh -i ~/.ssh/smartanalyst_deploy -p 65002 u123456789@145.223.xxx.xxx "echo OK"
# Doit imprimer OK sans demander de mot de passe
```

---

## 4. Configurer les secrets GitHub

Va sur **GitHub → ton repo → Settings → Secrets and variables → Actions → New repository secret**.

Crée ces 5 secrets :

| Nom du secret | Valeur |
|---|---|
| `HOSTINGER_SSH_HOST` | l'adresse de l'étape 1 (`145.223.xxx.xxx` ou hostname) |
| `HOSTINGER_SSH_PORT` | `65002` |
| `HOSTINGER_SSH_USER` | ton user (`u123456789`) |
| `HOSTINGER_SSH_PRIVATE_KEY` | **le contenu complet** de `~/.ssh/smartanalyst_deploy` (depuis `-----BEGIN OPENSSH PRIVATE KEY-----` jusqu'à `-----END OPENSSH PRIVATE KEY-----` inclus) |
| `HOSTINGER_DEPLOY_PATH` | le document root de l'étape 1 |

Pour copier la clé privée proprement :
```bash
cat ~/.ssh/smartanalyst_deploy | pbcopy   # macOS
cat ~/.ssh/smartanalyst_deploy | xclip    # Linux
```
Puis colle dans le champ "Secret" de GitHub. Pas de trim, pas de modification.

---

## 5. Créer l'environnement protégé (recommandé)

Va sur **Settings → Environments → New environment** et crée
`production-marketing`. Tu peux y ajouter :
- **Required reviewers** : un humain doit approuver chaque deploy
- **Deployment branches** : limite à `main`

Le workflow référence déjà cet environnement, donc ces protections seront
appliquées automatiquement dès qu'il existe.

---

## 6. Premier deploy

Deux façons :

**A. Manuelle (recommandée pour le premier deploy)** :
GitHub → Actions → "Deploy marketing site" → Run workflow → branche `main`

**B. Auto** :
Merge n'importe quel PR qui touche `apps/marketing/` vers `main`.

---

## 7. Vérifier que ça a marché

1. Onglet **Actions** : le run doit être vert
2. Va sur https://smartanalyst.io — la nouvelle vitrine doit être en ligne
3. Inspecter `view-source:` doit montrer le HTML statique généré par Astro

---

## Troubleshooting

**`Permission denied (publickey)`** dans le step "Deploy via rsync"
→ La clé privée dans `HOSTINGER_SSH_PRIVATE_KEY` est mal copiée (espaces en fin, ligne tronquée).
   Re-copie depuis `cat ~/.ssh/smartanalyst_deploy | pbcopy` sans rien modifier.

**`Host key verification failed`**
→ Vérifie que `HOSTINGER_SSH_HOST` et `HOSTINGER_SSH_PORT` sont corrects et qu'`ssh-keyscan` peut joindre le serveur (rare — moyen que Hostinger bloque la CI IP).

**Le site n'est pas mis à jour après deploy vert**
→ Cache navigateur ou cache Hostinger LiteSpeed. Hard refresh (Cmd+Shift+R), ou attendre 1-2 minutes. En dernier recours, purger le cache LiteSpeed dans hPanel.

**Erreur `rsync: command not found`**
→ Ne devrait pas arriver sur `ubuntu-latest`, mais Hostinger doit aussi avoir rsync — c'est le cas par défaut sur Cloud Hosting. Si pas le cas, on peut basculer sur `scp -r` (moins efficace mais marche partout).

---

## Roadmap déploiement (pour plus tard)

- **App SaaS (`apps/web`, `apps/api`)** : déploiement sur Railway ou Render, pas sur Hostinger Cloud (cf. discussion d'archi). Workflow séparé à créer le moment venu.
- **Preview deploys** : Vercel ou Cloudflare Pages pour avoir une URL par PR sur la vitrine. À considérer si on itère beaucoup sur le contenu.
- **Rollback** : pour l'instant pas automatique. En cas de souci, `git revert` sur main relance un deploy avec la version précédente.
