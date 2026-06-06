// Mini service HTTP local : écoute sur 127.0.0.1:3001, reçoit POST de GHA
// avec header X-Deploy-Token, exécute le script bash correspondant.
//
// Pourquoi ce service plutôt que SSH+rsync dans la CI : permet de supprimer
// toute connexion SSH entrante depuis le runner GHA. Si Hostinger (ou un
// autre fournisseur) ferme le port 22 / déclenche son Anti-DDoS, le deploy
// continue de marcher (passe par 443/Nginx).
//
// Sécurité :
//   - Bind sur 127.0.0.1 uniquement (jamais exposé direct). Accès via Nginx
//     proxy_pass /admin/deploy/ → 127.0.0.1:3001/deploy/.
//   - Auth par token long (≥32 chars) dans header X-Deploy-Token.
//   - Tous les call sites loggés en JSON (success / failure / forbidden).
//   - Exécution déléguée à des scripts bash versionnés dans le repo
//     (scripts/deploy-{api,web}.sh) — pas d'eval dynamique.

const express = require('express')
const { execFile } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const pino = require('pino')

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'deploy-server' },
})

const PORT = parseInt(process.env.DEPLOY_SERVER_PORT || '3001', 10)
const HOST = process.env.DEPLOY_SERVER_HOST || '127.0.0.1'
const DEPLOY_TOKEN = process.env.DEPLOY_TOKEN
const REPO_PATH = process.env.REPO_PATH || '/srv/smartanalyst-repo'
const EXEC_TIMEOUT_MS = 8 * 60 * 1000 // 8 min — suffit pour build + npm ci

if (!DEPLOY_TOKEN || DEPLOY_TOKEN.length < 32) {
  logger.fatal('DEPLOY_TOKEN missing or too short (must be ≥ 32 chars)')
  process.exit(1)
}

const SCRIPT_BY_TARGET = {
  api: path.join(REPO_PATH, 'scripts/deploy-api.sh'),
  web: path.join(REPO_PATH, 'scripts/deploy-web.sh'),
}

const app = express()
app.use(express.json({ limit: '4kb' }))
app.disable('x-powered-by')

function requireToken(req, res, next) {
  const token = req.header('X-Deploy-Token') || ''
  // Comparaison à durée constante pour éviter les timing attacks
  if (
    token.length !== DEPLOY_TOKEN.length ||
    !require('node:crypto').timingSafeEqual(Buffer.from(token), Buffer.from(DEPLOY_TOKEN))
  ) {
    logger.warn(
      { event: 'deploy_auth_failed', ip: req.ip, path: req.path },
      'Bad deploy token',
    )
    return res.status(403).json({ error: 'forbidden' })
  }
  next()
}

function runDeploy(target, req, res) {
  const script = SCRIPT_BY_TARGET[target]
  if (!script) return res.status(400).json({ error: 'unknown_target' })
  if (!fs.existsSync(script)) {
    logger.error({ event: 'deploy_script_missing', target, script }, 'Script not found')
    return res.status(500).json({ error: 'deploy_script_missing', script })
  }

  logger.info({ event: 'deploy_started', target }, `Deploy ${target} started`)
  const startedAt = Date.now()

  execFile(
    '/bin/bash',
    [script],
    {
      timeout: EXEC_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024, // 4 MB
      env: { ...process.env, REPO_PATH },
    },
    (err, stdout, stderr) => {
      const durationMs = Date.now() - startedAt
      if (err) {
        logger.error(
          {
            event: 'deploy_failed',
            target,
            durationMs,
            error: err.message,
            code: err.code,
            signal: err.signal,
            stderr: stderr.slice(-2000),
          },
          `Deploy ${target} failed`,
        )
        return res.status(500).json({
          error: 'deploy_failed',
          message: err.message,
          stderr: stderr.slice(-2000),
          stdout: stdout.slice(-2000),
        })
      }
      logger.info(
        { event: 'deploy_success', target, durationMs },
        `Deploy ${target} succeeded in ${durationMs}ms`,
      )
      res.json({ ok: true, target, durationMs, stdout: stdout.slice(-2000) })
    },
  )
}

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'deploy-server', ts: new Date().toISOString() })
})

app.post('/deploy/api', requireToken, (req, res) => runDeploy('api', req, res))
app.post('/deploy/web', requireToken, (req, res) => runDeploy('web', req, res))

app.use((req, res) => res.status(404).json({ error: 'not_found' }))

const server = app.listen(PORT, HOST, () => {
  logger.info(
    { event: 'deploy_server_listening', host: HOST, port: PORT, repoPath: REPO_PATH },
    `Deploy server listening on ${HOST}:${PORT}`,
  )
})

// Graceful shutdown — important : ne pas couper un deploy en cours.
function shutdown(signal) {
  logger.info({ event: 'deploy_server_shutdown', signal }, `Shutting down (${signal})`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 30_000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
