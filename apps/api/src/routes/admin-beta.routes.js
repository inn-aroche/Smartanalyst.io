// Admin beta playbook — GET /admin/beta
//
// Tableau de bord pour piloter la beta : qui s'est inscrit, qui est passé
// par l'onboarding, qui utilise le chat, qui coûte combien en tokens IA…
//
// Protégé par X-Admin-Token (même token que /admin/queues, /admin/waitlist).
//
// Format de réponse négocié via Accept :
//   - Accept: application/json (défaut, curl/scripts) → JSON
//   - Accept: text/html (navigateur)                  → HTML inline standalone
//
// Pas d'UI dans le web app : c'est un outil ops solo-founder, pas un
// "vrai" dashboard. Quand on aura besoin de fancy charts on basculera
// vers une page dédiée — pas pour la beta.

const express = require('express')
const { requireAdminToken } = require('../middleware/admin-token.middleware')
const betaStats = require('../services/admin/beta-stats.service')

const router = express.Router()

router.use(requireAdminToken)

router.get('/', async (req, res) => {
  try {
    const overview = await betaStats.getOverview({ recentLimit: 15, costsLimit: 10 })

    // Content negotiation : JSON par défaut (curl/scripts envoient Accept: */*),
    // HTML uniquement si le client le demande explicitement (ex: navigateur
    // qui priorise text/html, ou `Accept: text/html` à la main).
    // L'ordre de la liste compte : sur Accept: */* le 1er gagne.
    const preferred = req.accepts(['json', 'html'])
    if (preferred === 'html') {
      res.set('Content-Type', 'text/html; charset=utf-8')
      // Cache strictement nul : c'est un dashboard live qu'on refresh.
      res.set('Cache-Control', 'no-store')
      return res.send(renderHtml(overview))
    }
    res.json(overview)
  } catch (err) {
    res.status(500).json({ error: 'overview_failed', message: err.message })
  }
})

// ─── HTML render (standalone, zéro dépendance, inline CSS) ───────────────

