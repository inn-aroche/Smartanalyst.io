// VerdictHighlight — dispatcher principal. Cahier 22c.
//
// Rend une reponse "analyste" complete : Header → Verdict 1-ligne →
// (WinnerCard | FunnelBar) → (Table | …) → ActionBlock (toujours en bas).
//
// La structure est dictee par `pattern` :
//   - campaigns / creatives / products → WinnerCard + Table + Actions
//   - journey                          → FunnelBar + Actions
//   - benchmark                        → Phase 3b (Spectrum + Sources)
//   - unavailable                      → message court "ce qui manque"

import ActionBlock from './ActionBlock'
import FunnelBar from './FunnelBar'
import MiniMap from './MiniMap'
import ProportionalTable from './ProportionalTable'
import SourcesBlock from './SourcesBlock'
import SpectrumBar from './SpectrumBar'
import WinnerCard from './WinnerCard'
import type { VerdictSpec } from './types'

export default function VerdictHighlight({ spec }: { spec: VerdictSpec }) {
  // Pattern "donnees indispo" : message court, pas de visuel.
  if (spec.pattern === 'unavailable') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700">
            DONNÉES INSUFFISANTES
          </span>
        </div>
        <p className="mt-3 text-sm text-gray-700 leading-relaxed">{spec.verdict}</p>
        {spec.actions.length > 0 && (
          <div className="mt-4">
            <ActionBlock actions={spec.actions} />
          </div>
        )}
      </div>
    )
  }

  // Pattern journey : MiniMap (silhouette) + FunnelBar (chiffres) + actions.
  if (spec.pattern === 'journey') {
    return (
      <div className="space-y-3">
        <Header spec={spec} />
        {spec.journey?.steps?.length ? (
          <>
            <MiniMap steps={spec.journey.steps} />
            <FunnelBar steps={spec.journey.steps} />
          </>
        ) : null}
        <ActionBlock actions={spec.actions} />
      </div>
    )
  }

  // Pattern benchmark : SpectrumBar + Sources + actions.
  if (spec.pattern === 'benchmark') {
    return (
      <div className="space-y-3">
        <Header spec={spec} />
        {spec.benchmark && <SpectrumBar benchmark={spec.benchmark} />}
        {spec.sources && spec.sources.length > 0 && <SourcesBlock sources={spec.sources} />}
        <ActionBlock actions={spec.actions} />
      </div>
    )
  }

  // Patterns standard : campaigns / creatives / products.
  return (
    <div className="space-y-3">
      <Header spec={spec} />
      {spec.winner && <WinnerCard winner={spec.winner} />}
      {spec.rows && spec.rows.length > 0 && (
        <ProportionalTable rows={spec.rows} metricLabel={spec.winner?.metrics?.[0]?.label} />
      )}
      <ActionBlock actions={spec.actions} />
    </div>
  )
}

function Header({ spec }: { spec: VerdictSpec }) {
  return (
    <div className="px-1">
      {spec.header.context && (
        <p className="text-xs font-mono uppercase tracking-widest text-gray-400">
          {spec.header.context}
        </p>
      )}
      <h3 className="mt-1 text-lg font-bold text-gray-900 leading-tight">{spec.header.title}</h3>
      <p className="mt-1.5 text-sm text-gray-700 leading-relaxed">{spec.verdict}</p>
    </div>
  )
}
