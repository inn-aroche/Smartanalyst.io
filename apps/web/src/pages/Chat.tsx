import { type FormEvent, useEffect, useRef, useState } from 'react'

import AppLayout from '@/components/AppLayout'
import { apiFetch, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { type StringKey, useLocale, useT } from '@/lib/i18n'

type Message =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; text: string }
  | { id: string; role: 'assistant'; pending: true }

type AskResponse = { answer: string; model: string }

const SUGGESTION_KEYS: StringKey[] = [
  'chat.suggestion1',
  'chat.suggestion2',
  'chat.suggestion3',
]

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
            ? { id: msg.id, role: 'assistant', text: res.answer }
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
            <EmptyState onPick={(s) => void send(s)} />
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

function EmptyState({ onPick }: { onPick: (s: string) => void }) {
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
          {SUGGESTION_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onPick(t(key))}
              className="rounded-full border border-border bg-bg-2 px-4 py-2 text-sm text-text-2 transition hover:border-brand-blue-deep hover:text-text-1"
            >
              {t(key)}
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
  return (
    <div className="flex flex-col gap-1.5">
      <div className="font-mono text-[10px] uppercase tracking-widest text-text-3">
        {t('chat.assistant')}
      </div>
      <div className="self-start whitespace-pre-wrap rounded-2xl rounded-bl-md border border-border bg-bg-2 px-4 py-3 text-sm leading-relaxed text-text-1">
        {'text' in message ? message.text : ''}
      </div>
    </div>
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
