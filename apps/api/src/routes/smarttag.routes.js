// SmartTag dashboard routes: /api/v1/smarttag/*
//
// Routes authentifiées utilisées par la page Smart tag côté app web pour
// décider si on affiche l'onboarding (tag pas installé) ou le dashboard
// (events qui arrivent). À ne pas confondre avec /api/v1/track qui est le
// endpoint public d'ingestion (POST event depuis le script sa.js).

const express = require('express')

const { jwtMiddleware } = require('../middleware/jwt.middleware')
const { workspaceScope } = require('../middleware/workspace-scope.middleware')
const ingestion = require('../services/tracking/ingestion.service')

const router = express.Router()

router.use(jwtMiddleware)
router.use(workspaceScope)

// GET /smarttag/status
// Renvoie l'état d'installation du tag pour le workspace courant.
//   { installed: boolean, lastEventAt: number|null }
// Polled par la page Smart tag pendant l'étape "verify install" (toutes les
// 2s pendant ~30s, jusqu'à ce que le 1er event arrive ou timeout).
router.get('/status', async (req, res, next) => {
  try {
    const status = await ingestion.getStatus(req.workspaceId)
    res.json(status)
  } catch (err) {
    next(err)
  }
})

module.exports = router
