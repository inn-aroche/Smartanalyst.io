// Insight Engine — orchestration.
//
// Pipeline (déclenché post-sync par insights.handler) :
//   1. buildContext()  → agrège canonical_metrics + smarttag_daily (courant vs précédent)
//   2. prompt strict   → Gemini en Structured Output (JSON forcé)
//   3. validate        → garde les insights bien formés, jette les autres
//   4. store           → insert idempotent (dedup_key) insights + action_cards
//
// Garde-fous :
//   - Gemini non configuré → on log et on sort proprement (ne casse pas le sync).
//   - 0 insight valide → no-op silencieux.
//   - Insert : ON CONFLICT dedup_key → on saute (pas de doublon, pas de delete).

const { getServiceRoleClient } = require('../../lib/supabase')
const { logger } = require('../../lib/logger')
const { generateStructured } = require('../ai/gemini.service')
const aiUsage = require('../ai/ai-usage.service')
const aggregator = require('./aggregator.service')
const digestService = require('../notifications/digest.service')
const notificationCenter = require('../notifications/notification-center.service')
const entitlements = require('../billing/entitlements.service')
const { validateInsightsPayload, SCHEMA_DESCRIPTION_FOR_PROMPT } = require('./insight-schema')

const SYSTEM_PROMPT = `Tu es Smart Analyst, un analyste marketing IA spécialisé dans l'analyse de performance.

Tu analyses UNIQUEMENT les données fournies dans le contexte. Tu ne dois JAMAIS inventer une donnée ni un chiffre.
Tu ne dois jamais affirmer une causalité certaine si les données ne la prouvent pas : parle de cause probable, d'hypothèse ou de signal explicatif.

Règle "jamais de chiffre nu suspect" (cahier §3 Lot 0) :
- Si tu lis "0 €", "0 conversion", "0 session" sur une source, regarde d'abord \`source_states\` :
  - state="not_connected" → la source n'existe pas pour ce workspace, ne mentionne pas ce zéro.
  - state="connected_no_data" → connecteur OK mais aucune donnée remontée : c'est probablement un volume trop bas ou un tracking absent, dis-le explicitement (catégorie data_quality / tracking).
  - state="failing" ou "expired" → tu DOIS attribuer le zéro à l'incident de sync, pas au business.
  - state="producing_data" → le zéro est réel, tu peux le commenter normalement.
- Tu n'écris jamais un chiffre seul sans le contextualiser. Toujours associer une cause probable (signal métier OU problème technique) ou explicitement dire "donnée trop faible pour conclure".

Règle "seuil de signifiance" (cahier §3 Lot 0) :
- Le contexte fournit \`data_density\` = { days_with_data, days_in_window, min_days_required, sufficient }.
- Si \`data_density.sufficient === false\` (typiquement < 7 jours de données) : tu N'écris PAS de diagnostic métier ; tu renvoies UN SEUL insight catégorie data_quality, sévérité info, qui explique calmement que la fenêtre est trop courte pour conclure et que les insights démarreront automatiquement à mesure que les données arrivent. Aucun pourcentage de variation, aucun "fort recul" — ce serait du bruit non défendable statistiquement.
- Si \`data_density.sufficient === true\` : analyse normalement.

Ta mission :
- détecter les signaux importants (variations fortes, anomalies, écarts entre sources) ;
- identifier les problèmes de tracking / qualité de données ;
- expliquer pourquoi un signal compte, en t'appuyant sur des preuves chiffrées issues du contexte ;
- recommander des actions concrètes et priorisées (impact / effort).

Chaque insight DOIT contenir : un titre clair, un résumé pour non-technicien, une catégorie, une sévérité, un niveau de confiance, AU MOINS une preuve chiffrée, AU MOINS une action recommandée, et les limites de l'analyse.

Si les données sont insuffisantes ou si le SmartTag montre un écart avec les connecteurs, préfère un insight de catégorie data_quality ou tracking plutôt qu'un diagnostic inventé.

${SCHEMA_DESCRIPTION_FOR_PROMPT}`

function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function buildUserMessage(context) {
  return `Voici l'état du workspace à analyser (période courante vs période de comparaison équivalente).
Tous les chiffres ci-dessous sont fiables et sourcés — base-toi UNIQUEMENT dessus.

${JSON.stringify(context, null, 2)}

Génère jusqu'à 3 insights pertinents. Si rien de notable, renvoie moins d'insights (ou un seul insight de data_quality).`
}

