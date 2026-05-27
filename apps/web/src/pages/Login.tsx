import { type FormEvent, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'

import Brand from '@/components/Brand'
import GoogleSignInButton, { OrSeparator } from '@/components/GoogleSignInButton'
import { useAuth } from '@/lib/auth'

type LocationState = { from?: string }

export default function Login() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
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
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6 py-12">
      <BackgroundGlow />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-10 flex justify-center">
          <Brand />
        </div>
        <div className="sa-card">
          <h1 className="font-head text-2xl font-bold text-text-1">
            Welcome back.
          </h1>
          <p className="mt-1 text-sm text-text-2">
            Sign in to your SmartAnalyst workspace.
          </p>

          <div className="mt-7">
            <GoogleSignInButton returnTo={redirectTo} />
          </div>

          <OrSeparator />

          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div>
              <label className="sa-label" htmlFor="email">
                Email
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
            <div>
              <label className="sa-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                className="sa-input"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
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
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-text-2">
            New to SmartAnalyst?{' '}
            <Link
              to="/signup"
              className="text-brand-blue hover:text-brand-cyan"
            >
              Create an account
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
        className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-[520px] w-[520px] -translate-x-1/2 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(61,130,255,0.18) 0%, transparent 70%)',
        }}
      />
      <div
        className="pointer-events-none absolute bottom-0 right-0 -z-10 h-[420px] w-[420px] rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(34,211,238,0.10) 0%, transparent 70%)',
        }}
      />
    </>
  )
}
