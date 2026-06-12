// Fetch wrapper for the SmartAnalyst API.
// - Reads the JWT from the AuthProvider (passed in via setAuthToken).
// - Base URL comes from VITE_API_URL at build time; empty in dev so the Vite
//   proxy can forward /api → http://localhost:3000.

const BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

let currentToken: string | null = null
export function setAuthToken(token: string | null) {
  currentToken = token
}

export class ApiError extends Error {
  status: number
  body: unknown
  code: string | null
  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.status = status
    this.body = body
    // Extract the error.code from the standard API error envelope so callers
    // can switch on it (e.g. BETA_LOCKED → redirect to /beta-locked).
    const err = (body as { error?: unknown })?.error
    this.code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code: string }).code)
        : null
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  auth?: boolean
}

export async function apiFetch<T>(
  path: string,
  { method = 'GET', body, signal, auth = true }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth && currentToken) headers.Authorization = `Bearer ${currentToken}`

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })

  const text = await res.text()
  const parsed = text ? safeJson(text) : null

  if (!res.ok) {
    const errorField = (parsed as { error?: unknown })?.error
    const message =
      (typeof errorField === 'object' && errorField !== null
        ? (errorField as { message?: string }).message
        : typeof errorField === 'string'
          ? errorField
          : undefined) ??
      (parsed as { message?: string })?.message ??
      `${res.status} ${res.statusText}`
    throw new ApiError(message, res.status, parsed)
  }
  return parsed as T
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
