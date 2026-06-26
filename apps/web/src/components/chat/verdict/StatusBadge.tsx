// StatusBadge — chip 4 tons (TOP/BON/MOYEN/FAIBLE). Cahier 22c §2.

import { STATUS_CONFIG, type Status } from './types'

export default function StatusBadge({ status }: { status: Status }) {
  const cfg = STATUS_CONFIG[status]
  return <span className={`text-xs font-bold px-2 py-0.5 rounded ${cfg.badge}`}>{status}</span>
}
