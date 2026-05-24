import { type FormEvent, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

import Brand from '@/components/Brand'
import { useAuth } from '@/lib/auth'

export default function Signup() {
  const { signup, isAuthenticated } = useAuth()
  const navigate = useNavigate()

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
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6 py-12">
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-10 flex justify-center">
          <Brand />
        </div>
        <div className="sa-card">
          <h1 className="font-head text-2xl font-bold text-text-1">
            Create your workspace.
          </h1>
          <p className="mt-1 text-sm text-text-2">
            Get started in under a minute.
          </p>

          <form className="mt-7 flex flex-col gap-4" onSubmit={handleSubmit}>
            <div>
              <label className="sa-label" htmlFor="organization">
                Organization name
              </label>
              <input
                id="organization"
                className="sa-input"
                type="text"
                required
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder="Acme Inc."
              />
            </div>
            <div>
              <label className="sa-label" htmlFor="email">
                Work email
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
                autoComplete="new-password"
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 12 characters"
              />
              <p className="mt-1.5 font-mono text-[11px] text-text-3">
                12+ characters. Use a passphrase you'll remember.
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
              {submitting ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-text-2">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-blue hover:text-brand-cyan">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
