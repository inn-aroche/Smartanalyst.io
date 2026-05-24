# DEPLOYMENT_WEB.md — Setup du déploiement de l'app sur Hostinger

Déploiement statique du build Vite de `apps/web/` vers le sous-domaine
`app.smartanalyst.io` (Hostinger). À faire **une fois**, après quoi chaque push
sur `main` qui touche `apps/web/` déclenche un déploiement via GitHub Actions.

**Pipeline :**
```
push main → GitHub Actions → npm ci + build (VITE_API_URL=https://api.smartanalyst.io)
        → rsync dist/ → Hostinger public_html du sous-domaine
```

---

## 1. Créer le sous-domaine côté Hostinger

1. hPanel → Domains → `smartanalyst.io` → **Subdomains** → **Create subdomain**
2. Subdomain : `app`
3. Document root : laisse la valeur par défaut (Hostinger crée automatiquement
   `domains/app.smartanalyst.io/public_html` ou équivalent)
4. **Note le chemin exact du document root** — c'est lui qu'on mettra dans le
   secret `HOSTINGER_WEB_DEPLOY_PATH`.

Vérifie via SSH :
```bash
ssh -p 65002 u123456789@<host> 'ls -la domains/app.smartanalyst.io/public_html'
```

---

## 2. Configurer le SSL pour `app.smartanalyst.io`

hPanel → Security → SSL → sélectionne `app.smartanalyst.io` → **Install SSL**.
Hostinger émet un cert Let's Encrypt sous quelques minutes.

---

## 3. Routing SPA — ajouter un `.htaccess`

Vite produit un SPA : toutes les routes (`/`, `/login`, `/dashboard`, etc.) doivent
servir `index.html`. Sans ça, un refresh sur `/dashboard` renverra un 404 Apache.

Connecte-toi en SSH au sous-domaine et crée le fichier :

```bash
ssh -p 65002 u123456789@<host>
cd domains/app.smartanalyst.io/public_html
cat > .htaccess <<'EOF'
# SPA fallback: route everything to index.html so client-side routing works.
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>

# Strong caching for hashed assets
<IfModule mod_headers.c>
  <FilesMatch "\.(js|css|woff2?|svg|png|jpg|jpeg|webp)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  <FilesMatch "index\.html$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
</IfModule>
EOF
```

Note : la workflow rsync `--exclude='.htaccess'` pour ne pas l'écraser à chaque
déploiement.

---

## 4. Ajouter le secret GitHub

GitHub → Settings → Secrets and variables → Actions → **New repository secret**.

| Nom | Valeur |
|---|---|
| `HOSTINGER_WEB_DEPLOY_PATH` | chemin absolu du `public_html` du sous-domaine, ex. `/home/u123456789/domains/app.smartanalyst.io/public_html` |

Les autres secrets (`HOSTINGER_SSH_HOST`, `HOSTINGER_SSH_PORT`, `HOSTINGER_SSH_USER`,
`HOSTINGER_SSH_PRIVATE_KEY`) sont déjà configurés pour le déploiement marketing
et sont réutilisés tels quels.

---

## 5. Créer l'environnement protégé GitHub (optionnel)

Settings → Environments → New environment → `production-web`.
Le workflow référence déjà ce nom. Tu peux y ajouter des required reviewers si tu
veux une approbation manuelle avant chaque deploy.

---

## 6. Premier déploiement

**A. Manuel** (recommandé pour la première fois) :
GitHub → Actions → "Deploy web app" → Run workflow → branche `main`

**B. Auto** : merge n'importe quel PR qui touche `apps/web/` vers `main`.

---

## 7. Vérifier

```bash
curl -I https://app.smartanalyst.io
# 200 OK, Content-Type: text/html
```

Dans le navigateur : la page de login SmartAnalyst doit s'afficher.

---

## Troubleshooting

**Refresh d'une route donne un 404 Apache**
→ Le `.htaccess` n'est pas en place (cf. §3). Recrée-le.

**La page charge mais les appels API échouent (CORS / 401)**
→ Vérifie que l'API a bien `app.smartanalyst.io` dans sa liste `CORS_ALLOWED_ORIGINS`.

**Le build casse sur `VITE_API_URL`**
→ Le workflow l'injecte au build (cf. `.github/workflows/deploy-web.yml`). Vérifie
qu'il est bien défini.
