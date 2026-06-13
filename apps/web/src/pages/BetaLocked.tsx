import { Link } from 'react-router-dom'

import Brand from '@/components/Brand'
import LocaleSwitcher from '@/components/LocaleSwitcher'
import { useLocale, useT } from '@/lib/i18n'

// Affichée quand l'API renvoie code: 'BETA_LOCKED' sur un signup/login.
// Voir apps/api/src/lib/beta-access.js + PR #45 (Phase A du beta lockdown).
//
// L'idée : plutôt que d'afficher le raw message d'erreur inline dans le
// formulaire de login, on dirige le user sur une page dédiée qui explique
// la situation et propose un CTA clair vers la waitlist (page Phase C).

export default function BetaLocked() {
  const t = useT()
  const { locale } = useLocale()
  // Pointer vers la page beta du marketing dans la même locale que le SaaS.
  const waitlistUrl = `https://smartanalyst.io/${locale}/beta`

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6 py-12">
      <a
        href="https://smartanalyst.io"
        className="absolute left-5 top-5 z-20 inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-2 px-3 py-1.5 text-xs text-text-2 transition hover:border-border-bright hover:text-text-1"
      >
        <span aria-hidden="true">←</span>
        <span>{t('common.backToSite')}</span>
      </a>
      <div className="absolute right-5 top-5 z-20">
        <LocaleSwitcher />
      </div>
      <BackgroundGlow />

      <div className="relative z-10 w-full max-w-lg">
        <a href="https://smartanalyst.io" className="mb-10 flex justify-center">
          <Brand />
        </a>

        <div className="sa-card text-center">
          <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-brand-cyan">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand-cyan shadow-[0_0_8px_currentColor]" />
            {t('betaLocked.badge')}
          </div>

          <h1 className="font-head text-2xl font-bold text-text-1">
            {t('betaLocked.title')}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-text-2">
            {t('betaLocked.body')}
          </p>

          <a
            href={waitlistUrl}
            className="sa-btn sa-btn-primary mt-7 inline-flex w-full justify-center"
          >
            {t('betaLocked.cta')} →
          </a>

          <p className="mt-5 text-xs text-text-3">
            {t('betaLocked.alreadyInvited')}{' '}
            <Link to="/login" className="text-brand-blue hover:text-brand-cyan">
              {t('betaLocked.backToLogin')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

function BackgroundGlow() {
  return (
    <>
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[600px] w-[600px] -translate-x-1/2 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(92,143,255,0.12) 0%, transparent 70%)',
        }}
      />
      <div
        className="pointer-events-none absolute bottom-0 right-0 -z-10 h-[440px] w-[440px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(45,217,238,0.10) 0%, transparent 70%)',
        }}
      />
    </>
  )
}
