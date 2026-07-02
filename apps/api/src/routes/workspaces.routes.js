// Workspace routes — branding white-label (cahier §3 Lot 4 + §4.8).
//
// Pour l'instant un seul endpoint : PATCH brand_color + logo_url. Le reste
// (nom du workspace, plan, etc.) est géré ailleurs (me.routes pour read,
// stripe-webhook pour le plan).

const express = require('express')
const { body } = require('express-validator')

const { jwtMiddleware } = require('../middleware/jwt.middleware')
const { workspaceScope, requireRole } = require('../middleware/workspace-scope.middleware')
const { runValidation } = require('../middleware/validation.middleware')
const { UserFacingError, NotFoundError } = require('../lib/error-handler')
const { getServiceRoleClient } = require('../lib/supabase')

const router = express.Router()
router.use(jwtMiddleware)

// ━━━ PATCH /api/v1/workspaces — met à jour branding du workspace courant ━━━
// Réservé aux owners/editors. Accepte :
//   - brand_color : hex 6 chars (ex: '#6366f1'), null pour reset au default
//   - logo_url    : URL https, null pour retirer
router.patch(
  '/',
  [
    body('workspaceId').isUUID(),
    body('brand_color')
      .optional({ nullable: true })
      .matches(/^#[0-9a-fA-F]{6}$/)
      .withMessage('brand_color doit être un code hex à 6 chiffres (ex: #6366f1)'),
    body('logo_url')
      .optional({ nullable: true })
      .isURL({ require_tld: false, protocols: ['https'] }),
    // C3 — langue des emails transactionnels (synchronisée depuis Réglages).
    body('locale').optional().isIn(['fr', 'en']),
  ],
  runValidation,
  workspaceScope,
  requireRole('editor'),
  async (req, res, next) => {
    try {
      const patch = {}
      if ('brand_color' in req.body) patch.brand_color = req.body.brand_color
      if ('logo_url' in req.body) patch.logo_url = req.body.logo_url
      if ('locale' in req.body) patch.locale = req.body.locale
      if (Object.keys(patch).length === 0) {
        return next(
          new UserFacingError('Aucun champ modifiable fourni.', {
            statusCode: 400,
            code: 'EMPTY_PATCH',
          }),
        )
      }
      const supabase = getServiceRoleClient()
      const { data, error } = await supabase
        .from('workspaces')
        .update(patch)
        .eq('id', req.workspaceId)
        .select('id, name, brand_color, logo_url')
        .maybeSingle()
      if (error) throw error
      if (!data) throw new NotFoundError('Workspace introuvable.')
      res.json({ workspace: data })
    } catch (err) {
      next(err)
    }
  },
)

module.exports = router
