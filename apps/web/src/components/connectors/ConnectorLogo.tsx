// ConnectorLogo — tuiles arrondies aux couleurs de marque avec glyphes
// simples pour chaque partenaire (handoff Claude Design, sa-kit.jsx
// → ConnectorLogo). À remplacer par les vrais logos officiels en production.
//
// Le source key vient de l'API (ex: 'shopify', 'meta_ads', 'google_ads'),
// on le mappe vers une clé canonique pour le glyphe.

type GlyphKey =
  | 'SHOP'
  | 'META'
  | 'GADS'
  | 'GA4'
  | 'STRP'
  | 'GSC'
  | 'KLAV'
  | 'PIN'
  | 'TIKTOK'
  | 'PRESTA'
  | 'HUBSPOT'
  | 'MAILCHIMP'

const SOURCE_TO_GLYPH: Record<string, GlyphKey> = {
  shopify: 'SHOP',
  meta_ads: 'META',
  meta: 'META',
  google_ads: 'GADS',
  ga4: 'GA4',
  stripe: 'STRP',
  search_console: 'GSC',
  klaviyo: 'KLAV',
  pinterest_ads: 'PIN',
  tiktok_ads: 'TIKTOK',
  prestashop: 'PRESTA',
  hubspot: 'HUBSPOT',
  mailchimp: 'MAILCHIMP',
}

const BG_COLOR: Record<GlyphKey, string> = {
  SHOP: '#5E8E3E',
  META: '#1877F2',
  GADS: '#3C7DF4',
  GA4: '#E0922A',
  STRP: '#635BFF',
  GSC: '#3C7DF4',
  KLAV: '#1A1A1A',
  PIN: '#E60023',
  TIKTOK: '#111111',
  PRESTA: '#DF0067',
  HUBSPOT: '#FF5C35',
  MAILCHIMP: '#FFD200',
}

function glyphFor(key: GlyphKey) {
  switch (key) {
    case 'SHOP':
      return (
        <g>
          <rect x="16" y="19" width="16" height="15" rx="3" fill="#fff" />
          <path d="M19 20a5 5 0 0 1 10 0" fill="none" stroke="#fff" strokeWidth="2.4" />
        </g>
      )
    case 'META':
      return (
        <g fill="none" stroke="#fff" strokeWidth="3">
          <circle cx="20" cy="24" r="5.5" />
          <circle cx="28" cy="24" r="5.5" />
        </g>
      )
    case 'GADS':
      return <path d="M24 15 L33 33 L15 33 Z" fill="#fff" />
    case 'GA4':
      return (
        <g fill="#fff">
          <rect x="15" y="27" width="4.6" height="7" rx="1.4" />
          <rect x="21.7" y="21" width="4.6" height="13" rx="1.4" />
          <rect x="28.4" y="15" width="4.6" height="19" rx="1.4" />
        </g>
      )
    case 'STRP':
    case 'KLAV':
    case 'TIKTOK':
    case 'PRESTA':
    case 'MAILCHIMP': {
      const letter = key === 'STRP' ? 'S' : key === 'MAILCHIMP' ? 'M' : key[0]
      const fill = key === 'MAILCHIMP' ? '#1A1A1A' : '#fff'
      return (
        <text
          x="24"
          y="31"
          textAnchor="middle"
          fontFamily="'Plus Jakarta Sans',sans-serif"
          fontWeight="800"
          fontSize="20"
          fill={fill}
        >
          {letter}
        </text>
      )
    }
    case 'GSC':
      return (
        <g fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
          <circle cx="22" cy="22" r="6" />
          <line x1="26.5" y1="26.5" x2="33" y2="33" />
        </g>
      )
    case 'PIN':
      return (
        <g>
          <circle cx="24" cy="24" r="3.4" fill="#fff" />
          <path d="M24 27 L21 35" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        </g>
      )
    case 'HUBSPOT':
      return (
        <g fill="none" stroke="#fff" strokeWidth="2.6">
          <circle cx="24" cy="27" r="4" />
          <line x1="24" y1="23" x2="24" y2="17" />
          <circle cx="24" cy="15" r="2.6" fill="#fff" />
        </g>
      )
    default:
      return null
  }
}

export default function ConnectorLogo({
  source,
  size = 44,
  radius = 12,
}: {
  source: string
  size?: number
  radius?: number
}) {
  const key = SOURCE_TO_GLYPH[source.toLowerCase()] ?? null
  const bg = key ? BG_COLOR[key] : '#5C8FFF'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className="block flex-shrink-0"
      aria-hidden="true"
    >
      <rect width="48" height="48" rx={radius} fill={bg} />
      {key ? (
        glyphFor(key)
      ) : (
        <text
          x="24"
          y="31"
          textAnchor="middle"
          fontFamily="'Plus Jakarta Sans',sans-serif"
          fontWeight="800"
          fontSize="19"
          fill="#fff"
        >
          {(source[0] ?? '?').toUpperCase()}
        </text>
      )}
    </svg>
  )
}
