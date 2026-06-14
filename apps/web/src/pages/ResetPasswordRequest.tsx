// Demande de reset password (étape 1) :
// L'user entre son email → POST /auth/password-reset/request → message
// neutre "si l'email existe, on a envoyé un lien" (anti-enumeration).

import { type FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'

import Brand from '@/components/Brand'
import LocaleSwitcher from '@/components/LocaleSwitcher'
import { apiFetch } from '@/lib/api'
import { useT } from '@/lib/i18n'

export default function ResetPasswordRequest() {
  const t = useT()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await apiFetch('/api/v1/auth/password-reset/request', {
        method: 'POST',
        body: { email },
      })
      setDone(true)
    } catch (err) {
      // L'endpoint renvoie 200 systématiquement. Si on a une erreur, c'est
      // rate limit ou serveur — message neutre.
      setError(err instanceof Error ? err.message : t('reset.error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-bg-0 px-6 py-10">
      <div className="absolute right-6 top-6 z-10">
        <LocaleSwitcher />
      </div>
      <BackgroundGlow />
      <div className="relative z-10 w-full max-w-md">
        <a href="https://smartanalyst.io" className="mb-10 flex justify-center">
          <Brand />
        </a>
        <div className="sa-card">
          {done ? (
            <>
              <h1 className="font-head text-2xl font-bold text-text-1">
                {t('reset.requestDoneTitle')}
              </h1>
              <p className="mt-2 text-sm text-text-2">
                {t('reset.requestDoneBody', { email })}
              </p>
              <Link to="/login" className="sa-btn mt-6 w-full !text-center">
                {t('reset.backToLogin')}
              </Link>
            </>
          ) : (
            <>
              <h1 className="font-head text-2xl font-bold text-text-1">
                {t('reset.requestTitle')}
              </h1>
              <p className="mt-1 text-sm text-text-2">{t('reset.requestSubtitle')}</p>

              <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
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
                    placeholder="you@company.com"
                  />
                </div>

                {error && (
                  <div className="rounded-lg border border-brand-red/30 bg-brand-red/10 px-3 py-2 text-xs text-brand-red">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || !email.trim()}
                  className="sa-btn sa-btn-primary mt-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? t('reset.requestSubmitting') : t('reset.requestSubmit')}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-text-2">
                <Link to="/login" className="text-brand-blue hover:text-brand-cyan">
                  {t('reset.backToLogin')}
                </Link>
              </p>
            </>
          )}
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
          background: 'radial-gradient(circle, rgba(92,143,255,0.12) 0%, transparent 70%)',
        }}
      />
      <div
        className="pointer-events-none absolute bottom-0 right-0 -z-10 h-[440px] w-[440px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(45,217,238,0.08) 0%, transparent 70%)',
        }}
      />
    </>
  )
}
