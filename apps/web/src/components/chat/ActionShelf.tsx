// ActionShelf — barre d'actions sous chaque reponse assistant (cahier 22b §3.4).
//
// Actions :
//   - Excel / CSV : telecharge la reponse (texte + highlights table)
//   - Copier     : markdown
//   - Rejouer    : re-envoie la meme question avec le mode oppose (Rapide ↔ Approfondi)
//   - Epingler   : Pro-gated, place un cadenas si plan Free (cahier ADR-02)
//   - Rapport    : Pro-gated, ouvre ReportGenModal pre-rempli
//
// V2.1 livre : Excel/CSV (CSV reel, Excel = CSV pour l'instant — XLSX en V2.2),
// Copier, Rejouer. Pin + Rapport posent l'UI mais le wiring complet
// (canvas dashboard + report dispatch) est en V2.3.

import { useState } from 'react'

import { useT } from '@/lib/i18n'
import { track } from '@/lib/tracking'

import type { Highlight } from './HighlightStack'

export type ActionShelfProps = {
  text: string
  highlights?: Highlight[]
  /** Mode utilise pour cette reponse, pour proposer le mode oppose en Rejouer. */
  mode: 'fast' | 'deep'
  /** Plan workspace pour gating Pin/Report. */
  isPro: boolean
  /** Re-pose la meme question avec le mode oppose. */
  onRerun?: (newMode: 'fast' | 'deep') => void
  /** Slug stable pour le nom de fichier export. */
  conversationId?: string | null
  messageId: string
}

export default function ActionShelf({
  text,
  highlights = [],
  mode,
  isPro,
  onRerun,
  conversationId,
  messageId,
}: ActionShelfProps) {
  const t = useT()
  const [copied, setCopied] = useState(false)

  // Si la reponse contient au moins une serie / table exportable.
  const hasExportableData = highlights.some(
    (h) => (h.series && h.series.length > 0) || h.value != null,
  )

  function copy() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
      track('chat_action_taken', { kind: 'copy' })
    }
  }

  function downloadCsv() {
    const csv = buildCsv(text, highlights)
    triggerDownload(csv, fileName(conversationId, messageId, 'csv'), 'text/csv;charset=utf-8;')
    track('chat_export_generated', { format: 'csv' })
  }

  function downloadExcel() {
    // V2.1 : on livre un .csv encode UTF-8 BOM, Excel l'ouvre proprement.
    // Le vrai .xlsx (exceljs + Storage signe) arrive en V2.2 (cahier 22b §4.3).
    const csv = '﻿' + buildCsv(text, highlights)
    triggerDownload(csv, fileName(conversationId, messageId, 'csv'), 'text/csv;charset=utf-8;')
    track('chat_export_generated', { format: 'excel-csv' })
  }

  function rerun() {
    const newMode = mode === 'fast' ? 'deep' : 'fast'
    track('chat_action_taken', { kind: 'rerun', from: mode, to: newMode })
    onRerun?.(newMode)
  }

  function pinDashboard() {
    // V2.1 : on pose juste un toast soft. Le vrai pin (widget cree dans
    // Audit/BriefHome) arrive en V2.3 (cahier 22b roadmap).
    track('chat_action_taken', { kind: 'pin', deferred: true })
    if (typeof window !== 'undefined') {
      // alert temporaire — sera remplace par un Toast quand on aura le canvas.
      window.alert(t('chat.shelf.pin.soon'))
    }
  }

  function openReport() {
    // Navigation vers /rapports avec un flag pour declencher ReportGenModal
    // pre-rempli avec aiNote=true. Wiring complet en V2.3.
    track('chat_action_taken', { kind: 'report' })
    if (typeof window !== 'undefined') {
      window.location.href = '/rapports?gen=1&aiNote=1'
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      <ShelfButton
        icon="⧉"
        label={copied ? t('chat.shelf.copy.done') : t('chat.shelf.copy')}
        ariaLabel={t('chat.shelf.copy.aria')}
        onClick={copy}
        active={copied}
      />
      {hasExportableData && (
        <>
          <ShelfButton
            icon="📥"
            label={t('chat.shelf.excel')}
            ariaLabel={t('chat.shelf.excel.aria')}
            onClick={downloadExcel}
          />
          <ShelfButton
            icon="📋"
            label={t('chat.shelf.csv')}
            ariaLabel={t('chat.shelf.csv.aria')}
            onClick={downloadCsv}
          />
        </>
      )}
      {onRerun && (
        <ShelfButton
          icon="🔁"
          label={t('chat.shelf.rerun')}
          ariaLabel={t('chat.shelf.rerun.aria')}
          onClick={rerun}
        />
      )}
      <ShelfButton
        icon="📌"
        label={t('chat.shelf.pin')}
        ariaLabel={t('chat.shelf.pin.aria')}
        onClick={pinDashboard}
        locked={!isPro}
        lockedReason={t('chat.shelf.proOnly')}
      />
      <ShelfButton
        icon="📑"
        label={t('chat.shelf.report')}
        ariaLabel={t('chat.shelf.report.aria')}
        onClick={openReport}
        locked={!isPro}
        lockedReason={t('chat.shelf.proOnly')}
      />
    </div>
  )
}

function ShelfButton({
  icon,
  label,
  ariaLabel,
  onClick,
  active,
  locked,
  lockedReason,
}: {
  icon: string
  label: string
  ariaLabel: string
  onClick: () => void
  active?: boolean
  locked?: boolean
  lockedReason?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={locked ? lockedReason || ariaLabel : ariaLabel}
      className={[
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-widest transition',
        active
          ? 'bg-brand-green/15 text-brand-green'
          : locked
            ? 'text-text-3 hover:bg-bg-3 hover:text-text-2'
            : 'text-text-3 hover:bg-bg-3 hover:text-text-1',
      ].join(' ')}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
      {locked && (
        <span aria-hidden="true" className="ml-0.5 text-[10px]">
          🔒
        </span>
      )}
    </button>
  )
}

// ─── helpers ────────────────────────────────────────────────────────────

function fileName(convId: string | null | undefined, msgId: string, ext: string): string {
  const slug = (convId || msgId).slice(0, 12)
  return `smartanalyst-chat-${slug}.${ext}`
}

function triggerDownload(content: string, filename: string, mimeType: string) {
  if (typeof window === 'undefined') return
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Construit un CSV simple a partir du texte de la reponse + des highlights.
 * Chaque highlight serie devient un block "metric / date,value". Le texte
 * est en haut, en commentaire (lignes prefixees #).
 */
function buildCsv(text: string, highlights: Highlight[]): string {
  const lines: string[] = []
  // En-tete texte en commentaires.
  for (const line of text.split('\n')) {
    lines.push('# ' + escapeCsvLine(line))
  }
  lines.push('')

  for (const h of highlights) {
    if (h.series && h.series.length > 0) {
      lines.push(escapeCsv(h.title || h.metricKey || 'series'))
      lines.push('date,value')
      for (const p of h.series) {
        lines.push(`${p.date},${p.value}`)
      }
      lines.push('')
    } else if (h.value != null) {
      lines.push(`${escapeCsv(h.title)},${escapeCsv(String(h.value))}`)
    }
  }
  return lines.join('\n')
}

function escapeCsv(v: string): string {
  if (v == null) return ''
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

function escapeCsvLine(v: string): string {
  // Pour les lignes de commentaire on neutralise juste les \r\n parasites.
  return v.replace(/[\r\n]+/g, ' ').trim()
}
