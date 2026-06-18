// OnboardingFlow — overlay full-screen 5 étapes (handoff Claude Design,
// sa-views2.jsx → OnboardingFlow). Brief V2 §3.7C : "premier insight en
// < 10 min". Le step 0 "Compte" du design est ignoré : ici l'user est déjà
// authentifié quand le flow démarre.
//
// Trigger via event global `sa-onboarding:open` (pattern aligné sur
// ConsentBanner). Le replay depuis la sidebar (chrome) ou le banner d'invite
// BriefHome dispatch l'event.
//
// Étapes :
//   1. URL site                : input + POST /onboarding/analyze
//   2. Profil détecté          : confirme/corrige → POST /onboarding/profile
//   3. Connecter 1re source    : lien /connectors ou skip
//   4. Loading                 : barre de progression + checklist (animée)
//   5. Premier wow             : ScoreRing + 3 insights réels → ferme l'overlay

import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import ScoreRing from '@/components/charts/ScoreRing'
import { apiFetch, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useT } from '@/lib/i18n'

export const ONBOARDING_OPEN_EVENT = 'sa-onboarding:open'

// Clé sessionStorage pour persister l'état du flow à travers les rechargements
// de page. L'OAuth d'un connecteur navigue hors de l'app (window.location.href),
// donc sans persistance le user revient à la step 1, perte sèche d'UX.
const STORAGE_KEY = 'sa-onboarding:state-v1'

type PersistedState = {
  step: 1 | 2 | 3 | 4 | 5
  url: string
  detected: DetectedProfile | null
  fallback: boolean
}

function loadPersisted(): PersistedState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    if (!parsed || !parsed.step || parsed.step < 1 || parsed.step > 5) return null
    return {
      step: parsed.step as 1 | 2 | 3 | 4 | 5,
      url: typeof parsed.url === 'string' ? parsed.url : 'https://',
      detected: parsed.detected ?? null,
      fallback: !!parsed.fallback,
    }
  } catch {
    return null
  }
}

function clearPersisted(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // sessionStorage indispo (mode privé strict) — pas grave.
  }
}

export function openOnboarding(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(ONBOARDING_OPEN_EVENT))
}

type DetectedProfile = {
  url: string
  sector: string
  market: string
  brand_keywords: string[]
  description: string
  detected_tools: Record<string, boolean>
  confidence_score: number | null
}

type AnalyzeResponse =
  | { profile: DetectedProfile; fallback: false }
  | { profile: null; fallback: true; reason: string }

type HealthScore = { score: number; delta: number | null; has_data: boolean }

type Insight = {
  id: string
  title: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  summary: string
  actions?: Array<{ title: string }>
}

export default function OnboardingFlow() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    function onOpen() {
      setOpen(true)
    }
    window.addEventListener(ONBOARDING_OPEN_EVENT, onOpen)
    // Auto-open via query param `?onboarding=1` — utile pour dev, replay
    // depuis Settings, ou deep-link depuis emails (welcome).
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('onboarding') === '1') {
        setOpen(true)
        params.delete('onboarding')
        const newSearch = params.toString()
        const newUrl =
          window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash
        window.history.replaceState({}, '', newUrl)
      } else if (loadPersisted()) {
        // Flow démarré, user parti faire son OAuth, retour sur l'app :
        // on rouvre automatiquement à l'étape où il s'était arrêté.
        setOpen(true)
      }
    }
    return () => window.removeEventListener(ONBOARDING_OPEN_EVENT, onOpen)
  }, [])
  if (!open) return null
  return (
    <OnboardingShell
      onClose={(opts) => {
        // keepState=true : on ferme l'overlay (ex. user part faire l'OAuth)
        // mais on garde le sessionStorage pour pouvoir reprendre au retour.
        if (!opts?.keepState) clearPersisted()
        setOpen(false)
      }}
    />
  )
}

