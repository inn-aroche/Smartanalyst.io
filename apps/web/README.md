# @smartanalyst/web

Authenticated SaaS frontend for SmartAnalyst.io — Vite + React + TypeScript.

## Stack

- **Vite 5** — build & dev server
- **React 18** + **TypeScript** (strict)
- **react-router-dom** — routing
- **@tanstack/react-query** — server state
- **Tailwind CSS** — styling, sharing tokens with the marketing site
- Auth: JWT in `localStorage` (refresh token rotation handled by `lib/auth.tsx`)

## Local dev

```bash
# from repo root
npm install
npm run dev:web
# → http://localhost:5173

# in another terminal, run the API
npm run dev:api
# → http://localhost:3000 (Vite proxies /api → :3000)
```

Copy `.env.example` to `.env.local` if you need a custom API URL.

## Build

```bash
npm run build --workspace=@smartanalyst/web
# → apps/web/dist/
```

## Deployment

Static build deployed to `app.smartanalyst.io` (Hostinger) by
`.github/workflows/deploy-web.yml` on push to `main`.

See `docs/DEPLOYMENT_WEB.md` for the one-time setup.
