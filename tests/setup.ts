import { beforeEach, afterAll } from "vitest";
import { db } from "@/lib/db";

// Clean slate before each test. TRUNCATE ... CASCADE on User clears every
// user-owned table transitively. EmailAllowance and WebhookEvent have no FK to
// User (by design — the email allowance must survive account deletion), so they
// are truncated explicitly here to keep tests isolated.
//
// TRUNCATE needs an ACCESS EXCLUSIVE lock; under load a lingering connection can
// make it wait and blow the 30s hook budget. We cap the wait with a short
// lock_timeout so it fails FAST instead of hanging, then retry a few times — this
// absorbs transient contention without silently masking a real stuck lock.
beforeEach(async () => {
  const stmt = 'TRUNCATE "User", "EmailAllowance", "WebhookEvent" RESTART IDENTITY CASCADE';
  let lastErr: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      // Wait a reasonable time for the ACCESS EXCLUSIVE lock before giving up and
      // retrying. Too short (e.g. a few seconds) turns ordinary contention under a
      // loaded suite into spurious failures; this is generous but still bounded by
      // the database-level statement_timeout set in global-setup.
      await db.$executeRawUnsafe("SET lock_timeout = '15s'");
      await db.$executeRawUnsafe(stmt);
      return;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 300 + attempt * 200));
    }
  }
  throw lastErr;
});

afterAll(async () => {
  await db.$disconnect();
});