/**
 * Persiste un insight + ses actions. Idempotent via dedup_key : si l'insight
 * existe déjà (même catégorie + titre), on saute (pas de doublon, on préserve
 * le statut éventuellement modifié par l'user).
 *
 * @returns {Promise<{ created: boolean, insightId?: string, actionsCreated?: number }>}
 */
async function storeInsight(workspaceId, insight, rawModelOutput) {
  const supabase = getServiceRoleClient()
  const dedupKey = `${insight.category}:${slugify(insight.title)}`

  const { data: inserted, error } = await supabase
    .from('insights')
    .insert({
      workspace_id: workspaceId,
      title: insight.title,
      summary: insight.summary,
      category: insight.category,
      severity: insight.severity,
      confidence: insight.confidence,
      period_start: insight.period.start,
      period_end: insight.period.end,
      comparison_start: insight.period.comparison_start,
      comparison_end: insight.period.comparison_end,
      primary_source: insight.primary_source,
      evidence: insight.evidence,
      chart_spec: insight.chart_spec,
      limitations: insight.limitations,
      raw_model_output: rawModelOutput ?? null,
      dedup_key: dedupKey,
    })
    .select('id')
    .single()

  if (error) {
    // 23505 = conflit unique (dedup) → insight déjà présent, on saute.
    if (error.code === '23505') return { created: false }
    throw error
  }

  const insightId = inserted.id
  // Brief V2 §3.4 : les recommandations naissent en `proposed`. L'user les
  // valide (→ todo) ou les archive. Évite la liste "à faire" qui se remplit
  // toute seule en déversoir.
  const actionRows = insight.recommended_actions.map((a) => ({
    workspace_id: workspaceId,
    insight_id: insightId,
    title: a.title,
    description: a.description,
    priority: a.priority,
    impact: a.impact,
    effort: a.effort,
    confidence: a.confidence,
    status: 'proposed',
    expected_impact: a.expected_impact,
    follow_up_check: a.follow_up_check,
  }))
  if (actionRows.length > 0) {
    const { error: aErr } = await supabase.from('action_cards').insert(actionRows)
    if (aErr) {
      logger.warn(
        { event: 'action_cards_insert_failed', workspaceId, insightId, error: aErr.message },
        'Action cards insert failed (insight kept)',
      )
    }
  }
  return { created: true, insightId, actionsCreated: actionRows.length }
}

/**
 * Notifie (une fois par mois) que le quota d'insights est atteint. Le cron
 * post-sync tourne tous les jours : sans idempotence, l'user serait spammé.
 * Type 'system' + meta.kind (le CHECK de la table ne connaît pas de type
 * dédié) ; texte localisé selon workspaces.locale.
 */
async function notifyInsightQuotaReached(workspaceId, quota) {
  const supabase = getServiceRoleClient()
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const { data: existing } = await supabase
    .from('notifications')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('type', 'system')
    .contains('meta', { kind: 'insight_quota_reached' })
    .gte('created_at', monthStart.toISOString())
    .limit(1)
    .maybeSingle()
  if (existing) return

  const { data: ws } = await supabase
    .from('workspaces')
    .select('locale')
    .eq('id', workspaceId)
    .maybeSingle()
  const en = ws?.locale === 'en'
  await notificationCenter.createNotification({
    workspaceId,
    type: 'system',
    severity: 'warning',
    title: en ? 'Your monitoring is paused' : 'Ta veille est en pause',
    body: en
      ? `Monthly insight limit reached (${quota.current}/${quota.limit}). Upgrade to keep detection running.`
      : `Limite mensuelle d'insights atteinte (${quota.current}/${quota.limit}). Passe au plan supérieur pour garder la détection active.`,
    link: '/settings?tab=billing',
    meta: { kind: 'insight_quota_reached', current: quota.current, limit: quota.limit },
  })
}

/**
 * Génère les insights pour un workspace. Point d'entrée appelé post-sync.
 * @returns {Promise<{ generated: number, dropped: number, skipped: boolean }>}
 */
