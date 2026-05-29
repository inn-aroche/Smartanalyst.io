// "The Ascent" mark — three ascending rounded bars + cyan signal dot.
// Sourced from the SmartAnalyst Brand Guidelines handoff bundle.

type Props = { size?: number; variant?: 'gradient' | 'solid' | 'onLight' }

function BrandMark({ size = 28, variant = 'gradient' }: Props) {
  const uid = `sa-grad-${Math.random().toString(36).slice(2, 9)}`
  if (variant === 'solid') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="currentColor"
        role="img"
        aria-label="SmartAnalyst"
        className="block shrink-0"
      >
        <rect x="8" y="40" width="11" height="16" rx="3" opacity="0.45" />
        <rect x="22.5" y="26" width="11" height="30" rx="3" opacity="0.78" />
        <rect x="37" y="12" width="11" height="44" rx="3" />
        <circle cx="42.5" cy="8" r="5" />
      </svg>
    )
  }
  if (variant === 'onLight') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        role="img"
        aria-label="SmartAnalyst"
        className="block shrink-0"
      >
        <rect x="8" y="40" width="11" height="16" rx="3" fill="#3D6BE0" opacity="0.45" />
        <rect x="22.5" y="26" width="11" height="30" rx="3" fill="#3D6BE0" opacity="0.82" />
        <rect x="37" y="12" width="11" height="44" rx="3" fill="#3D6BE0" />
        <circle cx="42.5" cy="8" r="5" fill="#2DD9EE" />
      </svg>
    )
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="SmartAnalyst"
      className="block shrink-0"
    >
      <defs>
        <linearGradient id={uid} x1="0" y1="64" x2="64" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5C8FFF" />
          <stop offset="100%" stopColor="#2DD9EE" />
        </linearGradient>
      </defs>
      <rect x="8" y="40" width="11" height="16" rx="3" fill="#5C8FFF" opacity="0.45" />
      <rect x="22.5" y="26" width="11" height="30" rx="3" fill={`url(#${uid})`} opacity="0.78" />
      <rect x="37" y="12" width="11" height="44" rx="3" fill={`url(#${uid})`} />
      <circle cx="42.5" cy="8" r="5" fill="#2DD9EE" />
    </svg>
  )
}

export default function Brand({
  size = 28,
  variant = 'onLight',
}: {
  size?: number
  variant?: 'gradient' | 'solid' | 'onLight'
}) {
  return (
    <div className="inline-flex items-center gap-2.5">
      <BrandMark size={size} variant={variant} />
      <span className="font-head text-base font-bold tracking-tight text-text-1">
        SmartAnalyst
      </span>
    </div>
  )
}

export { BrandMark }
