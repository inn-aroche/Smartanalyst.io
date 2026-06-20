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
  // ID stable de la requête côté serveur, propagé via le header `X-Request-Id`
  // ET le champ `error.requestId` du body. Permet à un user de coller cet ID
  // dans un ticket support pour qu'on retrouve la trace en O(1).
  requestId: string | null
  constructor(message: string, status: number, body: unknown, requestId: string | null = null) {
    super(message)
    this.status = status
    this.body = body
    this.requestId = requestId
    // Extract the error.code from the standard API error envelope so callers
    // can switch on it (e.g. BETA_LOCKED → redirect to /beta-locked).
    const err = (body as { error?: unknown })?.error
    this.code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code: string }).code)
        : null
    // Body peut aussi contenir le requestId (cas d'une réponse JSON valide).
    if (
      !requestId &&
      typeof err === 'object' &&
      err !== null &&
      'requestId' in err &&
      typeof (err as { requestId: unknown }).requestId === 'string'
    ) {
      this.requestId = (err as { requestId: string }).requestId
    }
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
    // requestId : on lit le header en priorité (toujours posé par le
    // middleware côté API, même quand le body n'est pas JSON / vide).
    throw new ApiError(message, res.status, parsed, res.headers.get('X-Request-Id'))
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

// ─── Server-Sent Events (SSE) — chat streaming (cahier §3 Lot 1) ────────
//
// Pourquoi pas EventSource natif : il ne supporte que GET. Le streaming
// chat exige POST (body avec message + workspaceId + fileIds). On utilise
// donc fetch + ReadableStream + parser SSE maison (~30 lignes, vs ajouter
// une dépendance npm).
//
// Format SSE consommé (compatible spec) :
//   event: <name>\n
//   data: <json>\n\n
// Les lignes ":" (commentaires de heartbeat) sont ignorées.

export type StreamEvent = { event: string; data: unknown }

type StreamOptions = {
  body: unknown
  signal?: AbortSignal
  onEvent: (ev: StreamEvent) => void
}

export async function apiStream(path: string, opts: StreamOptions): Promise<void> {
  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
  }
  if (currentToken) headers.Authorization = `Bearer ${currentToken}`

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(opts.body),
    signal: opts.signal,
  })

  if (!res.ok) {
    // Erreur AVANT le démarrage du stream (401, 429, validation, etc.) :
    // on lit le body comme JSON classique et on rebascule sur ApiError.
    const text = await res.text()
    const parsed = text ? safeJson(text) : null
    const errorField = (parsed as { error?: unknown })?.error
    const message =
      (typeof errorField === 'object' && errorField !== null
        ? (errorField as { message?: string }).message
        : typeof errorField === 'string'
          ? errorField
          : undefined) ?? `${res.status} ${res.statusText}`
    throw new ApiError(message, res.status, parsed, res.headers.get('X-Request-Id'))
  }

  if (!res.body) {
    throw new ApiError('Stream sans body', 502, null)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // Sépare les events sur le double saut de ligne (terminator SSE).
    let sepIdx
    while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, sepIdx)
      buffer = buffer.slice(sepIdx + 2)
      const parsed = parseSseBlock(rawEvent)
      if (parsed) opts.onEvent(parsed)
    }
  }
}

function parseSseBlock(block: string): StreamEvent | null {
  let eventName = 'message'
  const dataLines: string[] = []
  for (const line of block.split('\n')) {
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim())
    }
  }
  if (dataLines.length === 0) return null
  const dataStr = dataLines.join('\n')
  let data: unknown = dataStr
  try {
    data = JSON.parse(dataStr)
  } catch {
    // garde le texte brut si non-JSON (rare)
  }
  return { event: eventName, data }
}
