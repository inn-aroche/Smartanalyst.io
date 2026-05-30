import { useCallback, useEffect, useRef, useState } from 'react'

import { useT } from '@/lib/i18n'

type Props = {
  value: string
  className?: string
  size?: 'sm' | 'md'
  // Si true, le bouton occupe la largeur dispo (utile dans une card stretch).
  block?: boolean
}

export default function CopyButton({ value, className = '', size = 'md', block }: Props) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // Fallback pour environnements où clipboard API est bloquée (iframes, http).
      const ta = document.createElement('textarea')
      ta.value = value
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } catch {
        /* ignore — at this point the user just won't see "copied" */
      }
      document.body.removeChild(ta)
    }
    setCopied(true)
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setCopied(false), 1800)
  }, [value])

  const sizeClass = size === 'sm' ? '!py-1 !text-[11px]' : '!text-xs'
  const widthClass = block ? 'w-full justify-center' : 'shrink-0'

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className={`sa-btn ${sizeClass} ${widthClass} inline-flex items-center gap-1.5 ${className}`}
      aria-label={copied ? t('common.copied') : t('common.copy')}
    >
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M3 8l3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <rect x="4.5" y="4.5" width="8" height="9" rx="1.5" />
          <path d="M11.5 4.5V3a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h1" />
        </svg>
      )}
      {copied ? t('common.copied') : t('common.copy')}
    </button>
  )
}
