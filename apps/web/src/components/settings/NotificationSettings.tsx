import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api'
import { useT } from '@/lib/i18n'

type Settings = {
  weekly_digest: boolean
  critical_alerts: boolean
  email_override: string | null
}

export default function NotificationSettings({ workspaceId }: { workspaceId: string }) {
  const t = useT()
  const queryClient = useQueryClient()
  const q = useQuery({
    queryKey: ['notification-settings', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () => apiFetch<Settings>(`/api/v1/notification-settings?workspaceId=${workspaceId}`),
  })

  const [emailDraft, setEmailDraft] = useState('')
  const [savedFlag, setSavedFlag] = useState(false)

  useEffect(() => {
    if (q.data?.email_override !== undefined) {
      setEmailDraft(q.data.email_override ?? '')
    }
  }, [q.data?.email_override])

  const mutation = useMutation({
    mutationFn: async (patch: Partial<Settings>) =>
      apiFetch<Settings>(`/api/v1/notification-settings`, {
        method: 'PATCH',
        body: { workspaceId, ...patch },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notification-settings', workspaceId] })
      setSavedFlag(true)
      setTimeout(() => setSavedFlag(false), 1500)
    },
  })

  if (q.isLoading || !q.data) {
    return <div className="sa-card animate-pulse h-32" />
  }
  const s = q.data

  return (
    <div className="sa-card flex flex-col gap-4">
      <Toggle
        checked={s.weekly_digest}
        onChange={(v) => mutation.mutate({ weekly_digest: v })}
        title={t('notifSettings.weeklyDigest.title')}
        body={t('notifSettings.weeklyDigest.body')}
      />
      <hr className="border-border" />
      <Toggle
        checked={s.critical_alerts}
        onChange={(v) => mutation.mutate({ critical_alerts: v })}
        title={t('notifSettings.criticalAlerts.title')}
        body={t('notifSettings.criticalAlerts.body')}
      />
      <hr className="border-border" />
      <div className="flex flex-col gap-2">
        <div className="text-sm font-semibold text-text-1">
          {t('notifSettings.emailOverride.title')}
        </div>
        <p className="text-sm text-text-2">{t('notifSettings.emailOverride.body')}</p>
        <div className="flex gap-2">
          <input
            type="email"
            className="sa-input flex-1"
            value={emailDraft}
            onChange={(e) => setEmailDraft(e.target.value)}
            placeholder={t('notifSettings.emailOverride.placeholder')}
          />
          <button
            type="button"
            onClick={() => mutation.mutate({ email_override: emailDraft || null })}
            disabled={mutation.isPending}
            className="sa-btn !py-1.5 !text-xs"
          >
            {t('notifSettings.save')}
          </button>
        </div>
        {savedFlag && <span className="text-xs text-brand-green">{t('notifSettings.saved')}</span>}
      </div>
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  title,
  body,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  title: string
  body: string
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-text-1">{title}</div>
        <div className="mt-1 text-sm text-text-2">{body}</div>
      </div>
      <span
        className={`relative mt-1 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
          checked ? 'bg-brand-blue' : 'bg-bg-2'
        }`}
      >
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition ${
            checked ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </span>
    </label>
  )
}
