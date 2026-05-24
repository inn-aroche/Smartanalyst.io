export default function Brand() {
  return (
    <div className="inline-flex items-center gap-2">
      <div className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-blue to-brand-cyan">
        <span className="block h-2.5 w-2.5 rounded-sm bg-white/90" />
      </div>
      <span className="font-head text-base font-bold tracking-tight text-text-1">
        SmartAnalyst
      </span>
    </div>
  )
}
