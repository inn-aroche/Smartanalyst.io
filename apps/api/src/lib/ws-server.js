// WebSocket server pour le dashboard temps-réel /live.
//
// Pattern :
//   - Attaché au HTTP server Express (cf server.js).
//   - Path : /ws/live
//   - Auth : ?token=<jwt>&workspaceId=<uuid> en query string (les browsers
//     ne permettent pas de passer un header Authorization sur le handshake WS).
//   - Une fois auth OK : subscribe au channel Redis `track:<workspaceId>`
//     (via un client Redis dédié en mode subscriber) et forward chaque
//     event vers le WS client.
//
// Limitations actuelles (MVP) :
//   - 1 subscriber Redis par connexion WS (simple, suffisant à petit volume).
//     À refactor en multiplex partagé si on monte en charge.
//   - Pas de back-pressure / buffering : si le client est lent, on drop.

const Redis = require('ioredis')
const { WebSocketServer } = require('ws')
const { logger } = require('./logger')
const { verifyToken } = require('../services/auth/jwt.utils')
const { getServiceRoleClient } = require('./supabase')
const { channelFor } = require('../services/tracking/ingestion.service')

async function _userHasAccessToWorkspace(userId, workspaceId) {
  const supabase = getServiceRoleClient()
  const { data, error } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle()
  return !error && Boolean(data)
}

/**
 * Attache un WebSocketServer au HTTP server.
 * @param {import('http').Server} httpServer
 */
function attachWsServer(httpServer) {
  const wss = new WebSocketServer({ noServer: true })

  httpServer.on('upgrade', async (req, socket, head) => {
    if (!req.url) {
      socket.destroy()
      return
    }

    // Parse "/ws/live?token=...&workspaceId=..."
    let url
    try {
      url = new URL(req.url, 'http://x')
    } catch {
      socket.destroy()
      return
    }

    if (url.pathname !== '/ws/live') {
      socket.destroy()
      return
    }

    const token = url.searchParams.get('token')
    const workspaceId = url.searchParams.get('workspaceId')
    if (!token || !workspaceId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }

    // Verify JWT + membership avant l'upgrade
    let userId
    try {
      const decoded = verifyToken(token, 'access')
      userId = decoded.sub
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    const hasAccess = await _userHasAccessToWorkspace(userId, workspaceId).catch(() => false)
    if (!hasAccess) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      _bindClient(ws, { userId, workspaceId })
    })
  })

  function _bindClient(ws, { userId, workspaceId }) {
    // Un client Redis dédié par WS (mode subscriber bloquant — séparé du
    // singleton getRedis() utilisé pour les commandes normales).
    const sub = new Redis(process.env.REDIS_URL, { lazyConnect: false })
    const channel = channelFor(workspaceId)

    sub.subscribe(channel).catch((err) => {
      logger.warn(
        { event: 'ws_subscribe_failed', workspaceId, error: err.message },
        'Redis subscribe failed for WS client',
      )
      ws.close(1011, 'subscribe_failed')
    })

    sub.on('message', (_chan, message) => {
      if (ws.readyState !== ws.OPEN) return
      ws.send(message, { binary: false })
    })

    sub.on('error', (err) => {
      logger.warn({ event: 'ws_subscriber_error', error: err.message }, 'WS subscriber error')
    })

    ws.send(JSON.stringify({ type: 'connected', workspaceId, ts: Date.now() }))

    logger.info(
      { event: 'ws_client_connected', userId, workspaceId },
      'WS client connected to /live',
    )

    const cleanup = () => {
      try {
        sub.unsubscribe(channel).catch(() => {})
      } finally {
        sub.quit().catch(() => {})
      }
    }

    ws.on('close', cleanup)
    ws.on('error', cleanup)

    // Heartbeat : ping toutes les 30s pour détecter les sockets morts.
    const interval = setInterval(() => {
      if (ws.readyState !== ws.OPEN) {
        clearInterval(interval)
        return
      }
      ws.ping()
    }, 30_000)
    ws.on('close', () => clearInterval(interval))
  }

  logger.info({ event: 'ws_server_attached', path: '/ws/live' }, 'WebSocket server attached')
  return wss
}

module.exports = { attachWsServer }