function OnboardingShell({ onClose }: { onClose: (opts?: { keepState?: boolean }) => void }) {
  const t = useT()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { state } = useAuth()
  const workspace = state.workspaces[0]
  // Hydrate depuis sessionStorage si on reprend un flow en cours (cas OAuth :
  // user redirigé hors app puis ramené, React state perdu).
  const persisted = useMemo(() => loadPersisted(), [])
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(persisted?.step ?? 1)
  const [url, setUrl] = useState(persisted?.url ?? 'https://')
  const [detected, setDetected] = useState<DetectedProfile | null>(persisted?.detected ?? null)
  const [fallback, setFallback] = useState<boolean>(persisted?.fallback ?? false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [prog, setProg] = useState(0)
  const [finalScore, setFinalScore] = useState<HealthScore | null>(null)
  const [finalInsights, setFinalInsights] = useState<Insight[]>([])
  const [loadWowError, setLoadWowError] = useState<string | null>(null)

  // Persiste le state critique à chaque changement utile (step / URL /
  // profil détecté / flag fallback). Step 5 n'est pas persisté : si le user
  // a atteint le wow, c'est terminé, pas besoin de rouvrir au F5.
  useEffect(() => {
    if (step >= 5) return
    const payload: PersistedState = { step, url, detected, fallback }
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // sessionStorage indispo (mode privé strict) — pas grave, on continue
      // sans persistance.
    }
  }, [step, url, detected, fallback])

  // Loading animation step 4 — 15s simulés (4 paliers).
  useEffect(() => {
    if (step !== 4) return
    setProg(0)
    const interval = window.setInterval(() => {
      setProg((p) => {
        if (p >= 100) {
          window.clearInterval(interval)
          window.setTimeout(() => void loadFinalWow(), 350)
          return 100
        }
        return p + 4
      })
    }, 90)
    return () => window.clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  async function loadFinalWow() {
    if (!workspace?.id) {
      // Cas rare mais bloquant : l'auth n'a pas encore résolu le workspace
      // (ex. retour OAuth dans une nouvelle session, refresh raté). On
      // affiche step 5 quand même, mais avec un message explicite plutôt
      // qu'un écran blanc.
      setLoadWowError(t('onboarding.s5.errorNoWorkspace'))
      setStep(5)
      return
    }
    // Best-effort : on tente le score + insights. Si l'API n'a rien, on
    // affichera l'écran "premier wow" avec un état placeholder.
    try {
      const score = await apiFetch<HealthScore>(`/api/v1/health-score?workspaceId=${workspace.id}`)
      setFinalScore(score)
    } catch {
      setFinalScore(null)
    }
    try {
      const ins = await apiFetch<{ insights: Insight[] }>(
        `/api/v1/insights?workspaceId=${workspace.id}&status=open`,
      )
      setFinalInsights((ins.insights ?? []).slice(0, 3))
    } catch {
      setFinalInsights([])
    }
    // Refresh tout — BriefHome se mettra à jour à la fermeture.
    void queryClient.invalidateQueries()
    setStep(5)
  }

  async function handleAnalyze() {
    const cleaned = url.trim()
    if (!/^https?:\/\/.+\..+/.test(cleaned)) {
      setAnalyzeError(t('onboarding.error.url'))
      return
    }
    setAnalyzeError(null)
    setAnalyzing(true)
    try {
      const res = await apiFetch<AnalyzeResponse>('/api/v1/onboarding/analyze', {
        method: 'POST',
        body: { url: cleaned },
      })
      if (res.fallback) {
        // Fallback : on saute l'écran "profil détecté" et on va direct à la
        // connexion. On flag explicitement le mode dégradé pour que la
        // step 3 affiche un chip "mode manuel" et ne laisse pas l'user
        // se demander pourquoi son profil n'a pas été détecté.
        setDetected({
          url: cleaned,
          sector: '',
          market: '',
          brand_keywords: [],
          description: '',
          detected_tools: {},
          confidence_score: null,
        })
        setFallback(true)
        setStep(3)
      } else {
        setDetected(res.profile)
        setFallback(false)
        setStep(2)
      }
    } catch (err) {
      setAnalyzeError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t('onboarding.error.generic'),
      )
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleSaveProfile() {
    if (!detected || !workspace?.id) return
    setSaving(true)
    try {
      await apiFetch('/api/v1/onboarding/profile', {
        method: 'POST',
        body: {
          workspaceId: workspace.id,
          url: detected.url,
          sector: detected.sector,
          market: detected.market,
          brand_keywords: detected.brand_keywords,
          description: detected.description,
          detected_tools: detected.detected_tools,
          confidence_score: detected.confidence_score ?? undefined,
        },
      })
      setStep(3)
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : t('onboarding.error.generic'))
    } finally {
      setSaving(false)
    }
  }

  function handleClose() {
    if (window.confirm(t('onboarding.exit.confirm'))) onClose()
  }

  function handleConnect() {
    // L'OAuth d'un connecteur sort de l'app (window.location.href = ...),
    // donc le state React est perdu. On force-sauve l'état actuel en
    // sessionStorage avec step=3 (pour que l'auto-open au retour rouvre
    // sur l'écran connexion plutôt que step 1), puis on ferme l'overlay
    // et on navigue vers /connectors.
    try {
      const payload: PersistedState = { step: 3, url, detected, fallback }
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // sessionStorage indispo : on continue, dans le pire des cas l'user
      // devra rouvrir le flow manuellement depuis Settings.
    }
    onClose({ keepState: true })
    navigate('/connectors')
  }

  return (
    <div
      className="fixed inset-0 z-[2000] flex flex-col bg-bg-0"
      role="dialog"
      aria-modal="true"
      aria-label={t('onboarding.flowTitle')}
    >
      <TopBar step={step} onClose={handleClose} />

      <div className="flex flex-1 items-center justify-center overflow-y-auto px-6 py-10">
        <div key={step} className="w-full max-w-[620px] animate-[fadeUp_.28s_ease]">
          {step === 1 && (
            <StepUrl
              url={url}
              onUrlChange={setUrl}
              analyzing={analyzing}
              error={analyzeError}
              onSubmit={handleAnalyze}
            />
          )}
          {step === 2 && detected && (
            <StepProfile
              profile={detected}
              onCorrect={() => setStep(1)}
              onConfirm={handleSaveProfile}
              saving={saving}
              error={analyzeError}
            />
          )}
          {step === 3 && (
            <StepConnect onConnect={handleConnect} onSkip={() => setStep(4)} fallback={fallback} />
          )}
          {step === 4 && <StepLoading progress={prog} />}
          {step === 5 && (
            <StepWow
              score={finalScore}
              insights={finalInsights}
              firstName={(state.user?.full_name ?? '').split(' ')[0] || ''}
              loadError={loadWowError}
              onDone={() => {
                onClose()
                navigate('/')
              }}
            />
          )}
        </div>
      </div>

      <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  )
}

// ─── Top bar : logo + progress + close ───────────────────────────────────

function TopBar({ step, onClose }: { step: number; onClose: () => void }) {
  const t = useT()
  return (
    <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-7 py-4">
      <div className="flex items-center gap-2.5">
        <img
          src="/brand/ascent-appicon-512.png"
          alt=""
          width={28}
          height={28}
          style={{ borderRadius: 8 }}
          className="flex-shrink-0"
        />
        <span className="font-head text-[15px] font-bold tracking-[-0.02em] text-text-1">
          Smart<span className="font-semibold text-text-2">Analyst</span>
        </span>
      </div>
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={[
                'h-[7px] rounded-[4px] transition-all duration-300',
                i === step ? 'w-[26px]' : 'w-[7px]',
                i <= step ? 'bg-brand-blue-deep' : 'bg-bg-3',
              ].join(' ')}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-xs text-text-3 transition-colors hover:text-text-2"
        >
          {t('onboarding.exit')} ✕
        </button>
      </div>
    </div>
  )
}

// ─── Step 1 : URL ────────────────────────────────────────────────────────

function StepUrl({
  url,
  onUrlChange,
  analyzing,
  error,
  onSubmit,
}: {
  url: string
  onUrlChange: (v: string) => void
  analyzing: boolean
  error: string | null
  onSubmit: () => void
}) {
  const t = useT()
  return (
    <>
      <Eyebrow n={1} hint={t('onboarding.s1.hint')} />
      <h1 className="mb-2.5 font-head text-[26px] font-bold tracking-[-0.02em] text-text-1">
        {t('onboarding.s1.title')}
      </h1>
      <p className="mb-6 text-[14.5px] leading-[1.6] text-text-2">{t('onboarding.s1.body')}</p>
      <div className="sa-card flex items-center gap-2.5">
        <span className="font-mono text-sm text-text-3">https://</span>
        <input
          type="url"
          value={url.replace(/^https?:\/\//, '')}
          onChange={(e) => onUrlChange('https://' + e.target.value)}
          placeholder="atelier-lumi.fr"
          className="flex-1 border-none bg-transparent py-2 text-base text-text-1 outline-none placeholder:text-text-3"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !analyzing) onSubmit()
          }}
        />
      </div>
      {error && (
        <div className="mt-3 rounded-[10px] border border-brand-red/30 bg-brand-red/10 px-3 py-2 text-sm text-brand-red">
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={onSubmit}
        disabled={analyzing}
        className="sa-btn sa-btn-primary mt-4 w-full !py-3.5 !text-base disabled:opacity-60"
      >
        {analyzing ? t('onboarding.s1.analyzing') : t('onboarding.s1.cta')} →
      </button>
    </>
  )
}

// ─── Step 2 : Profil détecté ─────────────────────────────────────────────

function StepProfile({
  profile,
  onCorrect,
  onConfirm,
  saving,
  error,
}: {
  profile: DetectedProfile
  onCorrect: () => void
  onConfirm: () => void
  saving: boolean
  error: string | null
}) {
  const t = useT()
  const tools = useMemo(
    () =>
      Object.entries(profile.detected_tools || {})
        .filter(([, v]) => v)
        .map(([k]) => k),
    [profile.detected_tools],
  )
  return (
    <>
      <Eyebrow n={2} hint={t('onboarding.s2.hint')} />
      <div className="mb-5 flex items-center gap-4">
        <ProfileIllus />
        <div>
          <h1 className="mb-1.5 font-head text-[25px] font-bold tracking-[-0.02em] text-text-1">
            {t('onboarding.s2.title')} 👌
          </h1>
          <p className="text-[14px] leading-[1.55] text-text-2">
            {t('onboarding.s2.body')}{' '}
            <strong className="text-text-1">{profile.url.replace(/^https?:\/\//, '')}</strong>.
          </p>
        </div>
      </div>

      <div className="sa-card !p-0">
        {profile.description && (
          <Row label={t('onboarding.s2.activity')}>{profile.description}</Row>
        )}
        {profile.sector && <Row label={t('onboarding.s2.sector')}>{profile.sector}</Row>}
        {profile.market && <Row label={t('onboarding.s2.market')}>{profile.market}</Row>}
        {tools.length > 0 && (
          <Row label={t('onboarding.s2.tools')}>
            <div className="flex flex-wrap gap-1.5">
              {tools.map((tool) => (
                <span key={tool} className="sa-chip bg-brand-blue-dim text-brand-blue-deep">
                  {tool}
                </span>
              ))}
            </div>
          </Row>
        )}
        {profile.brand_keywords?.length > 0 && (
          <Row label={t('onboarding.s2.keywords')} last>
            <div className="flex flex-wrap gap-1.5">
              {profile.brand_keywords.map((k) => (
                <span key={k} className="sa-chip bg-brand-cyan/10 text-brand-cyan">
                  {k}
                </span>
              ))}
            </div>
          </Row>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-[10px] border border-brand-red/30 bg-brand-red/10 px-3 py-2 text-sm text-brand-red">
          {error}
        </div>
      )}

      <div className="mt-4 flex gap-2.5">
        <button type="button" onClick={onCorrect} className="sa-btn !text-sm">
          {t('onboarding.s2.correct')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={saving}
          className="sa-btn sa-btn-primary flex-1 !text-sm disabled:opacity-60"
        >
          {saving ? t('onboarding.s2.saving') : t('onboarding.s2.confirm')} →
        </button>
      </div>
    </>
  )
}

function Row({
  label,
  children,
  last,
}: {
  label: string
  children: React.ReactNode
  last?: boolean
}) {
  return (
    <div
      className={['flex items-start gap-4 px-5 py-3.5', last ? '' : 'border-b border-border'].join(
        ' ',
      )}
    >
      <span className="w-20 flex-shrink-0 pt-1 font-mono text-[11.5px] uppercase tracking-[0.04em] text-text-3">
        {label}
      </span>
      <div className="flex-1 text-[14.5px] font-medium leading-[1.5] text-text-1">{children}</div>
    </div>
  )
}

// ─── Step 3 : Connecter 1re source ───────────────────────────────────────

function StepConnect({
  onConnect,
  onSkip,
  fallback,
}: {
  onConnect: () => void
  onSkip: () => void
  fallback: boolean
}) {
  const t = useT()
  return (
    <>
      <Eyebrow n={3} hint={t('onboarding.s3.hint')} />
      <h1 className="mb-2.5 font-head text-[25px] font-bold tracking-[-0.02em] text-text-1">
        {t('onboarding.s3.title')}
      </h1>
      <p className="mb-3 text-[14.5px] leading-[1.6] text-text-2">{t('onboarding.s3.body')}</p>
      {fallback && (
        <div className="mb-5 flex items-start gap-2.5 rounded-[10px] border border-brand-amber/30 bg-brand-amber/10 px-3.5 py-2.5 text-[13px] text-text-1">
          <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-brand-amber font-bold text-white">
            !
          </span>
          <span>{t('onboarding.s3.fallback')}</span>
        </div>
      )}
      <div className="sa-card">
        <div className="mb-4 flex items-center gap-3.5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[13px] bg-[#5E8E3E]">
            <svg width="28" height="28" viewBox="0 0 48 48" aria-hidden="true">
              <rect x="16" y="19" width="16" height="15" rx="3" fill="#fff" />
              <path d="M19 20a5 5 0 0 1 10 0" fill="none" stroke="#fff" strokeWidth="2.4" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="font-head text-base font-bold text-text-1">Shopify</div>
            <div className="text-[13px] text-text-2">{t('onboarding.s3.desc')}</div>
          </div>
          <span className="sa-chip bg-brand-cyan/10 text-brand-cyan">
            {t('onboarding.s3.recommended')}
          </span>
        </div>
        <button type="button" onClick={onConnect} className="sa-btn sa-btn-primary w-full !text-sm">
          {t('onboarding.s3.connect')}
        </button>
      </div>
      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={onSkip}
          className="text-[13px] text-text-3 hover:text-text-2"
        >
          {t('onboarding.s3.later')} →
        </button>
      </div>
    </>
  )
}

// ─── Step 4 : Loading ────────────────────────────────────────────────────

function StepLoading({ progress }: { progress: number }) {
  const t = useT()
  const checks: Array<[string, number]> = [
    [t('onboarding.s4.check1'), 20],
    [t('onboarding.s4.check2'), 45],
    [t('onboarding.s4.check3'), 72],
    [t('onboarding.s4.check4'), 92],
  ]
  return (
    <div className="text-center">
      <ConnectIllus />
      <h1 className="mb-2.5 mt-6 font-head text-[23px] font-bold tracking-[-0.02em] text-text-1">
        {t('onboarding.s4.title')}
      </h1>
      <p className="mb-7 text-[14px] text-text-2">{t('onboarding.s4.body')}</p>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-bg-3">
        <div
          className="h-full rounded-full bg-brand-grad transition-[width] duration-200"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex flex-col gap-2 text-left">
        {checks.map(([label, p]) => (
          <div
            key={label}
            className={[
              'flex items-center gap-2.5 transition-opacity duration-300',
              progress >= p ? 'opacity-100' : 'opacity-40',
            ].join(' ')}
          >
            <span
              className={[
                'flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full text-[11px] text-white',
                progress >= p ? 'bg-brand-green' : 'bg-bg-3',
              ].join(' ')}
            >
              {progress >= p ? '✓' : ''}
            </span>
            <span className="text-[13px] text-text-2">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Step 5 : First wow ──────────────────────────────────────────────────

function StepWow({
  score,
  insights,
  firstName,
  loadError,
  onDone,
}: {
  score: HealthScore | null
  insights: Insight[]
  firstName: string
  loadError: string | null
  onDone: () => void
}) {
  const t = useT()
  const hasScore = score?.has_data && typeof score.score === 'number'
  return (
    <>
      <div className="mb-6 text-center">
        <span className="sa-chip mb-3.5 inline-flex bg-brand-green/10 text-brand-green">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-green" />
          {t('onboarding.s5.done')}
        </span>
        <h1 className="mb-2.5 font-head text-[27px] font-extrabold tracking-[-0.03em] text-text-1">
          {t('onboarding.s5.title')}
        </h1>
        <p className="text-[14.5px] leading-[1.6] text-text-2">{t('onboarding.s5.body')}</p>
        {loadError && (
          <div className="mx-auto mt-4 max-w-[440px] rounded-[10px] border border-brand-amber/30 bg-brand-amber/10 px-3.5 py-2.5 text-left text-[13px] text-text-1">
            {loadError}
          </div>
        )}
      </div>

      <div className="sa-card mb-3.5">
        <div className="flex items-center gap-6">
          {hasScore ? (
            <ScoreRing
              value={score!.score}
              size={116}
              label={t('brief.score.label')}
              delta={score!.delta}
            />
          ) : (
            <div className="flex h-[116px] w-[116px] flex-shrink-0 items-center justify-center rounded-full border-2 border-dashed border-border text-text-3">
              <span className="font-mono text-xs">—</span>
            </div>
          )}
          <div className="flex-1">
            <div className="mb-1.5 font-head text-[17px] font-bold text-text-1">
              {firstName
                ? t('onboarding.s5.cardTitleNamed', { name: firstName })
                : t('onboarding.s5.cardTitle')}
            </div>
            <p className="text-[13.5px] leading-[1.55] text-text-2">
              {hasScore ? t('onboarding.s5.cardBody') : t('onboarding.s5.cardBodyNoData')}
            </p>
          </div>
        </div>
      </div>

      {insights.length > 0 && (
        <div className="mb-5 flex flex-col gap-2.5">
          {insights.map((i) => (
            <div
              key={i.id}
              className="flex items-start gap-3 rounded-brief border border-border bg-card p-3.5 shadow-card"
            >
              <SevDot sev={i.severity} />
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 truncate text-sm font-semibold text-text-1">{i.title}</div>
                <div className="text-[12.5px] leading-[1.45] text-text-2 line-clamp-2">
                  {i.actions?.[0]?.title ?? i.summary}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onDone}
        className="sa-btn sa-btn-primary w-full !py-3.5 !text-base"
      >
        {t('onboarding.s5.cta')} →
      </button>
    </>
  )
}

function SevDot({ sev }: { sev: Insight['severity'] }) {
  const cls =
    sev === 'critical' || sev === 'high'
      ? 'bg-brand-red/13 text-brand-red'
      : sev === 'medium'
        ? 'bg-brand-amber/13 text-brand-amber'
        : 'bg-brand-blue-deep/13 text-brand-blue-deep'
  return (
    <span
      className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[9px] font-head text-xs font-extrabold ${cls}`}
    >
      {sev === 'critical' || sev === 'high' ? '!' : sev === 'medium' ? '!' : '↗'}
    </span>
  )
}

// ─── Bits ────────────────────────────────────────────────────────────────

function Eyebrow({ n, hint }: { n: number; hint: string }) {
  const t = useT()
  return (
    <div className="mb-3.5 flex items-center gap-2.5">
      <span className="font-mono text-[11px] tracking-[0.1em] text-brand-blue-deep">
        {t('onboarding.step')} {n}/5
      </span>
      <span className="h-px flex-1 bg-border" />
      <span className="font-mono text-[11px] text-text-3">{hint}</span>
    </div>
  )
}

function ProfileIllus() {
  return (
    <svg width="70" height="70" viewBox="0 0 70 70" aria-hidden="true" className="flex-shrink-0">
      <defs>
        <linearGradient id="prof-grad" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#5C8FFF" />
          <stop offset="1" stopColor="#2DD9EE" />
        </linearGradient>
      </defs>
      <rect
        x="14"
        y="20"
        width="42"
        height="38"
        rx="8"
        fill="none"
        stroke="url(#prof-grad)"
        strokeWidth="2.8"
      />
      <line
        x1="22"
        y1="32"
        x2="42"
        y2="32"
        stroke="#5C5C78"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line
        x1="22"
        y1="40"
        x2="48"
        y2="40"
        stroke="#5C5C78"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line
        x1="22"
        y1="48"
        x2="38"
        y2="48"
        stroke="#5C5C78"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="48" cy="48" r="3.5" fill="#2DD9EE" />
    </svg>
  )
}

function ConnectIllus() {
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" className="mx-auto" aria-hidden="true">
      <defs>
        <linearGradient id="conn-grad" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#5C8FFF" />
          <stop offset="1" stopColor="#2DD9EE" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="42" r="10" fill="none" stroke="url(#conn-grad)" strokeWidth="3" />
      <circle cx="64" cy="42" r="10" fill="none" stroke="#5C5C78" strokeWidth="2.8" />
      <line
        x1="30"
        y1="42"
        x2="54"
        y2="42"
        stroke="url(#conn-grad)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="42" cy="42" r="3.5" fill="#2DD9EE" />
    </svg>
  )
}
