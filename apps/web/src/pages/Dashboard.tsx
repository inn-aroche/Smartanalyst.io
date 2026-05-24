import Brand from '@/components/Brand'
import { useAuth } from '@/lib/auth'

export default function Dashboard() {
  const { state, logout } = useAuth()
  const workspace = state.workspaces[0]

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-bg-1/50 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-site items-center px-6">
          <Brand />
          <div className="ml-auto flex items-center gap-4">
            <span className="hidden font-mono text-xs uppercase tracking-wider text-text-3 sm:inline">
              {state.user?.email}
            </span>
            <button
              type="button"
              onClick={() => void logout()}
              className="sa-btn !py-1.5 !text-xs"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-site px-6 py-12">
        <div className="mb-8">
          <span className="font-mono text-xs uppercase tracking-widest text-brand-cyan">
            {workspace?.name ?? 'No workspace'}
          </span>
          <h1 className="mt-2 font-head text-4xl font-bold text-text-1">
            Welcome back{state.user?.full_name ? `, ${state.user.full_name}` : ''}.
          </h1>
          <p className="mt-2 text-text-2">
            Your workspace is live. Connect your first data source to start
            asking questions.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <DashboardCard
            badge="01"
            title="Connect a data source"
            body="Plug GA4, Meta Ads, Google Ads, Stripe or Search Console in 2 clicks."
            cta="Add connector"
          />
          <DashboardCard
            badge="02"
            title="Ask your first question"
            body="Try “What changed this week?” or “Why did CVR drop yesterday?”."
            cta="Open chat"
          />
          <DashboardCard
            badge="03"
            title="Schedule a report"
            body="Auto-generated PDF, sent on the 1st with an exec summary."
            cta="Configure"
          />
        </div>

        <div className="sa-card mt-10">
          <h2 className="font-head text-xl font-semibold text-text-1">
            Session
          </h2>
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <Row label="Email" value={state.user?.email ?? '—'} />
            <Row label="User ID" value={state.user?.id ?? '—'} />
            <Row label="Workspace" value={workspace?.name ?? '—'} />
            <Row label="Role" value={workspace?.role ?? '—'} />
          </dl>
        </div>
      </main>
    </div>
  )
}

function DashboardCard({
  badge,
  title,
  body,
  cta,
}: {
  badge: string
  title: string
  body: string
  cta: string
}) {
  return (
    <div className="sa-card flex flex-col">
      <span className="font-mono text-xs uppercase tracking-widest text-brand-cyan">
        {badge}
      </span>
      <h3 className="mt-3 font-head text-lg font-semibold text-text-1">
        {title}
      </h3>
      <p className="mt-2 flex-1 text-sm text-text-2">{body}</p>
      <button
        type="button"
        className="sa-btn mt-5 self-start !py-1.5 !text-xs"
        disabled
        title="Coming soon"
      >
        {cta} →
      </button>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[11px] uppercase tracking-wider text-text-3">
        {label}
      </dt>
      <dd className="mt-1 break-all font-mono text-sm text-text-1">{value}</dd>
    </div>
  )
}
