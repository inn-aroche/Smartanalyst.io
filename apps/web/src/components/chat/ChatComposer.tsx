// ChatComposer — input pro pour le chat (cahier 22b §3.2).
//
// Une carte unique avec :
//   - textarea auto-grow (1-6 lignes)
//   - chip "filtre sources" persistante au-dessus si selected.length > 0
//   - toolbar : 📎 attach · 🎯 sources · ⚡/🧠 mode toggle · ↑ envoi / ⏹ stop
//
// Le parent (Chat.tsx) reste responsable du state input/mode/sources/file —
// ce composant est purement presentationnel + delegue.

import { type FormEvent, useEffect, useRef } from 'react'

import { useT } from '@/lib/i18n'

import SourceFilter, { SourceChip, type SourceOption } from './SourceFilter'

export type ChatComposerProps = {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onStop: () => void
  /** true tant qu'un message est en streaming. */
  busy: boolean
  placeholder: string

  // Toolbar
  mode: 'fast' | 'deep'
  onModeChange: (m: 'fast' | 'deep') => void
  sourceOptions: SourceOption[]
  selectedSources: string[]
  onSourcesChange: (next: string[]) => void

  // Attach (delegue au parent qui gere FileUpload + state attachedFileId)
  attachedFileName?: string | null
  onPickFile: () => void
  onRemoveFile: () => void

  /** Hint sous-titre de mode. Si null, on n'affiche que le toggle. */
  modeHint?: string | null
}

export default function ChatComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  busy,
  placeholder,
  mode,
  onModeChange,
  sourceOptions,
  selectedSources,
  onSourcesChange,
  attachedFileName,
  onPickFile,
  onRemoveFile,
  modeHint,
}: ChatComposerProps) {
  const t = useT()
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  // Auto-grow : ajuste la hauteur au contenu (max 6 lignes).
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = '0px'
    const max = 6 * 22 // ~6 lignes
    ta.style.height = Math.min(max, ta.scrollHeight) + 'px'
  }, [value])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!value.trim() || busy) return
    onSubmit()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl + Enter = envoi. Shift+Enter = saut de ligne (default).
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit(e as unknown as FormEvent)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      {/* Chips persistantes : sources filtrees + fichier joint */}
      {(selectedSources.length > 0 || attachedFileName) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {selectedSources.map((key) => {
            const opt = sourceOptions.find((o) => o.key === key)
            return (
              <SourceChip
                key={key}
                label={opt?.label || key}
                onRemove={() => onSourcesChange(selectedSources.filter((k) => k !== key))}
              />
            )
          })}
          {attachedFileName && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-blue-deep/30 bg-brand-blue-dim px-2.5 py-0.5 text-[11px] text-brand-blue-deep">
              📎 <span className="max-w-[180px] truncate">{attachedFileName}</span>
              <button
                type="button"
                onClick={onRemoveFile}
                aria-label={t('chat.removeAttachment')}
                className="ml-0.5 leading-none hover:text-brand-red"
              >
                ✕
              </button>
            </span>
          )}
        </div>
      )}

      <div className="rounded-[14px] border border-border bg-card shadow-card focus-within:border-brand-cyan/60">
        {/* Textarea */}
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          className="block w-full resize-none border-0 bg-transparent px-4 py-3 text-[14px] text-text-1 outline-none placeholder:text-text-3"
          disabled={busy}
        />

        {/* Toolbar */}
        <div className="flex items-center gap-1.5 border-t border-border/60 px-2 py-1.5">
          <button
            type="button"
            onClick={onPickFile}
            aria-label={t('chat.toolbar.attach')}
            title={t('chat.toolbar.attach')}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-text-3 hover:bg-bg-3 hover:text-text-1"
          >
            📎
          </button>

          <SourceFilter
            options={sourceOptions}
            selected={selectedSources}
            onChange={onSourcesChange}
          />

          <ModeToggle mode={mode} onChange={onModeChange} disabled={busy} />

          {modeHint && (
            <span className="hidden font-mono text-[10px] uppercase tracking-widest text-text-3 sm:block">
              {modeHint}
            </span>
          )}

          <div className="flex-1" />

          {busy ? (
            <button
              type="button"
              onClick={onStop}
              aria-label={t('chat.stop.aria')}
              title={t('chat.stop')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-red/15 text-brand-red hover:bg-brand-red/25"
            >
              <SquareIcon />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!value.trim()}
              aria-label={t('chat.toolbar.send.aria')}
              title={t('chat.send')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-blue-deep text-white shadow-sm transition disabled:cursor-not-allowed disabled:bg-bg-3 disabled:text-text-3"
            >
              <UpIcon />
            </button>
          )}
        </div>
      </div>
    </form>
  )
}

// ─── sous-composants ────────────────────────────────────────────────────

function ModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: 'fast' | 'deep'
  onChange: (m: 'fast' | 'deep') => void
  disabled?: boolean
}) {
  const t = useT()
  return (
    <div
      role="group"
      aria-label={t('chat.mode.aria')}
      className="inline-flex items-center rounded-full border border-border bg-bg-2 p-0.5 text-[11px]"
    >
      <ModeChip
        active={mode === 'fast'}
        disabled={disabled}
        onClick={() => onChange('fast')}
        icon="⚡"
        label={t('chat.mode.fast')}
      />
      <ModeChip
        active={mode === 'deep'}
        disabled={disabled}
        onClick={() => onChange('deep')}
        icon="🧠"
        label={t('chat.mode.deep')}
      />
    </div>
  )
}

function ModeChip({
  active,
  disabled,
  onClick,
  icon,
  label,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  icon: string
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={[
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 transition',
        active ? 'bg-card text-text-1 shadow-sm' : 'text-text-3 hover:text-text-1',
        disabled && 'cursor-not-allowed opacity-60',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function UpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path
        d="M7 11V3M3 7l4-4 4 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

function SquareIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <rect x="2" y="2" width="8" height="8" rx="1" fill="currentColor" />
    </svg>
  )
}
