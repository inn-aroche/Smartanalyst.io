// Health score route: /api/v1/health-score
// Brief V2 §3.1 — score 0-100 + breakdown + delta vs semaine précédente.

const express = require('express')
const { query } = require('express-validator')

const { jwtMiddleware } = require('../middleware/jwt.middleware')
const { workspaceScope } = require('../middleware/workspace-scope.middleware')
const { runValidation } = require('../middleware/validation.middleware')
const healthScore = require('../services/health/health-score.service')

const router = express.Router()
router.use(jwtMiddleware)

router.get(
  '/',
  [query('workspaceId').isUUID().withMessage('workspaceId UUID requis.')],
  runValidation,
  workspaceScope,
  async (req, res, next) => {
    try {
      const result = await healthScore.getScore(req.workspaceId)
      res.json(result)
    } catch (err) {
      next(err)
    }
  },
)

module.exports = router
