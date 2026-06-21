// Shared email template — shell HTML branded reutilise par tous les services
// (invitation team, digest insights, task email, waitlist, payment failed…).
//
// Pourquoi : avant chaque service avait son propre HTML inline minimal.
// Resultat : look-and-feel incoherent, header/footer manquants, pas de
// fallback texte. Ce helper concentre le branding + la baseline.
//
// USAGE :
//   const { renderEmail } = require('./email-template.service')
//   const { html, text } = renderEmail({
//     preview: 'Tu as une nouvelle invitation', // text visible dans inbox preview
//     title: 'Tu es invité',
//     intro: 'Tu as été invité à rejoindre…',
//     body: '<p>Détails ici en HTML.</p>',     // optionnel
//     cta: { label: 'Accepter', href: 'https://...' },
//     footer: 'Ce lien expire dans 7 jours.', // optionnel
//   })
//
// Le `text` est genere automatiquement (strip HTML + intro + URL CTA) — bonne
// deliverability (les emails sans alternative text/plain finissent en spam).

const BRAND_PRIMARY = '#5C8FFF' // brand-blue-deep
const BRAND_ACCENT = '#2DD9EE' // brand-cyan
const TEXT_DARK = '#14142A'
const TEXT_MUTED = '#5C5C78'
const BG_PAGE = '#F5F5F9'
const BORDER = '#E5E5EA'

const APP_NAME = 'SmartAnalyst'
const APP_TAGLINE = 'Le copilote marketing qui agit'

function appUrl() {
  return (process.env.APP_URL || 'https://app.smartanalyst.io').replace(/\/$/, '')
}

function marketingUrl() {
  return (process.env.MARKETING_URL || 'https://smartanalyst.io').replace(/\/$/, '')
}

function escapeHtml(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Construit un email HTML branded + sa version text/plain.
 *
 * @param {object} opts
 * @param {string} opts.preview     Snippet pre-affiche par Gmail/Outlook.
 * @param {string} opts.title       H1 principal.
 * @param {string} [opts.intro]     Phrase d'intro (paragraphe sous H1).
 * @param {string} [opts.body]      HTML libre injecte apres l'intro.
 * @param {object} [opts.cta]       { label, href } — bouton principal.
 * @param {string} [opts.footer]    Phrase de note finale (sous CTA).
 * @returns {{ html: string, text: string }}
 */
function renderEmail({ preview, title, intro, body, cta, footer }) {
  const safePreview = escapeHtml(preview || title || '')
  const safeTitle = escapeHtml(title || '')
  const safeIntro = intro
    ? `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:${TEXT_DARK}">${escapeHtml(intro)}</p>`
    : ''
  const safeBody = body || '' // l'appelant est responsable d'escape son HTML libre
  const safeFooter = footer
    ? `<p style="margin:24px 0 0 0;font-size:12.5px;color:${TEXT_MUTED};line-height:1.5">${escapeHtml(footer)}</p>`
    : ''

  const ctaHtml = cta
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 0 0">
        <tr><td align="center" bgcolor="${BRAND_PRIMARY}" style="border-radius:10px">
          <a href="${escapeHtml(cta.href)}" target="_blank" style="display:inline-block;padding:12px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(cta.label)}</a>
        </td></tr>
      </table>`
    : ''

  // Le HTML email est dur a styler — on reste en table-based + inline CSS,
  // testé sur Gmail / Outlook / Apple Mail / iOS Mail.
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:${BG_PAGE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${TEXT_DARK};-webkit-font-smoothing:antialiased">
<!-- Preview text Gmail/Outlook (invisible) -->
<div style="display:none;font-size:1px;color:${BG_PAGE};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${safePreview}</div>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" bgcolor="${BG_PAGE}">
  <tr>
    <td align="center" style="padding:32px 16px">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid ${BORDER};overflow:hidden">

        <!-- Header brand -->
        <tr>
          <td style="background:linear-gradient(135deg,${BRAND_PRIMARY} 0%,${BRAND_ACCENT} 100%);padding:18px 28px">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td>
                  <span style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:18px;font-weight:800;color:#ffffff;letter-spacing:-0.02em">✦ ${APP_NAME}</span>
                </td>
                <td align="right">
                  <span style="font-family:ui-monospace,'SF Mono','DM Mono',monospace;font-size:10.5px;color:rgba(255,255,255,0.85);text-transform:uppercase;letter-spacing:0.08em">${APP_TAGLINE}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 28px 28px 28px">
            <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;letter-spacing:-0.02em;color:${TEXT_DARK};line-height:1.25">${safeTitle}</h1>
            ${safeIntro}
            ${safeBody}
            ${ctaHtml}
            ${safeFooter}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#FAFAFC;border-top:1px solid ${BORDER};padding:18px 28px">
            <p style="margin:0;font-size:11.5px;color:${TEXT_MUTED};line-height:1.5">
              ${APP_NAME} — analyste marketing IA · hébergement européen<br>
              <a href="${marketingUrl()}" style="color:${TEXT_MUTED};text-decoration:none">${marketingUrl().replace(/^https?:\/\//, '')}</a>
              ·
              <a href="${appUrl()}/settings" style="color:${TEXT_MUTED};text-decoration:none">Préférences emails</a>
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`

  // text/plain alternative — required for bonne deliverability.
  const textParts = []
  textParts.push(`${APP_NAME} — ${APP_TAGLINE}`)
  textParts.push('')
  textParts.push(title || '')
  if (intro) {
    textParts.push('')
    textParts.push(intro)
  }
  if (body) {
    // Strip HTML tags pour le fallback texte.
    const stripped = body
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    if (stripped) {
      textParts.push('')
      textParts.push(stripped)
    }
  }
  if (cta) {
    textParts.push('')
    textParts.push(`${cta.label} : ${cta.href}`)
  }
  if (footer) {
    textParts.push('')
    textParts.push(footer)
  }
  textParts.push('')
  textParts.push('---')
  textParts.push(`${marketingUrl()} · Préférences emails : ${appUrl()}/settings`)
  const text = textParts.join('\n')

  return { html, text }
}

module.exports = { renderEmail, escapeHtml, BRAND_PRIMARY, BRAND_ACCENT }