async function generateForWorkspace(workspaceId) {
  // Quota check (cahier §3 Lot 3) : un workspace en plan Free est plafonné
  // à 3 insights/mois. Si dépassé, on skip silencieusement — l'user verra
  // dans Settings/Billing qu'il a atteint sa limite, et l'UI proposera
  // l'upgrade.
  const quota = await entitlements.checkQuota(workspaceId, 'insights_per_month')
  if (quota.exceeded) {
    logger.info(
      {
        event: 'insight_engine_quota_exceeded',
        workspaceId,
        plan: quota.plan,
        current: quota.current,
        limit: quota.limit,
      },
      'Insight engine: monthly insight quota reached, skipping',
    )
    // Rend le blocage VISIBLE in-app (meilleur moment de conversion
    // Free→Pro) — le skip était silencieux, la veille « mourait » sans
    // signal. Une seule notification par mois (idempotence).
    try {
      await notifyInsightQuotaReached(workspaceId, quota)
    } catch (err) {
      logger.warn(
        { event: 'insight_quota_notify_failed', workspaceId, error: err.message },
        'Could not create quota notification',
      )
    }
    return { generated: 0, dropped: 0, skipped: true, reason: 'quota_exceeded' }
  }

  const context = await aggregator.buildContext(workspaceId)
  if (!context) {
    logger.info(
      { event: 'insight_engine_no_data', workspaceId },
      'Insight engine: no data to analyse, skipping',
    )
    return { generated: 0, dropped: 0, skipped: true }
  }

  let result
  try {
    result = await generateStructured({
      systemPrompt: SYSTEM_PROMPT,
      userMessage: buildUserMessage(context),
      temperature: 0.3,
      maxOutputTokens: 4096,
    })
    // Tracking d'usage IA — best-effort, ne throw jamais.
    void aiUsage.recordUsage({
      workspaceId,
      model: result.usage?.model || result.modelName,
      requestType: 'insight_engine',
      inputTokens: result.usage?.inputTokens || 0,
      outputTokens: result.usage?.outputTokens || 0,
      durationMs: result.usage?.durationMs,
    })
  } catch (err) {
    if (err.code === 'GEMINI_NOT_CONFIGURED') {
      logger.warn(
        { event: 'insight_engine_ai_unconfigured', workspaceId },
        'Insight engine: Gemini not configured, skipping',
      )
      return { generated: 0, dropped: 0, skipped: true }
    }
    logger.error(
      {
        event: 'insight_engine_generation_failed',
        workspaceId,
        error: err.message,
        code: err.code,
      },
      'Insight engine generation failed',
    )
    throw err
  }

  const { insights, droppedCount } = validateInsightsPayload(result.json)
  if (insights.length === 0) {
    logger.info(
      { event: 'insight_engine_empty', workspaceId, dropped: droppedCount },
      'Insight engine produced no valid insights',
    )
    return { generated: 0, dropped: droppedCount, skipped: false }
  }

  let created = 0
  for (const insight of insights) {
    try {
      const r = await storeInsight(workspaceId, insight, result.json)
      if (r.created) {
        created++
        // Notification in-app (cahier §3 Lot 1) — toute création d'insight
        // génère une notif, la sévérité visuelle dépend de celle de l'insight.
        // Best-effort : un échec n'interrompt pas la génération, et la
        // rejection éventuelle est avalée pour ne pas faire crasher le runner
        // de tests (qui mock Supabase de façon incomplète sur le path notif).
        notificationCenter
          .createNotification({
            workspaceId,
            type: 'insight_created',
            severity:
              insight.severity === 'critical' || insight.severity === 'high'
                ? 'critical'
                : insight.severity === 'medium'
                  ? 'warning'
                  : 'info',
            title: insight.title,
            body: insight.summary ? String(insight.summary).slice(0, 280) : null,
            link: '/veille',
            meta: { insight_id: r.insightId, severity: insight.severity },
          })
          .catch(() => null)
        // Brief V2 §3.3 : alerte email immédiate sur insight critical
        // nouvellement créé (la veille qui prévient AVANT qu'on demande).
        // Best-effort, jamais bloquant pour la génération.
        if (insight.severity === 'critical') {
          digestService
            .sendCriticalAlert(workspaceId, insight)
            .catch((err) =>
              logger.warn(
                { event: 'critical_alert_dispatch_failed', workspaceId, error: err.message },
                'Critical alert dispatch failed',
              ),
            )
        }
      }
    } catch (err) {
      logger.warn(
        { event: 'insight_store_failed', workspaceId, error: err.message },
        'Failed to store one insight (continuing)',
      )
    }
  }

  logger.info(
    {
      event: 'insight_engine_completed',
      workspaceId,
      model: result.modelName,
      validInsights: insights.length,
      created,
      dropped: droppedCount,
    },
    'Insight engine completed',
  )
  return { generated: created, dropped: droppedCount, skipped: false }
}

module.exports = { generateForWorkspace, storeInsight, slugify }
