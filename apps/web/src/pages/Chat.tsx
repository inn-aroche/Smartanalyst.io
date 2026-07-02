import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'

import AppLayout from '@/components/AppLayout'
import ActionShelf from '@/components/chat/ActionShelf'
import ChatComposer from '@/components/chat/ChatComposer'
import EmptyStateHero, { useRotatingPlaceholder } from '@/components/chat/EmptyStateHero'
import HighlightStack, { type Highlight } from '@/components/chat/HighlightStack'
import { type SourceOption } from '@/components/chat/SourceFilter'
import ToolBadge, {
  pickSkeletonKinds,
  useRunningTools,
  VisualSkeleton,
} from '@/components/chat/ToolBadge'
import { apiFetch, apiStream, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useLocale, useT } from '@/lib/i18n'
import { useEntitlements } from '@/lib/use-entitlements'
import { renderMarkdown } from '@/lib/markdown'
import { SOURCE_LABELS } from '@/lib/sources'
import { track } from '@/lib/tracking'

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
      // `streaming` = true tant qu'on reçoit des deltas SSE. Bascule à false
      // au moment du 'done'. Permet à l'UI d'afficher un curseur clignotant
      // pendant la frappe.
      streaming?: boolean
      // Lot V2.2 — ID Supabase du message persiste. Necessaire pour appeler
      // /chat/messages/:id/export.xlsx. null pendant le streaming, recu au
      // 'done' depuis le backend.
      serverMessageId?: string | null
    }
  | { id: string; role: 'assistant'; pending: true }

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

