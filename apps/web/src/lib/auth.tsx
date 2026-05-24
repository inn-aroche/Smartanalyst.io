import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { apiFetch, setAuthToken } from './api'

type User = {
  id: string
  email: string
  full_name?: string
}

type Workspace = {
  id: string
  name: string
  role: string
}

type AuthState = {
  token: string | null
  refreshToken: string | null
  user: User | null
  workspaces: Workspace[]
}

type LoginResponse = {
  token: string
  refreshToken: string
  user: User
  workspaces?: Workspace[]
}

type SignupResponse = LoginResponse

const STORAGE_KEY = 'smartanalyst.auth'

function readStored(): AuthState {
  if (typeof window === 'undefined') return emptyState()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw) as Partial<AuthState>
    return {
      token: parsed.token ?? null,
      refreshToken: parsed.refreshToken ?? null,
      user: parsed.user ?? null,
      workspaces: parsed.workspaces ?? [],
    }
  } catch {
    return emptyState()
  }
}

function emptyState(): AuthState {
  return { token: null, refreshToken: null, user: null, workspaces: [] }
}

type AuthContextValue = {
  state: AuthState
  isAuthenticated: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (input: {
    email: string
    password: string
    organizationName: string
  }) => Promise<void>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(readStored)
  const [loading, setLoading] = useState<boolean>(true)

  // Keep the API client in sync with the current token.
  useEffect(() => {
    setAuthToken(state.token)
  }, [state.token])

  const persist = useCallback((next: AuthState) => {
    setState(next)
    if (next.token) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  // On boot, if we have a token, verify it via /me and pull fresh workspaces.
  useEffect(() => {
    let cancelled = false
    async function boot() {
      if (!state.token) {
        setLoading(false)
        return
      }
      try {
        const me = await apiFetch<{ user: User; workspaces: Workspace[] }>(
          '/api/v1/auth/me',
        )
        if (cancelled) return
        persist({
          token: state.token,
          refreshToken: state.refreshToken,
          user: me.user,
          workspaces: me.workspaces ?? [],
        })
      } catch {
        if (cancelled) return
        persist(emptyState())
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void boot()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await apiFetch<LoginResponse>('/api/v1/auth/login', {
        method: 'POST',
        body: { email, password },
        auth: false,
      })
      persist({
        token: res.token,
        refreshToken: res.refreshToken,
        user: res.user,
        workspaces: res.workspaces ?? [],
      })
    },
    [persist],
  )

  const signup = useCallback(
    async ({
      email,
      password,
      organizationName,
    }: {
      email: string
      password: string
      organizationName: string
    }) => {
      const res = await apiFetch<SignupResponse>('/api/v1/auth/signup', {
        method: 'POST',
        body: {
          email,
          password,
          organization_name: organizationName,
        },
        auth: false,
      })
      persist({
        token: res.token,
        refreshToken: res.refreshToken,
        user: res.user,
        workspaces: res.workspaces ?? [],
      })
    },
    [persist],
  )

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/v1/auth/logout', { method: 'POST' })
    } catch {
      // best-effort; even if the API call fails we still drop local state
    }
    persist(emptyState())
  }, [persist])

  const refreshSession = useCallback(async () => {
    if (!state.refreshToken) return
    try {
      const res = await apiFetch<LoginResponse>('/api/v1/auth/refresh', {
        method: 'POST',
        body: { refreshToken: state.refreshToken },
        auth: false,
      })
      persist({
        token: res.token,
        refreshToken: res.refreshToken,
        user: res.user,
        workspaces: res.workspaces ?? state.workspaces,
      })
    } catch {
      persist(emptyState())
    }
  }, [persist, state.refreshToken, state.workspaces])

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      isAuthenticated: Boolean(state.token),
      loading,
      login,
      signup,
      logout,
      refreshSession,
    }),
    [state, loading, login, signup, logout, refreshSession],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
