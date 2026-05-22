// Structured JSON logger (pino).
// Source: docs/01_CONVENTIONS_GLOBALES.md §2.4, docs/02_BONNES_PRATIQUES_TRANSVERSALES.md §5.1

const pino = require('pino')

const isProduction = process.env.NODE_ENV === 'production'
const level = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug')

const logger = pino({
  level,
  // En dev, pretty-print pour la lecture. En production, JSON brut (parsable par tooling).
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      },
  base: {
    service: 'smartanalyst-api',
  },
  // Redact des champs sensibles si jamais ils transitent par erreur
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.access_token',
      '*.refresh_token',
      '*.api_key',
    ],
    censor: '[REDACTED]',
  },
})

module.exports = { logger }
