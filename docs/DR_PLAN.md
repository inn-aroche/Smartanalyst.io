# Disaster Recovery — SmartAnalyst

> **Audience :** Aurélien (toi), on-call.
> **Objectif :** Reprendre un service dégradé en < 1h, un service complet en < 4h.
> **Référence :** PRE_LAUNCH_CHECKLIST.md §5.2 · CLAUDE.md « Exige une validation humaine ».

À tester en sandbox au moins 1× **avant** ouverture publique. Re-tester tous les 6 mois.

---

## 0. Vue d'ensemble

| Composant | Hébergeur | Données | Backup |
|---|---|---|---|
| Marketing site | Netlify | aucune (statique) | git only |
| App web | Netlify | aucune (statique) | git only |
| API | VPS Hostinger | aucune (stateless) | git + snapshot Hostinger |
| Postgres + Auth + Vault | Supabase | **toutes les données user** | Supabase backups quotidiens + PITR (plan Pro) |
| Redis (BullMQ) | VPS Hostinger | jobs en cours | jobs idempotents, perte tolérée |
| Stripe | Stripe | abos + factures | Stripe-managed |
| Resend | Resend | logs email 30j | Resend-managed |

**Single Point of Failure :** Supabase Postgres. Tout le reste est récupérable depuis git.

---

## 1. Détection

### Alertes qui déclenchent ce playbook
1. UptimeRobot → SMS si `/health/ready` (api.smartanalyst.io) down > 2 min
2. Sentry → email si error rate API > 50/min
3. PostHog → drop signups > 90% jour J vs J-1 (incident silencieux)
4. Stripe → email si checkout success rate < 50% sur 1h

### Décision : incident vs glitch
Si l'alerte est isolée + se résout en < 5 min → glitch, on note dans `/incidents.md` et on continue.
Si > 5 min OU multiples alertes simultanées → on déclenche ce playbook.

---

## 2. Triage rapide (5 min)

```bash
# 1. État global VPS
ssh root@2.24.9.186
pm2 status
df -h        # disque plein ?
free -h      # RAM saturée ?

# 2. API logs
pm2 logs smartanalyst-api --lines 200 --nostream

# 3. Postgres up ?
curl -s https://api.smartanalyst.io/health/ready | jq

# 4. Supabase dashboard
# https://supabase.com/dashboard/project/zbvwkqdohkpkyyyyphlo
# → Database → "Service status" doit être green
```

Selon ce que tu vois → branche correspondante ci-dessous.

---

## 3. Scénario A — API VPS down

**Symptômes :** `/health/ready` timeout, `pm2 status` montre l'API en `errored` ou `stopped`.

```bash
ssh root@2.24.9.186
cd /var/www/smartanalyst-api
pm2 logs smartanalyst-api --lines 500 --nostream | tail -100  # cherche la stack
pm2 restart smartanalyst-api
sleep 5
curl -s https://api.smartanalyst.io/health/ready | jq
```

**Si crash récurrent :**
1. Le dernier commit est-il sain ? `git log --oneline -5`
2. Si la cause est un commit récent → rollback :
   ```bash
   git fetch origin
   git reset --hard <commit_sha_safe>
   npm ci --omit=dev
   pm2 reload smartanalyst-api
   ```
3. Si la cause est ailleurs (DB, env) → voir scénarios B/C.

---

## 4. Scénario B — Supabase Postgres dégradé / down

**Symptômes :** API up mais 5xx sur tout endpoint qui touche DB. Supabase dashboard rouge.

### B.1 Incident Supabase officiel
1. Check https://status.supabase.com → si incident reconnu, mettre `status.smartanalyst.io` en mode dégradé.
2. Communiquer aux users via banner sur la status page + tweet `@SmartAnalyst_io`.
3. Attendre la résolution Supabase (généralement < 1h pour les incidents majeurs).

