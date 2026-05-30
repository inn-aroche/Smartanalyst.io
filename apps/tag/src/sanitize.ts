// Helpers de sanitization. Tous PII-safe : aucune lecture de valeurs
// d'inputs ou de contenu utilisateur. On regarde seulement la structure DOM.

/**
 * Construit un sélecteur court et stable pour un élément cliqué :
 *   tagName[#id][.firstClass][[data-track=...]]
 *
 * Évite volontairement le textContent (peut contenir email, nom, etc.) et
 * la position dans le DOM (peu utile, fluctue).
 */
export function selectorFor(el: Element): string {
  const parts: string[] = [el.tagName.toLowerCase()]
  if (el.id) parts.push('#' + el.id.replace(/[^a-zA-Z0-9_-]/g, ''))
  const cls = el.getAttribute('class')
  if (cls) {
    const first = cls.split(/\s+/)[0]
    if (first) parts.push('.' + first.replace(/[^a-zA-Z0-9_-]/g, ''))
  }
  const track = el.getAttribute('data-track')
  if (track) parts.push(`[data-track=${track.slice(0, 32).replace(/[^a-zA-Z0-9_-]/g, '_')}]`)
  return parts.join('').slice(0, 80)
}

/**
 * URL anonymisée : on garde le path et les clés de query (pas les valeurs,
 * qui peuvent contenir des emails, tokens, etc.).
 */
export function safeUrl(url: string): string {
  try {
    const u = new URL(url, 'http://x')
    const keys: string[] = []
    u.searchParams.forEach((_, k) => keys.push(k))
    const qs = keys.length ? `?${keys.sort().join('&')}` : ''
    return (u.pathname + qs).slice(0, 300)
  } catch {
    return ''
  }
}

/**
 * Référent : seulement l'origin (host), pas le path qui pourrait fuiter
 * une URL paramétrée privée.
 */
export function safeReferrer(ref: string): string {
  try {
    return new URL(ref).origin.slice(0, 100)
  } catch {
    return ''
  }
}

/**
 * Sanitize les propriétés custom : refuse les valeurs ressemblant à des PII
 * (email, téléphone), tronque les strings, ne garde que primitives.
 */
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
const PHONE_RE = /(\+?\d[\d\s().-]{6,}\d)/

export function safeProps(
  input: Record<string, unknown> | undefined,
): Record<string, string | number | boolean> | undefined {
  if (!input) return undefined
  const out: Record<string, string | number | boolean> = {}
  let count = 0
  for (const k in input) {
    if (count++ >= 20) break // max 20 propriétés
    if (!/^[a-zA-Z0-9_]{1,40}$/.test(k)) continue
    const v = input[k]
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    else if (typeof v === 'boolean') out[k] = v
    else if (typeof v === 'string') {
      if (EMAIL_RE.test(v) || PHONE_RE.test(v)) continue // ne logue jamais d'email/téléphone
      out[k] = v.slice(0, 200)
    }
  }
  return out
}