// Libelles des sources : partages avec le wizard de rapports (lib/sources.ts).

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
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const heroPlaceholder = useRotatingPlaceholder()
  const [messages, setMessages] = useState<Message[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [modeDowngraded, setModeDowngraded] = useState(false)
  const [budgetExceeded, setBudgetExceeded] = useState(false)
  const lastInputRef = useRef<string>('')
  // Fichier joint à la prochaine requête. Persiste tant que l'user ne
  // l'enlève pas — l'assistant peut s'y référer dans plusieurs échanges.
  const [attachedFileId, setAttachedFileId] = useState<string | null>(null)
  // Chip "filtre sources" (cahier 22b §3.2). Persiste dans localStorage
  // par workspace — un user qui taffe sur Meta veut rester focus dessus.
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  // Trace des tool events SSE pour les badges "🔌 Lecture GA4…" pendant
  // le streaming. Reset a chaque nouveau message.
  const [toolEvents, setToolEvents] = useState<Array<{ name: string; status: 'running' | 'done' }>>(
    [],
  )
  const runningTools = useRunningTools(toolEvents)
  // Feedback transient ("Épinglé !", "Erreur…") affiche en haut de la
  // colonne chat 2.5s puis disparait. Pas de toast provider pour eviter
  // de refactor ChatPage en sub-component dans AppLayout.
  const [pinFeedback, setPinFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  // Toggle Rapide/Approfondi (cahier ADR-04). Persiste dans localStorage
  // pour qu'un user qui préfère "Approfondi" ne reswitche pas à chaque
  // ouverture. Jamais "Gemini"/"Claude" exposés en UI (terminologie CLAUDE.md).
  const [mode, setMode] = useState<'fast' | 'deep'>(() => {
    if (typeof window === 'undefined') return 'fast'
    const stored = window.localStorage.getItem('sa-chat:mode')
    return stored === 'deep' ? 'deep' : 'fast'
  })
  // AbortController du stream en cours — permet le bouton "Stop".
  const abortRef = useRef<AbortController | null>(null)
  // Feedback par message (en mémoire pour l'instant — persist API à brancher).
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down'>>({})
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
              // Pour les messages reloads depuis l'historique, l'ID local =
              // l'ID Supabase (pas de generation client-side). On le branche
              // donc directement pour permettre l'export XLSX.
              serverMessageId: m.id,
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
  // Options pour le picker SourceFilter (label lisible derive de la cle).
  const sourceOptions: SourceOption[] = useMemo(
    () => activeSources.map((src) => ({ key: src, label: SOURCE_LABELS[src] || src })),
    [activeSources],
  )
  // Reference a insightsQ pour ne pas casser le contrat de queries paralleles.
  void insightsQ
  // Plan Pro pour gating action shelf (Pin / Slides). Starter NE compte PAS
  // comme Pro (cf. entitlements.service : Starter a ses propres quotas et n'a
  // pas pin_to_dashboard ni generate_slides). On lit directement les feature
  // flags retournes par le backend pour ne pas dupliquer la logique de plan.
  const entitlementsQ = useEntitlements()
  const isPro = Boolean(entitlementsQ.data?.features.canPinToDashboard)
  const deepLocked = entitlementsQ.data?.features.canUseDeepChat === false

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

    lastInputRef.current = trimmed
    setError(null)
    setModeDowngraded(false)
    setBudgetExceeded(false)
    setInput('')
    const userMsg: Message = { id: nextId(), role: 'user', text: trimmed }
    const pendingMsg: Message = { id: nextId(), role: 'assistant', pending: true }
    setMessages((m) => [...m, userMsg, pendingMsg])
    // Event chat_message_sent (cahier §6 — engagement / boucle).
    track('chat_message_sent', {
      length: trimmed.length,
      has_file: Boolean(attachedFileId),
    })

    // Streaming SSE (cahier §3 Lot 1 — perception "moderne") : on bascule le
    // message pending → streaming au 1er delta, on accumule le texte au fil
    // des chunks, on finalise au 'done' avec sources + highlights.
    let accumulated = ''
    let errored = false
    const controller = new AbortController()
    abortRef.current = controller
    // Reset les badges tool a chaque nouvelle requete.
    setToolEvents([])
    try {
      await apiStream('/api/v1/chat/stream', {
        signal: controller.signal,
        body: {
          message: trimmed,
          workspaceId,
          locale,
          mode,
          fileIds: attachedFileId ? [attachedFileId] : undefined,
          ...(conversationId ? { conversationId } : {}),
          ...(selectedSources.length > 0 ? { sources: selectedSources } : {}),
        },
        onEvent: (ev) => {
          const payload = ev.data as Record<string, unknown>
          if (ev.event === 'meta') {
            const cid = payload?.conversationId as string | null | undefined
            if (cid && cid !== conversationId) {
              setConversationId(cid)
              if (workspaceId) {
                const key = lastConversationKey(workspaceId)
                if (key) window.localStorage.setItem(key, cid)
              }
            }
          } else if (ev.event === 'tool') {
            // Cahier 22b §3.5 — badge "🔌 Lecture GA4…" pendant le tool call.
            const name = typeof payload?.name === 'string' ? payload.name : null
            const status = payload?.status === 'done' ? 'done' : 'running'
            if (name) setToolEvents((evs) => [...evs, { name, status }])
          } else if (ev.event === 'delta') {
            const delta = typeof payload?.text === 'string' ? payload.text : ''
            if (!delta) return
            accumulated += delta
            setMessages((m) =>
              m.map((msg) =>
                msg.id === pendingMsg.id
                  ? { id: msg.id, role: 'assistant', text: accumulated, streaming: true }
                  : msg,
              ),
            )
          } else if (ev.event === 'done') {
            const answer = (payload?.answer as string) || accumulated
            const sources = payload?.sources as Source[] | undefined
            const highlights = payload?.highlights as Highlight[] | undefined
            const cid = payload?.conversationId as string | null | undefined
            const serverMessageId = (payload?.messageId as string | null | undefined) ?? null
            if (payload?.modeDowngraded) setModeDowngraded(true)
            if (cid && cid !== conversationId) {
              setConversationId(cid)
              if (workspaceId) {
                const key = lastConversationKey(workspaceId)
                if (key) window.localStorage.setItem(key, cid)
              }
            }
            // Rafraîchit la liste de conversations dans la sidebar.
            void queryClient.invalidateQueries({ queryKey: ['chat', 'conversations', workspaceId] })
            setMessages((m) =>
              m.map((msg) =>
                msg.id === pendingMsg.id
                  ? {
                      id: msg.id,
                      role: 'assistant',
                      text: answer,
                      sources,
                      highlights,
                      streaming: false,
                      serverMessageId,
                    }
                  : msg,
              ),
            )
          } else if (ev.event === 'error') {
            errored = true
            const code = (payload?.code as string) || 'INTERNAL'
            const message = (payload?.message as string) || ''
            const fakeErr = Object.assign(new ApiError(message, 500, payload), { code })
            setMessages((m) => m.filter((msg) => msg.id !== pendingMsg.id))
            setError(mapErrorToMessage(fakeErr, t))
            // Measurement plan §6 — qualité IA.
            track('chat_error_shown', { code })
            if (code === 'AI_BUDGET_EXCEEDED') {
              setBudgetExceeded(true)
              track('chat_budget_blocked')
            }
          }
        },
      })
    } catch (err) {
      // Abort = user a cliqué "Stop". On garde le texte accumulé, on retire
      // le flag streaming, et on ne montre PAS d'erreur (c'était volontaire).
      if (controller.signal.aborted) {
        setMessages((m) =>
          m.map((msg) =>
            msg.id === pendingMsg.id
              ? accumulated
                ? {
                    id: msg.id,
                    role: 'assistant',
                    text: accumulated + ' …',
                    streaming: false,
                  }
                : msg
              : msg,
          ),
        )
      } else if (!errored) {
        setMessages((m) => m.filter((msg) => msg.id !== pendingMsg.id))
        setError(mapErrorToMessage(err, t))
        // Measurement plan §6 — qualité IA.
        const errCode = err instanceof ApiError ? (err.code ?? String(err.status)) : 'NETWORK'
        track('chat_error_shown', { code: errCode })
        if (err instanceof ApiError && err.code === 'AI_BUDGET_EXCEEDED') {
          setBudgetExceeded(true)
          track('chat_budget_blocked')
        }
      }
    } finally {
      abortRef.current = null
    }
  }

  // Lot V2.3 — Pin highlight to dashboard. POST vers /pinned-widgets puis
  // affiche un feedback transient. Si plan Free → 402 → message specifique.
  async function handlePin(args: {
    kind: 'kpi' | 'chart'
    spec: Record<string, unknown>
    sourceMessageId: string | null
  }) {
    if (!workspaceId) return
    try {
      await apiFetch('/api/v1/pinned-widgets', {
        method: 'POST',
        body: {
          workspaceId,
          kind: args.kind,
          spec: args.spec,
          sourceMessageId: args.sourceMessageId,
        },
      })
      setPinFeedback({ kind: 'ok', text: t('chat.pin.success') })
      track('chat_action_taken', { kind: 'pin', widget_kind: args.kind })
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 402
          ? t('chat.shelf.proOnly')
          : err instanceof ApiError && err.code === 'MAX_WIDGETS'
            ? t('chat.pin.max')
            : err instanceof Error
              ? err.message
              : t('chat.pin.error')
      setPinFeedback({ kind: 'err', text: msg })
    }
    setTimeout(() => setPinFeedback(null), 2500)
  }

  function stopGeneration() {
    abortRef.current?.abort()
  }

  function setModeAndPersist(next: 'fast' | 'deep') {
    setMode(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('sa-chat:mode', next)
    }
  }

  // Sources filtrees persistees par workspace pour ne pas resetter entre
  // sessions. Cle distincte par ws pour ne pas melanger les filtres entre
  // clients/business chez un meme user.
  const sourcesKey = workspaceId ? `sa-chat:sources:${workspaceId}` : null
  useEffect(() => {
    if (!sourcesKey) return
    try {
      const raw = window.localStorage.getItem(sourcesKey)
      if (raw) setSelectedSources(JSON.parse(raw))
    } catch (_) {
      // ignore — localStorage indispo / JSON pourri
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcesKey])
  function setSelectedSourcesAndPersist(next: string[]) {
    setSelectedSources(next)
    if (sourcesKey) {
      try {
        window.localStorage.setItem(sourcesKey, JSON.stringify(next))
      } catch (_) {
        // ignore
      }
    }
  }

  function recordFeedback(messageId: string, value: 'up' | 'down') {
    setFeedback((m) => ({
      ...m,
      [messageId]: m[messageId] === value ? (undefined as never) : value,
    }))
    // Event qualité IA (cahier §6) — signal d'hallucination quand thumbs down.
    if (value === 'down') {
      track('insight_dismissed_as_wrong', { source: 'chat', message_id: messageId })
    }
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

        {/* Colonne chat — élargie (max-w-5xl) pour laisser respirer les
            highlights/tableaux dans les réponses. La sidebar conversations
            prend 280px à gauche, le reste est au chat. */}
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-8 md:py-10">
          {/* Header compact uniquement en conversation active — en empty state,
              le hero EmptyStateHero porte tout le titre (Julius-style). */}
          {messages.length > 0 && (
            <div className="mb-4 flex-shrink-0">
              <span className="font-mono text-xs uppercase tracking-widest text-brand-cyan">
                {t('chat.kicker')}
              </span>
              <h1 className="mt-1 font-head text-2xl font-bold text-text-1">{t('chat.title')}</h1>
            </div>
          )}

          {/* Feedback transient pin (Lot V2.3). */}
          {pinFeedback && (
            <div
              className={[
                'mb-3 flex-shrink-0 rounded-lg border px-3 py-2 text-sm',
                pinFeedback.kind === 'ok'
                  ? 'border-brand-green/30 bg-brand-green/10 text-brand-green'
                  : 'border-brand-red/30 bg-brand-red/10 text-brand-red',
              ].join(' ')}
              role="status"
            >
              {pinFeedback.kind === 'ok' ? '📌 ' : '⚠ '}
              {pinFeedback.text}
            </div>
          )}

          <div
            ref={scrollRef}
            className={[
              'flex-1 overflow-y-auto',
              messages.length === 0
                ? '' // empty state : pas de card, le hero prend la place
                : 'rounded-2xl border border-border bg-card p-5 shadow-card',
            ].join(' ')}
          >
            {messages.length === 0 ? (
              <EmptyStateHero
                onPick={(prompt) => {
                  setInput(prompt)
                  void send(prompt)
                  track('chat_quickcard_clicked', { prompt_preview: prompt.slice(0, 40) })
                }}
                activeSources={activeSources}
                maxCards={isPro ? 8 : 4}
              />
            ) : (
              <div className="flex flex-col gap-5">
                {messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    feedback={m.role === 'assistant' && 'text' in m ? feedback[m.id] : undefined}
                    onFeedback={(v) => recordFeedback(m.id, v)}
                    mode={mode}
                    isPro={isPro}
                    workspaceId={workspaceId}
                    conversationId={conversationId}
                    onRerun={(newMode) => {
                      // Trouve le dernier message user juste avant la reponse
                      // assistant en question — on reprend la meme question
                      // avec le mode oppose.
                      const idx = messages.findIndex((x) => x.id === m.id)
                      const prevUser = [...messages.slice(0, idx)]
                        .reverse()
                        .find((x) => x.role === 'user') as
                        | { id: string; role: 'user'; text: string }
                        | undefined
                      if (prevUser) {
                        setModeAndPersist(newMode)
                        void send(prevUser.text)
                      }
                    }}
                    onPin={(args) => void handlePin(args)}
                  />
                ))}
                {/* Badges tool en cours (cahier 22b §3.5) — sous la derniere bulle pendant streaming. */}
                {runningTools.length > 0 && (
                  <div className="flex flex-col gap-2 px-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {runningTools.map((name) => (
                        <ToolBadge key={name} toolName={name} />
                      ))}
                    </div>
                    {/* Skeleton intelligent : place-holder de la FORME du bloc qui
                        va arriver (chart / table / compare). Pulse doucement
                        pour signaler "ca arrive". */}
                    {pickSkeletonKinds(runningTools).map((kind) => (
                      <VisualSkeleton key={kind} kind={kind} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="mt-3 flex items-center gap-2 flex-shrink-0 rounded-lg border border-brand-red/30 bg-brand-red/10 px-3 py-2 text-sm text-brand-red">
              <span className="flex-1">{error}</span>
              {budgetExceeded ? (
                <a
                  href="/settings"
                  className="flex-shrink-0 rounded-md bg-brand-red/15 px-2.5 py-1 text-xs font-medium hover:bg-brand-red/25 transition"
                >
                  {t('chat.error.budget.cta')}
                </a>
              ) : (
                lastInputRef.current && (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null)
                      void send(lastInputRef.current)
                    }}
                    className="flex-shrink-0 rounded-md bg-brand-red/15 px-2.5 py-1 text-xs font-medium hover:bg-brand-red/25 transition"
                  >
                    {t('chat.error.retry')}
                  </button>
                )
              )}
            </div>
          )}

          {modeDowngraded && (
            <div className="mt-2 flex-shrink-0 rounded-lg border border-brand-amber/30 bg-brand-amber/10 px-3 py-2 text-xs text-brand-amber">
              {t('chat.modeDowngraded')}
            </div>
          )}

          {/* Composer pro (cahier 22b §3.2) — toolbar attach/sources/mode/send,
              sticky en bas, chip sources persistante au-dessus si filtre actif. */}
          <div className="mt-4 flex-shrink-0">
            <ChatComposer
              value={input}
              onChange={setInput}
              onSubmit={() => void send(input)}
              onStop={stopGeneration}
              busy={pending}
              placeholder={messages.length === 0 ? heroPlaceholder : t('chat.placeholder')}
              mode={mode}
              onModeChange={setModeAndPersist}
              sourceOptions={sourceOptions}
              selectedSources={selectedSources}
              onSourcesChange={setSelectedSourcesAndPersist}
              attachedFileName={
                attachedFileId ? (attachedFileQ.data?.filename ?? t('chat.attachedFile')) : null
              }
              onPickFile={() => navigate('/sources?tab=library')}
              onRemoveFile={() => setAttachedFileId(null)}
              modeHint={deepLocked && mode === 'deep' ? t('chat.shelf.proOnly') : null}
            />
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

