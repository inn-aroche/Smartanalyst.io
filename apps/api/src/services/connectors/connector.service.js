// Connector business logic: list, get, add (API key), remove, test, sync,
// finalize OAuth (callback handler).
//
// Source: docs/03_ARCHITECTURE_GLOBALE.md §2, docs/15_BASE_CONNECTOR_CLASSE.md,
//         docs/09_API_CONNECTEURS.md
//
// Toutes les opérations supposent que workspace_id a déjà été vérifié par
// le middleware workspaceScope.

const { getServiceRoleClient } = require('../../lib/supabase')
const { logger } = require('../../lib/logger')
const vault = require('../../lib/vault')
const { UserFacingError, NotFoundError } = require('../../lib/error-handler')
const { getConnector, SUPPORTED_SOURCES } = require('../../connectors')
const { getQueue, QUEUE_NAMES, JOB_NAMES } = require('../../queue-jobs/queues')

const TABLE = 'connectors'

// Validation de format de clé API par source. Fait au niveau service (pas du
// connecteur concret) pour rejeter au plus tôt avant chiffrement et insert DB.
const API_KEY_FORMATS = {
  stripe: {
    pattern: /^(sk_(test|live)_|rk_(test|live)_)[A-Za-z0-9]+$/,
    hint: 'Format attendu: sk_test_... / sk_live_... / rk_test_... / rk_live_... (restricted key recommandée).',
  },
  // Brevo, Notion, etc. à venir avec leurs propres regex
}

function validateApiKeyFormat(source, apiKey) {
  const spec = API_KEY_FORMATS[source]
  if (!spec) return // pas de format imposé pour cette source
  if (!spec.pattern.test(apiKey)) {
    throw new UserFacingError(`Format de clé API invalide pour ${source}. ${spec.hint}`, {
      statusCode: 400,
      code: 'INVALID_API_KEY_FORMAT',
    })
  }
}

// Fenêtre de resync par défaut à la connexion, calibrée sur le délai de
// révision réel de chaque source (cron quotidien + sync manuel). Un chiffre
// nu dans un rapport doit refléter les remboursements/annulations de la
// veille, pas seulement l'événement d'hier — 7 jours flat ratait ça pour
// Stripe (litiges/remboursements) et Shopify (statut de commande révisé
// après livraison). Reste ajustable par connecteur via la colonne DB.
const SOURCE_DEFAULT_RESYNC_DAYS = {
  ga4: 7,
  meta_ads: 7,
  google_ads: 7,
  search_console: 7,
  shopify: 14,
  stripe: 30,
}
const FALLBACK_RESYNC_DAYS = 7

function resyncWindowDays(record) {
  return (
    record?.resync_window_days || SOURCE_DEFAULT_RESYNC_DAYS[record?.source] || FALLBACK_RESYNC_DAYS
  )
}

// Champs jamais exposés au client (tokens chiffrés)
const SENSITIVE = ['access_token', 'refresh_token']

function sanitize(record) {
  if (!record) return record
  const clone = { ...record }
  for (const f of SENSITIVE) delete clone[f]
  return clone
}

/**
 * Enqueue le backfill 12 mois d'un connecteur qui vient d'être ajouté.
 * Fire-and-forget : un échec d'enqueue ne doit jamais faire échouer l'ajout
 * du connecteur (le prochain cron quotidien rattrapera, fenêtre 7j).
 */
async function enqueueBackfill({ workspaceId, connectorId, source }) {
  try {
    const dataSyncQueue = getQueue(QUEUE_NAMES.DATA_SYNC)
    const jobId = `backfill-connector:${connectorId}`
    await dataSyncQueue.add(
      JOB_NAMES.DATA_SYNC_CONNECTOR_BACKFILL,
      { workspaceId, connectorId, source },
      { jobId },
    )
    logger.info(
      { event: 'connector_backfill_enqueued', workspaceId, connectorId, source, jobId },
      'Connector backfill job enqueued',
    )
  } catch (err) {
    logger.warn(
      {
        event: 'connector_backfill_enqueue_failed',
        workspaceId,
        connectorId,
        source,
        error: err.message,
      },
      'Failed to enqueue connector backfill (next daily cron will catch up)',
    )
  }
}

async function list(workspaceId) {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).map(sanitize)
}

async function getById(workspaceId, connectorId) {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', connectorId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new NotFoundError('Connecteur introuvable.')
  return data // version "interne" (tokens chiffrés inclus), à sanitize avant retour HTTP
}

/**
 * Ajoute un connecteur basé sur une API key (Stripe, Brevo, etc.).
 * Pour les connecteurs OAuth (GA4, Meta...), utiliser finalizeOAuthConnector.
 */
