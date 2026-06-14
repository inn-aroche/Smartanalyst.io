// Garde-fou React global : isole les crashes de rendu d'un sous-arbre pour
// éviter que toute l'app affiche l'écran blanc. Pas de hook équivalent en V18
// pour intercepter les erreurs de rendu → class component.
//
// On affiche un message neutre + 2 actions (rafraîchir / retour accueil). Si
// `import.meta.env.DEV`, on rend aussi la stack pour débug local.
//
// TODO: brancher Sentry web (pas encore installé côté app — Sentry est seulement
// côté API pour l'instant).

import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Console pour qu'on retrouve dans Sentry/DataDog quand on les branchera.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children

    const isDev = import.meta.env.DEV

    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-0 px-6 py-10">
        <div className="sa-card max-w-lg">
          <div className="font-mono text-[10px] uppercase tracking-widest text-brand-red">
            Erreur inattendue
          </div>
          <h1 className="mt-2 font-head text-xl font-bold text-text-1">
            Quelque chose s’est mal passé.
          </h1>
          <p className="mt-2 text-sm text-text-2">
            Le problème a été noté. Rafraîchis la page ou reviens à l’accueil pour continuer.
          </p>

          {isDev && (
            <pre className="mt-4 overflow-auto rounded border border-border bg-bg-2 p-3 text-[11px] text-text-2">
              {this.state.error.message}
              {'\n'}
              {this.state.error.stack}
            </pre>
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="sa-btn sa-btn-primary !py-1.5 !text-xs"
            >
              Rafraîchir
            </button>
            <button
              type="button"
              onClick={() => {
                this.reset()
                window.location.assign('/')
              }}
              className="sa-btn !py-1.5 !text-xs"
            >
              Retour à l’accueil
            </button>
          </div>
        </div>
      </div>
    )
  }
}
