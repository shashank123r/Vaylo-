import "server-only";
import { z } from "zod";

// Server-side environment validation. Fails fast with a readable error if a
// required variable is missing or malformed. Never import this from client code.
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 chars"),
  DATABASE_URL: z.string().url(),

  LLM_PROVIDER: z.enum(["anthropic", "bedrock", "bridge", "cli", "mock"]).default("mock"),
  CLAUDE_CLI_PATH: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-5"),
  BRIDGE_BASE_URL: z.string().url().optional(),
  BRIDGE_API_KEY: z.string().optional(),
  // Claude via Amazon Bedrock. Uses the default AWS credential chain (instance
  // role in prod). The model id is a Bedrock inference-profile id.
  BEDROCK_MODEL_ID: z.string().default("au.anthropic.claude-haiku-4-5-20251001-v1:0"),
  BEDROCK_REGION: z.string().default("ap-southeast-2"),

  STORAGE_DRIVER: z.enum(["local"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage/uploads"),

  // Real job discovery provider. "none" = no provider configured (the honest
  // default: the real Browse Jobs page shows an empty/setup state, never fake
  // listings). "demo" = serve clearly-labeled sample data on the real route too
  // (opt-in only). Demo data is always available at /jobs/demo regardless.
  JOBS_PROVIDER: z.enum(["none", "arbeitnow", "demo"]).default("none"),

  BILLING_PROVIDER: z.enum(["dev", "stripe", "cashfree"]).default("dev"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
  // Cashfree Payments (India). App ID + secret key from the Cashfree dashboard.
  // CASHFREE_ENV selects the sandbox (test) or production gateway. The secret key
  // doubles as the webhook signing secret, so no separate webhook secret is needed.
  CASHFREE_APP_ID: z.string().optional(),
  CASHFREE_SECRET_KEY: z.string().optional(),
  CASHFREE_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  // The dev billing adapter grants Pro WITHOUT any real charge. That is correct
  // for local/staging, but a production instance must not hand out free Pro to
  // real users. So dev upgrades FAIL CLOSED in production unless this is set true
  // on purpose (e.g. a staging-like instance where you want to exercise Pro).
  ALLOW_DEV_BILLING: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default("false"),

  // LLM policy
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  LLM_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(20),

  EXTENSION_ALLOWED_ORIGIN: z.string().optional(),

  // Public install link for end users (set once the extension is published to a
  // web store). When absent, the app shows the developer "load unpacked" flow.
  EXTENSION_WEBSTORE_URL: z
    .string()
    .url()
    .refine(
      (u) =>
        /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore|microsoftedge\.microsoft\.com\/addons|addons\.mozilla\.org)\//.test(
          u,
        ),
      "EXTENSION_WEBSTORE_URL must be a Chrome Web Store, Edge Add-ons, or Firefox AMO URL",
    )
    .optional(),

  // Master safety gate for the server-side auto-apply engine's LIVE submission to
  // real employer sites. Default OFF: the engine fills and (when authorized) stops
  // at "filled" without clicking submit. Submission requires ALL of: this = true,
  // the user authorizing the run, and a paid entitlement.
  AUTO_APPLY_LIVE_SUBMIT: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default("false"),

  // Opt-in: run the single in-process SERVER auto-apply worker inside this Next
  // server (a claim loop with concurrency 1 that launches Chromium on demand and
  // closes it after each task). OFF by default. On a small VM, enable it on exactly
  // ONE instance so there is never more than one Chromium alive.
  AUTOAPPLY_WORKER_INPROC: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default("false"),
  AUTOAPPLY_WORKER_POLL_MS: z.coerce.number().int().positive().default(5000),
  AUTOAPPLY_WORKER_LOCK_MS: z.coerce.number().int().positive().default(120000),
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;

  // Cross-field checks so misconfiguration fails at boot, not mid-request.
  if (env.LLM_PROVIDER === "anthropic" && !env.ANTHROPIC_API_KEY) {
    throw new Error("LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY");
  }
  if (env.LLM_PROVIDER === "bridge" && !env.BRIDGE_BASE_URL) {
    throw new Error("LLM_PROVIDER=bridge requires BRIDGE_BASE_URL");
  }
  if (env.BILLING_PROVIDER === "stripe") {
    const missing = [
      ["STRIPE_SECRET_KEY", env.STRIPE_SECRET_KEY],
      ["STRIPE_WEBHOOK_SECRET", env.STRIPE_WEBHOOK_SECRET],
      ["STRIPE_PRICE_PRO", env.STRIPE_PRICE_PRO],
    ].filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) throw new Error(`BILLING_PROVIDER=stripe requires: ${missing.join(", ")}`);
  }
  if (env.BILLING_PROVIDER === "cashfree") {
    const missing = [
      ["CASHFREE_APP_ID", env.CASHFREE_APP_ID],
      ["CASHFREE_SECRET_KEY", env.CASHFREE_SECRET_KEY],
    ].filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) throw new Error(`BILLING_PROVIDER=cashfree requires: ${missing.join(", ")}`);
  }
  // The "no mock in production" rule is enforced at getLlm() call time (runtime),
  // not here, so it does not break the production build step.
  return env;
}

export const env = load();
export type Env = z.infer<typeof schema>;
