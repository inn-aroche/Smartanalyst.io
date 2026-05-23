// PM2 process manifest for the API + worker on the VPS.
// Loaded by `pm2 reload ecosystem.config.cjs --update-env` after each deploy.

module.exports = {
  apps: [
    {
      name: 'smartanalyst-api',
      script: 'src/server.js',
      cwd: '/srv/smartanalyst-api/apps/api',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '500M',
      env: { NODE_ENV: 'production' },
      // Hard restart loop guards
      max_restarts: 10,
      min_uptime: '30s',
      // Pino writes JSON to stdout; PM2 captures it
      out_file: '/srv/smartanalyst-api/logs/api.out.log',
      error_file: '/srv/smartanalyst-api/logs/api.err.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'smartanalyst-worker',
      script: 'src/queue-jobs/index.js',
      cwd: '/srv/smartanalyst-api/apps/api',
      instances: 1,
      exec_mode: 'fork',
      // Playwright (PDF rendering) is memory-hungry
      max_memory_restart: '1G',
      env: { NODE_ENV: 'production' },
      max_restarts: 10,
      min_uptime: '30s',
      out_file: '/srv/smartanalyst-api/logs/worker.out.log',
      error_file: '/srv/smartanalyst-api/logs/worker.err.log',
      merge_logs: true,
      time: true,
    },
  ],
}
