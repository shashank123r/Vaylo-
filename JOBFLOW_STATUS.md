# JobFlow Status

Updated continuously so work survives session restarts. Newest state at top.

## SECTION-WISE PROFILE SYSTEM (in progress, requested by user)

Building a section-wise application-profile wizard + resume autofill + completion
scoring. Progress:
- **Phase 1 DONE — schema + migration** (`20261022030631_section_wise_profile`,
  additive/safe, applied, client generated). Extended `Profile` (personal, work
  prefs, factual application questions, sensitive declarations), added `gradeScale`
  + `graduationStatus` to `Education`, `source`/`confirmed` provenance to
  Education/WorkExperience/SkillItem, and new models `Project`, `Certification`,
  `ProfileFieldMeta` (per-field provenance + conflict review). `FieldSource` enum.
- **Phase 2 DONE — completion engine** (`src/lib/profile/completion.ts`): field
  catalog with essential/helpful/optional tiers + sensitive flags; `computeCompletion`
  gives percent, per-section + per-tier breakdown, and missing essential/helpful
  lists. Sensitive + optional fields excluded from the denominator. 8 tests
  (`tests/profile-completion.test.ts`), all green; deterministic/server-safe.
- **Phase 3 DONE — server loader + completion wiring** (`src/lib/profile/data.ts`):
  `loadProfileData(userId)` reads persisted profile + entry counts + resume status +
  account email (tenant-safe); `getProfileCompletion(userId)` computes the
  authoritative server-side %. 5 tests (`tests/profile-data.test.ts`): new-user score,
  rises + deterministic on reload (survives refresh), sensitive-exclusion persisted,
  resume counts, cross-user isolation. All green. Test DB auto-synced via db push.
- **Phase 4 DONE — section-wise wizard UI** (`src/app/app/profile/page.tsx` +
  `actions.ts` + `src/lib/profile/sections.ts`): 9 navigable sections, save-as-you-go
  server actions, prominent progress bar + per-section % + missing-field checklist,
  add/remove for education/experience/skills/projects/certifications, sensitive
  declarations clearly optional. Verified e2e in a real browser: % rose 6→31→50 as
  data was added, persisted across reloads, grade "3.9"/"GPA 4.0" kept verbatim,
  declarations did not change the score, no mobile overflow, no errors.
- **Phase 5 DONE — resume autofill** (`src/lib/profile/autofill.ts`): grounded LLM
  extraction (Zod schema, strict no-invention prompt) + `applyResumeExtraction` that
  fills ONLY empty fields, marks them resume-derived (ProfileFieldMeta source=RESUME,
  unconfirmed), flags conflicts with user-confirmed values WITHOUT overwriting, never
  erases, no duplicates. Wired into the upload route (best-effort; a slow/failed LLM
  never fails the upload). 8 deterministic unit tests. Also hardened `extractJson`
  (balanced-brace extraction tolerating prose around JSON) + 2 tests. Real-LLM
  extraction is best-effort and completeness varies by resume/model (never invents).
- **Phase 6 DONE — readiness view** (`computeReadiness` + `getProfileStatus`): ready/
  not-ready, essential blockers, and "may pause specific applications" for unknown
  factual answers (work auth, sponsorship, resume) — we pause & ask, never guess.
  3 tests + rendered on the profile page.
- New tests total: profile-completion 11, profile-data 5, profile-autofill 8,
  llm +2 = 26 added across the feature. All green.

## DEPLOY-READY (as of the overnight loop)

Verified green end-to-end: `tsc` 0 errors, `eslint` 0 problems, `next build` clean
(34 static pages, 39 routes, **no warnings** after the middleware→proxy migration),
`npm test` = **99 passing / 20 files**. Full happy path smoke-tested in PRODUCTION
mode (NODE_ENV=production, CSP + HSTS + rate-limiting active): signup, profile save,
job create→detail, all app + marketing pages load, ZERO CSP violations, zero page
errors. Real LLM (Claude via CLI) verified end-to-end. Mobile (375px): no overflow,
working nav on app + marketing. Error/404 pages, favicon, robots, SEO titles,
metadataBase, deploy docs (`docs/DEPLOY.md`), extension APP_URL templating all in.

Two items below await a product decision; everything else is done.

## PRO DAILY QUOTA — 50 confirmed successes/day, IST (implemented)

