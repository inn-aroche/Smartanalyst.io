// ProportionalBar — barre fine coloree par statut. Cahier 22c §4.3.

import { STATUS_CONFIG, type Status } from './types'

export default function ProportionalBar({
  value,
  max,
  status,
}: {
  value: number
  max: number
  status: Status
}) {
  const cfg = STATUS_CONFIG[status]
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${cfg.bar} transition-all`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
