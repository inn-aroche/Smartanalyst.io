// Évaluateur de watches custom (brief V2 §3.3, suite de la PR #96).
//
// Pour chaque watch enabled :
//   1. Pull la valeur la plus récente (ou les 2 dernières pour changes_by_pct)
//      depuis canonical_metrics — filtrée par metric_key + source si défini.
//   2. Évalue la condition (operator + threshold).
//   3. Si trigger ET pas refire dans les 24h → crée un insight critical +
//      incrémente triggered_count + met à jour last_triggered_at.
//
// Le digest.service prend ensuite le relais pour notifier in-app / email
// selon les préférences workspace (déjà câblé via notification_settings).

const { getServiceRoleClient } = require('../../lib/supabase')
const { logger } = require('../../lib/logger')
const canonicalMetrics = require('../metrics/canonical-metrics.service')
const digestService = require('../notifications/digest.service')
const notificationCenter = require('../notifications/notification-center.service')

const REFIRE_COOLDOWN_HOURS = 24

/**
 * Évalue toutes les watches enabled de tous les workspaces.
 * Idempotent : un trigger récent (< 24h) ne refait rien.
 *
 * @returns {Promise<{ workspaces: number, watchesChecked: number, watchesTriggered: number }>}
 */
async function evaluateAllWorkspaces() {
  const supabase = getServiceRoleClient()
  // Distinct workspace_ids ayant au moins une watch active.
  const { data: rows, error } = await supabase
    .from('watches')
    .select('workspace_id')
    .eq('enabled', true)
  if (error) throw error

  const workspaceIds = Array.from(new Set((rows || []).map((r) => r.workspace_id)))
  let totalChecked = 0
  let totalTriggered = 0

  for (const wsId of workspaceIds) {
    try {
      const r = await evaluateWorkspace(wsId)
      totalChecked += r.checked
      totalTriggered += r.triggered
    } catch (err) {
      logger.error(
        { event: 'watch_evaluator_workspace_failed', workspaceId: wsId, error: err.message },
        'Watch evaluation failed for workspace',
      )
    }
  }

  logger.info(
    {
      event: 'watch_evaluator_done',
      workspaces: workspaceIds.length,
      checked: totalChecked,
      triggered: totalTriggered,
    },
    'Watch evaluation pass complete',
  )

  return {
    workspaces: workspaceIds.length,
    watchesChecked: totalChecked,
    watchesTriggered: totalTriggered,
  }
}

/**
 * Évalue les watches d'un workspace donné.
 */
async function evaluateWorkspace(workspaceId) {
  const supabase = getServiceRoleClient()
  const { data: watches, error } = await supabase
    .from('watches')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('enabled', true)
  if (error) throw error

  let triggered = 0
  for (const watch of watches || []) {
    try {
      const fired = await evaluateOne(watch)
      if (fired) triggered++
    } catch (err) {
      logger.warn(
        { event: 'watch_eval_failed', watchId: watch.id, error: err.message },
        'Single watch evaluation failed',
      )
    }
  }
  return { checked: (watches || []).length, triggered }
}

/**
 * Évalue une watch en isolation. Renvoie true si elle s'est déclenchée.
 */
async function evaluateOne(watch) {
  // Snooze (cahier §3 Lot 4) : si snoozed_until est dans le futur, on skip
  // entièrement — l'user a explicitement mis la veille en pause.
  if (watch.snoozed_until) {
    const snoozedUntilMs = new Date(watch.snoozed_until).getTime()
    if (Date.now() < snoozedUntilMs) return false
  }
  // Debounce : si déclenchée dans les dernières 24h, on skip — évite le spam
  // si la condition reste vraie sur plusieurs ticks.
  if (watch.last_triggered_at) {
    const lastMs = new Date(watch.last_triggered_at).getTime()
    if (Date.now() - lastMs < REFIRE_COOLDOWN_HOURS * 3600_000) return false
  }

  // On charge la fenêtre nécessaire à l'opérateur. changes_by_pct + any_change
  // ont besoin de 2 points, les autres d'un seul.
  const needsTwo = watch.operator === 'changes_by_pct' || watch.operator === 'any_change'
  const days = needsTwo ? 3 : 1
  const fmt = (d) => d.toISOString().slice(0, 10)
  const endDate = new Date()
  const startDate = new Date(endDate.getTime() - days * 86400_000)

  const rows = await canonicalMetrics.query({
    workspaceId: watch.workspace_id,
    metricKey: watch.metric_key,
    source: watch.source || undefined,
    startDate: fmt(startDate),
    endDate: fmt(endDate),
    limit: 20,
  })
  if (!rows.length) {
    // Pas de data dispo pour la metric_key surveillée. Avant : skip silent —
    // l'user créait une veille, elle ne se déclenchait jamais, et personne
    // ne savait pourquoi (source pas connectée, mauvaise key…). On log un
    // event structuré "watch_no_data" pour pouvoir le remonter ailleurs
    // (Sentry, dashboard admin, futur warning in-app sur la watch).
    logger.info(
      {
        event: 'watch_no_data',
        watchId: watch.id,
        workspaceId: watch.workspace_id,
        metricKey: watch.metric_key,
        source: watch.source || null,
        windowDays: days,
      },
      'Watch evaluated but no canonical_metrics row matched — connector likely missing for this metric',
    )
    return false
  }

  // Tri date desc (la query renvoie déjà desc, mais on assure).
  rows.sort((a, b) => (a.date < b.date ? 1 : -1))
  const latest = Number(rows[0].metric_value)
  const previous = rows.length > 1 ? Number(rows[1].metric_value) : null

  // Si plusieurs sources, on somme — cohérent avec la convention chat-tools.
  // (En pratique watch.source est généralement renseigné, donc 1 row par date.)

  const condition = evaluateCondition(watch.operator, latest, previous, Number(watch.threshold))
  if (!condition.triggered) return false

  // Trigger : créer l'insight + envoyer alerte + bump compteurs.
  await persistTrigger(watch, latest, previous, condition)
  return true
}

