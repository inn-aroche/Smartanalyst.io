import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import Brand from '@/components/Brand'
import { useAuth } from '@/lib/auth'

// Lands here after Google sign-in. The API redirects to
//   /auth/callback#token=…&refresh_token=…&user=…&workspaces=…
// We parse the fragment (kept out of server logs), seed the auth context,
// then forward to the original return_to or /.

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'Tu as refusé l’accès Google.',
  GOOGLE_LOGIN_NOT_CONFIGURED:
    'La connexion Google n’est pas encore activée côté serveur.',
  GOOGLE_CODE_EXCHANGE_FAILED:
    'Google a refusé le code d’autorisation. Réessaie.',
  SUPABASE_OAUTH_FAILED:
    'Supabase a refusé la session Google. Vérifie que le provider est activé.',
  OAUTH_STATE_INVALID: 'Le lien a expiré. Réessaie depuis la page de connexion.',
  OAUTH_STATE_MISSING: 'Lien invalide. Réessaie.',
  missing_code_or_state: 'Réponse Google invalide. Réessaie.',
}

export default function AuthCallback() {
  const { applySession } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const raw = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash

    if (!raw) {
      setError('Réponse manquante.')
      return
    }

    const params = new URLSearchParams(raw)
    const errCode = params.get('error')
    if (errCode) {
      setError(ERROR_MESSAGES[errCode] || `Erreur Google : ${errCode}`)
      return
    }

    const token = params.get('token')
    const refreshToken = params.get('refresh_token')
    const userJson = params.get('user')
    const workspacesJson = params.get('workspaces')
    const returnTo = params.get('return_to') || '/'

    if (!token || !refreshToken || !userJson) {
      setError('Réponse incomplète. Réessaie.')
      return
    }

    let user: { id: string; email: string; full_name?: string }
    let workspaces: { id: string; name: string; role: string }[] = []
    try {
      user = JSON.parse(userJson)
      workspaces = workspacesJson ? JSON.parse(workspacesJson) : []
    } catch {
      setError('Réponse mal formée.')
      return
    }

    applySession({ token, refreshToken, user, workspaces })

    // Wipe the hash so credentials don't linger in history / address bar.
    window.history.replaceState(null, '', window.location.pathname)
    navigate(returnTo, { replace: true })
  }, [applySession, navigate])

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
                Connexion Google échouée
              </h1>
              <p className="mt-2 text-sm text-text-2">{error}</p>
              <button
                type="button"
                onClick={() => navigate('/login', { replace: true })}
                className="sa-btn sa-btn-primary mt-5"
              >
                Retour à la connexion
              </button>
            </>
          ) : (
            <>
              <h1 className="font-head text-xl font-bold text-text-1">
                Signing you in…
              </h1>
              <p className="mt-2 text-sm text-text-2">One sec.</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
