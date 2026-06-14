import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import AppLayout from '@/components/AppLayout'
import { apiFetch, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { pickSuggestions } from '@/lib/chat-suggestions'
import { useLocale, useT } from '@/lib/i18n'

type Source = {
  id: number
  metricKey: string
  label: string
  providers: string[]
  value: number
  formattedValue: string
  unit: string
  kind: 'snapshot' | 'sum'
  dateRef: string
  rowCount: number
}

type Message =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; text: string; sources?: Source[] }
  | { id: string; role: 'assistant'; pending: true }

type AskResponse = { answer: string; model: string; sources?: Source[] }

type WorkspaceConnector = {
  id: string
  source: string
  status: 'active' | 'expired' | 'error' | 'disconnected'
}

function nextId() {
  return Math.random().toString(36).slice(2, 10)
}

export default function ChatPage() {
  const { state } = useAuth()
  const { locale } = useLocale()
  const t = useT()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const workspaceId = state.workspaces[0]?.id

  // Suggestions adaptées aux sources connectées (cache 5min, fallback silencieux).
  const connectors = useQuery({
    queryKey: ['connectors', 'list', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () =>
      apiFetch<{ connectors: WorkspaceConnector[] }>(
        `/api/v1/connectors?workspaceId=${workspaceId}`,
      ),
    staleTime: 5 * 60_000,
  })
  const activeSources = useMemo(
    () =>
      (connectors.data?.connectors ?? [])
        .filter((c) => c.status === 'active')
        .map((c) => c.source),
    [connectors.data],
  )
  const suggestions = useMemo(
    () => pickSuggestions(activeSources, locale === 'fr' ? 'fr' : 'en'),
    [activeSources, locale],
  )

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const pending = messages.some(
    (m): m is { id: string; role: 'assistant'; pending: true } =>
      m.role === 'assistant' && 'pending' in m && m.pending === true,
  )

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || pending) return

    setError(null)
    setInput('')
    const userMsg: Message = { id: nextId(), role: 'user', text: trimmed }
    const pendingMsg: Message = { id: nextId(), role: 'assistant', pending: true }
    setMessages((m) => [...m, userMsg, pendingMsg])

    try {
      const res = await apiFetch<AskResponse>('/api/v1/chat/ask', {
        method: 'POST',
        body: { message: trimmed, workspaceId, locale },
      })
      setMessages((m) =>
        m.map((msg) =>
          msg.id === pendingMsg.id
            ? { id: msg.id, role: 'assistant', text: res.answer, sources: res.sources }
            : msg,
        ),
      )
    } catch (err) {
      setMessages((m) => m.filter((msg) => msg.id !== pendingMsg.id))
      setError(
        err instanceof ApiError && err.status === 503
          ? err.message
          : err instanceof Error
            ? err.message
            : t('chat.error'),
      )
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    void send(input)
  }

  return (
    <AppLayout>
      <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-3xl flex-col px-6 py-8 md:h-screen md:py-10">
        <div className="mb-6 flex-shrink-0">
          <span className="font-mono text-xs uppercase tracking-widest text-brand-cyan">
            {t('chat.kicker')}
          </span>
          <h1 className="mt-2 font-head text-3xl font-bold text-text-1">
            {t('chat.title')}
          </h1>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-card"
        >
          {messages.length === 0 ? (
            <EmptyState onPick={(s) => void send(s)} suggestions={suggestions} />
          ) : (
            <div className="flex flex-col gap-5">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="mt-3 flex-shrink-0 rounded-lg border border-brand-red/30 bg-brand-red/10 px-3 py-2 text-sm text-brand-red">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 flex flex-shrink-0 gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('chat.placeholder')}
            className="sa-input flex-1"
            disabled={pending}
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            className="sa-btn sa-btn-primary !px-6 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? t('chat.thinking') : t('chat.send')}
          </button>
        </form>
      </div>
    </AppLayout>
  )
}

function EmptyState({
  onPick,
  suggestions,
}: {
  onPick: (s: string) => void
  suggestions: string[]
}) {
  const t = useT()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
      <div className="max-w-md text-sm leading-relaxed text-text-2">
        {t('chat.emptyState')}
      </div>
      <div className="flex flex-col items-center gap-3">
        <div className="font-mono text-[11px] uppercase tracking-widest text-text-3">
          {t('chat.suggestions')}
        </div>
        <div className="flex flex-col items-center gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPick(s)}
              className="rounded-full border border-border bg-bg-2 px-4 py-2 text-sm text-text-2 transition hover:border-brand-blue-deep hover:text-text-1"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const t = useT()
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-brand-blue-deep px-4 py-2.5 text-sm text-white shadow-sm">
          {message.text}
        </div>
      </div>
    )
  }
  // Assistant
  if ('pending' in message && message.pending) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="font-mono text-[10px] uppercase tracking-widest text-text-3">
          {t('chat.assistant')}
        </div>
        <div className="inline-flex items-center gap-1.5 self-start rounded-2xl rounded-bl-md border border-border bg-bg-2 px-4 py-3">
          <Dot delay="0s" />
          <Dot delay="0.18s" />
          <Dot delay="0.36s" />
        </div>
      </div>
    )
  }
  const text = 'text' in message ? message.text : ''
  const sources = 'sources' in message ? message.sources || [] : []
  const byId = new Map(sources.map((s) => [s.id, s]))

  return (
    <div className="flex flex-col gap-1.5">
      <div className="font-mono text-[10px] uppercase tracking-widest text-text-3">
        {t('chat.assistant')}
      </div>
      <div className="self-start whitespace-pre-wrap rounded-2xl rounded-bl-md border border-border bg-bg-2 px-4 py-3 text-sm leading-relaxed text-text-1">
        {renderWithCitations(text, byId)}
      </div>
      {sources.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5 self-start">
          <span className="font-mono text-[10px] uppercase tracking-widest text-text-3">
            {t('chat.sources')}
          </span>
          {sources.map((s) => (
            <SourceChip key={s.id} source={s} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Découpe le texte autour des marqueurs [N] et remplace chaque marqueur par
 * un span superscript cliquable qui scroll vers la pilule source en dessous.
 * Si l'ID est inconnu (modèle a fabriqué un marqueur), on laisse en clair.
 */
function renderWithCitations(text: string, byId: Map<number, Source>) {
  const parts: Array<string | { id: number; key: string }> = []
  const re = /\[(\d+)\](?!\w)/g
  let lastIndex = 0
  let m
  let k = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index))
    const id = Number(m[1])
    parts.push({ id, key: `cite-${k++}-${m.index}` })
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))

  return (
    <>
      {parts.map((p, i) => {
        if (typeof p === 'string') return <span key={i}>{p}</span>
        const src = byId.get(p.id)
        if (!src) {
          // ID fabriqué → on garde le marqueur tel quel (signale au user que ce n'est pas une vraie source)
          return (
            <span key={p.key} className="text-text-3">
              [{p.id}]
            </span>
          )
        }
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              const el = document.getElementById(`source-${p.id}`)
              el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
              el?.animate(
                [
                  { boxShadow: '0 0 0 2px var(--brand-cyan)' },
                  { boxShadow: '0 0 0 0 transparent' },
                ],
                { duration: 1200 },
              )
            }}
            className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-1 align-super font-mono text-[9px] font-semibold text-brand-cyan transition hover:bg-brand-cyan/20"
            title={`${src.label}: ${src.formattedValue} (${src.providers.join(', ')})`}
          >
            {p.id}
          </button>
        )
      })}
    </>
  )
}

function SourceChip({ source }: { source: Source }) {
  return (
    <span
      id={`source-${source.id}`}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-2 px-2 py-1 text-[11px] text-text-2"
      title={`${source.kind === 'snapshot' ? 'Snapshot' : 'Sum'} ${source.dateRef}`}
    >
      <span className="inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-brand-cyan/15 px-1 font-mono text-[9px] font-semibold text-brand-cyan">
        {source.id}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-3">
        {source.providers.join(', ')}
      </span>
      <span className="text-text-1">{source.label}</span>
      <span className="font-mono text-text-2">{source.formattedValue}</span>
    </span>
  )
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-text-3"
      style={{ animationDelay: delay, animationDuration: '1.2s' }}
    />
  )
}
