import AppLayout from '@/components/AppLayout'
import { useAuth } from '@/lib/auth'

export default function SettingsPage() {
  const { state, logout } = useAuth()
  const user = state.user
  const workspace = state.workspaces[0]

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-8">
          <span className="font-mono text-xs uppercase tracking-widest text-brand-cyan">
            Settings
          </span>
          <h1 className="mt-2 font-head text-3xl font-bold text-text-1">
            Account & workspace.
          </h1>
        </div>

        <Section title="Profile">
          <Field label="Full name" value={user?.full_name ?? '—'} />
          <Field label="Email" value={user?.email ?? '—'} />
          <Field label="User ID" value={user?.id ?? '—'} mono />
        </Section>

        <Section title="Workspace">
          <Field label="Name" value={workspace?.name ?? '—'} />
          <Field label="Workspace ID" value={workspace?.id ?? '—'} mono />
          <Field label="Your role" value={workspace?.role ?? '—'} />
        </Section>

        <Section title="Security">
          <div className="sa-card flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-text-1">Password</div>
              <div className="mt-1 text-sm text-text-2">
                Reset your password via the email flow. We'll send you a magic link.
              </div>
            </div>
            <button
              type="button"
              className="sa-btn shrink-0 !text-xs"
              disabled
              title="Coming soon — email-based password reset"
            >
              Reset password
            </button>
          </div>
        </Section>

        <Section title="Session">
          <div className="sa-card flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-text-1">Sign out everywhere</div>
              <div className="mt-1 text-sm text-text-2">
                End this session and invalidate the refresh token.
              </div>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="sa-btn shrink-0 !text-xs"
            >
              Sign out
            </button>
          </div>
        </Section>

        <Section title="Danger zone">
          <div className="sa-card flex items-center justify-between gap-4 border-brand-red/20">
            <div>
              <div className="text-sm font-semibold text-text-1">Delete workspace</div>
              <div className="mt-1 text-sm text-text-2">
                Permanently remove this workspace and all its data. This can't be undone.
              </div>
            </div>
            <button
              type="button"
              className="sa-btn shrink-0 border-brand-red/40 !text-xs text-brand-red"
              disabled
              title="Coming soon"
            >
              Delete
            </button>
          </div>
        </Section>
      </div>
    </AppLayout>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 font-head text-sm font-semibold uppercase tracking-widest text-text-3">
        {title}
      </h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="sa-card flex flex-col gap-1">
      <div className="font-mono text-[10px] uppercase tracking-widest text-text-3">
        {label}
      </div>
      <div
        className={`${
          mono ? 'font-mono text-xs' : 'text-sm'
        } break-all text-text-1`}
      >
        {value}
      </div>
    </div>
  )
}
