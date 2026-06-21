// EmptyStateHero — etat initial du chat (cahier 22b §3.1).
//
// 3 zones :
//   - titre chaleureux centre
//   - input principal carde, placeholder qui tourne toutes les 4s
//   - grille de 8 quick-cards (icone + titre court + sous-titre)
//
// L'input du hero est rendu PAR LE PARENT (Chat.tsx) — ce composant ne
// gere que les decorations + les cards. Le parent passe `onPick(prompt)`
// pour qu'un clic sur une card envoie le prompt directement.
//
// CAS LIMITE — workspace sans connecteur (1er-run). On remplace la grille
// de quick-cards par une seule CTA "Connecte ta 1ere source" pour eviter
// la frustration "l'IA n'a pas de donnees" sur chaque clic.

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { useT, type StringKey } from '@/lib/i18n'

type QuickCard = {
  key: string
  icon: string
  titleKey: StringKey
  descKey: StringKey
  promptKey: StringKey
  // Si renseigne, la card est filtree quand aucun de ces connecteurs n'est
  // actif (ex: "Comparer canaux" inutile sans GA4/Meta).
  requiresAny?: string[]
}

const QUICK_CARDS: QuickCard[] = [
  {
    key: 'compare',
    icon: '📊',
    titleKey: 'chat.qc.compare.title',
    descKey: 'chat.qc.compare.desc',
    promptKey: 'chat.qc.compare.prompt',
    requiresAny: ['ga4', 'meta_ads', 'google_ads'],
  },
  {
    key: 'revenue',
    icon: '📈',
    titleKey: 'chat.qc.revenue.title',
    descKey: 'chat.qc.revenue.desc',
    promptKey: 'chat.qc.revenue.prompt',
    requiresAny: ['ga4', 'stripe'],
  },
  {
    key: 'report',
    icon: '📑',
    titleKey: 'chat.qc.report.title',
    descKey: 'chat.qc.report.desc',
    promptKey: 'chat.qc.report.prompt',
  },
  {
    key: 'funnel',
    icon: '📋',
    titleKey: 'chat.qc.funnel.title',
    descKey: 'chat.qc.funnel.desc',
    promptKey: 'chat.qc.funnel.prompt',
    requiresAny: ['ga4'],
  },
  {
    key: 'pareto',
    icon: '🎯',
    titleKey: 'chat.qc.pareto.title',
    descKey: 'chat.qc.pareto.desc',
    promptKey: 'chat.qc.pareto.prompt',
    requiresAny: ['meta_ads', 'google_ads'],
  },
  {
    key: 'alerts',
    icon: '⚠️',
    titleKey: 'chat.qc.alerts.title',
    descKey: 'chat.qc.alerts.desc',
    promptKey: 'chat.qc.alerts.prompt',
  },
  {
    key: 'compare_prev',
    icon: '🆚',
    titleKey: 'chat.qc.compare_prev.title',
    descKey: 'chat.qc.compare_prev.desc',
    promptKey: 'chat.qc.compare_prev.prompt',
  },
  {
    key: 'actions',
    icon: '💡',
    titleKey: 'chat.qc.actions.title',
    descKey: 'chat.qc.actions.desc',
    promptKey: 'chat.qc.actions.prompt',
  },
]

const PLACEHOLDER_KEYS: StringKey[] = [
  'chat.hero.placeholder.1',
  'chat.hero.placeholder.2',
  'chat.hero.placeholder.3',
  'chat.hero.placeholder.4',
  'chat.hero.placeholder.5',
]

/**
 * Hook qui retourne le placeholder courant, en tournant toutes les `intervalMs`.
 * Expose aussi le placeholder full pour passer dans <input placeholder=…>.
 */
export function useRotatingPlaceholder(intervalMs = 4000): string {
  const t = useT()
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % PLACEHOLDER_KEYS.length)
    }, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return t(PLACEHOLDER_KEYS[idx])
}

export default function EmptyStateHero({
  onPick,
  activeSources = [],
  maxCards = 8,
}: {
  onPick: (prompt: string) => void
  activeSources?: string[]
  /** Plan Free = 4 cards, Pro = 8. Limite ce nombre. */
  maxCards?: number
}) {
  const t = useT()

  // Filtre les cards selon les sources actives. Si une card est requiresAny=[…]
  // et qu'AUCUNE de ces sources n'est connectee, on la cache (sinon le LLM
  // dirait "pas de data" → frustrant en empty state).
  const visibleCards = useMemo(() => {
    const list = QUICK_CARDS.filter((c) => {
      if (!c.requiresAny || c.requiresAny.length === 0) return true
      return c.requiresAny.some((src) => activeSources.includes(src))
    })
    return list.slice(0, maxCards)
  }, [activeSources, maxCards])

  // Cas 1er-run : aucun connecteur actif → afficher une CTA dediee plutot
  // que les quick-cards (qui declencheraient des reponses IA "no data").
  if (activeSources.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 px-4 py-10 text-center">
        <h2 className="max-w-xl font-head text-2xl font-bold text-text-1 sm:text-3xl">
          {t('chat.hero.title')}
        </h2>
        <div className="w-full max-w-md rounded-[14px] border border-brand-cyan/30 bg-brand-cyan/5 p-5 text-left">
          <div className="font-mono text-[10px] uppercase tracking-widest text-brand-cyan">
            {t('chat.empty.firstRun.eyebrow')}
          </div>
          <h3 className="mt-1.5 font-head text-[17px] font-bold text-text-1">
            {t('chat.empty.firstRun.title')}
          </h3>
          <p className="mt-2 text-[13px] leading-relaxed text-text-2">
            {t('chat.empty.firstRun.body')}
          </p>
          <Link to="/sources" className="sa-btn sa-btn-primary mt-3 inline-flex !text-[13px]">
            {t('chat.empty.firstRun.cta')} →
          </Link>
        </div>
        <div className="max-w-sm text-[11.5px] leading-snug text-text-3">
          {t('chat.empty.firstRun.hint')}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-4 py-10 text-center">
      <h2 className="max-w-xl font-head text-2xl font-bold text-text-1 sm:text-3xl">
        {t('chat.hero.title')}
      </h2>

      <div className="grid w-full max-w-3xl grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
        {visibleCards.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => onPick(t(c.promptKey))}
            className="group flex flex-col items-start gap-1.5 rounded-[12px] border border-border bg-card px-3 py-3 text-left transition hover:-translate-y-px hover:border-brand-cyan/60 hover:shadow-card"
          >
            <span aria-hidden="true" className="text-[20px] leading-none">
              {c.icon}
            </span>
            <div className="text-[13px] font-semibold text-text-1">{t(c.titleKey)}</div>
            <div className="text-[11.5px] leading-snug text-text-3">{t(c.descKey)}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
