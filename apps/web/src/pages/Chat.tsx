import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'

import AppLayout from '@/components/AppLayout'
import HighlightStack, { type Highlight } from '@/components/chat/HighlightStack'
import { apiFetch, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { pickSuggestions } from '@/lib/chat-suggestions'
import { useLocale, useT } from '@/lib/i18n'
import { renderMarkdown } from '@/lib/markdown'

type SaFile = {
  id: string
  filename: string
  mime_type: string
}

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
  | {
      id: string
      role: 'assistant'
      text: string
      sources?: Source[]
      highlights?: Highlight[]
    }
  | { id: string; role: 'assistant'; pending: true }

type AskResponse = {
  answer: string
  model: string
  sources?: Source[]
  highlights?: Highlight[]
  // ID du fil de discussion — créé par le backend au 1er tour, à renvoyer
  // tel quel ensuite pour que l'historique s'accumule. null en cas de
  // workspace absent (fallback exceptionnel).
  conversationId: string | null
}

type ConversationDetail = {
  conversation: { id: string; title: string; created_at: string; updated_at: string }
  messages: Array<{
    id: string
    role: 'user' | 'assistant'
    content: string
    sources: Source[]
    highlights: Highlight[]
    created_at: string
  }>
}

type WorkspaceConnector = {
  id: string
  source: string
  status: 'active' | 'expired' | 'error' | 'disconnected'
}

function nextId() {
  return Math.random().toString(36).slice(2, 10)
}

// localStorage key — la conversation en cours, par workspace, pour qu'un
// refresh / retour sur /chat reprenne là où on en était. On stocke par
// workspace pour ne pas mélanger des conversations entre clients d'une
// agence.
function lastConversationKey(wsId: string | undefined): string | null {
  if (!wsId) return null
  return `sa-chat:last-conversation:${wsId}`
}

export default function ChatPage() {
  const { state } = useAuth()
  const { locale } = useLocale()
  const t = useT()
  const [messages, setMessages] = useState<Message[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Fichier joint à la prochaine requête. Persiste tant que l'user ne
  // l'enlève pas — l'assistant peut s'y référer dans plusieurs échanges.
  const [attachedFileId, setAttachedFileId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  const workspaceId = state.workspaces[0]?.id

  // Charge une conversation par id : fetch + hydrate state + met à jour le
  // localStorage. Utilisé par (a) la reprise auto au mount et (b) la
  // sidebar ConversationPicker qui permet de switcher de fil.
  async function loadConversation(convId: string): Promise<void> {
    if (!workspaceId || !convId) return
    setError(null)
    try {
      const data = await apiFetch<ConversationDetail>(
        `/api/v1/chat/conversations/${convId}?workspaceId=${workspaceId}`,
      )
      setConversationId(data.conversation.id)
      const hydrated: Message[] = data.messages.map((m) =>
        m.role === 'user'
          ? { id: m.id, role: 'user', text: m.content }
          : {
              id: m.id,
              role: 'assistant',
              text: m.content,
              sources: m.sources,
              highlights: m.highlights,
            },
      )
      setMessages(hydrated)
      const key = lastConversationKey(workspaceId)
      if (key) window.localStorage.setItem(key, data.conversation.id)
    } catch {
      // 404 (conv supprimée) ou autre : on clear et on repart fresh.
      const key = lastConversationKey(workspaceId)
      if (key) window.localStorage.removeItem(key)
    }
  }

  // Reprise du fil précédent : au mount, on regarde localStorage pour la
  // dernière conversation de ce workspace. Best-effort.
  useEffect(() => {
    if (!workspaceId) return
    const key = lastConversationKey(workspaceId)
    if (!key) return
    const lastId = window.localStorage.getItem(key)
    if (!lastId) return
    void loadConversation(lastId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  function startNewConversation() {
    setConversationId(null)
    setMessages([])
    setError(null)
    if (workspaceId) {
      const key = lastConversationKey(workspaceId)
      if (key) window.localStorage.removeItem(key)
    }
  }

  // Préfill depuis l'URL — `?q=<question>` posé par Veille, BriefHome…
  // `?file=<id>` posé par Sources/Files. Cleaned aussitôt lu pour éviter
  // un re-fire sur back/forward.
  useEffect(() => {
    const q = searchParams.get('q')
    const fileId = searchParams.get('file')
    if (q || fileId) {
      if (q) setInput(q)
      if (fileId) setAttachedFileId(fileId)
      // Nettoie sans déclencher un fetch (replace, pas push).
      const next = new URLSearchParams(searchParams)
      next.delete('q')
      next.delete('file')
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Métadonnée du fichier joint pour afficher son nom dans la pastille.
  const attachedFileQ = useQuery({
    queryKey: ['files', 'meta', workspaceId, attachedFileId],
    enabled: Boolean(workspaceId && attachedFileId),
    queryFn: async () => {
      const all = await apiFetch<{ files: SaFile[] }>(`/api/v1/files?workspaceId=${workspaceId}`)
      return all.files.find((f) => f.id === attachedFileId) ?? null
    },
    staleTime: 5 * 60_000,
  })

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
  // Insights actifs : 1-2 questions ciblées prependent les suggestions
  // génériques — beaucoup plus pertinent que "Quel est ton MRR ?" quand
  // l'user a déjà un insight "ROAS Meta -28%" qui attend.
  const insightsQ = useQuery({
    queryKey: ['insights', 'list', workspaceId, 'open'],
    enabled: Boolean(workspaceId),
    queryFn: () =>
      apiFetch<{ insights: Array<{ title: string }> }>(
        `/api/v1/insights?workspaceId=${workspaceId}&status=open`,
      ),
    staleTime: 5 * 60_000,
  })
  const activeSources = useMemo(
    () =>
      (connectors.data?.connectors ?? []).filter((c) => c.status === 'active').map((c) => c.source),
    [connectors.data],
  )
  const suggestions = useMemo(
    () =>
      pickSuggestions(activeSources, locale === 'fr' ? 'fr' : 'en', insightsQ.data?.insights ?? []),
    [activeSources, locale, insightsQ.data],
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
        body: {
          message: trimmed,
          workspaceId,
          locale,
          fileIds: attachedFileId ? [attachedFileId] : undefined,
          // Au 1er tour conversationId est null — on OMET la clé du payload
          // pour qu'express-validator ne tente pas de valider `null` comme
          // un UUID (validation côté API stricte). Backend crée le fil et
          // renvoie son ID qu'on persiste pour les tours suivants.
          ...(conversationId ? { conversationId } : {}),
        },
      })
      if (res.conversationId && res.conversationId !== conversationId) {
        setConversationId(res.conversationId)
        if (workspaceId) {
          const key = lastConversationKey(workspaceId)
          if (key) window.localStorage.setItem(key, res.conversationId)
        }
      }
      setMessages((m) =>
        m.map((msg) =>
          msg.id === pendingMsg.id
            ? {
                id: msg.id,
                role: 'assistant',
                text: res.answer,
                sources: res.sources,
                highlights: res.highlights,
              }
            : msg,
        ),
      )
    } catch (err) {
      setMessages((m) => m.filter((msg) => msg.id !== pendingMsg.id))
      setError(mapErrorToMessage(err, t))
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    void send(input)
  }

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-3.5rem)] md:h-screen">
        {/* Sidebar conversations — visible desktop, drawer sur mobile. */}
        {workspaceId && (
          <ConversationSidebar
            workspaceId={workspaceId}
            currentId={conversationId}
            onPick={(id) => void loadConversation(id)}
            onNew={startNewConversation}
          />
        )}

        {/* Colonne chat */}
        <div className="mx-auto flex max-w-3xl flex-1 flex-col px-6 py-8 md:py-10">
          <div className="mb-6 flex-shrink-0">
            <span className="font-mono text-xs uppercase tracking-widest text-brand-cyan">
              {t('chat.kicker')}
            </span>
            <h1 className="mt-2 font-head text-3xl font-bold text-text-1">{t('chat.title')}</h1>
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

          {/* Pastille fichier joint */}
          {attachedFileId && (
            <div className="mt-3 flex flex-shrink-0 items-center gap-2 self-start rounded-full border border-brand-blue-deep/30 bg-brand-blue-dim px-3 py-1.5 text-xs">
              <span className="text-brand-blue-deep">📎</span>
              <span className="max-w-[260px] truncate font-medium text-text-1">
                {attachedFileQ.data?.filename ?? t('chat.attachedFile')}
              </span>
              <button
                type="button"
                onClick={() => setAttachedFileId(null)}
                aria-label={t('chat.removeAttachment')}
                className="ml-1 text-text-3 hover:text-brand-red"
              >
                ✕
              </button>
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
      <div className="max-w-md text-sm leading-relaxed text-text-2">{t('chat.emptyState')}</div>
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
      <div className="flex items-start gap-2.5">
        <AssistantAvatar />
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
      </div>
    )
  }
  const text = 'text' in message ? message.text : ''
  const sources = 'sources' in message ? message.sources || [] : []
  const highlights = 'highlights' in message ? message.highlights || [] : []
  const byId = new Map(sources.map((s) => [s.id, s]))

  return (
    <div className="flex items-start gap-2.5">
      <AssistantAvatar />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-text-3">
          {t('chat.assistant')}
        </div>
        <div className="rounded-2xl rounded-bl-md border border-border bg-bg-2 px-4 py-3 text-sm text-text-1">
          {renderMarkdown(text, (id, key) => renderCitation(id, key, byId))}
        </div>
        {/* Highlights : KPI cards + callouts — extraits par la 2e passe Gemini. */}
        <HighlightStack highlights={highlights} />
        {sources.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-widest text-text-3">
              {t('chat.sources')}
            </span>
            {sources.map((s) => (
              <SourceChip key={s.id} source={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AssistantAvatar() {
  return (
    <div
      aria-hidden="true"
      className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[9px] bg-brand-grad font-head text-sm font-bold text-white shadow-sm"
    >
      ✦
    </div>
  )
}

/**
 * Mappe une erreur API/network vers un message i18n côté chat. Concentre la
 * logique en un seul endroit pour que `send()` reste lisible.
 */
function mapErrorToMessage(err: unknown, t: ReturnType<typeof useT>): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'AI_BUDGET_EXCEEDED':
        return t('chat.error.budget')
      case 'AI_RATE_LIMIT':
        return t('chat.error.rateLimit')
      case 'AI_TIMEOUT':
        return t('chat.error.timeout')
      case 'AI_PROVIDER_DOWN':
        return t('chat.error.providerDown')
      default:
        return err.status === 503 ? err.message : err.message || t('chat.error')
    }
  }
  if (err instanceof Error) return err.message
  return t('chat.error')
}

/**
 * Rend un marqueur de citation [N] :
 *   - bouton cliquable qui scroll vers la pilule source (cas normal)
 *   - span grisé si l'ID ne correspond à rien (modèle a fabriqué le marqueur)
 *
 * Appelé par renderMarkdown au fil de la prose (le markdown s'occupe du
 * **gras**, italique et bullets, on s'occupe juste des [N]).
 */
function renderCitation(id: number, key: string, byId: Map<number, Source>) {
  const src = byId.get(id)
  if (!src) {
    return (
      <span key={key} className="text-text-3">
        [{id}]
      </span>
    )
  }
  return (
    <button
      key={key}
      type="button"
      onClick={() => {
        const el = document.getElementById(`source-${id}`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        el?.animate(
          [{ boxShadow: '0 0 0 2px var(--brand-cyan)' }, { boxShadow: '0 0 0 0 transparent' }],
          { duration: 1200 },
        )
      }}
      className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-brand-cyan/40 bg-brand-cyan/10 px-1 align-super font-mono text-[9px] font-semibold text-brand-cyan transition hover:bg-brand-cyan/20"
      title={`${src.label}: ${src.formattedValue} (${src.providers.join(', ')})`}
    >
      {id}
    </button>
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

// ─── Conversation sidebar — panneau gauche style ChatGPT/Claude ─────────
// 260px desktop, drawer overlay sur mobile (toggle via bouton flottant).
// Liste les 50 fils les plus récents triés par récence (le backend renvoie
// déjà DESC sur updated_at).

type ConvSummary = {
  id: string
  title: string
  created_at: string
  updated_at: string
}

function ConversationSidebar({
  workspaceId,
  currentId,
  onPick,
  onNew,
}: {
  workspaceId: string
  currentId: string | null
  onPick: (id: string) => void
  onNew: () => void
}) {
  const t = useT()
  const { locale } = useLocale()
  // Mobile : drawer ouvert/fermé. Desktop : toujours visible (md:block).
  const [mobileOpen, setMobileOpen] = useState(false)

  const q = useQuery({
    queryKey: ['chat', 'conversations', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () =>
      apiFetch<{ conversations: ConvSummary[] }>(
        `/api/v1/chat/conversations?workspaceId=${workspaceId}`,
      ),
    staleTime: 30_000,
  })

  const conversations = q.data?.conversations ?? []

  // Le panneau lui-même : utilisé pour desktop ET mobile drawer.
  const panel = (
    <aside className="flex h-full w-[260px] flex-shrink-0 flex-col border-r border-border bg-bg-2">
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border p-3">
        <button
          type="button"
          onClick={() => {
            onNew()
            setMobileOpen(false)
          }}
          className="sa-btn sa-btn-primary flex-1 !text-[12.5px]"
          title={t('chat.new.title')}
        >
          + {t('chat.new.cta')}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {q.isLoading && (
          <div className="px-3 py-3 text-xs text-text-3">{t('chat.history.loading')}</div>
        )}
        {!q.isLoading && conversations.length === 0 && (
          <div className="px-3 py-3 text-xs text-text-3">{t('chat.history.empty')}</div>
        )}
        {!q.isLoading && conversations.length > 0 && (
          <ul role="listbox" className="py-1">
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(c.id)
                    setMobileOpen(false)
                  }}
                  aria-selected={c.id === currentId}
                  className={[
                    'flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors',
                    c.id === currentId
                      ? 'bg-brand-blue-dim text-text-1'
                      : 'text-text-2 hover:bg-card hover:text-text-1',
                  ].join(' ')}
                >
                  <span className="line-clamp-1 w-full text-[13px] font-semibold">{c.title}</span>
                  <span className="font-mono text-[10px] text-text-3">
                    {formatRelative(c.updated_at, locale)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )

  return (
    <>
      {/* Desktop : sidebar inline dans le flex parent */}
      <div className="hidden md:flex">{panel}</div>

      {/* Mobile : bouton flottant pour ouvrir le drawer */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-[4.25rem] z-30 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-text-1 shadow-card md:hidden"
        aria-label={t('chat.history.cta')}
      >
        ☰ {t('chat.history.cta')}
      </button>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 flex md:hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMobileOpen(false)
          }}
        >
          <div className="h-full">{panel}</div>
          <div className="flex-1 bg-text-1/40" />
        </div>
      )}
    </>
  )
}

function formatRelative(iso: string, locale: string): string {
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return locale === 'fr' ? "à l'instant" : 'just now'
  if (minutes < 60) return locale === 'fr' ? `il y a ${minutes} min` : `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return locale === 'fr' ? `il y a ${hours} h` : `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return locale === 'fr' ? `il y a ${days} j` : `${days}d ago`
  return d.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'short',
  })
}
