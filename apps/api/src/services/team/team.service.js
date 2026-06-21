// Team management — invitations + membres workspace (cahier §3 Lot 4).
//
// Le flux complet :
//   1. Owner/editor invite un email → on stocke un token hashe + on envoie
//      un email avec l'URL d'acceptation `/invite/accept?token=…`.
//   2. Destinataire clique → si compte SmartAnalyst existant on cree le
//      workspace_members directement ; sinon on le redirige vers /signup et
//      le membership est cree apres confirmation email.
//
// Le clear-token n'existe qu'en memoire le temps d'envoyer l'email.

const crypto = require('node:crypto')

const { getServiceRoleClient } = require('../../lib/supabase')
const { logger } = require('../../lib/logger')
const { UserFacingError, NotFoundError } = require('../../lib/error-handler')
const resend = require('../email/resend.service')
const emailTemplate = require('../email/email-template.service')

const VALID_ROLES = ['admin', 'editor', 'viewer']
const INVITE_TTL_DAYS = 7

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function buildAcceptUrl(token) {
  const base = (process.env.APP_URL || 'https://app.smartanalyst.io').replace(/\/$/, '')
  return `${base}/invite/accept?token=${encodeURIComponent(token)}`
}

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase()
}

/**
 * Liste les membres + invitations pending d'un workspace.
 */
async function listMembers(workspaceId) {
  const supabase = getServiceRoleClient()

  const { data: members, error: memErr } = await supabase
    .from('workspace_members')
    .select('id, role, created_at, accepted_at, invited_by_user_id, user_id')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
  if (memErr) throw memErr

  // Enrichit avec email/nom via auth.admin (1 round-trip par membre).
  // Un workspace a typiquement < 20 membres en MVP : on ne batch pas.
  const userIds = (members || []).map((m) => m.user_id).filter(Boolean)
  const profiles = new Map()
  for (const uid of userIds) {
    try {
      const { data, error } = await supabase.auth.admin.getUserById(uid)
      if (!error && data?.user) {
        profiles.set(uid, {
          id: data.user.id,
          email: data.user.email,
          full_name: data.user.user_metadata?.full_name || null,
        })
      }
    } catch (_) {
      // best-effort : on garde le membre sans email plutot que de tout planter.
    }
  }

  const enriched = (members || []).map((m) => ({
    id: m.id,
    user_id: m.user_id,
    role: m.role,
    created_at: m.created_at,
    accepted_at: m.accepted_at,
    email: profiles.get(m.user_id)?.email || null,
    full_name: profiles.get(m.user_id)?.full_name || null,
  }))

  const { data: invitations, error: invErr } = await supabase
    .from('workspace_invitations')
    .select('id, email, role, status, expires_at, created_at')
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (invErr) throw invErr

  return { members: enriched, invitations: invitations || [] }
}

/**
 * Cree une invitation et envoie l'email. Best-effort sur l'email : si Resend
 * fail, on garde l'invitation mais on remonte un avertissement.
 */
