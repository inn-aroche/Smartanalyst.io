// Types internes du tag. Tous strippés au build (isolatedModules + noEmit).

export type SaConfig = {
  writeKey: string
  endpoint?: string
  // Quand true, on n'envoie pas les pageviews automatiques (utile si le client
  // veut piloter manuellement via Smartanalyst('page')).
  disableAutoPageview?: boolean
  // Couper les error listeners (utile si l'app a déjà sa propre télémétrie).
  disableErrorTracking?: boolean
}

export type SaEvent = {
  type: 'pageview' | 'click' | 'error' | 'session_start' | 'custom'
  // Identifiant SessionStorage, expire à la fermeture de l'onglet.
  sid: string
  ts: number
  // URL anonymisée (path + search clés-only)
  url: string
  // Référent anonymisé (origin seulement, pas le path)
  ref?: string
  // Sélecteur sanitized si type=click
  el?: string
  // Texte ou name de l'événement custom
  name?: string
  // Détail erreur (message tronqué, file:line:col)
  err?: string
  // Propriétés custom limitées en taille (anti-PII)
  props?: Record<string, string | number | boolean>
}

// Signature de l'API publique exposée sur window.Smartanalyst.
export type SaApi = {
  (action: 'init', config: SaConfig): void
  (action: 'page', url?: string): void
  (action: 'track', name: string, props?: Record<string, string | number | boolean>): void
  (action: 'runAudit'): void
}
