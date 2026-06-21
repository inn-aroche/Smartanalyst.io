// SourceFilter — chip dans la toolbar input qui ouvre un picker de sources
// (cahier 22b §3.2). Au depart, vide = "Toutes les sources actives".
// Quand l'user coche 1+ source, le parent passe `sources=[…]` au backend
// et affiche au-dessus de l'input les chips "GA4 ✕", "Meta ✕" persistantes.

import { useEffect, useRef, useState } from 'react'

import { useT } from '@/lib/i18n'

export type SourceOption = {
  /** Cle du connecteur, ex: 'ga4', 'meta_ads'. */
  key: string
  /** Nom lisible affiche dans le picker, ex: 'Google Analytics'. */
  label: string
}

export default function SourceFilter({
  options,
  selected,
  onChange,
}: {
  options: SourceOption[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Click outside → fermer.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const empty = options.length === 0
  const label =
    selected.length === 0
      ? t('chat.toolbar.sources.allActive')
      : selected.length === 1
        ? options.find((o) => o.key === selected[0])?.label || selected[0]
        : `${selected.length} ${t('chat.toolbar.sources').toLowerCase()}`

  function toggle(key: string) {
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key])
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={empty}
        className={[
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition',
          empty
            ? 'cursor-not-allowed border-border bg-bg-2 text-text-3'
            : selected.length > 0
              ? 'border-brand-cyan/40 bg-brand-cyan/10 text-brand-cyan hover:bg-brand-cyan/15'
              : 'border-border bg-bg-2 text-text-2 hover:border-border-bright hover:text-text-1',
        ].join(' ')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('chat.toolbar.sources')}
        title={empty ? t('chat.toolbar.sources.empty') : t('chat.toolbar.sources')}
      >
        <span aria-hidden="true">🎯</span>
        <span className="max-w-[140px] truncate">{label}</span>
      </button>

      {open && !empty && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-50 mb-2 w-[240px] rounded-[12px] border border-border bg-card p-2 shadow-card"
        >
          <ul className="flex flex-col gap-0.5">
            {options.map((o) => {
              const checked = selected.includes(o.key)
              return (
                <li key={o.key}>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={checked}
                    onClick={() => toggle(o.key)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-card-hover"
                  >
                    <span
                      aria-hidden="true"
                      className={[
                        'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border',
                        checked
                          ? 'border-brand-cyan bg-brand-cyan text-white'
                          : 'border-border bg-card',
                      ].join(' ')}
                    >
                      {checked && (
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M1.5 5l2.2 2.2L8.5 2.4"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span className="flex-1 truncate text-text-1">{o.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          {selected.length > 0 && (
            <div className="mt-1.5 border-t border-border pt-1.5">
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full rounded px-2 py-1 text-left text-[11.5px] text-text-3 hover:bg-card-hover hover:text-text-1"
              >
                ↺ {t('chat.toolbar.sources.clear')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Chip persistante affichee au-dessus de l'input quand une source est filtree.
 * Click sur la croix → onRemove(key).
 */
export function SourceChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-2 py-0.5 text-[11px] text-brand-cyan">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Retirer ${label}`}
        className="leading-none hover:text-brand-red"
      >
        ✕
      </button>
    </span>
  )
}