async function inviteMember(workspaceId, invitedByUserId, { email, role = 'editor' }) {
  const cleanEmail = normalizeEmail(email)
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new UserFacingError('Email invalide.', { statusCode: 400, code: 'INVALID_EMAIL' })
  }
  if (!VALID_ROLES.includes(role)) {
    throw new UserFacingError('Role invalide.', { statusCode: 400, code: 'INVALID_ROLE' })
  }

  const supabase = getServiceRoleClient()

  // Genere un token clair URL-safe + son hash.
  const token = crypto.randomBytes(32).toString('base64url')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString()

  const { data: inv, error } = await supabase
    .from('workspace_invitations')
    .insert({
      workspace_id: workspaceId,
      invited_by: invitedByUserId,
      email: cleanEmail,
      role,
      token_hash: tokenHash,
      expires_at: expiresAt,
    })
    .select('id, email, role, status, expires_at, created_at')
    .single()
  if (error) {
    // Doublon sur (workspace_id, email, status='pending') → 409.
    if (error.code === '23505') {
      throw new UserFacingError('Une invitation est deja en attente pour cet email.', {
        statusCode: 409,
        code: 'INVITE_PENDING',
      })
    }
    throw error
  }

  // Recupere le nom du workspace pour l'email.
  const { data: ws } = await supabase
    .from('workspaces')
    .select('name')
    .eq('id', workspaceId)
    .maybeSingle()

  const acceptUrl = buildAcceptUrl(token)
  const wsName = ws?.name || 'SmartAnalyst'
  const roleLabels = { admin: 'admin', editor: 'éditeur', viewer: 'lecteur' }
  const roleLabel = roleLabels[role] || role
  const { html, text } = emailTemplate.renderEmail({
    preview: `Tu as été invité à rejoindre ${wsName}.`,
    title: 'Tu as une invitation 🎉',
    intro: `Tu as été invité à rejoindre l'espace de travail « ${wsName} » sur SmartAnalyst en tant que ${roleLabel}.`,
    body: `<p style="margin:0 0 8px 0;font-size:14px;line-height:1.55;color:#5C5C78">En acceptant, tu pourras :</p>
      <ul style="margin:0 0 8px 0;padding-left:22px;font-size:14px;line-height:1.6;color:#14142A">
        <li>Voir les insights et tableaux de bord du workspace</li>
        <li>Poser des questions à l'IA sur les données connectées</li>
        ${role !== 'viewer' ? '<li>Créer des rapports et des veilles</li>' : ''}
      </ul>`,
    cta: { label: "Accepter l'invitation", href: acceptUrl },
    footer: `Ce lien expire dans ${INVITE_TTL_DAYS} jours. Si tu n'attendais pas cette invitation, tu peux l'ignorer en toute sécurité.`,
  })
  const emailResult = await resend.sendEmail({
    to: cleanEmail,
    subject: `Invitation à rejoindre « ${wsName} » sur SmartAnalyst`,
    html,
    text,
  })

  if (!emailResult.ok) {
    logger.warn(
      { event: 'invite_email_failed', invitationId: inv.id, error: emailResult.error },
      'Invite email send failed (invitation still created)',
    )
  }

  return { ...inv, emailDelivered: emailResult.ok }
}

/**
 * Revoke une invitation pending (admin/editor).
 */
