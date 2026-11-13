import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    // DB-backed tests share one Postgres database; run serially for isolation.
    fileParallelism: false,
    pool: "forks",
    testTimeout: 30000,
    // Headroom for the per-test DB cleanup hook, which retries on transient
    // TRUNCATE lock contention (see tests/setup.ts).
    hookTimeout: 60000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://jobflow:jobflow@localhost:5432/jobflow_test?schema=public",
      AUTH_SECRET: "test-secret-0123456789abcdef",
      LLM_PROVIDER: "mock",
      BCRYPT_ROUNDS: "4",
      // Pin the job provider so tests never depend on .env or make live calls.
      JOBS_PROVIDER: "none",
      // Dummy Stripe values so the SDK's offline signature helpers work in tests.
      // BILLING_PROVIDER stays "dev"; these are never used for a real charge.
      STRIPE_SECRET_KEY: "sk_test_dummy_000000000000000000000000",
      STRIPE_WEBHOOK_SECRET: "whsec_test_dummy_0000000000000000000000",
      STRIPE_PRICE_PRO: "price_test_dummy",
      LLM_RATE_LIMIT_PER_MIN: "5",
      // Master auto-submit switch ON in tests so the gating/queue can be exercised;
      // the per-run authorization + paid-entitlement gates are what the tests verify.
      AUTO_APPLY_LIVE_SUBMIT: "true",
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // server-only throws outside an RSC bundler; stub it for Node tests.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
});
