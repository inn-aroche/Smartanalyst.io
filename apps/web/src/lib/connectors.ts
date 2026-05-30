// Types et constantes UI du catalogue de connecteurs.
//
// Les définitions concrètes (nom, scopes, statut, etc.) viennent désormais
// de l'API GET /api/v1/connectors/catalog, alimentée par la table
// Supabase `integration_providers`. Ajouter un nouveau provider = INSERT
// en DB + créer l'app OAuth chez le provider, sans modification de ce
// fichier ni redéploiement front.

export type ConnectorStatus = 'available' | 'beta' | 'soon' | 'disabled'

export type ConnectorCategory =
  | 'Analytics'
  | 'Advertising'
  | 'Payments'
  | 'CRM'
  | 'Email & SMS'
  | 'Ecommerce'
  | 'Product & Events'
  | 'SEO'
  | 'Social'
  | 'Support'
  | 'Data warehouse'
  | 'Spreadsheet & Files'

// Forme renvoyée par /api/v1/connectors/catalog (après sanitize côté backend).
export type ConnectorDef = {
  source: string
  name: string
  category: ConnectorCategory
  description: string
  status: ConnectorStatus
  auth_kind: 'oauth2' | 'apikey'
  requires_subdomain: boolean
  requires_account_id: boolean
  credentials_configured: boolean
  icon_url: string | null
  scopes?: string[]
}

export type ConnectorCounts = {
  available: number
  beta: number
  soon: number
}

export function countByStatus(items: ConnectorDef[]): ConnectorCounts {
  const counts: ConnectorCounts = { available: 0, beta: 0, soon: 0 }
  for (const c of items) {
    if (c.status === 'available') counts.available++
    else if (c.status === 'beta') counts.beta++
    else if (c.status === 'soon') counts.soon++
  }
  return counts
}

// Liste fixe utilisée comme ordre canonique des filtres côté UI.
// Une catégorie absente de la DB est simplement ignorée dans le rendu.
export const CATEGORIES: ConnectorCategory[] = [
  'Analytics',
  'Advertising',
  'Payments',
  'CRM',
  'Email & SMS',
  'Ecommerce',
  'Product & Events',
  'SEO',
  'Social',
  'Support',
  'Data warehouse',
  'Spreadsheet & Files',
]