function esc(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtUsd(n) {
  return `$${(Number(n) || 0).toFixed(4)}`
}

function fmtInt(n) {
  return new Intl.NumberFormat('fr-FR').format(n || 0)
}

const STEP_LABELS = {
  signed_up: 'Inscrits',
  connected_source: 'Connecté ≥ 1 source',
  received_data: 'Reçu ≥ 1 métrique',
  asked_chat: 'Posé une question (7j)',
  created_watch: 'Créé une veille',
  got_insight: 'Reçu un insight',
}

/**
 * Rendu HTML standalone — aucune dépendance externe. Inline CSS, monospace
 * sobre, sparkline en SVG. Suffisant pour un outil interne.
 */
function renderHtml(o) {
  const sparkline = renderSparkline(o.activity.chatActivityByDay)
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SmartAnalyst — Beta playbook</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: ui-monospace, "DM Mono", monospace; background: #0c0c1b; color: #ECECF1; margin: 0; padding: 32px 28px; line-height: 1.5; }
  h1 { font-family: "Plus Jakarta Sans", system-ui, sans-serif; font-size: 24px; font-weight: 700; margin: 0 0 4px; }
  .sub { color: #9C9CB4; font-size: 12px; margin-bottom: 32px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; }
  .card { background: #14142A; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 18px 20px; }
  .card .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #9C9CB4; margin-bottom: 6px; }
  .card .value { font-family: "Plus Jakarta Sans", system-ui, sans-serif; font-size: 32px; font-weight: 700; }
  .card .delta { font-size: 11px; color: #9C9CB4; margin-top: 4px; }
  .section { background: #14142A; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 18px 22px; margin-bottom: 16px; }
  .section h2 { font-family: "Plus Jakarta Sans", system-ui, sans-serif; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #9C9CB4; margin: 0 0 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid rgba(255,255,255,0.06); }
  th { color: #9C9CB4; font-weight: 500; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td code { font-size: 11px; opacity: 0.7; }
  .bar { position: relative; height: 22px; background: rgba(255,255,255,0.05); border-radius: 4px; overflow: hidden; }
  .bar .fill { position: absolute; top: 0; left: 0; bottom: 0; background: linear-gradient(90deg, #3D6BE0, #2DD9EE); }
  .bar .lbl { position: absolute; top: 4px; left: 8px; font-size: 11px; color: #fff; }
  .bar .pct { position: absolute; top: 4px; right: 8px; font-size: 11px; color: #fff; opacity: 0.85; font-variant-numeric: tabular-nums; }
  .row { display: grid; grid-template-columns: 200px 1fr; gap: 12px; align-items: center; margin-bottom: 8px; font-size: 12px; }
  .row .name { color: #ECECF1; }
  a { color: #5C8FFF; }
  .meta { color: #9C9CB4; font-size: 11px; margin-top: 12px; }
</style>
</head>
<body>
  <h1>Beta playbook</h1>
  <div class="sub">Generated ${esc(fmtDate(o.generatedAt))} · <a href="?format=json">JSON</a></div>

  <div class="grid">
    <div class="card">
      <div class="label">Total workspaces</div>
      <div class="value">${fmtInt(o.totals.workspaces)}</div>
      <div class="delta">${fmtInt(o.totals.last7d)} (7j) · ${fmtInt(o.totals.last30d)} (30j)</div>
    </div>
    <div class="card">
      <div class="label">Questions chat (24h)</div>
      <div class="value">${fmtInt(o.activity.askedLast24h)}</div>
      <div class="delta">${fmtInt(o.activity.askedLast7d)} sur 7 jours</div>
    </div>
    <div class="card">
      <div class="label">Activité chat (14j)</div>
      ${sparkline}
    </div>
  </div>

  <div class="section">
    <h2>Funnel d'activation</h2>
    ${o.funnel
      .map((step) => {
        const pct = step.ratio == null ? 0 : Math.max(2, Math.min(100, step.ratio))
        return `<div class="row">
          <div class="name">${esc(STEP_LABELS[step.step] || step.step)}</div>
          <div class="bar">
            <div class="fill" style="width:${pct}%"></div>
            <span class="lbl">${fmtInt(step.count)}</span>
            <span class="pct">${step.ratio == null ? '—' : step.ratio + ' %'}</span>
          </div>
        </div>`
      })
      .join('\n')}
  </div>

  <div class="section">
    <h2>Top coûts IA (mois en cours)</h2>
    ${
      o.topAiCosts.length === 0
        ? '<div class="meta">Aucune consommation IA enregistrée ce mois-ci.</div>'
        : `<table>
        <thead><tr><th>Workspace</th><th class="num">Coût USD</th><th class="num">Tokens</th><th class="num">Appels</th></tr></thead>
        <tbody>
          ${o.topAiCosts
            .map(
              (e) => `<tr>
            <td><code>${esc(e.workspaceId)}</code></td>
            <td class="num">${esc(fmtUsd(e.costUsd))}</td>
            <td class="num">${fmtInt(e.tokens)}</td>
            <td class="num">${fmtInt(e.calls)}</td>
          </tr>`,
            )
            .join('')}
        </tbody>
      </table>`
    }
  </div>

  <div class="section">
    <h2>Inscriptions récentes (${o.recentSignups.length})</h2>
    ${
      o.recentSignups.length === 0
        ? '<div class="meta">Personne inscrit pour l\'instant.</div>'
        : `<table>
        <thead><tr><th>Date</th><th>Org / Email</th><th>Workspace</th></tr></thead>
        <tbody>
          ${o.recentSignups
            .map(
              (s) => `<tr>
            <td>${esc(fmtDate(s.createdAt))}</td>
            <td>${esc(s.orgName || '—')}<br/><span style="color:#9C9CB4">${esc(s.email || '')}</span></td>
            <td>${esc(s.workspaceName || '—')}<br/><code>${esc(s.workspaceId)}</code></td>
          </tr>`,
            )
            .join('')}
        </tbody>
      </table>`
    }
  </div>

  <div class="meta">Auto-refresh : ce dashboard est généré on-demand. Recharge la page pour mettre à jour.</div>
</body>
</html>`
}

function renderSparkline(series) {
  if (!series || series.length < 2) return '<div class="meta">Pas assez de données.</div>'
  const w = 240
  const h = 56
  const values = series.map((p) => p.count)
  const max = Math.max(...values, 1)
  const pts = series.map((p, i) => {
    const x = (i / (series.length - 1)) * w
    const y = h - 2 - (p.count / max) * (h - 6)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p).join(' ')
  const last = pts[pts.length - 1].split(',')
  return `<svg width="${w}" height="${h}" style="display:block;margin-top:6px" aria-hidden="true">
    <defs><linearGradient id="b-grad" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#5C8FFF" stop-opacity="0.4"/><stop offset="1" stop-color="#5C8FFF" stop-opacity="0"/></linearGradient></defs>
    <path d="${line} L ${w} ${h} L 0 ${h} Z" fill="url(#b-grad)" />
    <path d="${line}" fill="none" stroke="#5C8FFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="${last[0]}" cy="${last[1]}" r="3" fill="#2DD9EE" />
  </svg>`
}

module.exports = router
