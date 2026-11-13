# Deploying JobFlow to production

JobFlow is a Next.js (App Router) app with a PostgreSQL database (via Prisma) and a
companion Chrome extension. This guide covers a production deployment end to end.

## 0. Prerequisites

- Node.js 20+ and npm.
- A PostgreSQL 14+ database (managed is fine: Neon, Supabase, RDS, Railway, …).
- A domain with HTTPS (cookies are secure/httpOnly; the app must be served over TLS).
- Optional: an Anthropic API key, Stripe account, and a published extension listing.

## 1. Environment variables

Copy `.env.example` and fill it in. The app validates the environment at boot
(`src/lib/env.ts`) and fails loudly if anything required is missing or inconsistent.

Required:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Postgres connection string (include `?sslmode=require` for most managed DBs). |
| `AUTH_SECRET` | Long random string (`openssl rand -hex 32`). Rotating it logs everyone out. |
| `NODE_ENV=production` | Enables production behavior; blocks the mock LLM provider. |

LLM (pick one provider):

| Variable | Notes |
|---|---|
| `LLM_PROVIDER` | `anthropic` (recommended in prod), `bridge`, or `cli`. `mock` is refused in production. |
| `ANTHROPIC_API_KEY` | Required when `LLM_PROVIDER=anthropic`. |
| `BRIDGE_BASE_URL` / `BRIDGE_API_KEY` | Required when `LLM_PROVIDER=bridge`. Confirm your bridge's real protocol first. |

Billing (optional — defaults to a labeled `dev` adapter that never charges):

| Variable | Notes |
|---|---|
| `BILLING_PROVIDER` | `dev` (default) or `stripe`. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO` | All three required when `BILLING_PROVIDER=stripe`. Use test keys until you are ready. |

Extension:

| Variable | Notes |
|---|---|
| `EXTENSION_ALLOWED_ORIGIN` | `chrome-extension://<id>` of your published extension (pairing checks this). |
| `EXTENSION_WEBSTORE_URL` | Your store listing; when set, the app shows a one-click "Add to browser". See `docs/PUBLISH_EXTENSION.md`. |

## 2. Database

```bash
npm ci
npx prisma generate
npx prisma migrate deploy   # applies committed migrations (never `migrate dev` in prod)
npm run db:seed             # optional: seeds reference/demo data
```

`migrate deploy` is idempotent and safe to run on every release.

## 3. Build and run

```bash
npm run build               # next build
npm run start               # serves on $PORT (default 3000) behind your TLS proxy
```

Put the app behind a reverse proxy / platform that terminates TLS (Vercel, Fly,
Railway, Render, a container on ECS/Cloud Run, etc.). Security headers are set in
`next.config.mjs`.

### Platform notes

- **Vercel**: set all env vars in the project; run `prisma migrate deploy` as a build
  or release step. Use a pooled Postgres connection string.
- **Container**: the provided app needs only Node + the built `.next` output. Run
  `prisma migrate deploy` as a release command before `npm run start`.

### No server-side browser needed

Auto-apply runs entirely in the user's own browser via the extension, so the server
needs **no headless browser** (no Playwright / Chromium install, no extra memory).

## 4. The browser extension

Users install the extension separately. For a one-click install, publish it to the
Chrome Web Store and set `EXTENSION_WEBSTORE_URL` — full steps in
`docs/PUBLISH_EXTENSION.md`. Until then the app offers a signed-in `.zip` download
and the developer "load unpacked" flow.

After publishing, set `EXTENSION_ALLOWED_ORIGIN=chrome-extension://<id>` so pairing
accepts the published extension.

## 5. Pre-flight checklist

```bash
npm run typecheck     # 0 errors
npm run lint          # 0 problems
npm test              # all green (needs a reachable Postgres test DB; see vitest.config.ts)
npm run build         # compiles
npm run ext:build     # extension bundles to extension/dist + zip
```

- [ ] `DATABASE_URL` points at the production DB and `migrate deploy` has run.
- [ ] `AUTH_SECRET` is a fresh long random value, not the example.
- [ ] `NODE_ENV=production` and `LLM_PROVIDER` is not `mock`.
- [ ] TLS is enforced end to end (secure cookies will not work over plain HTTP).
- [ ] If using Stripe: live/test keys set, and the webhook endpoint is registered
      and reachable at `/api/billing/webhook`.
- [ ] Extension published (or the download flow is acceptable) and
      `EXTENSION_ALLOWED_ORIGIN` matches.

## 6. Post-deploy smoke test

1. Sign up, confirm you land in `/app`.
2. Upload a resume; confirm it parses and only you can download it.
3. Open `/app/settings/extension`, generate a pairing code, connect the extension.
4. Run auto-apply for a role; confirm a tab group opens and supported forms fill.
5. If billing is live: run a test checkout and confirm the webhook records it.
