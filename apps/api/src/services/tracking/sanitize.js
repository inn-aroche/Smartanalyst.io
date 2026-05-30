// Sanitize les payloads reçus côté ingestion /track avant publish vers Redis.
//
// Compliance (cf docs SmartTag §2.2):
//   - Le tag client est déjà censé pré-sanitizer mais on RE-vérifie côté serveur.
//   - On TRUNQUE les IPs (zero IP storage).
//   - On WHITELIST les types d'événements.
//   - On TRONQUE toutes les strings.
//   - On REFUSE les valeurs avec patterns email / téléphone (anti-PII).

const ALLOWED_TYPES = new Set(['pageview', 'click', 'error', 'session_start', 'custom'])
const MAX_STRING = 300
const MAX_PROPS = 20
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
const PHONE_RE = /(\+?\d[\d\s().-]{6,}\d)/

function _trunc(s, n = MAX_STRING) {
  if (typeof s !== 'string') return undefined
  if (EMAIL_RE.test(s) || PHONE_RE.test(s)) return undefined
  return s.slice(0, n)
}

/**
 * Sanitize un objet "ev" (event) reçu du tag. Retourne null si invalide.
 */
function sanitizeEvent(ev) {
  if (!ev || typeof ev !== 'object') return null
  if (!ALLOWED_TYPES.has(ev.type)) return null
  if (typeof ev.sid !== 'string' || ev.sid.length === 0 || ev.sid.length > 80) return null

  const out = {
    type: ev.type,
    sid: ev.sid.slice(0, 80),
    ts: Number.isFinite(ev.ts) ? Math.floor(ev.ts) : Date.now(),
    url: _trunc(ev.url, 300) || '',
  }
  if (ev.ref) out.ref = _trunc(ev.ref, 200)
  if (ev.el) out.el = _trunc(ev.el, 100)
  if (ev.name) out.name = _trunc(ev.name, 60)
  if (ev.err) out.err = _trunc(ev.err, 300)

  if (ev.props && typeof ev.props === 'object') {
    const props = {}
    let count = 0
    for (const k in ev.props) {
      if (count++ >= MAX_PROPS) break
      if (!/^[a-zA-Z0-9_]{1,40}$/.test(k)) continue
      const v = ev.props[k]
      if (typeof v === 'number' && Number.isFinite(v)) props[k] = v
      else if (typeof v === 'boolean') props[k] = v
      else if (typeof v === 'string') {
        const safe = _trunc(v, 200)
        if (safe !== undefined) props[k] = safe
      }
    }
    if (Object.keys(props).length > 0) out.props = props
  }

  return out
}

/**
 * Anonymise une adresse IP avant publication : ne garde que les 3 premiers
 * octets (IPv4) ou les 4 premiers groupes (IPv6). Sert UNIQUEMENT au geo-lookup
 * grossier, jamais stocké tel quel.
 */
function truncateIp(ip) {
  if (typeof ip !== 'string' || !ip) return null
  // Strip IPv6-mapped IPv4 prefix
  const v4 = ip.replace(/^::ffff:/i, '')
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v4)) {
    const parts = v4.split('.')
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`
  }
  // IPv6 : garde 4 premiers groupes
  if (ip.includes(':')) {
    const parts = ip.split(':').slice(0, 4)
    return parts.join(':') + '::'
  }
  return null
}

module.exports = { sanitizeEvent, truncateIp, ALLOWED_TYPES }
