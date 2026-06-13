import { type FormEvent, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

import Brand from '@/components/Brand'
import GoogleSignInButton, { OrSeparator } from '@/components/GoogleSignInButton'
import LocaleSwitcher from '@/components/LocaleSwitcher'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useT } from '@/lib/i18n'

export default function Signup() {
  const { signup, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const t = useT()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signup({ email, password, organizationName })
      navigate('/', { replace: true })
    } catch (err) {
      // Beta lockdown — voir Login.tsx pour le rationale.
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
      <div className="relative z-10 w-full max-w-md">
        <a href="https://smartanalyst.io" className="mb-10 flex justify-center">
          <Brand />
        </a>
        <div className="sa-card">
          <h1 className="font-head text-2xl font-bold text-text-1">
            {t('signup.title')}
          </h1>
          <p className="mt-1 text-sm text-text-2">{t('signup.subtitle')}</p>

          <div className="mt-7">
            <GoogleSignInButton label={t('signup.googleButton')} />
          </div>

          <OrSeparator />

          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div>
              <label className="sa-label" htmlFor="organization">
                {t('signup.organizationName')}
              </label>
              <input
                id="organization"
                className="sa-input"
                type="text"
                required
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder={t('signup.organizationPlaceholder')}
              />
            </div>
            <div>
              <label className="sa-label" htmlFor="email">
                {t('signup.workEmail')}
              </label>
              <input
                id="email"
                className="sa-input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="toi@entreprise.com"
              />
            </div>
            <div>
              <label className="sa-label" htmlFor="password">
                {t('common.password')}
              </label>
              <input
                id="password"
                className="sa-input"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('signup.passwordPlaceholder')}
              />
              <p className="mt-1.5 font-mono text-[11px] text-text-3">
                {t('signup.passwordHint')}
              </p>
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
              {submitting ? t('signup.submitting') : t('signup.submit')}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-text-2">
            {t('signup.alreadyHaveAccount')}{' '}
            <Link to="/login" className="text-brand-blue hover:text-brand-cyan">
              {t('signup.signIn')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
