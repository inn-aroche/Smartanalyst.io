// Beta playbook — agrège les signaux clés sur l'état de la beta dans une
// seule page admin. Pas de dashboard fancy ; juste de quoi répondre vite à
// "qu'est-ce qui se passe sur mon produit ce matin ?".
//
// Source unique de vérité : on lit directement les tables existantes (auth,
// workspaces, connectors, canonical_metrics, ai_usage, watches, insights,
// audit_logs). AUCUNE table ad-hoc — on accepte les requêtes un peu
// coûteuses pour rester simple et ne pas créer de dette schema.
//
// Cible volume : 50-200 workspaces beta. Les requêtes COUNT ci-dessous
// restent rapides à ce niveau. Au-delà, on cachera.

const { getServiceRoleClient } = require('../../lib/supabase')

const DAY_MS = 86_400_000

function daysAgoIso(days) {
  return new Date(Date.now() - days * DAY_MS).toISOString()
}

/**
 * Compte de workspaces actifs (non soft-deleted) avec leur date de
 * création. Sert de base à toutes les autres métriques.
 */
async function listActiveWorkspaces(supabase) {
  const { data, error } = await supabase
    .from('workspaces')
    .select('id, name, organization_id, created_at')
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

/**
 * Set d'IDs des workspaces qui ont au moins 1 connecteur en status='active'.
 * = a passé l'étape OAuth de l'onboarding.
 */
async function workspacesWithActiveConnector(supabase) {
  const { data, error } = await supabase
    .from('connectors')
    .select('workspace_id')
    .eq('status', 'active')
  if (error) throw error
  return new Set((data || []).map((r) => r.workspace_id))
}

/**
 * Set d'IDs des workspaces qui ont au moins 1 ligne canonical_metrics.
 * = a reçu au moins une donnée. Souvent décalé de quelques minutes après
 * la connexion d'une source (sync initial). Si le delta entre "connecté"
 * et "a de la data" est élevé, c'est qu'un sync coince.
 */
async function workspacesWithMetrics(supabase) {
  const { data, error } = await supabase
    .from('canonical_metrics')
    .select('workspace_id')
    .limit(10_000)
  if (error) throw error
  return new Set((data || []).map((r) => r.workspace_id))
}

/**
 * Set d'IDs des workspaces qui ont au moins 1 chat_ask dans les
 * N derniers jours. Sépare "actif" de "abandonné".
 */
async function workspacesAskedRecently(supabase, days) {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('workspace_id, created_at')
    .eq('action', 'chat_ask')
    .gte('created_at', daysAgoIso(days))
    .not('workspace_id', 'is', null)
  if (error) throw error
  return new Set((data || []).map((r) => r.workspace_id))
}

async function workspacesWithWatches(supabase) {
  const { data, error } = await supabase.from('watches').select('workspace_id').eq('enabled', true)
  if (error) throw error
  return new Set((data || []).map((r) => r.workspace_id))
}

async function workspacesWithInsights(supabase) {
  const { data, error } = await supabase.from('insights').select('workspace_id').limit(10_000)
  if (error) throw error
  return new Set((data || []).map((r) => r.workspace_id))
}

/**
 * Coût IA agrégé sur le mois en cours, par workspace. Renvoie top N
 * trié par coût décroissant — pour repérer un workspace qui se met à
 * coûter cher (boucle de chat ou bug).
 */
async function topAiCosts(supabase, limit) {
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from('ai_usage')
    .select('workspace_id, cost_usd, input_tokens, output_tokens')
    .gte('created_at', monthStart.toISOString())
  if (error) throw error
  const byWs = new Map()
  for (const row of data || []) {
    const wsId = row.workspace_id
    const e = byWs.get(wsId) || { workspaceId: wsId, costUsd: 0, tokens: 0, calls: 0 }
    e.costUsd += Number(row.cost_usd) || 0
    e.tokens += (row.input_tokens || 0) + (row.output_tokens || 0)
    e.calls += 1
    byWs.set(wsId, e)
  }
  return Array.from(byWs.values())
    .sort((a, b) => b.costUsd - a.costUsd)
    .slice(0, limit)
    .map((e) => ({
      ...e,
      costUsd: Math.round(e.costUsd * 1_000_000) / 1_000_000,
    }))
}

/**
 * Récente activité chat agrégée par jour (14j) pour visualiser tendance.
 */
async function chatActivityByDay(supabase, days) {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('created_at')
    .eq('action', 'chat_ask')
    .gte('created_at', daysAgoIso(days))
  if (error) throw error
  const byDay = new Map()
  for (const r of data || []) {
    const day = r.created_at.slice(0, 10)
    byDay.set(day, (byDay.get(day) || 0) + 1)
  }
  // On remplit les jours manquants avec 0 pour avoir une série complète.
  const series = []
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10)
    series.push({ day, count: byDay.get(day) || 0 })
  }
  return series
}