async function revokeInvitation(workspaceId, invitationId) {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('workspace_invitations')
    .update({ status: 'revoked' })
    .eq('workspace_id', workspaceId)
    .eq('id', invitationId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new NotFoundError('Invitation introuvable ou deja traitee.')
  return { revoked: true }
}

/**
 * Met a jour le role d'un membre existant. Empeche de retirer le dernier admin.
 */
async function updateMemberRole(workspaceId, memberId, newRole) {
  if (!VALID_ROLES.includes(newRole)) {
    throw new UserFacingError('Role invalide.', { statusCode: 400, code: 'INVALID_ROLE' })
  }
  const supabase = getServiceRoleClient()

  // Recupere le membre vise.
  const { data: target, error: getErr } = await supabase
    .from('workspace_members')
    .select('id, user_id, role')
    .eq('workspace_id', workspaceId)
    .eq('id', memberId)
    .maybeSingle()
  if (getErr) throw getErr
  if (!target) throw new NotFoundError('Membre introuvable.')

  // Garde-fou : si on retire le rang admin et qu'il reste 0 admin → block.
  if (target.role === 'admin' && newRole !== 'admin') {
    const { count } = await supabase
      .from('workspace_members')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('role', 'admin')
    if ((count || 0) <= 1) {
      throw new UserFacingError('Impossible de retirer le dernier administrateur du workspace.', {
        statusCode: 400,
        code: 'LAST_ADMIN',
      })
    }
  }

  const { error: updErr } = await supabase
    .from('workspace_members')
    .update({ role: newRole })
    .eq('id', memberId)
  if (updErr) throw updErr
  return { updated: true, role: newRole }
}

/**
 * Retire un membre du workspace (admin only). Empeche de virer le dernier
 * admin et empeche un user de se retirer lui-meme via ce endpoint (pour ca
 * il faut delete le compte ou demander a un autre admin).
 */
async function removeMember(workspaceId, memberId, actorUserId) {
  const supabase = getServiceRoleClient()
  const { data: target, error: getErr } = await supabase
    .from('workspace_members')
    .select('id, user_id, role')
    .eq('workspace_id', workspaceId)
    .eq('id', memberId)
    .maybeSingle()
  if (getErr) throw getErr
  if (!target) throw new NotFoundError('Membre introuvable.')

  if (target.user_id === actorUserId) {
    throw new UserFacingError('Tu ne peux pas te retirer toi-meme. Demande a un autre admin.', {
      statusCode: 400,
      code: 'SELF_REMOVE',
    })
  }

  if (target.role === 'admin') {
    const { count } = await supabase
      .from('workspace_members')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('role', 'admin')
    if ((count || 0) <= 1) {
      throw new UserFacingError('Impossible de retirer le dernier administrateur du workspace.', {
        statusCode: 400,
        code: 'LAST_ADMIN',
      })
    }
  }

  const { error: delErr } = await supabase.from('workspace_members').delete().eq('id', memberId)
  if (delErr) throw delErr
  return { removed: true }
}

/**
 * Accepte une invitation : valide le token, cree le workspace_members, marque
 * l'invitation 'accepted'. Idempotent : si deja accepte par le meme user,
 * renvoie OK silencieusement.
 */
async function acceptInvitation(token, userId, userEmail) {
  if (!token) {
    throw new UserFacingError('Token manquant.', { statusCode: 400, code: 'TOKEN_REQUIRED' })
  }
  const supabase = getServiceRoleClient()
  const tokenHash = hashToken(token)

  const { data: inv, error: getErr } = await supabase
    .from('workspace_invitations')
    .select('id, workspace_id, email, role, status, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()
  if (getErr) throw getErr
  if (!inv) throw new NotFoundError('Invitation introuvable ou deja consommee.')

  if (inv.status !== 'pending') {
    throw new UserFacingError('Cette invitation a deja ete utilisee ou revoquee.', {
      statusCode: 410,
      code: 'INVITE_NOT_PENDING',
    })
  }
  if (new Date(inv.expires_at).getTime() < Date.now()) {
    await supabase.from('workspace_invitations').update({ status: 'expired' }).eq('id', inv.id)
    throw new UserFacingError('Cette invitation a expire. Demande-en une nouvelle.', {
      statusCode: 410,
      code: 'INVITE_EXPIRED',
    })
  }

  // Verifie que l'email du user connecte matche l'email invite (defense en
  // profondeur : empeche qu'un user A ouvre le lien de l'user B).
  if (normalizeEmail(userEmail) !== normalizeEmail(inv.email)) {
    throw new UserFacingError(
      `Cette invitation a ete envoyee a ${inv.email}. Connecte-toi avec ce compte.`,
      { statusCode: 403, code: 'EMAIL_MISMATCH' },
    )
  }

  // Cree le membership (ou no-op si deja la).
  const { error: insErr } = await supabase.from('workspace_members').insert({
    workspace_id: inv.workspace_id,
    user_id: userId,
    role: inv.role,
    accepted_at: new Date().toISOString(),
  })
  // 23505 = deja membre → on tolere (l'acceptation devient idempotente).
  if (insErr && insErr.code !== '23505') throw insErr

  await supabase
    .from('workspace_invitations')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      accepted_by: userId,
    })
    .eq('id', inv.id)

  logger.info(
    { event: 'invite_accepted', invitationId: inv.id, workspaceId: inv.workspace_id, userId },
    'Workspace invitation accepted',
  )
  return { workspaceId: inv.workspace_id, role: inv.role }
}

module.exports = {
  listMembers,
  inviteMember,
  revokeInvitation,
  updateMemberRole,
  removeMember,
  acceptInvitation,
  VALID_ROLES,
}
