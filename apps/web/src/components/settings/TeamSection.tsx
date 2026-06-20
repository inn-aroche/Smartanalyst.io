// TeamSection — gestion des membres + invitations (cahier §3 Lot 4).
//
// 3 zones :
//   - en-tete avec bouton "Inviter" (toggle un formulaire inline)
//   - liste des membres actuels (avec role + remove)
//   - liste des invitations pending (avec revoke)
//
// Roles : admin > editor > viewer. Seul admin peut promote/demote ; admins
// et editors peuvent inviter.

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch, ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useT, useLocale, type StringKey } from '@/lib/i18n'

type Role = 'admin' | 'editor' | 'viewer'

type Member = {
  id: string
  user_id: string
  role: Role
  email: string | null
  full_name: string | null
  accepted_at: string | null
  created_at: string
}

type Invitation = {
  id: string
  email: string
  role: Role
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
  expires_at: string
  created_at: string
}

type TeamPayload = { members: Member[]; invitations: Invitation[] }

export default function TeamSection() {
  const t = useT()
  const { locale } = useLocale()
  const queryClient = useQueryClient()
  const { state } = useAuth()
  const workspaceId = state.workspaces[0]?.id
  const myUserId = state.user?.id
  const myRole = (state.workspaces[0]?.role || 'viewer') as Role
  const canInvite = myRole === 'admin' || myRole === 'editor'
  const canManage = myRole === 'admin'

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('editor')
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(
    null,
  )

  const listQ = useQuery({
    queryKey: ['team', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () => apiFetch<TeamPayload>(`/api/v1/team?workspaceId=${workspaceId}`),
    staleTime: 30_000,
  })

  const invite = useMutation({
    mutationFn: async () => {
      const res = await apiFetch<{ invitation: Invitation & { emailDelivered: boolean } }>(
        '/api/v1/team/invite',
        {
          method: 'POST',
          body: { workspaceId, email: inviteEmail.trim(), role: inviteRole },
        },
      )
      return res
    },
    onSuccess: (data) => {
      setFeedback({
        kind: data.invitation.emailDelivered ? 'ok' : 'warn',
        text: data.invitation.emailDelivered
          ? t('team.invite.success')
          : t('team.invite.successNoEmail'),
      })
      setInviteEmail('')
      setInviteRole('editor')
      setInviteOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['team', workspaceId] })
    },
    onError: (err) => {
      const msg = mapTeamError(err, t)
      setFeedback({ kind: 'err', text: msg })
    },
  })

  const revokeInv = useMutation({
    mutationFn: async (id: string) => {
      return apiFetch(`/api/v1/team/invitations/${id}?workspaceId=${workspaceId}`, {
        method: 'DELETE',
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['team', workspaceId] })
    },
  })

  const updateRole = useMutation({
    mutationFn: async (args: { memberId: string; role: Role }) => {
      return apiFetch(`/api/v1/team/members/${args.memberId}`, {
        method: 'PATCH',
        body: { workspaceId, role: args.role },
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['team', workspaceId] })
    },
    onError: (err) => {
      setFeedback({ kind: 'err', text: mapTeamError(err, t) })
    },
  })

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      return apiFetch(`/api/v1/team/members/${memberId}?workspaceId=${workspaceId}`, {
        method: 'DELETE',
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['team', workspaceId] })
    },
    onError: (err) => {
      setFeedback({ kind: 'err', text: mapTeamError(err, t) })
    },
  })

  const members = listQ.data?.members || []
  const invitations = listQ.data?.invitations || []

  return (
    <div className="flex flex-col gap-3">
      <div className="sa-card">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="font-head text-[14px] font-semibold text-text-1">{t('team.title')}</div>
            <p className="mt-1 text-[12.5px] text-text-2">{t('team.body')}</p>
          </div>
          {canInvite && !inviteOpen && (
            <button
              type="button"
              onClick={() => {
                setInviteOpen(true)
                setFeedback(null)
              }}
              className="sa-btn sa-btn-primary flex-shrink-0 !text-[12px]"
            >
              + {t('team.invite.cta')}
            </button>
          )}
        </div>

        {inviteOpen && (
          <div className="rounded-[10px] border border-border bg-bg-2 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
              <div>
                <label className="block text-[12px] font-medium text-text-1">
                  {t('team.invite.email')}
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="teammate@example.com"
                  className="sa-input mt-1 w-full !text-[13px]"
                  maxLength={254}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-text-1">
                  {t('team.invite.role')}
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as Role)}
                  className="sa-input mt-1 !text-[13px]"
                >
                  <option value="editor">{t('team.role.editor')}</option>
                  <option value="viewer">{t('team.role.viewer')}</option>
                  {canManage && <option value="admin">{t('team.role.admin')}</option>}
                </select>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => invite.mutate()}
                disabled={invite.isPending || !isValidEmail(inviteEmail)}
                className="sa-btn sa-btn-primary !text-[12px] disabled:opacity-60"
              >
                {invite.isPending ? t('team.invite.sending') : t('team.invite.send')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setInviteOpen(false)
                  setInviteEmail('')
                  setFeedback(null)
                }}
                className="sa-btn !text-[12px]"
              >
                {t('team.invite.cancel')}
              </button>
            </div>
          </div>
        )}

        {feedback && (
          <div
            className={[
              'mt-3 rounded-[8px] px-3 py-2 text-[12px]',
              feedback.kind === 'ok' &&
                'border border-brand-green/30 bg-brand-green/10 text-brand-green',
              feedback.kind === 'warn' &&
                'border border-brand-amber/30 bg-brand-amber/10 text-brand-amber',
              feedback.kind === 'err' &&
                'border border-brand-red/30 bg-brand-red/10 text-brand-red',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {feedback.text}
          </div>
        )}
      </div>

      {/* Membres actifs */}
      <div className="sa-card">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-text-3">
          {t('team.members.title')} ({members.length})
        </div>
        {listQ.isLoading ? (
          <div className="h-3 w-1/2 animate-pulse rounded bg-bg-3" />
        ) : members.length === 0 ? (
          <div className="text-[12.5px] text-text-3">{t('team.members.empty')}</div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {members.map((m) => {
              const isYou = m.user_id === myUserId
              return (
                <li
                  key={m.id}
                  className="flex items-center gap-3 rounded-[8px] border border-border/60 bg-bg-2/40 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-text-1">
                      {m.full_name || m.email || m.user_id.slice(0, 8) + '…'}
                      {isYou && (
                        <span className="ml-2 rounded bg-bg-3 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-text-3">
                          {t('team.members.you')}
                        </span>
                      )}
                    </div>
                    {m.email && m.full_name && (
                      <div className="truncate text-[11.5px] text-text-3">{m.email}</div>
                    )}
                  </div>
                  {canManage && !isYou ? (
                    <select
                      value={m.role}
                      onChange={(e) =>
                        updateRole.mutate({ memberId: m.id, role: e.target.value as Role })
                      }
                      disabled={updateRole.isPending}
                      className="sa-input !w-auto !text-[12px]"
                      aria-label={t('team.role.change')}
                    >
                      <option value="admin">{t('team.role.admin')}</option>
                      <option value="editor">{t('team.role.editor')}</option>
                      <option value="viewer">{t('team.role.viewer')}</option>
                    </select>
                  ) : (
                    <span className="rounded bg-bg-3 px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-widest text-text-3">
                      {t(`team.role.${m.role}` as StringKey)}
                    </span>
                  )}
                  {canManage && !isYou && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(t('team.members.remove.confirm'))) {
                          removeMember.mutate(m.id)
                        }
                      }}
                      disabled={removeMember.isPending}
                      className="sa-btn !text-[11.5px] disabled:opacity-60"
                    >
                      {t('team.members.remove')}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Invitations pending */}
      {invitations.length > 0 && (
        <div className="sa-card">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-text-3">
            {t('team.invitations.title')} ({invitations.length})
          </div>
          <ul className="flex flex-col gap-1.5">
            {invitations.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center gap-3 rounded-[8px] border border-border/60 bg-bg-2/40 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-text-1">{inv.email}</div>
                  <div className="mt-0.5 truncate text-[11px] text-text-3">
                    {t('team.invitations.expires', {
                      date: new Date(inv.expires_at).toLocaleDateString(locale),
                    })}
                  </div>
                </div>
                <span className="rounded bg-bg-3 px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-widest text-text-3">
                  {t(`team.role.${inv.role}` as StringKey)}
                </span>
                {canInvite && (
                  <button
                    type="button"
                    onClick={() => revokeInv.mutate(inv.id)}
                    disabled={revokeInv.isPending}
                    className="sa-btn !text-[11.5px] disabled:opacity-60"
                  >
                    {t('team.invitations.revoke')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}

function mapTeamError(err: unknown, t: ReturnType<typeof useT>): string {
  if (err instanceof ApiError) {
    if (err.code === 'LAST_ADMIN') return t('team.error.lastAdmin')
    if (err.code === 'SELF_REMOVE') return t('team.error.selfRemove')
    if (err.code === 'ALREADY_MEMBER') return t('team.error.alreadyMember')
    if (err.code === 'INVITE_PENDING') return t('team.error.invitePending')
    return err.message
  }
  return t('team.invite.error')
}
