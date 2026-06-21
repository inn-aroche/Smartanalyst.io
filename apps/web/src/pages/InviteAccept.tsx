// Page d'acceptation d'invitation (cahier §3 Lot 4).
//
// L'URL ressemble a `/invite/accept?token=…`. Si l'user n'est pas auth, on le
// redirige vers /login (et il revient ici apres). Sinon on POST le token, on
// rafraichit l'auth state (pour que le nouveau workspace apparaisse) puis on
// navigue vers la home.

import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { apiFetch, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useT } from '@/lib/i18n'

export default function InviteAcceptPage() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const t = useT()
  const navigate = useNavigate()
  const { isAuthenticated, loading, refreshSession } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // Si l'user n'est pas connecte, on le pousse vers /login puis il revient ici.
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate(`/login?next=${encodeURIComponent(`/invite/accept?token=${token}`)}`, {
        replace: true,
      })
    }
  }, [loading, isAuthenticated, navigate, token])

  async function handleAccept() {
    setBusy(true)
    setError(null)
    try {
      await apiFetch<{ workspaceId: string }>('/api/v1/team/accept', {
        method: 'POST',
        body: { token },
      })
      setDone(true)
      // Refresh pour que le workspace fraichement ajoute soit visible.
      try {
        await refreshSession()
      } catch (_) {
        // noop : pas grave si refresh echoue, la home rechargera tout.
      }
      setTimeout(() => navigate('/', { replace: true }), 1200)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'INVITE_EXPIRED') setError(t('invite.accept.error.expired'))
        else if (err.code === 'INVITE_NOT_PENDING') setError(t('invite.accept.error.notPending'))
        else if (err.code === 'EMAIL_MISMATCH') setError(t('invite.accept.error.emailMismatch'))
        else setError(err.message || t('invite.accept.error.generic'))
      } else {
        setError(t('invite.accept.error.generic'))
      }
    } finally {
      setBusy(false)
    }
  }

  if (loading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="font-mono text-xs uppercase tracking-widest text-text-3">Loading…</span>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6">
      <div className="w-full rounded-[14px] border border-border bg-card p-6 shadow-card">
        <span className="font-mono text-[10px] uppercase tracking-widest text-brand-cyan">
          SmartAnalyst
        </span>
        <h1 className="mt-2 font-head text-2xl font-bold text-text-1">
          {t('invite.accept.title')}
        </h1>
        <p className="mt-2 text-sm text-text-2">{t('invite.accept.body')}</p>

        {done ? (
          <div className="mt-5 rounded-[10px] border border-brand-green/30 bg-brand-green/10 p-3 text-sm text-brand-green">
            {t('invite.accept.success')}
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void handleAccept()}
              disabled={busy || !token}
              className="sa-btn sa-btn-primary mt-5 w-full disabled:opacity-60"
            >
              {busy ? t('invite.accept.busy') : t('invite.accept.cta')}
            </button>
            {error && (
              <div className="mt-3 rounded-[8px] border border-brand-red/30 bg-brand-red/10 p-3 text-sm text-brand-red">
                {error}
              </div>
            )}
          </>
        )}

        <div className="mt-4 text-center">
          <Link to="/" className="text-xs text-text-3 hover:text-text-1">
            ← Home
          </Link>
        </div>
      </div>
    </div>
  )
}
