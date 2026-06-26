// SourcesBlock — bloc citations externes pour les patterns benchmark.
// Cahier 22c §4.8. Liste compacte "Source : X (lien)" avec caveat
// "benchmarks indicatifs — recouper avant decision majeure".

import type { Source } from './types'

export default function SourcesBlock({ sources }: { sources: Source[] }) {
  if (!sources || sources.length === 0) return null
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Sources</p>
      <ul className="mt-2 space-y-1">
        {sources.map((s, i) => (
          <li key={i} className="text-xs text-gray-700">
            {s.url ? (
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-900 hover:underline"
              >
                {s.name}
              </a>
            ) : (
              s.name
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] italic text-gray-400">
        Benchmarks indicatifs — recoupe avant une décision majeure.
      </p>
    </div>
  )
}
