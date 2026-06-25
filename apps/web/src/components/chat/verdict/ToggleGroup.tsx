// ToggleGroup — chip-row single-select. Cahier 22c §4.6.
// Utilise dans ProportionalTable pour switcher l'axe de tri, et reutilisable
// pour d'autres surfaces (filtre statut, dimension, etc.).
//
// Pourquoi un chip-row plutot qu'un <select> : on a 2-4 options visibles d'un
// coup → l'user voit ses choix sans cliquer, et le tap mobile est confortable.

export type ToggleOption<T extends string> = {
  key: T
  label: string
}

export default function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: ToggleOption<T>[]
  value: T
  onChange: (next: T) => void
  ariaLabel?: string
}) {
  if (options.length === 0) return null
  return (
    <div
      className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-gray-100 p-1"
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((opt) => {
        const active = opt.key === value
        return (
          <button
            key={opt.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.key)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
