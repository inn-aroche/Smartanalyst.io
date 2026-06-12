// Dashboard routes — alias des metrics routes avec un naming neutre côté
// adblockers (uBlock Origin et autres bloquent agressivement les paths
// `/metrics/*` car ils matchent les patterns analytics/tracking).
//
// Routes :
//   GET /overview            ↔ alias de /api/v1/metrics/summary
//   GET /series/:metricKey   ↔ alias de /api/v1/metrics/timeseries
//
// Backward-compat
// ---------------
// Les anciens endpoints /api/v1/metrics/* restent en place pour ne pas
// casser des SDK / tokens externes éventuels qui les consommeraient.
// Le frontend SaaS utilise désormais /api/v1/dashboard/*.
//
// Implem
// ------
// Les handlers sont importés de metrics.routes.js pour éviter la
// duplication. Si on change la logique dans un, l'autre suit automatiquement.

const express = require('express')
const { jwtMiddleware } = require('../middleware/jwt.middleware')
const { workspaceScope } = require('../middleware/workspace-scope.middleware')
const { handlers: metricsHandlers } = require('./metrics.routes')

const router = express.Router()

router.use(jwtMiddleware)
router.use(workspaceScope)

router.get('/overview', metricsHandlers.summary)
router.get('/series/:metricKey', (req, res, next) => {
  // Le handler timeseries lit `metric` depuis req.query — on l'injecte
  // depuis le path param pour conserver le pattern REST /series/:metricKey
  // côté frontend (plus naturel que ?metric=...).
  req.query.metric = req.params.metricKey
  return metricsHandlers.timeseries(req, res, next)
})

module.exports = router
