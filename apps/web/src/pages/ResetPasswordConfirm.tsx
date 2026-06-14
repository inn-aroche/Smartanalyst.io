// Confirmation reset password (étape 2) :
// L'user arrive ici via le lien Supabase. Le fragment d'URL contient
// access_token + refresh_token. On extrait l'access_token, on demande un
// nouveau password, on POST → succès → redirige vers /login.

import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import Brand from '@/components/Brand'
import LocaleSwitcher from '@/components/LocaleSwitcher'
import { apiFetch, ApiError } from '@/lib/api'
import { useT } from '@/lib/i18n'

/**
 * Parse `#access_token=...&type=recovery&...` du fragment d'URL.
 * Supabase met les params dans le fragment (pas la query), pour qu'ils ne
 * partent jamais au serveur — chez nous OK aussi puisqu'on les renvoie via
 * une requête JSON, pas une nav.
 */
function parseHashTokens(): { accessToken: string | null; errorCode: string | null } {
  if (typeof window === 'undefined') return { accessToken: null, errorCode: null }
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash) return { accessToken: null, errorCode: null }
  const params = new URLSearchParams(hash)
  return {
    accessToken: params.get('access_token'),
    errorCode: params.get('error') || params.get('error_code'),
  }
}

export default function ResetPasswordConfirm() {
  const t = useT()
  const navigate = useNavigate()
  const tokens = useMemo(parseHashTokens, [])
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Si le lien a expiré (Supabase met error_code=otp_expired par ex.), on
  // affiche un message clair plutôt qu'un form qui va échouer.
  useEffect(() => {
    if (tokens.errorCode) {
      setError(t('reset.linkExpired'))
    }
  }, [tokens.errorCode, t])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError(t('reset.mismatch'))
      return
    }
    if (password.length < 12) {
      setError(t('reset.tooShort'))
      return
    }
    if (!tokens.accessToken) {
      setError(t('reset.linkExpired'))
      return
    }
    setSubmitting(true)
    try {
      await apiFetch('/api/v1/auth/password-reset/confirm', {
        method: 'POST',
        body: { accessToken: tokens.accessToken, password },
      })
      // Nettoie le hash avant de naviguer (sinon il reste dans l'URL).
      window.location.hash = ''
      navigate('/login?reset=1', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_OR_EXPIRED_TOKEN') {
        setError(t('reset.linkExpired'))
      } else {
        setError(err instanceof Error ? err.message : t('reset.error'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit =
    !!tokens.accessToken && password.length >= 12 && password === confirm && !submitting

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
          <h1 className="font-head text-2xl font-bold text-text-1">
            {t('reset.confirmTitle')}
          </h1>
          <p className="mt-1 text-sm text-text-2">{t('reset.confirmSubtitle')}</p>

          <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
            <div>
              <label className="sa-label" htmlFor="password">
                {t('reset.newPassword')}
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
                placeholder={t('login.passwordPlaceholder')}
              />
              <p className="mt-1 font-mono text-[10px] text-text-3">{t('signup.passwordHint')}</p>
            </div>

            <div>
              <label className="sa-label" htmlFor="confirm">
                {t('reset.confirmPassword')}
              </label>
              <input
                id="confirm"
                className="sa-input"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>

            {error && (
              <div className="rounded-lg border border-brand-red/30 bg-brand-red/10 px-3 py-2 text-xs text-brand-red">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="sa-btn sa-btn-primary mt-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? t('reset.confirmSubmitting') : t('reset.confirmSubmit')}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-text-2">
            <Link to="/login" className="text-brand-blue hover:text-brand-cyan">
              {t('reset.backToLogin')}
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