Pro changed from "unlimited" to **up to 50 CONFIRMED SUCCESSFUL submissions per IST
(Asia/Kolkata) calendar day**; Free unchanged (3 lifetime per email, durable).
- **IST boundary** (`src/lib/billing/day.ts`): `istDay`/`nextIstMidnight`, exact
  UTC+5:30, no DST. Tested (`tests/ist-day.test.ts`).
- **Two-phase reservation** (`src/lib/applications/reservation.ts`,
  `SubmissionReservation` model + migration): `reserveSubmission` (fail-closed,
  idempotent, Serializable — concurrent workers can't overshoot) → `finalizeConfirmed`
  (evidence only; counts) / `releaseReservation` (confirmed failure/not-submitted;
  frees) / `markUncertain` (ambiguous → HOLDS capacity until reconciled, no blind
  retry) / `reconcileReservation`. `getQuota` is daily for Pro (used/limit/remaining/
  resetAt) and lifetime for Free.
- **Integration**: the server auto-apply orchestrator reserves before each attempt
  and finalizes by outcome; the extension/API `recordSubmissionResult` routes
  CONFIRMED→finalize, UNCERTAIN→hold, FAILED→release — so web + extension share ONE
  atomic daily quota.
- **Copy**: pricing (₹500/mo, "Up to 50 successful applications per day", IST reset,
  no over-promise), billing + extension-settings pages, extension popup.
- **Tests**: `tests/quota-daily.test.ts` (11) covering 50/day, block-after-50, failed
  not counting, ambiguous+reconcile, duplicate confirmations (idempotent), concurrency
  (no overshoot), crash reconciliation, daily reset, extension/web shared quota, Free
  regression, subscription expiry. Plus 3 IST tests. All green. Billing test updated
  for daily semantics.

## FLAGGED FOR USER DECISION (found by overnight testing)

1. **Uploaded resume text is not used by the AI.** `uploadResume` parses and stores
   the resume text (`resumeFile.parsedText`), but the LLM features (tailor resume,
   cover letter, analyze fit) are "grounded only in the profile" (deliberate, see
   `src/lib/llm/service.ts`) — they use the manually-entered structured profile
   (skills/experience/education), NOT the uploaded PDF. Effect: a new user who
   uploads a resume but has not filled their profile gets a 0/100 fit analysis
   ("no experience"). Verified end-to-end: real Claude via CLI works and returns a
   structured analysis in ~14s; the 0/100 was correct for an EMPTY profile.
   Options: (a) feed `parsedText` into the LLM prompts as extra grounding, (b)
   auto-populate the profile from the resume on upload, or (c) make the UI clearly
   require profile completion for AI features. Needs a product call — not auto-fixed
   because it changes the deliberate grounding model / output quality.
2. **Server-side Playwright apply subsystem is dead** (see note below): keep as a
   tested fallback or delete to drop the heavy `playwright` dep from prod.

## Overnight hardening loop (deploy-readiness)

Running `/loop` to test + harden toward deploy-ready. Done so far:
- Test count 83 → **95** (added `ext-rank.test.ts`, `jobfilter.test.ts`); full suite green.
- Functional-tested every core flow via headless browser: all 10 app pages load clean;
  profile save, resume upload+parse (+ invalid/renamed-file rejection, unit-tested),
  job create→tracker, billing dev upgrade+cancel — all pass. No bugs found in flows.
- Removed dead `AUTO_APPLY_LIVE_SUBMIT` env; flagged the now-unused server-side
  Playwright apply subsystem for a keep/remove decision.
- Added `docs/DEPLOY.md` (full deploy guide) + linked from README.
- **Double-submit guard** (`src/components/SubmitButton.tsx`, useFormStatus) on job-new,
  profile-save, and the 4 job-detail actions (3 are LLM calls + "Mark submitted" quota).
- **Extension app-URL templating**: `APP_URL=https://domain npm run ext:build` templates
  manifest host/content-script matches + background DEFAULT_BASE (was hardcoded localhost
  — a deploy blocker). Localhost kept too. Documented in PUBLISH_EXTENSION.md.
- **Bridge hardening**: origin check both sides + config sanitization before the
  privileged background worker.
- **Security headers**: added production CSP + HSTS in `next.config.mjs` (gated to prod so
  dev HMR is unaffected). Verified against a real prod build+server: all pages load,
  correct styling, ZERO CSP violations. No TODOs/FIXMEs anywhere in src.

## Current state (as of this session)

**Verified green:** `tsc --noEmit` (0 errors), `eslint` (0 problems), `next build`
(30 pages), `npm run ext:build` (extension bundles to extension/dist), `npm test`
= **95 passing across 19 files**, runtime HTTP smoke tests for the auth flow, billing (dev), real-vs-demo job separation, live Arbeitnow feed, resume
upload/parse/owner-download, AND the extension backend (pair → ext profile with no
secret leak → job upsert → confirmed result counted → revoke returns 401).

AUTO-APPLY IS NOW IN-BROWSER ONLY (via the extension). The Auto-apply page has a
SINGLE flow: the extension opens tabs in the user's own browser, does a Google
search for the role, opens the most relevant job results into one labeled Chrome
tab group, and fills supported ATS forms (Greenhouse/Lever/Ashby); other job pages
open for manual apply; dead tabs close. Key files: `extension/src/autoapply-bg.ts`
(orchestrator), `extension/src/jobfilter.ts` (pure, tested helpers), `extension/src/
bridge.ts` (page↔bg relay on localhost origin), `src/app/app/auto-apply/
InBrowserAutoApply.tsx` (UI + live progress), `src/app/api/ext/rank/route.ts`
(grounded ranking). Extension is v0.4.0 (permissions: google.com + ATS hosts,
tabs, tabGroups). Tests added: `ext-rank.test.ts` (4), `jobfilter.test.ts` (8).

DEAD CODE FLAGGED (not yet removed — needs a user call): the server-side Playwright
apply subsystem — `autoapply/{run,engine,discover,browser,resume}.ts` + their tests
— is no longer wired to any UI (the server-side AutoApplyClient/actions/live.ts were
deleted). It still passes tests and pulls in the heavy `playwright` dep at deploy.
`autoapply/match.ts` is still LIVE (used by the rank route). Removed the orphaned
`AUTO_APPLY_LIVE_SUBMIT` env var. Decision pending: delete the server-side subsystem
(drops Playwright from prod) or keep it as a tested fallback.

Adapter hardening session added: `adapters.test.ts` (7: routing, greenhouse/lever/
ashby map + sensitive-skip, multi-step nav, validation-error detection), `fill.test.ts`
(3: text/select/radio/checkbox fill, missing-field failure), `ext-api.test.ts` (3:
route-level auth/expiry/validation/idempotency/isolation).

### Implemented this session (M5 + M6)
- **Chrome MV3 extension** under `extension/` (bundled to `extension/dist` via
  esbuild, `npm run ext:build`): manifest with minimal perms (storage/activeTab/
  scripting/sidePanel; backend host only; ATS hosts optional), background service
  worker, popup + side panel UI (brand palette), content script. Pairing uses a
  short-lived (30d) revocable token the web app issues; stored in extension storage,
  never in a page. ATS adapters for Greenhouse/Lever/Ashby (config-driven factory +
  shared accessible-label/field-inference). Autofill fills only safe, approved
  fields; NEVER sensitive questions (work auth, gender, race, veteran, disability,
  salary, criminal, age) and NEVER auto-submits; resume upload left to the user
  (browser security). Outcome reported by the user and recorded idempotently.
- **Backend ext API**: `/api/extension/{pair,revoke}` (web session) and bearer
  `/api/ext/{profile,entitlement,jobs,resume/[id],applications/result}`. All
  tenant-isolated; `/api/ext/profile` returns only approved fields (no secrets).
  Web pairing page at `/app/settings/extension`.
- **Free-quota + entitlement**: 3 lifetime CONFIRMED successes per account, then a
  subscription is required. Enforced atomically (Serializable transaction),
  idempotent per clientRef, failed/uncertain never count. Verified in tests + runtime.

### Tests added (37 total, 9 files)
- `extension.test.ts` (6): pairing issue/resolve/revoke/expiry, no-secret profile,
  quota (failed/uncertain don't count, 3 free, 4th blocked, idempotent, subscribed
  unlimited, tenant isolation).
- `adapters.test.ts` (4): ATS routing, greenhouse/lever/ashby detect + safe map +
  sensitive-skip + resume-file detection (jsdom fixtures).
- `fill.test.ts` (1): content-script applyFills writes mapped values, fires events,
  never touches sensitive/unknown fields.
- Plus earlier: auth, intent, isolation, middleware, resume, jobs.

### Implemented and verified
- M0 Foundation (install, Prisma schema + migration, build, LLM abstraction, design system).
- M1 Public-first + progressive auth:
  - Public: `/`, `/demo`, `/jobs` (search + filters), `/jobs/[id]` (demo data labeled).
  - Auth: signup/login/logout, bcrypt, hashed session cookies, edge middleware guard.
  - Progressive signup: protected action preserves exact job + intent through auth,
    resumes workflow (verified end to end over HTTP).
  - Profile editor + onboarding, job save, Claude tailoring (resume + cover letter),
    application tracker, explicit-confirmation submission.
  - Tenant isolation verified in tests and over HTTP.
- Tests (18): intent/open-redirect, public browsing, auth, sessions, middleware redirect,
  cross-user isolation.

### Implemented this session
- M2 Resume library: PDF/DOCX upload with magic-byte validation + 5MB limit, text
  extraction (unpdf/mammoth), private storage (random keys, 0600, outside web root),
  owner-only signed download (IDOR-safe), delete. Wired into `/app/profile`. Runtime
  smoke test passed (upload PDF -> parsed -> listed -> downloaded correct bytes).
  Tests: `tests/resume.test.ts` (parse PDF+DOCX, type/size/spoof rejection, storage
  ownership + isolation, filename sanitization) = 5/5.
- M3a Manual job entry: `/app/jobs/new` form -> `createManualJob` (source "manual")
  -> saved + opens workspace. SSRF-safe URL validator (`src/lib/http/url.ts`) for any
  future server-side fetch. Tests: `tests/jobs.test.ts` (manual job isolation, URL
  safety incl. localhost/169.254/10.x/172.16/bare-host/file: rejection).

### Not started
- M3b job-fit analysis (Zod-validated structured LLM output).
- M4 LLM hardening (Zod output schemas, timeouts, retries, usage/cost, no prod mock fallback).
- M5 Chrome MV3 extension (manifest, background, popup, secure pairing, ATS adapters,
  content-script autofill + file upload, review screen, confirmation, outcome verify).
- M6 billing/quotas; M7 settings/export/admin; M8 security hardening + deploy docs.

### Blockers (need credentials / external access, cannot be faked)
- ANTHROPIC_API_KEY (else labeled mock). Claude Bridge protocol undocumented.
- Stripe keys for real billing. Live ATS pages for extension smoke tests.

## Jobs UI redesign + HTML fix (this session)
- **Find Jobs redesigned** to a real job-board layout: full-width, a scrollable job
  LIST on the left (selected row highlighted) and a DETAIL pane on the right (title,
  company, badges, Apply/employer link, full description). Real pagination (24/page).
- **Fixed raw-HTML in cards**: some Arbeitnow descriptions are HTML/entity-encoded
  (`&lt;div class="content-intro"&gt;…`); `stripHtml` now strips tags, decodes entities
  (two passes for double-encoding), and re-strips, so NO markup ever renders.
  Regression test added (`arbeitnow.test.ts` "About Anthropic bug").
- Verified by headless-Chrome screenshots at 1920px (list+detail, clean text, no demo
  leakage).

### Auto-Apply engine — IMPLEMENTED + tested (server-side browser)
- **Real browser engine** (`src/lib/autoapply/engine.ts`, Playwright/Chromium): opens
  an application page, detects the form from accessible labels (reusing the ATS field
  logic), fills safe mapped fields, **uploads the resume** into the real file control,
  handles select/radio/checkbox, and — only with auto-submit consent — clicks the real
  submit control and **verifies the employer confirmation** (never claims unseen
  success; returns submitted_confirmed vs submitted_uncertain). It **pauses (never
  bypasses)** on CAPTCHA, sign-in (password field), MFA, and required sensitive/legal
  questions (sponsorship, etc.). Verified end to end: `autoapply.engine.test.ts` (5) —
  real browser fills+uploads+submits+confirms against a served fixture; pause cases.
- **Matching** (`match.ts`): grounded score (only credits skills/titles actually in the
  profile; never fabricates). **Orchestrator** (`run.ts`): discover → dedupe → match ≥
  minScore → apply → record outcome; confirmed consumes quota atomically/idempotently
  (duplicate jobs never double-count), paused/failed never consume quota, respects
  maxApplications + free-quota boundary. Verified: `autoapply.run.test.ts` (6) incl.
  duplicate prevention, cap, quota stop, pause handling, and prompt-injection resistance.
- **UI** `/app/auto-apply`: config (titles/location/remote/min-score/max), a live
  browser-free **match preview** (ranked, grounded reasons), and honest status
  (skills/resume/quota, live-submit state).
- **Safety gate**: `AUTO_APPLY_LIVE_SUBMIT` (default false) → "prepare" mode (fills,
  never submits). Real final submission to employers is OFF on this instance by design.

### Browser-driven discovery (open a browser and search) — IMPLEMENTED + live-verified
- `src/lib/autoapply/discover.ts` opens a REAL browser (Playwright), navigates to the
  job board, performs the search, and reads the rendered postings from the live DOM
  (parses `/jobs/companies/<co>/<slug>` anchors; dedupes; ignores nav). Wired into the
  orchestrator/preview via `browserSearch` and the Auto-Apply UI checkbox "Open a real
  browser and search the job board live".
- **Live-verified**: searched "machine learning" in a real headless browser and got real
  company postings (Machine Learning Reply, Phantasma Labs, Sensmore, SumUp, Tools for
  Humanity). Deterministic parser test: `autoapply.discover.test.ts`.
- Note: from the search list, title is derived from the posting slug and company from the
  URL; full descriptions require opening each posting (the apply engine does that).

### Honest limits of auto-apply (not faked)
- The apply engine is proven against **controlled fixture forms**, NOT live employer ATS
  submission. Live final submission stays gated by `AUTO_APPLY_LIVE_SUBMIT`.
- Arbeitnow postings open on the board/employer page; reaching the actual ATS application
  form + submitting end to end on arbitrary employers is per-site and not universally
  guaranteed. The engine handles supported forms and pauses honestly on the rest.
- Full background queue with cross-restart recovery + concurrent workers + live
  pause/resume/stop is not built; the orchestrator runs a bounded pass. Next milestone.

## Product audit + real-vs-demo job data (earlier)

### The flagged defect, fixed
Browse Jobs previously hard-coded four demo companies as if they were real. Now:
- **`/jobs` is a real job-provider route.** It uses a provider abstraction
  (`src/lib/jobs/provider/*`). Default `JOBS_PROVIDER=none` → an **honest empty /
  not-connected state** with setup guidance; it NEVER fabricates listings. When a
  provider is configured, results carry source attribution, `fetchedAt`, external
  employer links, filters (q/location/remote/source), and pagination.
- **Demo data moved to a clearly-labeled `/jobs/demo` (+ `/jobs/demo/[id]`)** with a
  persistent "Demo data — not real jobs" banner on every demo screen.
- Runtime-verified: `/jobs` shows the not-connected state and leaks **zero** demo
  companies; `/jobs/demo` is labeled; `/jobs/<demoId>` on the real route → 404.
- Tests: `jobprovider.test.ts` (none → empty+unconfigured, demo → labeled samples
  only, filters + pagination).

### Route-by-route status
| Route | Data source | Auth | Status |
|---|---|---|---|
| `/` landing | static | public | Accurate copy; nav to Browse/How/Pricing/Sign in/up; ATS disclosure. |
| `/jobs` | job provider (none default) | public | Real; honest empty state; no demo leakage. |
| `/jobs/[id]` | provider.getById | public | Real detail, missing-field indicators, employer link; 404 when unconfigured. |
| `/jobs/demo`, `/jobs/demo/[id]` | demo provider | public | Labeled demo; Save/Apply preserve intent through auth. |
| `/demo` | static | public | How-it-works. |
| `/pricing` | entitlement consts | public | Plan limits; lifetime-free messaging. |
| `/login`,`/signup` | auth service | public | Working; intent preserved; generic errors. |
| `/app` dashboard | user data | required | Counts, onboarding nudge, recent. |
| `/app/jobs/new` | manual entry | required | Create job by URL (SSRF-safe validator). |
| `/app/jobs/import` | demo import | required | Completes progressive-signup import. |
| `/app/jobs/[id]` | user job + LLM | required | Tailor resume/cover letter, **job-fit analysis**, confirm-submit. |
| `/app/applications` | tracker | required | Statuses, dates. |
| `/app/profile` | profile + resumes | required | Edit profile; upload/parse/download/delete resumes (owner-only). |
| `/app/settings/extension` | pairing | required | Pair/revoke token, install guide, quota. |
| `/app/settings/billing` | entitlement + sub | required | Entitlement, usage bar, upgrade/manage/cancel. |
| `/api/*` | — | per-route | Auth + ownership enforced; ext API bearer; webhook signed. |

### Real job source: Arbeitnow (free, keyless) — INTEGRATED + live-verified
- `src/lib/jobs/provider/arbeitnow.ts` calls the documented free Arbeitnow feed
  (`https://www.arbeitnow.com/api/job-board-api`, fixed host → no SSRF). Maps real
  listings (title, company, location, remote, employer URL, posted date, type),
  strips HTML (no injection), dedupes by slug, filters client-side, times out at 10s,
  caches 1h (respectful), returns an honest error state on failure, and shows the
  required "Jobs via Arbeitnow" attribution link.
- Enabled via `JOBS_PROVIDER=arbeitnow` (this instance's `.env` is set to it; the
  `.env.example` default stays `none`). Tests: `arbeitnow.test.ts` (mocked transport:
  mapping/dedup, filters, error state, getById) — no live calls in the suite.
- **Live-verified** against the real API: `/jobs` returned 300 real roles (e.g.
  "Caspar Health · Berlin") with working employer links, attribution shown, and
  **zero demo leakage**; a real detail page rendered with "Apply on employer site".

### Free job-API research (for broader coverage; honest)
No single free API returns "all jobs for all companies." Options reviewed:
- **Arbeitnow** — free, keyless, commercial OK with link-back. Integrated. (EU-heavy.)
- **Adzuna** — free tier (~1k calls/mo) with a free app_id/app_key; true multi-employer
  aggregator (broadest coverage, UK/EU strong); requires "Jobs by Adzuna" label. Good
  NEXT provider to add (needs a free key).
- **Jobicy** — keyless, remote-only, terms unclear. **Remotive** — keyless but very
  restrictive (<=4 fetches/day, no redistribution). **USAJOBS** — free key, US federal
  only, no redistribution.

### Known gaps / honest blockers (not faked)
- Broader aggregation (Adzuna, etc.) needs a free API key + a per-provider adapter.
  The abstraction makes adding one small; Arbeitnow covers the "real + latest jobs" ask now.
- Email verification + password recovery UI: not yet built (needs a mail provider).
- Admin route: not built (none required yet; would be role-gated server-side).
- Stripe live + Claude live remain credential-blocked (see below).

## Billing (M8) + LLM hardening (M9) — earlier this session

### Blockers (live verification, documented not worked around)
- **Stripe**: no API keys configured. All code is implemented; deterministic tests
  use Stripe's offline signing helpers (`generateTestHeaderString`) so webhook
  signature verification + event handling are tested without a live key. To go live,
  set `BILLING_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_PRICE_PRO` (test-mode), point a Stripe webhook at `/api/billing/webhook`,
  and run a test-mode checkout. No real charge was made.
- **Claude**: no `ANTHROPIC_API_KEY`. The Anthropic adapter + policy wrapper are
  implemented; the main suite uses a fake transport. Set `LLM_PROVIDER=anthropic` +
  key for live use (mock is blocked in production at `getLlm`).

### M8 implemented + verified
- Stripe adapter: Checkout, Customer Portal, `verifyEvent` (signature), idempotent
  `applyEvent` (WebhookEvent dedupe) for checkout.session.completed,
  customer.subscription.created/updated/deleted, invoice.payment_failed; ownership by
  customer/metadata (unknown customers ignored, never granted). Dev adapter (labeled,
  no charge). Routes: `/api/billing/{checkout,portal,cancel,webhook}`. Pages: public
  `/pricing`, `/app/settings/billing` (entitlement, usage bar, manage/upgrade/cancel).
- **Lifetime free quota re-keyed to EmailAllowance** (per normalized email, NOT tied
  to User) → deleting/recreating an account does not reset it. Only FREE confirmed
  successes consume it; subscribed usage does not; cancellation/expiry revert to free
  rules without resetting past usage. Atomic + idempotent in a Serializable tx across
  web/extension paths. Browsing/profile/resumes/viewing are never paywalled.
- Runtime smoke (dev mode): pricing public 200, webhook 404 (stripe off), signup →
  dev upgrade → Pro → cancel → Free.

### M9 implemented + verified
- `generateWithPolicy` (timeout, bounded retries + backoff on retryable only, output
  cap), `generateJson` (Zod-validated structured output), `enforceLlmRateLimit`
  (per-user), structured `analyzeJobFit` (score/strengths/gaps/rationale) wired into
  the job workspace. Mock returns a valid job-fit shape for dev. Mock blocked in prod.
  Errors never surface provider internals/keys.

### Tests added
- `billing.test.ts` (6): email-lifetime quota + account-recreation persistence,
  subscribed-no-deplete + cancellation-preserves-usage, webhook bad signature,
  verify+grant (out-of-order via metadata)+idempotent replay, cancel/payment-failure
  revert, unknown-customer ownership isolation.
- `llm.test.ts` (11): retry/no-retry/give-up/timeout/output-cap/no-secret-leak,
  JSON+schema validation (valid/fenced/malformed/violation), rate limit, job-fit isolation.

## Adapter validation + hardening (previous session)

### Live-validation blocker (documented, not worked around)
Live validation against real Greenhouse/Lever/Ashby pages could NOT be performed:
the Claude browser extension is **not connected** in this environment
(`tabs_context_mcp` → "Browser extension is not connected"). No real-site selectors
are claimed as verified. Per the milestone instruction, deterministic fixtures and
adapter logic were expanded instead. To do the live pass: load `extension/dist`
unpacked in a real Chrome, pair, open a real posting, click Fill, and refine the
selector lists in `extension/src/adapters/{greenhouse,lever,ashby}.ts`.

### Hardened + tested this session
- **Multi-step detection**: `detectNavigation` classifies Next/Continue vs final
  Submit; `DetectedForm.multiStep`/`nav` drive popup guidance ("fill this step, click
  Next on the page, run Fill again"). Progress is preserved because each fill is
  idempotent and the job persists. No auto-advance, no auto-submit.
- **Required-field / validation errors**: `collectValidationErrors` reads
  `aria-invalid`, `aria-describedby`, and `role="alert"`/`.error` messages and surfaces
  them in the popup after a failed submit.
- **Robust autofill** (`applyFills`): realm-independent native value setter (React/Vue
  compatible, found by walking the element's own prototype chain), plus proper
  select / radio / checkbox handling; missing fields reported as failed, never silently
  "succeeded".
- **Dynamic/SPA forms**: content script retries detection (10 × 300ms) for forms that
  render after load.
- **Route-level ext API tests**: auth 401 (no/invalid/expired token), input validation
  400, idempotent outcome recording, and tenant isolation (404 on another user's job).

### Verified green this session
`tsc --noEmit` (0), `eslint` (0), `next build` (23 routes), `npm run ext:build`,
full `npm test` — see top line for the current count.

## Next task (precise)
1. **Live-ATS pass** (needs a connected browser): verify/refine selectors on real
   Greenhouse/Lever/Ashby postings; add a Playwright run against a local controlled
   multi-step fixture page (do NOT submit real applications).
2. **Guarded auto-submit** (optional): `adapter.submitSelector` + `confirmationSignal`;
   click submit only after explicit per-application confirmation, record CONFIRMED only
   when the confirmation signal is observed.
3. **Billing (M6b)**: `/app/settings/billing` dev adapter + server-enforced upgrade;
   Stripe when keys exist (never fake payments).
4. **M4 LLM hardening**: Zod output schemas, timeouts/retries, usage/cost accounting,
   block the mock provider in production.
Then M7 (settings/export/delete, admin) and M8 (rate limits, audit, deploy docs).

## Startup commands
```
cd ~/jobflow
docker compose up -d db
npm install
npx prisma migrate deploy   # or: npx prisma migrate dev
npm run db:seed             # demo@jobflow.local / demo-password
npm run dev                 # http://localhost:3000
```
Checks: `npm run typecheck && npm run lint && npm test && npm run build`
