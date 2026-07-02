// Garde-fou React global : isole les crashes de rendu d'un sous-arbre pour
// éviter que toute l'app affiche l'écran blanc. Pas de hook équivalent en V18
// pour intercepter les erreurs de rendu → class component.
//
// ⚠️ CE COMPOSANT EST MONTÉ AU-DESSUS DE TOUS LES PROVIDERS (main.tsx) :
// il ne doit dépendre d'AUCUN contexte (i18n, auth, router…). Un fallback
// qui appelait useT() crashait lui-même hors LocaleProvider → écran blanc à
// la place du filet de sécurité (incident du 2026-07-02). La locale est donc
// lue directement depuis localStorage/navigator et les strings piochées dans
// le dictionnaire statique, sans hook.

import { Component, type ErrorInfo, type ReactNode } from 'react'

import { reportClientError } from '@/lib/client-errors'
import { STRINGS } from '@/lib/strings'

type Props = { children: ReactNode }
type State = { error: Error | null }

// Détection de locale sans contexte — même clé localStorage que lib/i18n
// (détection dupliquée volontairement pour rester context-free).
function detectLocaleSafe(): 'en' | 'fr' {
  try {
    const stored = window.localStorage.getItem('smartanalyst.locale')
    if (stored === 'en' || stored === 'fr') return stored
    return (window.navigator.language || '').toLowerCase().startsWith('fr') ? 'fr' : 'en'
  } catch {
    return 'en'
  }
}

function ErrorFallback({ error, onReset }: { error: Error; onReset: () => void }) {
  const dict = STRINGS[detectLocaleSafe()]
  const isDev = import.meta.env.DEV

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-0 px-6 py-10">
      <div className="sa-card max-w-lg">
        <div className="font-mono text-[10px] uppercase tracking-widest text-brand-red">
          {dict['error.boundary.badge']}
        </div>
        <h1 className="mt-2 font-head text-xl font-bold text-text-1">
          {dict['error.boundary.title']}
        </h1>
        <p className="mt-2 text-sm text-text-2">{dict['error.boundary.body']}</p>

        {isDev && (
          <pre className="mt-4 overflow-auto rounded border border-border bg-bg-2 p-3 text-[11px] text-text-2">
            {error.message}
            {'\n'}
            {error.stack}
          </pre>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="sa-btn sa-btn-primary !py-1.5 !text-xs"
          >
            {dict['error.boundary.refresh']}
          </button>
          <button
            type="button"
            onClick={() => {
              onReset()
              window.location.assign('/')
            }}
            className="sa-btn !py-1.5 !text-xs"
          >
            {dict['error.boundary.home']}
          </button>
        </div>
      </div>
    </div>
  )
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack)
    // Remonte le crash au backend (→ Sentry). Les erreurs de rendu attrapées
    // par un boundary ne passent PAS par window.onerror — sans ce report,
    // elles étaient invisibles en prod.
    try {
      reportClientError(error, { componentStack: info.componentStack ?? undefined })
    } catch {
      // Le report ne doit jamais aggraver le crash.
    }
  }

  reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    return <ErrorFallback error={this.state.error} onReset={this.reset} />
  }
}
