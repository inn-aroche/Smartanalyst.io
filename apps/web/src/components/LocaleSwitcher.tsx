import { useEffect, useRef, useState } from 'react'

import { type Locale, useLocale, useT } from '@/lib/i18n'

const LOCALES: { code: Locale; flag: string; key: 'locale.english' | 'locale.french' }[] = [
  { code: 'en', flag: '🇬🇧', key: 'locale.english' },
  { code: 'fr', flag: '🇫🇷', key: 'locale.french' },
]

type Props = {
  /** 'compact' fits in the sidebar / corner; 'full' shows the label too. */
  variant?: 'compact' | 'full'
  align?: 'left' | 'right'
}

export default function LocaleSwitcher({ variant = 'compact', align = 'right' }: Props) {
  const { locale, setLocale } = useLocale()
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const current = LOCALES.find((l) => l.code === locale) ?? LOCALES[0]

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-2 px-2.5 py-1.5 font-mono text-xs text-text-2 transition hover:border-border-bright hover:text-text-1"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('locale.label')}
      >
        <span className="text-sm leading-none">{current.flag}</span>
        {variant === 'full' && <span>{t(current.key)}</span>}
        <span className="text-[10px] leading-none">▾</span>
      </button>
      {open && (
        <div
          role="listbox"
          className={[
            'absolute z-30 mt-1.5 min-w-[140px] overflow-hidden rounded-lg border border-border bg-bg-1 shadow-lg',
            align === 'right' ? 'right-0' : 'left-0',
          ].join(' ')}
        >
          {LOCALES.map((l) => (
            <button
              key={l.code}
              type="button"
              role="option"
              aria-selected={l.code === locale}
              onClick={() => {
                setLocale(l.code)
                setOpen(false)
              }}
              className={[
                'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                l.code === locale
                  ? 'bg-brand-blue-dim text-text-1'
                  : 'text-text-2 hover:bg-card hover:text-text-1',
              ].join(' ')}
            >
              <span className="text-base leading-none">{l.flag}</span>
              <span className="flex-1">{t(l.key)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
