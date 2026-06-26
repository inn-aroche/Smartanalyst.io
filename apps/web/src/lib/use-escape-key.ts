// Hook : declenche un callback quand l'user presse Escape (a11y modals).
//
// Usage typique dans un dialog :
//   useEscapeKey(onClose)
//
// Active uniquement quand le composant est monte. Si plusieurs modals sont
// ouverts en cascade, chacun ecoute — l'event ne se propage pas, donc le
// dernier listener registered (= le plus interne) gagne. Comportement
// attendu pour des dialogs imbriques.

import { useEffect } from 'react'

export function useEscapeKey(onEscape: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onEscape()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, onEscape])
}
