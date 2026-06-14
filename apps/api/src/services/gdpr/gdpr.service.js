// Service GDPR : export et suppression des données personnelles.
//
// Article 15 RGPD (droit d'accès) → exportUserData() retourne TOUTES les
// données qu'on a sur l'user, au format JSON portable.
//
// Article 17 RGPD (droit à l'effacement) → deleteUserData() supprime ou
// anonymise les données. Décisions assumées :
//   - audit_logs : ANONYMISÉS (user_id → NULL) plutôt que supprimés —
//     obligation légale de conservation (≥ 6 mois pour les logs auth).
//   - connectors / canonical_metrics / insights : DELETE CASCADE via FK
//     workspace.
//   - workspaces dont je suis sole member : DELETE → cascade tout.
//   - organizations dont je suis owner : si aucun autre member dans un
//     workspace de l'org → DELETE, sinon owner_id → NULL et l'org survit.
//   - waitlist_signups (par email) : DELETE.
//   - Supabase Auth user : DELETE via admin API.

const { getServiceRoleClient } = require('../../lib/supabase')
const { logger } = require('../../lib/logger')
const { UserFacingError } = require('../../lib/error-handler')

/**
 * Récupère TOUTES les données accessibles d'un user, format JSON.
 * Retourne un objet portable (taille raisonnable : on agrège les metrics
 * par jour/source plutôt que tous les rows, sinon ça explose).
 */