### B.2 Notre projet corrompu / migration en panne
1. **NE PAS** lancer de migration en panique. Identifier d'abord ce qui est cassé.
2. Snapshot avant tout :
   ```bash
   # Depuis le local
   supabase db dump --project-ref zbvwkqdohkpkyyyyphlo > backup-before-recovery-$(date +%Y%m%d-%H%M).sql
   ```
3. Si nécessité de revenir à un état antérieur, utiliser PITR (plan Pro requis) :
   - Dashboard → Database → Backups → "Restore to point in time" → choisir un timestamp **avant** l'incident.
   - ⚠ Cette opération crée un nouveau projet. Il faut basculer la `DATABASE_URL` du VPS dessus.

### B.3 Restore depuis backup quotidien
1. Dashboard → Database → Backups → "Download" du dernier backup OK.
2. Si tu dois importer dans un nouveau projet :
   ```bash
   psql "$NEW_DATABASE_URL" < backup-YYYYMMDD.sql
   ```
3. Mettre à jour `.env` du VPS :
   ```bash
   ssh root@2.24.9.186
   nano /var/www/smartanalyst-api/.env  # DATABASE_URL + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
   pm2 reload smartanalyst-api
   ```

---

## 5. Scénario C — Frontend Netlify down

**Symptômes :** smartanalyst.io ou app.smartanalyst.io répondent 5xx.

1. Check https://www.netlifystatus.com → si Netlify down, rien à faire, attendre.
2. Si seul notre déploiement est cassé :
   - Dashboard Netlify → site concerné → "Deploys" → trouver le dernier deploy OK
   - Cliquer "Publish deploy" pour rollback instantané (< 1 min)
3. Investiguer la cause du dernier build :
   - Deploy log dans Netlify
   - Si erreur de build (TS / lint / test), un fix + re-push résout

---

## 6. Scénario D — Stripe webhook silencieux

**Symptômes :** users upgrades mais leur plan reste Free. `billing_events` table ne reçoit plus.

1. Stripe dashboard → Webhooks → vérifier que les events récents sont en "Succeeded" (200 de notre API).
2. Si échecs : lire le code retour Stripe → souvent un mismatch de `STRIPE_WEBHOOK_SECRET` (LIVE vs TEST mélangés).
3. Resyncer les events ratés depuis le dashboard Stripe (bouton "Resend"). Tout event est idempotent côté API (clé `event.id` checkée).

---

## 7. Communication incident

Pour tout incident > 15 min :

1. **status.smartanalyst.io** → publier un incident avec ETA si possible.
2. **Email aux users** (depuis Resend) : template court "On a un souci, on regarde, on reviendra vers vous d'ici X."
3. **Post-mortem** : dans les 48h, doc dans `docs/incidents/YYYY-MM-DD-<slug>.md` avec timeline + cause racine + action items préventifs.

---

## 8. Annexes

### Identifiants clés (où les trouver, JAMAIS dans git)
- VPS : `ssh root@2.24.9.186`, mot de passe / clé SSH dans 1Password vault "SmartAnalyst Infra"
- Supabase project : `zbvwkqdohkpkyyyyphlo` — dashboard https://supabase.com/dashboard/project/zbvwkqdohkpkyyyyphlo
- Netlify : 2 sites (marketing + app) — dashboard owner = aurelien.roche92400@gmail.com
- Stripe : compte LIVE active, dashboard https://dashboard.stripe.com
- Resend : workspace "SmartAnalyst", clé d'API dans Resend vault

### Health endpoints
- API : `https://api.smartanalyst.io/health/ready` → JSON `{ status, postgres, redis }`
- Web : `https://app.smartanalyst.io/` → 200 OK (statique Netlify)
- Marketing : `https://smartanalyst.io/` → 200 OK

### Contact externe en cas d'urgence
- Supabase support (plan Pro) : email + form dashboard, réponse < 4h
- Stripe support : chat dashboard, réponse < 1h
- Hostinger support : chat dashboard, réponse < 30 min
- Resend support : `support@resend.com`

---

**Dernière mise à jour :** 2026-06-26 · à re-tester en sandbox tous les 6 mois.