/**
 * Erreurs côté API durant les N dernières heures, agrégées par code.
 * Source : audit_logs ne capture pas les erreurs, donc on remonte
 * uniquement ce qu'on a — pour mieux il faudrait scraper Sentry. À
 * minima on peut signaler qu'on n'a pas cette stat directement ici.
 *
 * (Note : volontairement on ne va PAS appeler Sentry depuis cette
 * route — auth séparée, latence imprévisible.)
 */

/**
 * Récupère les emails associés aux workspaces (via organizations.email).
 * Limité aux N plus récents.
 */
async function recentSignups(supabase, workspaces, limit) {
  const recent = workspaces.slice(0, limit)
  if (recent.length === 0) return []
  const orgIds = Array.from(new Set(recent.map((w) => w.organization_id)))
  const { data: orgs, error } = await supabase
    .from('organizations')
    .select('id, email, name')
    .in('id', orgIds)
  if (error) throw error
  const orgById = new Map((orgs || []).map((o) => [o.id, o]))
  return recent.map((w) => {
    const org = orgById.get(w.organization_id)
    return {
      workspaceId: w.id,
      workspaceName: w.name,
      email: org?.email || null,
      orgName: org?.name || null,
      createdAt: w.created_at,
    }
  })
}

/**
 * Vue d'ensemble beta. Une seule fonction qui orchestre tous les checks.
 *
 * @returns {Promise<{
 *   generatedAt: string,
 *   totals: {
 *     workspaces: number,
 *     last7d: number,
 *     last30d: number,
 *   },
 *   funnel: Array<{ step: string, count: number, ratio: number | null }>,
 *   activity: {
 *     askedLast24h: number,
 *     askedLast7d: number,
 *     chatActivityByDay: Array<{ day: string, count: number }>,
 *   },
 *   topAiCosts: Array<{ workspaceId, costUsd, tokens, calls }>,
 *   recentSignups: Array<{ workspaceId, email, createdAt }>,
 * }>}
 */
async function getOverview({ recentLimit = 10, costsLimit = 10 } = {}) {
  const supabase = getServiceRoleClient()

  const [
    workspaces,
    connectedSet,
    metricsSet,
    asked24hSet,
    asked7dSet,
    watchedSet,
    insightedSet,
    aiCosts,
    activity,
  ] = await Promise.all([
    listActiveWorkspaces(supabase),
    workspacesWithActiveConnector(supabase),
    workspacesWithMetrics(supabase),
    workspacesAskedRecently(supabase, 1),
    workspacesAskedRecently(supabase, 7),
    workspacesWithWatches(supabase),
    workspacesWithInsights(supabase),
    topAiCosts(supabase, costsLimit),
    chatActivityByDay(supabase, 14),
  ])

  const total = workspaces.length
  const sevenAgo = daysAgoIso(7)
  const thirtyAgo = daysAgoIso(30)
  const last7d = workspaces.filter((w) => w.created_at >= sevenAgo).length
  const last30d = workspaces.filter((w) => w.created_at >= thirtyAgo).length

  function pctOfTotal(count) {
    return total > 0 ? Math.round((count / total) * 1000) / 10 : null
  }

  const funnel = [
    { step: 'signed_up', count: total, ratio: 100 },
    { step: 'connected_source', count: connectedSet.size, ratio: pctOfTotal(connectedSet.size) },
    { step: 'received_data', count: metricsSet.size, ratio: pctOfTotal(metricsSet.size) },
    { step: 'asked_chat', count: asked7dSet.size, ratio: pctOfTotal(asked7dSet.size) },
    { step: 'created_watch', count: watchedSet.size, ratio: pctOfTotal(watchedSet.size) },
    { step: 'got_insight', count: insightedSet.size, ratio: pctOfTotal(insightedSet.size) },
  ]

  const signups = await recentSignups(supabase, workspaces, recentLimit)

  return {
    generatedAt: new Date().toISOString(),
    totals: { workspaces: total, last7d, last30d },
    funnel,
    activity: {
      askedLast24h: asked24hSet.size,
      askedLast7d: asked7dSet.size,
      chatActivityByDay: activity,
    },
    topAiCosts: aiCosts,
    recentSignups: signups,
  }
}

module.exports = {
  getOverview,
  // Internal helpers exposés pour les tests
  daysAgoIso,
}
