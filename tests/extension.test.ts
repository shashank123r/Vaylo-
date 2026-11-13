import { describe, it, expect } from "vitest";
import { signup } from "@/lib/auth/service";
import { createManualJob } from "@/lib/jobs/service";
import { createPairing, resolveExtensionToken, revokePairing } from "@/lib/extension/pairing";
import { buildAutofillProfile } from "@/lib/extension/profile";
import { recordSubmissionResult } from "@/lib/applications/submit";
import { getQuota } from "@/lib/billing/entitlement";
import { db } from "@/lib/db";

async function makeUser(email: string) {
  const r = await signup({ email, password: "password123", name: "Ext User" });
  if (!r.ok) throw new Error("signup failed");
  return r.user;
}
async function makeJob(userId: string, url: string) {
  return createManualJob(userId, { title: "ML Engineer", company: "Acme", url });
}
let ref = 0;
const nextRef = () => `clientref-${Date.now()}-${ref++}`;

describe("extension pairing", () => {
  it("issues a token that resolves, and rejects revoked/expired/garbage tokens", async () => {
    const user = await makeUser("x1@example.com");
    const { token } = await createPairing(user.id);

    expect((await resolveExtensionToken(token))?.id).toBe(user.id);
    expect(await resolveExtensionToken("jfx_garbage")).toBeNull();
    expect(await resolveExtensionToken(undefined)).toBeNull();

    await revokePairing(user.id);
    expect(await resolveExtensionToken(token)).toBeNull();

    // Re-pairing issues a working token again; expiry is enforced.
    const again = await createPairing(user.id);
    expect((await resolveExtensionToken(again.token))?.id).toBe(user.id);
    await db.extensionConnection.update({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await resolveExtensionToken(again.token)).toBeNull();
  });
});

describe("autofill profile", () => {
  it("returns only approved fields and never secrets", async () => {
    const user = await makeUser("x2@example.com");
    const profile = await buildAutofillProfile(user.id);
    expect(profile.email).toBe("x2@example.com");
    const serialized = JSON.stringify(profile);
    expect(serialized).not.toMatch(/passwordHash|tokenHash|\$2[aby]\$/); // no secrets/bcrypt
  });
});

describe("free-quota enforcement (3 lifetime confirmed successes)", () => {
  it("counts only confirmed successes, is idempotent, and blocks the 4th when unsubscribed", async () => {
    const user = await makeUser("x3@example.com");
    const jobs = await Promise.all([1, 2, 3, 4, 5].map((i) => makeJob(user.id, `https://acme.com/job/${i}`)));

    // Failed and uncertain never consume quota.
    expect((await recordSubmissionResult(user.id, { jobId: jobs[0]!.id, clientRef: nextRef(), outcome: "FAILED" })).counted).toBe(false);
    expect((await recordSubmissionResult(user.id, { jobId: jobs[0]!.id, clientRef: nextRef(), outcome: "UNCERTAIN" })).counted).toBe(false);
    expect((await getQuota(user.id)).used).toBe(0);

    // Three confirmed successes consume the free allowance.
    for (let i = 0; i < 3; i++) {
      const res = await recordSubmissionResult(user.id, { jobId: jobs[i]!.id, clientRef: nextRef(), outcome: "CONFIRMED" });
      expect(res.counted).toBe(true);
      expect(res.quotaExceeded).toBe(false);
    }
    const q = await getQuota(user.id);
    expect(q.used).toBe(3);
    expect(q.canSubmit).toBe(false);

    // The 4th confirmed success is blocked (recorded but not counted).
    const fourth = await recordSubmissionResult(user.id, { jobId: jobs[3]!.id, clientRef: nextRef(), outcome: "CONFIRMED" });
    expect(fourth.counted).toBe(false);
    expect(fourth.quotaExceeded).toBe(true);
    expect((await getQuota(user.id)).used).toBe(3);
  });

  it("is idempotent per clientRef (no double counting)", async () => {
    const user = await makeUser("x4@example.com");
    const job = await makeJob(user.id, "https://acme.com/dup");
    const clientRef = nextRef();
    const first = await recordSubmissionResult(user.id, { jobId: job.id, clientRef, outcome: "CONFIRMED" });
    const second = await recordSubmissionResult(user.id, { jobId: job.id, clientRef, outcome: "CONFIRMED" });
    expect(first.counted).toBe(true);
    expect(second.idempotent).toBe(true);
    expect((await getQuota(user.id)).used).toBe(1); // counted once, not twice
  });

  it("allows unlimited confirmed successes for a subscribed user", async () => {
    const user = await makeUser("x5@example.com");
    await db.subscription.create({ data: { userId: user.id, tier: "PRO", provider: "dev" } });
    const jobs = await Promise.all([1, 2, 3, 4, 5].map((i) => makeJob(user.id, `https://acme.com/pro/${i}`)));
    for (let i = 0; i < 5; i++) {
      const res = await recordSubmissionResult(user.id, { jobId: jobs[i]!.id, clientRef: nextRef(), outcome: "CONFIRMED" });
      expect(res.counted).toBe(true);
    }
    expect((await getQuota(user.id)).subscribed).toBe(true);
  });

  it("rejects recording against another user's job (tenant isolation)", async () => {
    const alice = await makeUser("x6a@example.com");
    const bob = await makeUser("x6b@example.com");
    const aliceJob = await makeJob(alice.id, "https://acme.com/alice");
    await expect(
      recordSubmissionResult(bob.id, { jobId: aliceJob.id, clientRef: nextRef(), outcome: "CONFIRMED" }),
    ).rejects.toThrow(/Job not found/);
  });
});
