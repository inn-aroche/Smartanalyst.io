// Search routes : /api/v1/search
//
// Endpoint unique cross-entity (cahier §3 Lot 2). Le résultat est groupé
// par bucket (conversations / insights / reports) pour permettre une UI
// type "résultats catégorisés" plutôt qu'une liste plate.

const express = require('express')
const { query } = require('express-validator')

const { jwtMiddleware } = require('../middleware/jwt.middleware')
const { workspaceScope } = require('../middleware/workspace-scope.middleware')
const { runValidation } = require('../middleware/validation.middleware')
const searchService = require('../services/search/search.service')

const router = express.Router()
router.use(jwtMiddleware)

router.get(
  '/',
  [
    query('workspaceId').isUUID().withMessage('workspaceId UUID requis.'),
    query('q').isString().bail().trim().isLength({ min: 2, max: 200 }),
    query('limit').optional().isInt({ min: 1, max: 20 }),
  ],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const results = await searchService.search({
        workspaceId: req.workspaceId,
        query: req.query.q,
        limit: Number(req.query.limit) || 5,
      })
      res.json(results)
    } catch (err) {
      next(err)
    }
  },
)

module.exports = router
