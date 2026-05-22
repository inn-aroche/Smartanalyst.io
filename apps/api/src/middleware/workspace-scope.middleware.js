// Middleware: vérifie que req.user a accès au workspace ciblé.
// Source: docs/03_ARCHITECTURE_GLOBALE.md §3.2 (RLS as backup, code enforcement first)
//
// Cherche workspaceId dans (par ordre): req.params, req.query, req.body.
// Accepte `workspaceId` (camelCase) ou `workspace_id` (snake_case).
//
// En cas de succès, attache:
//   req.workspaceId   - UUID validé
//   req.workspaceRole - 'admin' | 'editor' | 'viewer'

const { getServiceRoleClient } = require('../lib/supabase')
const { UserFacingError, ForbiddenError } = require('../lib/error-handler')
const { logger } = require('../lib/logger')

function extractWorkspaceId(req) {
  return (
    req.params?.workspaceId ||
    req.params?.workspace_id ||
    req.query?.workspaceId ||
    req.query?.workspace_id ||
    req.body?.workspaceId ||
    req.body?.workspace_id ||
    null
  )
}

async function workspaceScope(req, res, next) {
  try {
    if (!req.user?.id) {
      return next(new UserFacingError('Authentification requise.', { statusCode: 401, code: 'AUTH_REQUIRED' }))
    }

    const workspaceId = extractWorkspaceId(req)
    if (!workspaceId) {
      return next(
        new UserFacingError('workspaceId requis.', { statusCode: 400, code: 'WORKSPACE_ID_REQUIRED' }),
      )
    }

    const supabase = getServiceRoleClient()
    const { data: member, error } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('user_id', req.user.id)
      .eq('workspace_id', workspaceId)
      .maybeSingle()

    if (error) {
      logger.error({ event: 'workspace_scope_error', userId: req.user.id, workspaceId, error: error.message })
      return next(error)
    }

    if (!member) {
      return next(new ForbiddenError("Tu n'as pas accès à cet espace de travail."))
    }

    req.workspaceId = workspaceId
    req.workspaceRole = member.role
    next()
  } catch (err) {
    next(err)
  }
}

/**
 * Variante qui exige un rôle minimum (admin > editor > viewer).
 * Usage: router.use(requireRole('admin'))
 */
function requireRole(minRole) {
  const RANK = { viewer: 1, editor: 2, admin: 3 }
  return (req, res, next) => {
    if (!req.workspaceRole) {
      return next(
        new UserFacingError('workspaceScope middleware doit être appelé avant requireRole.', {
          statusCode: 500,
          code: 'MIDDLEWARE_ORDER',
        }),
      )
    }
    if ((RANK[req.workspaceRole] || 0) < (RANK[minRole] || 0)) {
      return next(new ForbiddenError(`Cette action requiert le rôle "${minRole}".`))
    }
    next()
  }
}

module.exports = { workspaceScope, requireRole }
