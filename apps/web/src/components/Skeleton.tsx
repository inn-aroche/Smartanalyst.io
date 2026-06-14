// Primitives Skeleton réutilisables.
//
// Pourquoi en composants plutôt que des classes Tailwind inline :
//   - cohérence visuelle (rayon, couleur de fond, durée d'animation)
//   - lecture du JSX plus claire (`<SkeletonLine w="20" />` vs
//     `<div className="h-3 w-20 animate-pulse rounded bg-card" />`)
//   - facile à brancher sur prefers-reduced-motion plus tard
//
// Utilise les variables CSS du thème (var(--card)) pour rester cohérent
// dark/light si on bascule.

type Width = 'full' | 'half' | string

function widthClass(w?: Width): string {
  if (!w) return 'w-full'
  if (w === 'full') return 'w-full'
  if (w === 'half') return 'w-1/2'
  return w.startsWith('w-') ? w : `w-${w}`
}

/** Ligne (texte) — par défaut 1rem de hauteur. */
export function SkeletonLine({
  w,
  h = 'h-3',
  className = '',
}: {
  w?: Width
  h?: string
  className?: string
}) {
  return <div className={`${h} ${widthClass(w)} animate-pulse rounded bg-card ${className}`} />
}

/** Bloc rectangulaire (image, badge, badge logo, etc.). */
export function SkeletonBlock({
  w = 'full',
  h = 'h-10',
  rounded = 'rounded-lg',
  className = '',
}: {
  w?: Width
  h?: string
  rounded?: string
  className?: string
}) {
  return <div className={`${h} ${widthClass(w)} animate-pulse ${rounded} bg-card ${className}`} />
}

/** Cercle (avatar, dot, badge rond). */
export function SkeletonCircle({ size = 'h-10 w-10' }: { size?: string }) {
  return <div className={`${size} animate-pulse rounded-full bg-card`} />
}

/** Carte complète (header + 2 lignes + footer). Utile pour la plupart des grilles. */
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`sa-card flex flex-col gap-3 ${className}`}>
      <div className="flex items-start gap-3">
        <SkeletonBlock w="w-10" h="h-10" />
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonLine w="w-32" h="h-3" />
          <SkeletonLine w="w-20" h="h-2" />
        </div>
      </div>
      <SkeletonLine w="w-full" h="h-3" />
      <SkeletonLine w="w-2/3" h="h-3" />
      <div className="mt-2 flex items-center justify-between">
        <SkeletonLine w="w-16" h="h-2" />
        <SkeletonBlock w="w-24" h="h-7" rounded="rounded-md" />
      </div>
    </div>
  )
}

/** Grille de N cartes (default 6). */
export function SkeletonCardGrid({
  count = 6,
  className = 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3',
}: {
  count?: number
  className?: string
}) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
