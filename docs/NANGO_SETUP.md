# Setup Nango — SmartAnalyst

Ce document liste les variables d'environnement et la configuration côté
consoles développeurs à effectuer une fois pour activer les 8 intégrations
OAuth via Nango.

> Source : `nango.yaml` (racine du repo) déclare les syncs ; ce document
> décrit les credentials à configurer dans le dashboard Nango et chez
> chaque provider.

---

## 1. Variables d'environnement

### Backend (`apps/api/.env`)

```env
# Dashboard Nango → Environment Settings → Secret Key
NANGO_SECRET_KEY=nango_xxx
```

### Frontend (`apps/web/.env`)

```env
# Dashboard Nango → Environment Settings → Public Key
VITE_NANGO_PUBLIC_KEY=nango_xxx
# Laisser tel quel pour Nango Cloud (changer uniquement si self-hosting)
VITE_NANGO_HOST=https://api.nango.dev
```

---

## 2. Configurations à effectuer dans le dashboard Nango

Pour chaque intégration : **Nango Dashboard → Integrations → New Integration**
→ choisir le provider correspondant → coller le Client ID / Secret récupéré
chez le provider.

### Shopify

- **Console** : Shopify Partner Dashboard → Apps → Create custom app
- **OAuth scopes** : `read_orders`, `read_products`, `read_customers`
- **Variables additionnelles** : `Shop subdomain` (par utilisateur, renseigné au moment de la connexion)

### Google Analytics 4

- **Console** : Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID (Web app)
- **OAuth scopes** : `https://www.googleapis.com/auth/analytics.readonly`
- **API à activer** : Google Analytics Data API
- **Redirect URI Nango** : `https://api.nango.dev/oauth/callback`

### Meta Ads (Facebook / Instagram)

- **Console** : Meta for Developers → Create App → type "Business"
- **Produit à ajouter** : Marketing API
- **OAuth scopes** : `ads_read`, `business_management`
- **Redirect URI Nango** : `https://api.nango.dev/oauth/callback`

### TikTok Ads

- **Console** : TikTok For Business → Developers → Create App
- **OAuth scopes** : `business.basic.read`, `ad.basic.read`, `report.read`
- **À noter** : Validation TikTok requise avant production (peut prendre 1 à 2 semaines).

### Google Ads

- **Console** : Google Cloud Console (peut être le même projet que GA4)
- **API à activer** : Google Ads API
- **OAuth scopes** : `https://www.googleapis.com/auth/adwords`
- **Variable additionnelle** : `Developer token` (Google Ads → Tools → API Center)

### Stripe (Stripe Connect Standard)

- **Console** : Stripe Dashboard → Settings → Connect Settings → OAuth
- **OAuth scopes** : `read_only`
- **À noter** : Remplace le pattern API key restreinte précédemment utilisé.

### HubSpot

- **Console** : HubSpot Developers → Apps → Create app
- **OAuth scopes** :
  - `crm.objects.contacts.read`
  - `crm.objects.deals.read`
  - `crm.schemas.contacts.read`
  - `crm.schemas.deals.read`

### Notion

- **Console** : <https://www.notion.so/my-integrations> → New integration → "Public integration"
- **Capabilities** : Read content uniquement
- **À noter** : L'utilisateur sélectionne lui-même au moment du flow OAuth quelles pages partager avec l'app.

---

## 3. Limites du forfait gratuit Nango

Le plan **Free** autorise jusqu'à **10 connexions actives** au total (cumul
sur tous les workspaces et toutes les intégrations).

À surveiller :

- 3 utilisateurs × 4 intégrations connectées = 12 connexions → au-delà du free tier.
- Une connexion expirée ou supprimée ne compte plus dans le quota.
- Au-delà du free tier, passer au plan payant ou désactiver les intégrations non utilisées.

---

## 4. Tester l'intégration

Une fois `NANGO_SECRET_KEY` configuré côté backend, l'endpoint suivant doit
répondre :

```bash
curl -X POST "http://localhost:3000/api/v1/nango/connect/google-analytics?workspaceId=<uuid>" \
  -H "Authorization: Bearer <jwt>"
# → { "connect_session_token": "...", "expires_at": "..." }
```

Le `connect_session_token` est ensuite passé au SDK `@nangohq/frontend` côté
web pour ouvrir la popup OAuth (intégration côté frontend faite dans un PR
ultérieur).

---

## 5. Architecture des flux de données

Deux flux distincts une fois la connexion établie :

- **Flux A — `ExtracteurMetrics`** (`apps/api/src/connectors/nango/extracteur-metrics.js`)
  Données structurées (Shopify, GA4, Meta Ads, TikTok Ads, Google Ads,
  Stripe, HubSpot). Sortie : Markdown narratif pour l'agent IA.

- **Flux B — `ExtracteurDocuments`** (`apps/api/src/connectors/nango/extracteur-documents.js`)
  Documents non-structurés (Notion). Sortie : chunks vectorisés pour
  recherche sémantique RAG dans le chat.
