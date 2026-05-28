import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import Brand from '@/components/Brand'
import { useAuth } from '@/lib/auth'
import { type StringKey, useT } from '@/lib/i18n'

// Lands here after Google sign-in. The API redirects to
//   /auth/callback#token=…&refresh_token=…&user=…&workspaces=…
// We parse the fragment (kept out of server logs), seed the auth context,
// then forward to the original return_to or /.

const ERROR_KEY: Record<string, StringKey> = {
  access_denied: 'callback.err.accessDenied',
  GOOGLE_LOGIN_NOT_CONFIGURED: 'callback.err.notConfigured',
  GOOGLE_CODE_EXCHANGE_FAILED: 'callback.err.codeExchange',
  SUPABASE_OAUTH_FAILED: 'callback.err.supabase',
  OAUTH_STATE_INVALID: 'callback.err.stateInvalid',
  OAUTH_STATE_MISSING: 'callback.err.stateMissing',
  missing_code_or_state: 'callback.err.missingCodeOrState',
}

export default function AuthCallback() {
  const { applySession } = useAuth()
  const navigate = useNavigate()
  const t = useT()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const raw = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash

    if (!raw) {
      setError(t('callback.err.missingResponse'))
      return
    }

    const params = new URLSearchParams(raw)
    const errCode = params.get('error')
    if (errCode) {
      const key = ERROR_KEY[errCode]
      setError(key ? t(key) : t('callback.err.generic', { code: errCode }))
      return
    }

    const token = params.get('token')
    const refreshToken = params.get('refresh_token')
    const userJson = params.get('user')
    const workspacesJson = params.get('workspaces')
    const returnTo = params.get('return_to') || '/'

    if (!token || !refreshToken || !userJson) {
      setError(t('callback.err.incompleteResponse'))
      return
    }

    let user: { id: string; email: string; full_name?: string }
    let workspaces: { id: string; name: string; role: string }[] = []
    try {
      user = JSON.parse(userJson)
      workspaces = workspacesJson ? JSON.parse(workspacesJson) : []
    } catch {
      setError(t('callback.err.malformed'))
      return
    }

    applySession({ token, refreshToken, user, workspaces })

    // Wipe the hash so credentials don't linger in history / address bar.
    window.history.replaceState(null, '', window.location.pathname)
    navigate(returnTo, { replace: true })
  }, [applySession, navigate, t])

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6 py-12">
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-10 flex justify-center">
          <Brand />
        </div>
        <div className="sa-card text-center">
          {error ? (
            <>
              <h1 className="font-head text-xl font-bold text-text-1">
                {t('callback.failedTitle')}
              </h1>
              <p className="mt-2 text-sm text-text-2">{error}</p>
              <button
                type="button"
                onClick={() => navigate('/login', { replace: true })}
                className="sa-btn sa-btn-primary mt-5"
              >
                {t('callback.backToLogin')}
              </button>
            </>
          ) : (
            <>
              <h1 className="font-head text-xl font-bold text-text-1">
                {t('callback.signingIn')}
              </h1>
              <p className="mt-2 text-sm text-text-2">{t('callback.oneSec')}</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