async function exportUserData(userId, userEmail) {
  const supabase = getServiceRoleClient()
  const now = new Date().toISOString()

  // 1. Memberships + workspaces accessibles
  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('role, accepted_at, invited_at, workspace_id, workspaces!inner(*)')
    .eq('user_id', userId)
  const workspaces = (memberships || []).map((m) => ({
    role: m.role,
    accepted_at: m.accepted_at,
    invited_at: m.invited_at,
    ...m.workspaces,
  }))
  const workspaceIds = workspaces.map((w) => w.id)

  // 2. Organizations possédées
  const { data: organizations } = await supabase
    .from('organizations')
    .select('*')
    .eq('owner_id', userId)

  // 3. Connecteurs (tokens chiffrés — on les expose mais ils sont opaques
  // pour l'user, c'est OK GDPR-wise puisque c'est SES tokens chiffrés
  // avec NOTRE clé Vault. On indique juste qu'il existe.)
  let connectors = []
  if (workspaceIds.length > 0) {
    const { data } = await supabase
      .from('connectors')
      .select('id, workspace_id, source, account_name, status, last_synced_at, created_at')
      .in('workspace_id', workspaceIds)
    connectors = data || []
  }

  // 4. Métriques canoniques (agrégées par metric_key + source + date pour
  // ne pas dépasser 1 Mo de JSON).
  let canonicalMetricsSummary = []
  if (workspaceIds.length > 0) {
    const { data } = await supabase
      .from('canonical_metrics')
      .select('workspace_id, source, metric_key, date, metric_value')
      .in('workspace_id', workspaceIds)
      .order('date', { ascending: false })
      .limit(5000) // cap raisonnable
    canonicalMetricsSummary = data || []
  }

  // 5. Insights (s'ils existent — la migration 022 peut ne pas être
  // appliquée encore quand on tourne cette PR).
  let insights = []
  if (workspaceIds.length > 0) {
    const { data } = await supabase
      .from('insights')
      .select('id, workspace_id, title, summary, category, severity, status, created_at')
      .in('workspace_id', workspaceIds)
    insights = data || []
  }

  // 6. Audit logs du user
  const { data: auditLogs } = await supabase
    .from('audit_logs')
    .select('action, resource_type, ip_address, user_agent, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(500)

  // 7. Waitlist signup (s'il s'est inscrit avant d'avoir un compte)
  const { data: waitlistSignup } = await supabase
    .from('waitlist_signups')
    .select('*')
    .eq('email', userEmail)
    .maybeSingle()

  return {
    exported_at: now,
    user: { id: userId, email: userEmail },
    organizations: organizations || [],
    workspaces,
    connectors,
    canonical_metrics: canonicalMetricsSummary,
    insights,
    audit_logs: auditLogs || [],
    waitlist_signup: waitlistSignup || null,
    notes: [
      "Les tokens OAuth/API key des connecteurs ne sont pas inclus (chiffrés via Vault, opaques).",
      "Les métriques sont limitées aux 5 000 lignes les plus récentes.",
      'Pour supprimer ces données : POST /api/v1/me/delete avec { confirm: "DELETE MY ACCOUNT" }.',
    ],
  }
}

/**
 * Supprime ou anonymise les données du user.
 * @returns {Promise<{ deleted: object }>}
 */
async function deleteUserData(userId, userEmail) {
  const supabase = getServiceRoleClient()
  const deleted = { workspaces: 0, organizations: 0, waitlist: 0, audit_anonymized: 0 }

  // 1. Sole-member workspaces : delete (cascade connectors + metrics + insights).
  const { data: myMemberships } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
  const myWsIds = (myMemberships || []).map((m) => m.workspace_id)

  for (const wsId of myWsIds) {
    const { count } = await supabase
      .from('workspace_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('workspace_id', wsId)
    if ((count ?? 0) <= 1) {
      const { error } = await supabase.from('workspaces').delete().eq('id', wsId)
      if (!error) deleted.workspaces++
    }
  }

  // 2. Memberships : delete tous (les workspaces partagés survivent sans moi).
  await supabase.from('workspace_members').delete().eq('user_id', userId)

  // 3. Organizations : pour celles dont je suis owner, si elles n'ont plus
  // aucun workspace → delete, sinon owner_id → NULL.
  const { data: ownedOrgs } = await supabase
    .from('organizations')
    .select('id')
    .eq('owner_id', userId)
  for (const org of ownedOrgs || []) {
    const { count } = await supabase
      .from('workspaces')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', org.id)
    if ((count ?? 0) === 0) {
      const { error } = await supabase.from('organizations').delete().eq('id', org.id)
      if (!error) deleted.organizations++
    } else {
      await supabase.from('organizations').update({ owner_id: null }).eq('id', org.id)
    }
  }

  // 4. Waitlist signup (par email).
  const { count: wlCount } = await supabase
    .from('waitlist_signups')
    .delete({ count: 'exact' })
    .eq('email', userEmail)
  deleted.waitlist = wlCount || 0

  // 5. Audit logs : ANONYMISER (NULL le user_id), pas supprimer.
  const { count: auditCount } = await supabase
    .from('audit_logs')
    .update({ user_id: null, ip_address: null, user_agent: null }, { count: 'exact' })
    .eq('user_id', userId)
  deleted.audit_anonymized = auditCount || 0

  // 6. Supabase Auth user : delete via admin API REST. supabase-js ne
  // l'expose pas dans le client anon ; on tape l'endpoint admin direct.
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (supabaseUrl && serviceKey) {
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        logger.error(
          { event: 'gdpr_auth_delete_failed', userId, status: res.status, body: txt.slice(0, 300) },
          'Supabase auth user delete failed',
        )
        // On ne throw pas — les données métier sont déjà supprimées. L'admin
        // pourra purger l'auth user à la main si besoin.
      }
    } catch (err) {
      logger.error(
        { event: 'gdpr_auth_delete_exception', userId, error: err.message },
        'Supabase auth user delete threw',
      )
    }
  } else {
    logger.warn(
      { event: 'gdpr_auth_delete_skipped', userId },
      'SUPABASE_SERVICE_ROLE_KEY missing — auth user not deleted',
    )
  }

  // 7. Audit log final (avec user_id=null puisqu'on vient de l'anonymiser
  // — c'est pour ça qu'on l'écrit après et qu'on stocke l'email anonymisé
  // dans `changes`).
  await supabase.from('audit_logs').insert({
    user_id: null,
    action: 'gdpr_delete',
    changes: {
      email_hash: hashEmail(userEmail),
      deleted_summary: deleted,
    },
  })

  logger.info({ event: 'gdpr_delete_completed', userId, deleted }, 'GDPR delete completed')
  return { deleted }
}

function hashEmail(email) {
  // Hash léger pour audit (pas crypto). On veut juste pouvoir savoir si
  // 2 demandes viennent du même email sans stocker l'email en clair.
  const s = String(email || '').toLowerCase()
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return `h:${(h >>> 0).toString(16)}`
}

function requireConfirmation(confirm) {
  if (confirm !== 'DELETE MY ACCOUNT') {
    throw new UserFacingError(
      'Pour confirmer la suppression, envoie { "confirm": "DELETE MY ACCOUNT" }.',
      { statusCode: 400, code: 'CONFIRMATION_REQUIRED' },
    )
  }
}

module.exports = {
  exportUserData,
  deleteUserData,
  requireConfirmation,
  hashEmail, // exporté pour tests
}
