import { useState } from 'react'

import { apiFetch } from '@/lib/api'
import { useT } from '@/lib/i18n'

type Props = {
  /** Where to send the user after a successful sign-in. Default: '/' */
  returnTo?: string
  label?: string
}

export default function GoogleSignInButton({ returnTo = '/', label }: Props) {
  const t = useT()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    setError(null)
    setLoading(true)
    try {
      const params = new URLSearchParams({ returnTo })
      const res = await apiFetch<{ authorize_url: string }>(
        `/api/v1/auth/google/start?${params.toString()}`,
        { auth: false },
      )
      window.location.href = res.authorize_url
    } catch (err) {
      setLoading(false)
      setError(err instanceof Error ? err.message : t('login.googleStartError'))
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={start}
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-bg-2 px-4 py-2.5 text-sm font-medium text-text-1 transition hover:border-border-bright hover:bg-card disabled:cursor-not-allowed disabled:opacity-60"
      >
        <GoogleIcon />
        {loading ? t('login.googleRedirecting') : (label ?? t('login.googleButton'))}
      </button>
      {error && (
        <div className="rounded-lg border border-brand-red/30 bg-brand-red/10 px-3 py-2 text-xs text-brand-red">
          {error}
        </div>
      )}
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.614z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  )
}

function OrSeparator() {
  const t = useT()
  return (
    <div className="my-5 flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-text-3">
      <div className="h-px flex-1 bg-border" />
      <span>{t('common.or')}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

export { OrSeparator }
