// Widget de chat flottant — accessible partout dans l'app authentifiée.
// Bouton bulle en bas à droite ; au clic, ouvre un panel modal (drawer
// sur desktop, plein écran sur mobile). Utilise le même endpoint
// /api/v1/chat/ask que la page /chat — pas de refactor de l'existant pour
// l'instant ; ChatPanel pourra être extrait en composant partagé plus tard.

import { type FormEvent, useEffect, useRef, useState } from 'react'

import { ApiError, apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useLocale, useT } from '@/lib/i18n'

type Message =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; text: string }
  | { id: string; role: 'assistant'; pending: true }

type AskResponse = { answer: string; model: string }

const STORAGE_KEY = 'smartanalyst.chatwidget.open'

function nextId() {
  return Math.random().toString(36).slice(2, 10)
}

export default function ChatWidget() {
  const t = useT()
  const { state } = useAuth()
  const { locale } = useLocale()
  const workspaceId = state.workspaces[0]?.id

  // L'état "open" est persisté en sessionStorage pour ne pas se refermer
  // entre 2 navigations à l'intérieur de l'app SPA.
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return sessionStorage.getItem(STORAGE_KEY) === '1'
  })
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, open ? '1' : '0')
    if (open) {
      // Focus le input à l'ouverture pour qu'on puisse taper direct.
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  // Échap ferme le panel
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

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
      // Strip les marqueurs de citation [N] dans le widget compact — pas la
      // place d'afficher les pilules sources ici. Le user peut ouvrir la
      // page Chat pleine pour voir les citations en clair.
      const cleanAnswer = res.answer.replace(/\s?\[\d+\](?!\w)/g, '')
      setMessages((m) =>
        m.map((msg) =>
          msg.id === pendingMsg.id ? { id: msg.id, role: 'assistant', text: cleanAnswer } : msg,
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

  // Si pas authentifié (auth state encore vide), on n'affiche pas le widget.
  if (!workspaceId) return null

  return (
    <>
      {/* Bouton flottant */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? t('chatWidget.close') : t('chatWidget.open')}
        aria-expanded={open}
        className={`fixed bottom-5 right-5 z-50 flex h-13 w-13 items-center justify-center rounded-full border border-brand-cyan/40 bg-gradient-to-br from-brand-blue to-brand-cyan text-white shadow-lg shadow-brand-blue/30 transition-transform hover:scale-105 active:scale-95 ${
          open ? 'rotate-45' : ''
        }`}
        style={{ width: 52, height: 52 }}
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path
              d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-label={t('chatWidget.title')}
          className="fixed inset-0 z-40 flex items-end justify-end sm:p-5"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div className="flex h-[88vh] w-full flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:h-[600px] sm:max-h-[80vh] sm:w-[400px] sm:rounded-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <div className="font-head text-sm font-semibold text-text-1">
                  {t('chatWidget.title')}
                </div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-text-3">
                  {t('chat.assistant')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('chatWidget.close')}
                className="text-text-3 hover:text-text-1"
              >
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
              {messages.length === 0 && (
                <div className="text-center text-sm text-text-2">
                  <div className="mb-3 text-text-1">{t('chatWidget.greeting')}</div>
                  <div className="space-y-1.5 text-left">
                    <SuggestionRow text={t('chat.suggestion1')} onClick={() => void send(t('chat.suggestion1'))} />
                    <SuggestionRow text={t('chat.suggestion2')} onClick={() => void send(t('chat.suggestion2'))} />
                    <SuggestionRow text={t('chat.suggestion3')} onClick={() => void send(t('chat.suggestion3'))} />
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {messages.map((m) => (
                  <MessageBubble key={m.id} message={m} />
                ))}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="border-t border-brand-red/20 bg-brand-red/5 px-4 py-2 text-xs text-brand-red">
                {error}
              </div>
            )}

            {/* Input */}
            <form onSubmit={handleSubmit} className="flex gap-2 border-t border-border p-3">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t('chat.placeholder')}
                disabled={pending}
                className="flex-1 rounded-md border border-border bg-bg-1 px-3 py-2 text-sm text-text-1 placeholder:text-text-3 focus:border-brand-cyan focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={pending || !input.trim()}
                className="sa-btn sa-btn-primary !text-xs disabled:opacity-50"
              >
                {pending ? '…' : t('chat.send')}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const t = useT()
  if ('pending' in message && message.pending) {
    return (
      <div className="flex justify-start">
        <div className="rounded-2xl bg-bg-1 px-3 py-2 text-sm text-text-3">
          <span className="animate-pulse">{t('chat.thinking')}</span>
        </div>
      </div>
    )
  }
  // À ce point on a forcément un message avec text (typescript narrowing
  // a écarté la variante pending).
  const textMsg = message as { id: string; role: 'user' | 'assistant'; text: string }
  const isUser = textMsg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
          isUser ? 'bg-brand-blue/20 text-text-1' : 'bg-bg-1 text-text-1'
        }`}
      >
        {textMsg.text}
      </div>
    </div>
  )
}

function SuggestionRow({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-md border border-border bg-bg-1 px-3 py-2 text-left text-xs text-text-2 transition-colors hover:border-brand-cyan/40 hover:text-text-1"
    >
      {text}
    </button>
  )
}
