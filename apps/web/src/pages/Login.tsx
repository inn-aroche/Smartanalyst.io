import { type FormEvent, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'

import Brand from '@/components/Brand'
import GoogleSignInButton, { OrSeparator } from '@/components/GoogleSignInButton'
import LocaleSwitcher from '@/components/LocaleSwitcher'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useT } from '@/lib/i18n'

type LocationState = { from?: string }

export default function Login() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const t = useT()
  const redirectTo = (location.state as LocationState | null)?.from ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (isAuthenticated) {
    return <Navigate to={redirectTo} replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      // Beta lockdown : si l'API rejette l'email pour cause de whitelist
      // restreinte (PR #45), on envoie le user vers une page dédiée qui
      // propose la waitlist plutôt que de coller le raw message inline.
      if (err instanceof ApiError && err.code === 'BETA_LOCKED') {
        navigate('/beta-locked', { replace: true })
        return
      }
      setError(err instanceof Error ? err.message : t('login.somethingWentWrong'))
    } finally {
      setSubmitting(false)
    }
  }

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
      <div className="relative z-10 w-full max-w-md">
        <a href="https://smartanalyst.io" className="mb-10 flex justify-center">
          <Brand />
        </a>
        <div className="sa-card">
          <h1 className="font-head text-2xl font-bold text-text-1">
            {t('login.welcomeBack')}
          </h1>
          <p className="mt-1 text-sm text-text-2">{t('login.subtitle')}</p>

          <div className="mt-7">
            <GoogleSignInButton returnTo={redirectTo} />
          </div>

          <OrSeparator />

          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div>
              <label className="sa-label" htmlFor="email">
                {t('common.email')}
              </label>
              <input
                id="email"
                className="sa-input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('login.emailPlaceholder')}
              />
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <label className="sa-label" htmlFor="password">
                  {t('common.password')}
                </label>
                <Link
                  to="/reset-password/request"
                  className="text-xs text-text-3 hover:text-text-1"
                >
                  {t('login.forgotPassword')}
                </Link>
              </div>
              <input
                id="password"
                className="sa-input"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('login.passwordPlaceholder')}
              />
            </div>

            {error && (
              <div className="rounded-lg border border-brand-red/30 bg-brand-red/10 px-3 py-2 text-sm text-brand-red">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="sa-btn sa-btn-primary mt-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? t('login.submitting') : t('login.submit')}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-text-2">
            {t('login.newToSmartAnalyst')}{' '}
            <Link
              to="/signup"
              className="text-brand-blue hover:text-brand-cyan"
            >
              {t('login.createAccount')}
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
            'radial-gradient(circle, rgba(45,217,238,0.08) 0%, transparent 70%)',
        }}
      />
    </>
  )
}
