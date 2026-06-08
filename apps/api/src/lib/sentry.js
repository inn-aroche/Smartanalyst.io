// Sentry helpers — abstrait l'API du SDK derrière une fonction unique qu'on
// peut appeler depuis le code business sans connaître la lib.
//
// L'init de Sentry est faite par instrument.js (chargé en premier dans les
// entry points). Ici on expose juste captureException + captureMessage qui
// no-op si le DSN n'est pas configuré.

const { Sentry, enabled } = require('../instrument')

/**
 * Capture une exception côté Sentry. No-op si SENTRY_DSN n'est pas configuré.
 *
 * @param {Error} err - L'erreur à reporter.
 * @param {object} [context] - Tags, extra, user à attacher à l'event.
 *   { tags: { route: 'POST /api/v1/...' }, extra: { jobId }, user: { id } }
 */
function captureException(err, context = {}) {
  if (!enabled) return
  Sentry.withScope((scope) => {
    if (context.tags) scope.setTags(context.tags)
    if (context.extra) scope.setExtras(context.extra)
    if (context.user) scope.setUser(context.user)
    if (context.level) scope.setLevel(context.level)
    Sentry.captureException(err)
  })
}

/**
 * Capture un message arbitraire (warning, info). Plus rare que captureException.
 */
function captureMessage(message, level = 'info', context = {}) {
  if (!enabled) return
  Sentry.withScope((scope) => {
    if (context.tags) scope.setTags(context.tags)
    if (context.extra) scope.setExtras(context.extra)
    Sentry.captureMessage(message, level)
  })
}

/**
 * Vide le buffer d'events avant un process.exit. À appeler dans les handlers
 * de shutdown ou uncaughtException — Sentry est async, sinon des events
 * partent au néant.
 */
async function flush(timeoutMs = 2000) {
  if (!enabled) return
  try {
    await Sentry.flush(timeoutMs)
  } catch {
    // Best-effort. On ne bloque pas le shutdown si Sentry tarde.
  }
}

module.exports = { captureException, captureMessage, flush, enabled, Sentry }
