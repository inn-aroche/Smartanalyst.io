// i18n primitives for the SaaS app.
//
// Pattern (kept light on purpose):
//   - Two flat string dictionaries (EN, FR) with identical keys, enforced by
//     `typeof en` on the FR dictionary so a missing translation is a compile
//     error.
//   - `useT()` returns a function `(key, vars?) => string` with autocomplete
//     on the keys. `vars` supports {{name}} interpolation.
//   - Language is picked from localStorage, falling back to navigator.language
//     (fr-* → fr, else en). User can override via the LocaleSwitcher.
//
// To add a new string: add it to STRINGS.en, the TS check forces FR to match.

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { STRINGS } from './strings'

export type Locale = 'en' | 'fr'

const STORAGE_KEY = 'smartanalyst.locale'

function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'fr'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'en' || stored === 'fr') return stored
  const browser = window.navigator.language || ''
  return browser.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

type LocaleContextValue = {
  locale: Locale
  setLocale: (next: Locale) => void
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next)
    }
  }, [])

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider')
  return ctx
}

export type StringKey = keyof typeof STRINGS.en

export function useT() {
  const { locale } = useLocale()
  return useCallback(
    (key: StringKey, vars?: Record<string, string | number>) => {
      const dict = STRINGS[locale] as Record<StringKey, string>
      let str = dict[key] ?? STRINGS.en[key] ?? key
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replaceAll(`{{${k}}}`, String(v))
        }
      }
      return str
    },
    [locale],
  )
}

const LOCALE_INTL: Record<Locale, string> = { en: 'en-US', fr: 'fr-FR' }

export function useFormatters() {
  const { locale } = useLocale()
  const tag = LOCALE_INTL[locale]
  return useMemo(
    () => ({
      number: (n: number) => new Intl.NumberFormat(tag).format(n),
      integer: (n: number) =>
        new Intl.NumberFormat(tag, { maximumFractionDigits: 0 }).format(Math.round(n)),
      currency: (n: number, currency = 'EUR') =>
        new Intl.NumberFormat(tag, {
          style: 'currency',
          currency,
          maximumFractionDigits: 0,
        }).format(n),
    }),
    [tag],
  )
}
