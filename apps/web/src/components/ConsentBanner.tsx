import { useEffect, useState } from 'react'

import { CONSENT_OPEN_EVENT, readConsent, writeConsent } from '@/lib/consent'
import { useT } from '@/lib/i18n'

// Bottom-right, non-bloquant (pas de backdrop, pas de scroll lock).
// 3 boutons même niveau visuel (CNIL : pas de "Tout accepter" survalorisé).
// Toggles décochés par défaut → consentement EXPLICITE.

export default function ConsentBanner() {
  const t = useT()
  const [visible, setVisible] = useState(false)
  const [analytics, setAnalytics] = useState(false)
  const [ads, setAds] = useState(false)

  useEffect(() => {
    const stored = readConsent()
    if (!stored) {
      const timeout = window.setTimeout(() => setVisible(true), 600)
      return () => window.clearTimeout(timeout)
    }
  }, [])

  useEffect(() => {
    function open() {
      const stored = readConsent()
      setAnalytics(stored?.analytics ?? false)
      setAds(stored?.ads ?? false)
      setVisible(true)
    }
    window.addEventListener(CONSENT_OPEN_EVENT, open)
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, open)
  }, [])

  function close() {
    setVisible(false)
  }
  function acceptAll() {
    writeConsent(true, true)
    close()
  }
  function rejectAll() {
    writeConsent(false, false)
    close()
  }
  function saveChoice() {
    writeConsent(analytics, ads)
    close()
  }

  if (!visible) return null

  return (
    <div
      className="fixed bottom-4 right-4 left-4 z-[100] sm:left-auto sm:max-w-md"
      role="dialog"
      aria-modal="false"
      aria-labelledby="sa-consent-title"
    >
      <div className="sa-card flex flex-col gap-3 border-border-bright shadow-xl backdrop-blur-md">
        <div>
          <h2 id="sa-consent-title" className="font-head text-sm font-semibold text-text-1">
            🍪 {t('consent.title')}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-text-2">{t('consent.message')}</p>
        </div>

        <div className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border bg-bg-1">
          <CatRow
            locked
            title={t('consent.cat.necessary.label')}
            desc={t('consent.cat.necessary.desc')}
            checked
            onChange={() => {
              /* locked */
            }}
          />
          <CatRow
            title={t('consent.cat.analytics.label')}
            desc={t('consent.cat.analytics.desc')}
            checked={analytics}
            onChange={setAnalytics}
          />
          <CatRow
            title={t('consent.cat.marketing.label')}
            desc={t('consent.cat.marketing.desc')}
            checked={ads}
            onChange={setAds}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={rejectAll} className="sa-btn flex-1 !text-xs">
            {t('consent.rejectAll')}
          </button>
          <button type="button" onClick={saveChoice} className="sa-btn flex-1 !text-xs">
            {t('consent.save')}
          </button>
          <button
            type="button"
            onClick={acceptAll}
            className="sa-btn sa-btn-primary flex-1 !text-xs"
          >
            {t('consent.acceptAll')}
          </button>
        </div>

        <a
          href="https://smartanalyst.io/en/legal/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-center text-[11px] text-text-3 underline underline-offset-2 hover:text-text-2"
        >
          {t('consent.privacyLink')}
        </a>
      </div>
    </div>
  )
}

function CatRow({
  title,
  desc,
  checked,
  onChange,
  locked,
}: {
  title: string
  desc: string
  checked: boolean
  onChange: (v: boolean) => void
  locked?: boolean
}) {
  return (
    <label
      className={`flex items-start justify-between gap-3 px-3 py-2.5 ${
        locked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-text-1">{title}</div>
        <div className="mt-0.5 text-[11px] leading-snug text-text-2">{desc}</div>
      </div>
      <span
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
          checked ? 'bg-brand-green' : 'bg-bg-2'
        }`}
      >
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          disabled={locked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition ${
            checked ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </span>
    </label>
  )
}
