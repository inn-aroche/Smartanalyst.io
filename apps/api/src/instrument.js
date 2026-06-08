// Sentry instrumentation — MUST be required FIRST in every entry point
// (server.js, queue-jobs/index.js), avant tous les autres `require`. Le SDK v8+
// utilise OpenTelemetry sous le capot et a besoin d'être init avant que les
// modules instrumentés (express, http, ioredis...) soient chargés.
//
// Pourquoi ce fichier séparé plutôt qu'un init dans lib/sentry.js : le require
// d'init doit être en tête de stack avant n'importe quel autre `require`. Si
// on l'enrobe dans `getSentry().init()`, on a déjà chargé express avant que
// Sentry ne puisse l'instrumenter. Conséquence : breadcrumbs HTTP perdus.
//
// No-op si SENTRY_DSN est absent (dev local, tests). Permet à l'app de booter
// sans Sentry sans changer de chemin de code.

require('dotenv').config()

const Sentry = require('@sentry/node')

const DSN = process.env.SENTRY_DSN
const ENVIRONMENT = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development'
const RELEASE = process.env.SENTRY_RELEASE // commit SHA injecté par le deploy
const TRACES_SAMPLE_RATE = parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1')

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: ENVIRONMENT,
    release: RELEASE,
    tracesSampleRate: TRACES_SAMPLE_RATE,
    // Capture les request bodies pour les erreurs 5xx, mais jamais les
    // headers `authorization` ou `cookie` (Sentry default filter).
    sendDefaultPii: false,
    // Ne pas dédoubler les events worker/api — chaque process a son tag.
    initialScope: {
      tags: {
        service: process.env.SENTRY_SERVICE_TAG || 'api',
      },
    },
  })
}

module.exports = { Sentry, enabled: Boolean(DSN) }