function MessageBubble({
  message,
  feedback,
  onFeedback,
  mode,
  isPro,
  workspaceId,
  conversationId,
  onRerun,
  onPin,
}: {
  message: Message
  feedback?: 'up' | 'down'
  onFeedback: (v: 'up' | 'down') => void
  // Optionnels — utilises uniquement pour les bubbles assistant non-pending.
  mode?: 'fast' | 'deep'
  isPro?: boolean
  workspaceId?: string | null
  conversationId?: string | null
  onRerun?: (newMode: 'fast' | 'deep') => void
  /** Lot V2.3 — appel quand l'user clique 📌 sur un highlight (kpi/chart). */
  onPin?: (args: {
    kind: 'kpi' | 'chart'
    spec: Record<string, unknown>
    sourceMessageId: string | null
  }) => void
}) {
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
  const streaming = 'streaming' in message ? Boolean(message.streaming) : false
  const byId = new Map(sources.map((s) => [s.id, s]))

  return (
    <div className="group flex items-start gap-2.5">
      <AssistantAvatar />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-text-3">
          {t('chat.assistant')}
        </div>
        <div className="rounded-2xl rounded-bl-md border border-border bg-bg-2 px-4 py-3 text-sm text-text-1">
          {renderMarkdown(text, (id, key) => renderCitation(id, key, byId))}
          {streaming && <StreamCursor />}
        </div>
        {/* Highlights : KPI cards + callouts — extraits par la 2e passe Gemini.
            Lot V2.3 : onPin pour epingler un highlight au dashboard. */}
        <HighlightStack
          highlights={highlights}
          canPin={Boolean(isPro)}
          onPin={
            onPin
              ? (args) =>
                  onPin({
                    ...args,
                    sourceMessageId:
                      'serverMessageId' in message ? (message.serverMessageId ?? null) : null,
                  })
              : undefined
          }
        />
        {/* Action shelf (cahier 22b §3.4) : Excel / CSV / Copier / Rejouer /
            Pin (Pro) / Rapport (Pro). Non affichee pendant le streaming. */}
        {!streaming && text && (
          <>
            <ActionShelf
              text={text}
              highlights={highlights}
              mode={mode || 'fast'}
              isPro={Boolean(isPro)}
              workspaceId={workspaceId}
              onRerun={onRerun}
              conversationId={conversationId}
              messageId={message.id}
              serverMessageId={
                'serverMessageId' in message ? (message.serverMessageId ?? null) : null
              }
            />
            <FeedbackButtons feedback={feedback} onFeedback={onFeedback} />
          </>
        )}
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

// Toggle Rapide/Approfondi — segmented control. Pas de label "Gemini"/"Claude"
// (terminologie cahier CLAUDE.md).
// Feedback ↑↓ sur une reponse assistant. Copier / Excel / etc. sont
// maintenant geres par <ActionShelf> (cahier 22b §3.4).
function FeedbackButtons({
  feedback,
  onFeedback,
}: {
  feedback: 'up' | 'down' | undefined
  onFeedback: (v: 'up' | 'down') => void
}) {
  const t = useT()
  return (
    <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      <button
        type="button"
        onClick={() => onFeedback('up')}
        aria-label={t('chat.feedback.up')}
        aria-pressed={feedback === 'up'}
        className={[
          'rounded px-1.5 py-0.5 text-[12px]',
          feedback === 'up'
            ? 'bg-brand-green/15 text-brand-green'
            : 'text-text-3 hover:bg-bg-3 hover:text-text-1',
        ].join(' ')}
      >
        ↑
      </button>
      <button
        type="button"
        onClick={() => onFeedback('down')}
        aria-label={t('chat.feedback.down')}
        aria-pressed={feedback === 'down'}
        className={[
          'rounded px-1.5 py-0.5 text-[12px]',
          feedback === 'down'
            ? 'bg-brand-red/15 text-brand-red'
            : 'text-text-3 hover:bg-bg-3 hover:text-text-1',
        ].join(' ')}
      >
        ↓
      </button>
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

// Curseur clignotant rendu à la fin du texte tant que des deltas SSE
// arrivent. Signale visuellement que la frappe est en cours.
function StreamCursor() {
  return (
    <span
      aria-hidden="true"
      className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-brand-blue-deep"
    />
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
      case 'AI_CREDIT_DEPLETED':
        return t('chat.error.creditDepleted')
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
      className="ml-0.5 align-super font-mono text-[10px] text-text-3 transition hover:text-brand-cyan"
      title={`${src.label}: ${src.formattedValue} (${src.providers.join(', ')})`}
    >
      [{id}]
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
