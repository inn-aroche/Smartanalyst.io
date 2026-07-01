// Utilitaire de fetch avec timeout et retry sur erreurs transitoires.
//
// Contexte : les connecteurs externes (GA4, GSC, Meta…) font des appels HTTP
// sans timeout par défaut. Un appel pendu bloque le worker BullMQ
// indéfiniment. Ce helper ajoute :
//   - AbortController (timeout configurable, défaut 30s)
//   - Retry sur 5xx et erreurs réseau (max 2 tentatives, backoff exponentiel)
//   - Pas de retry sur 4xx (auth errors, bad request → inutile de réessayer)

const { logger } = require('./logger')

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_RETRIES = 2
const RETRY_BASE_MS = 1_000

function isRetryable(statusCode) {
  return statusCode >= 500 || statusCode === 429
}

/**
 * @param {string} url
 * @param {RequestInit} options
 * @param {{ timeoutMs?: number, retries?: number, label?: string }} fetchOpts
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(
  url,
  options = {},
  { timeoutMs = DEFAULT_TIMEOUT_MS, retries = MAX_RETRIES, label = url } = {},
) {
  let attempt = 0
  while (attempt <= retries) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(url, { ...options, signal: controller.signal })
      clearTimeout(timer)

      if (!response.ok && isRetryable(response.status) && attempt < retries) {
        const wait = RETRY_BASE_MS * 2 ** attempt
        logger.warn(
          { event: 'fetch_retry', label, status: response.status, attempt, waitMs: wait },
          `Retrying ${label} after ${response.status}`,
        )
        await new Promise((r) => setTimeout(r, wait))
        attempt++
        continue
      }

      return response
    } catch (err) {
      clearTimeout(timer)
      const isTimeout = err.name === 'AbortError'
      if (!isTimeout && attempt < retries) {
        const wait = RETRY_BASE_MS * 2 ** attempt
        logger.warn(
          { event: 'fetch_retry', label, error: err.message, attempt, waitMs: wait },
          `Retrying ${label} after network error`,
        )
        await new Promise((r) => setTimeout(r, wait))
        attempt++
        continue
      }
      if (isTimeout) {
        const timeoutErr = new Error(`Request to ${label} timed out after ${timeoutMs}ms`)
        timeoutErr.code = 'FETCH_TIMEOUT'
        throw timeoutErr
      }
      throw err
    }
  }
}

module.exports = { fetchWithRetry }