async function addApiKeyConnector({ workspaceId, source, accountId, accountName, apiKey }) {
  if (!SUPPORTED_SOURCES.includes(source)) {
    throw new UserFacingError(`Source "${source}" non supportée.`, {
      statusCode: 400,
      code: 'UNSUPPORTED_SOURCE',
    })
  }
  if (!accountId || !apiKey) {
    throw new UserFacingError('accountId et apiKey requis.', {
      statusCode: 400,
      code: 'MISSING_FIELDS',
    })
  }

  validateApiKeyFormat(source, apiKey)

  const supabase = getServiceRoleClient()
  const encrypted = await vault.encrypt(apiKey, {
    secretType: 'connector_api_key',
    workspaceId,
    source,
    accountId,
  })

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(
      {
        workspace_id: workspaceId,
        source,
        account_id: accountId,
        account_name: accountName || accountId,
        access_token: encrypted,
        refresh_token: null,
        token_expires_at: null,
        status: 'active',
        status_reason: null,
        resync_window_days: SOURCE_DEFAULT_RESYNC_DAYS[source] || FALLBACK_RESYNC_DAYS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id,source,account_id' },
    )
    .select()
    .single()

  if (error) {
    logger.error({ event: 'connector_add_failed', workspaceId, source, error: error.message })
    throw error
  }

  logger.info(
    { event: 'connector_added', workspaceId, connectorId: data.id, source, mode: 'api_key' },
    'Connector added (API key)',
  )

  // Sans ça, un connecteur API key (Stripe...) n'a AUCUNE donnée avant le
  // prochain cron quotidien (jusqu'à 24h) — et ce cron ne backfill que 7j.
  await enqueueBackfill({ workspaceId, connectorId: data.id, source })

  return sanitize(data)
}

/**
 * Appelé par le callback OAuth après échange code → tokens.
 */
async function finalizeOAuthConnector({
  workspaceId,
  source,
  accountId,
  accountName,
  accessToken,
  refreshToken,
  expiresIn,
}) {
  if (!SUPPORTED_SOURCES.includes(source)) {
    throw new UserFacingError(`Source "${source}" non supportée.`, {
      statusCode: 400,
      code: 'UNSUPPORTED_SOURCE',
    })
  }

  const supabase = getServiceRoleClient()
  const ctx = { secretType: 'connector_oauth_token', workspaceId, source, accountId }
  const encryptedAccess = await vault.encrypt(accessToken, { ...ctx, field: 'access_token' })
  const encryptedRefresh = refreshToken
    ? await vault.encrypt(refreshToken, { ...ctx, field: 'refresh_token' })
    : null
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(
      {
        workspace_id: workspaceId,
        source,
        account_id: accountId,
        account_name: accountName || accountId,
        access_token: encryptedAccess,
        refresh_token: encryptedRefresh,
        token_expires_at: expiresAt,
        status: 'active',
        status_reason: null,
        last_error_message: null,
        last_error_at: null,
        resync_window_days: SOURCE_DEFAULT_RESYNC_DAYS[source] || FALLBACK_RESYNC_DAYS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id,source,account_id' },
    )
    .select()
    .single()

  if (error) {
    logger.error({
      event: 'oauth_connector_finalize_failed',
      workspaceId,
      source,
      error: error.message,
    })
    throw error
  }

  logger.info(
    { event: 'connector_added', workspaceId, connectorId: data.id, source, mode: 'oauth' },
    'Connector added (OAuth)',
  )
  return sanitize(data)
}

async function remove(workspaceId, connectorId) {
  // Vérifie l'existence (raise 404 si manquant)
  await getById(workspaceId, connectorId)

  const supabase = getServiceRoleClient()
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('id', connectorId)

  if (error) throw error

  logger.info({ event: 'connector_removed', workspaceId, connectorId }, 'Connector removed')
}

/**
 * Test live: instancie le connecteur, appelle testConnection().
 * Met à jour status='active' ou 'expired' selon le résultat.
 */
async function test(workspaceId, connectorId) {
  const record = await getById(workspaceId, connectorId)
  const supabase = getServiceRoleClient()

  const instance = getConnector(workspaceId, record)
  const ok = await instance.testConnection()

  const patch = ok
    ? { status: 'active', status_reason: null, updated_at: new Date().toISOString() }
    : {
        status: 'expired',
        status_reason: 'test_failed',
        last_error_message: 'Test de connexion échoué',
        last_error_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

  await supabase.from(TABLE).update(patch).eq('id', connectorId)

  return { ok, status: patch.status }
}

/**
 * Sync immédiat. Pour les rapports / le scheduler quotidien, préférer
 * la queue BullMQ (à venir, doc 20). Ici on l'expose en synchrone pour
 * permettre à l'utilisateur de forcer un refresh manuellement.
 */
async function sync(workspaceId, connectorId, { startDate, endDate } = {}) {
  const record = await getById(workspaceId, connectorId)
  const instance = getConnector(workspaceId, record)

  // Par défaut: fenêtre du connecteur (resync_window_days, calibrée par
  // source à la connexion — cf SOURCE_DEFAULT_RESYNC_DAYS).
  if (!startDate || !endDate) {
    const today = new Date()
    const windowStart = new Date(today.getTime() - resyncWindowDays(record) * 24 * 60 * 60 * 1000)
    const fmt = (d) => d.toISOString().slice(0, 10)
    startDate = startDate || fmt(windowStart)
    endDate = endDate || fmt(today)
  }

  return instance.sync({ startDate, endDate })
}

module.exports = {
  list,
  getById,
  addApiKeyConnector,
  finalizeOAuthConnector,
  remove,
  test,
  sync,
  sanitize,
  enqueueBackfill,
  resyncWindowDays,
  SOURCE_DEFAULT_RESYNC_DAYS,
}
