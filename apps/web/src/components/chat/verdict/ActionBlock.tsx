// ActionBlock — bloc actions toujours en bas, fond sombre. Cahier 22c §4.4.
// JAMAIS d'emojis dans le contenu (verdicts), juste un compteur numerique.

import type { Action } from './types'

export default function ActionBlock({ actions }: { actions: Action[] }) {
  if (!actions || actions.length === 0) return null
  return (
    <div className="bg-gray-900 text-white rounded-xl p-5 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Actions</p>
      <ol className="space-y-2">
        {actions.map((action, i) => (
          <li key={i} className="flex items-start gap-3 text-sm">
            <span className="text-gray-400 shrink-0 mt-0.5 tabular-nums">{i + 1}</span>
            <p className="flex-1">{action.text}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}
