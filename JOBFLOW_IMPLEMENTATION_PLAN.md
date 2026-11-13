# JobFlow Implementation Plan

Living plan. Updated as milestones complete. See JOBFLOW_STATUS.md for the current
state and the precise next task.

## Architecture

- **Web app**: Next.js 16 (App Router) + React 19, TypeScript strict.
- **DB**: PostgreSQL via Prisma 6. Tenant isolation: every user-owned row carries
  `userId`; all queries filter by it (`src/lib/jobs/service.ts`, etc.).
- **Auth**: email/password, bcrypt, hashed session tokens in httpOnly cookies
  (`src/lib/auth/*`). Edge middleware guards `/app/*` and preserves the exact
  destination; the `/app` layout re-validates server-side.
- **LLM**: provider abstraction (`src/lib/llm`) with Anthropic, bridge (documented,
  unverified protocol), and a labeled no-network mock. Service layer builds prompts
  with anti-fabrication + untrusted-input hardening.
- **Storage**: private file storage driver (`src/lib/storage`), never a public URL.
- **Design system**: Tailwind tokens in `tailwind.config.ts` + `globals.css`
  (off-white #F7F5F0, charcoal #252824, brick #B84A3A, stone borders).
- **Extension** (planned): Chrome MV3, content scripts + background worker, paired
  to the backend with a least-privilege token; ATS adapters (Greenhouse, Lever,
  Ashby first).

## Milestones

- [x] M0 Foundation: install, schema, migrations, build, LLM abstraction, design system.
- [x] M1 Public-first + progressive auth: public browsing, signup/login/sessions,
      intent preservation, tenant isolation, job save, Claude tailoring, tracker,
      explicit-confirmation submission. 18 tests.
- [ ] M2 Resume library: PDF/DOCX upload, text extraction, private storage,
      owner-only signed download, delete. (in progress)
- [ ] M3 Manual job entry + job-fit analysis (Zod-validated structured LLM output).
- [x] M5 Chrome MV3 extension (integrated): manifest (minimal perms), background
      worker, popup + side panel, secure pairing (short-lived revocable token),
      ATS adapters (Greenhouse/Lever/Ashby) with jsdom fixture tests, content-script
      autofill (tested) that never fills sensitive questions and never auto-submits,
      backend ext API, outcome reporting. Live-site autofill NOT validated here.
- [x] M5b Adapter hardening: multi-step navigation detection, required-field/validation
      error detection, realm-safe React/Vue value setter + select/radio/checkbox fill,
      dynamic-form retry, route-level ext API tests. Live-site validation BLOCKED here
      (browser extension not connected) — documented; fixtures expanded instead.
- [x] M6 Free-quota + entitlement: 3 lifetime CONFIRMED successes per account,
      then subscription required; enforced atomically (Serializable tx), idempotent
      per clientRef, failed/uncertain never consume quota. (Stripe billing UI pending.)
- [x] M8 Billing + subscription lifecycle: Stripe Checkout + Customer Portal +
      verified idempotent webhooks (created/updated/deleted/payment_failed), dev
      adapter (no real charge), public /pricing, /app/settings/billing. Lifetime free
      quota re-keyed to a per-EMAIL ledger that survives account recreation; subscribed
      usage does not deplete it; cancellation/expiry revert without resetting past use.
      Stripe LIVE verification blocked (no keys) — deterministic tests use the SDK's
      offline signing helpers.
- [x] M9 LLM hardening: timeout + bounded retries/backoff (retry only on retryable,
      no double-charge on success), output-size cap, Zod-validated structured outputs
      (job-fit), per-user rate limit, mock blocked in production (at getLlm), untrusted
      job/resume text kept as data, secrets never surfaced in errors. Anthropic adapter
      ready; LIVE Claude calls blocked (no ANTHROPIC_API_KEY).
- [ ] M7 Settings, data export/deletion, admin/support foundation.
- [ ] M8 Hardening: SSRF guard on any server-side fetch, rate limits, audit events,
      retention, security docs; deployment guide; supported-ATS matrix.

## Security principles (enforced, not aspirational)

- Authn + authz on every protected server op; strict per-user isolation.
- Secrets server-side only; never in frontend bundle, extension storage, logs, or responses.
- Uploads: type allowlist + size limit + random storage key + owner-only access.
- Treat job/page content as untrusted data, never instructions.
- Never store third-party site credentials or cookies; never bypass CAPTCHA/MFA/anti-bot.
- Record submission only after credible page confirmation; distinguish confirmed/failed/uncertain.

## Honest constraints

- No ANTHROPIC_API_KEY configured here → app runs on the labeled mock by default.
- Claude Bridge protocol undocumented → adapter fails loudly, does not invent an API.
- No Stripe keys → billing uses a labeled dev adapter.
- Extension autofill cannot be validated against live ATS pages from this environment;
  adapter logic is tested against local fixture HTML instead.