/**
 * Logique pure — testable en isolation. Renvoie `{ triggered, summary }`.
 */
function evaluateCondition(operator, latest, previous, threshold) {
  switch (operator) {
    case 'drops_below':
      if (latest < threshold) {
        return { triggered: true, summary: `${formatValue(latest)} < ${formatValue(threshold)}` }
      }
      return { triggered: false }
    case 'rises_above':
      if (latest > threshold) {
        return { triggered: true, summary: `${formatValue(latest)} > ${formatValue(threshold)}` }
      }
      return { triggered: false }
    case 'changes_by_pct': {
      if (previous == null || previous === 0) return { triggered: false }
      const delta = ((latest - previous) / Math.abs(previous)) * 100
      if (Math.abs(delta) >= Math.abs(threshold)) {
        return {
          triggered: true,
          summary: `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}% (≥ ${Math.abs(threshold)}%)`,
        }
      }
      return { triggered: false }
    }
    case 'any_change':
      if (previous == null) return { triggered: false }
      if (latest !== previous) {
        return { triggered: true, summary: `${formatValue(previous)} → ${formatValue(latest)}` }
      }
      return { triggered: false }
    default:
      return { triggered: false }
  }
}

async function persistTrigger(watch, latest, previous, condition) {
  const supabase = getServiceRoleClient()

  // 1. Créer l'insight critical (l'engine d'insights se charge plus tard du
  //    dispatch via digest si severity=critical — voir insight-engine.service).
  //    Ici on insère direct car ce n'est pas un insight IA, c'est un trigger
  //    déterministe ; on ne passe pas par le pipeline d'évaluation Gemini.
  const title = `Alerte : ${watch.description}`
  const summary = `Condition déclenchée — ${condition.summary}.`

  const { data: insight, error: insErr } = await supabase
    .from('insights')
    .insert({
      workspace_id: watch.workspace_id,
      title,
      summary,
      category: 'custom_watch',
      severity: 'critical',
      confidence: 'high',
      status: 'open',
      primary_source: watch.source || null,
      evidence: [
        {
          label: watch.metric_key,
          metric_key: watch.metric_key,
          value: latest,
          previous_value: previous,
          delta_percent:
            previous != null && previous !== 0
              ? ((latest - previous) / Math.abs(previous)) * 100
              : null,
          source: watch.source || 'multi',
          explanation: condition.summary,
        },
      ],
      chart_spec: null,
      limitations: [],
      dedup_key: `watch:${watch.id}:${new Date().toISOString().slice(0, 10)}`,
    })
    .select('id')
    .single()
  if (insErr) {
    // dedup_key collision : déjà déclenché aujourd'hui — ne refait rien.
    if (insErr.code === '23505') return
    throw insErr
  }

  // 2. Mettre à jour la watch (compteurs).
  await supabase
    .from('watches')
    .update({
      triggered_count: (watch.triggered_count || 0) + 1,
      last_triggered_at: new Date().toISOString(),
    })
    .eq('id', watch.id)

  // 3. Si notify_email : envoyer l'alerte critique via digest.service
  //    (qui respecte déjà les notification_settings + recipient override).
  if (watch.notify_email && insight) {
    try {
      await digestService.sendCriticalAlert(watch.workspace_id, {
        id: insight.id,
        title,
        summary,
        severity: 'critical',
      })
    } catch (err) {
      logger.warn(
        { event: 'watch_email_alert_failed', watchId: watch.id, error: err.message },
        'Email alert failed (insight still created)',
      )
    }
  }
  // 4. notify_in_app (cahier §3 Lot 1) : on pousse aussi une notif dans le
  //    Centre de notifications (cloche), pas seulement un insight au fil.
  //    Best-effort : l'insight reste la source de vérité, et la rejection
  //    éventuelle est avalée (.catch) pour ne pas faire crasher les tests
  //    qui mock Supabase de façon incomplète sur le path notif.
  if (watch.notify_in_app !== false) {
    notificationCenter
      .createNotification({
        workspaceId: watch.workspace_id,
        type: 'watch_triggered',
        severity: 'warning',
        title,
        body: summary ? String(summary).slice(0, 280) : null,
        link: '/veille',
        meta: { watch_id: watch.id, insight_id: insight?.id || null },
      })
      .catch(() => null)
  }
}

function formatValue(v) {
  if (Math.abs(v) >= 1000)
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v)
  return Number(v).toFixed(2).replace('.', ',')
}

module.exports = {
  evaluateAllWorkspaces,
  evaluateWorkspace,
  evaluateOne,
  evaluateCondition,
  REFIRE_COOLDOWN_HOURS,
}
