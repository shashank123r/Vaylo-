import { describe, it, expect } from "vitest";
import { signup } from "@/lib/auth/service";
import { db } from "@/lib/db";
import { getQuota, PRO_DAILY_LIMIT, FREE_SUBMISSION_LIMIT } from "@/lib/billing/entitlement";
import { istDay } from "@/lib/billing/day";
import {
  reserveSubmission,
  finalizeConfirmed,
  releaseReservation,
  markUncertain,
  reconcileReservation,
} from "@/lib/applications/reservation";
import { recordSubmissionResult } from "@/lib/applications/submit";

async function makeUser(email: string, opts: { subscribed?: boolean; expired?: boolean } = {}) {
  const r = await signup({ email, password: "password123" });
  if (!r.ok) throw new Error("signup failed");
  if (opts.subscribed || opts.expired) {
    await db.subscription.create({
      data: {
        userId: r.user.id,
        tier: "PRO",
        provider: "dev",
        status: "active",
        periodEnd: opts.expired ? new Date(Date.now() - 86400_000) : null,
      },
    });
  }
  return r.user;
}
async function makeJob(userId: string, n = 0) {
  const j = await db.job.create({ data: { userId, title: `Role ${n}`, company: `Co ${n}`, url: `https://e.com/${n}`, source: "test" } });
  return j.id;
}
// Seed N confirmed successes for TODAY quickly.
async function seedConfirmedToday(userId: string, n: number) {
  const day = istDay();
  await db.submissionReservation.createMany({
    data: Array.from({ length: n }, (_, i) => ({ userId, clientRef: `seed:${i}`, day, status: "CONFIRMED" as const })),
  });
}

describe("Pro daily submission quota (50 / IST day)", () => {
  it("counts only CONFIRMED successes; at 50 the next reservation is blocked", async () => {
    const u = await makeUser("q-50@example.com", { subscribed: true });
    await seedConfirmedToday(u.id, PRO_DAILY_LIMIT);
    const q = await getQuota(u.id);
    expect(q.kind).toBe("daily");
    expect(q.limit).toBe(50);
    expect(q.used).toBe(50);
    expect(q.remaining).toBe(0);
    expect(q.canSubmit).toBe(false);
    expect(q.resetAt).toBeTruthy();

    const r = await reserveSubmission(u.id, "aa:new", await makeJob(u.id, 99));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("quota_reached");
  });

  it("allows up to the limit and finalizes confirmed successes with evidence", async () => {
    const u = await makeUser("q-fill@example.com", { subscribed: true });
    await seedConfirmedToday(u.id, PRO_DAILY_LIMIT - 1); // 49 used
    const jobId = await makeJob(u.id, 1);
    const res = await reserveSubmission(u.id, "aa:1", jobId);
    expect(res.ok).toBe(true);
    const fin = await finalizeConfirmed(u.id, { jobId, clientRef: "aa:1", evidence: "Application received" });
    expect(fin.counted).toBe(true);
    const q = await getQuota(u.id);
    expect(q.used).toBe(50);
    expect(q.remaining).toBe(0);
  });

  it("FAILED (released) does not consume quota and frees the slot", async () => {
    const u = await makeUser("q-fail@example.com", { subscribed: true });
    const jobId = await makeJob(u.id, 2);
    await reserveSubmission(u.id, "aa:2", jobId); // holds 1
    expect((await getQuota(u.id)).remaining).toBe(49);
    await releaseReservation(u.id, "aa:2", { jobId, reason: "site error" });
    const q = await getQuota(u.id);
    expect(q.used).toBe(0);
    expect(q.remaining).toBe(50); // slot freed
  });

  it("AMBIGUOUS (uncertain) holds capacity until reconciled (no duplicate retry)", async () => {
    const u = await makeUser("q-amb@example.com", { subscribed: true });
    const jobId = await makeJob(u.id, 3);
    await reserveSubmission(u.id, "aa:3", jobId);
    await markUncertain(u.id, "aa:3", { jobId, reason: "no confirmation seen" });
    const held = await getQuota(u.id);
    expect(held.used).toBe(0); // not counted as success
    expect(held.remaining).toBe(49); // but still holds the slot

    // Re-reserving the SAME job must refuse until reconciled (prevents duplicates).
    const retry = await reserveSubmission(u.id, "aa:3", jobId);
    expect(retry.ok).toBe(false);
    expect(retry.reason).toBe("needs_reconcile");

    // Reconcile -> confirmed: now it counts.
    await reconcileReservation(u.id, "aa:3", "confirmed", { jobId, evidence: "ref #123" });
    const after = await getQuota(u.id);
    expect(after.used).toBe(1);
  });

  it("duplicate confirmation events count only once (idempotent)", async () => {
    const u = await makeUser("q-dup@example.com", { subscribed: true });
    const jobId = await makeJob(u.id, 4);
    await reserveSubmission(u.id, "aa:4", jobId);
    const a = await finalizeConfirmed(u.id, { jobId, clientRef: "aa:4", evidence: "ok" });
    const b = await finalizeConfirmed(u.id, { jobId, clientRef: "aa:4", evidence: "ok again" });
    expect(a.counted).toBe(true);
    expect(b.idempotent).toBe(true);
    expect((await getQuota(u.id)).used).toBe(1); // not 2
  });

  it("concurrent reservations never overshoot the limit (atomic)", async () => {
    const u = await makeUser("q-conc@example.com", { subscribed: true });
    await seedConfirmedToday(u.id, PRO_DAILY_LIMIT - 1); // 49 used -> exactly 1 slot
    const jobId = await makeJob(u.id, 5);
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => reserveSubmission(u.id, `aa:c${i}`, jobId)),
    );
    const ok = results.filter((r) => r.ok).length;
    const blocked = results.filter((r) => !r.ok && r.reason === "quota_reached").length;
    expect(ok).toBe(1); // only the single remaining slot was handed out
    expect(blocked).toBe(5);
  });

  it("crash reconciliation: a stranded RESERVED keeps holding capacity until resolved", async () => {
    const u = await makeUser("q-crash@example.com", { subscribed: true });
    const jobId = await makeJob(u.id, 6);
    await reserveSubmission(u.id, "aa:6", jobId); // worker 'crashes' before finalizing
    expect((await getQuota(u.id)).remaining).toBe(49); // slot still held, not blindly freed
    await reconcileReservation(u.id, "aa:6", "failed", { jobId, reason: "crashed; no evidence" });
    expect((await getQuota(u.id)).remaining).toBe(50); // reconciled -> freed
    expect((await getQuota(u.id)).used).toBe(0);
  });

  it("resets daily: yesterday's confirmed successes do not count today", async () => {
    const u = await makeUser("q-reset@example.com", { subscribed: true });
    await db.submissionReservation.createMany({
      data: Array.from({ length: 50 }, (_, i) => ({ userId: u.id, clientRef: `y:${i}`, day: "2000-01-01", status: "CONFIRMED" as const })),
    });
    const q = await getQuota(u.id);
    expect(q.used).toBe(0); // all counted toward a past day
    expect(q.remaining).toBe(50);
  });

  it("extension and web share ONE daily quota", async () => {
    const u = await makeUser("q-shared@example.com", { subscribed: true });
    await seedConfirmedToday(u.id, PRO_DAILY_LIMIT - 1); // 49
    const jobId = await makeJob(u.id, 7);
    // extension path (recordSubmissionResult) consumes the 50th
    const rec = await recordSubmissionResult(u.id, { jobId, clientRef: "ext:1", outcome: "CONFIRMED", detail: "received" });
    expect(rec.counted).toBe(true);
    expect((await getQuota(u.id)).remaining).toBe(0);
    // now the server orchestrator path is blocked too
    const r = await reserveSubmission(u.id, "aa:8", await makeJob(u.id, 8));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("quota_reached");
  });
});

describe("Free plan + subscription expiry (regression)", () => {
  it("Free stays a 3-lifetime allowance (not daily), and blocks the 4th", async () => {
    const u = await makeUser("q-free@example.com");
    for (let i = 0; i < FREE_SUBMISSION_LIMIT; i++) {
      const jobId = await makeJob(u.id, i);
      const rec = await recordSubmissionResult(u.id, { jobId, clientRef: `f:${i}`, outcome: "CONFIRMED", detail: "ok" });
      expect(rec.counted).toBe(true);
    }
    const q = await getQuota(u.id);
    expect(q.kind).toBe("lifetime");
    expect(q.used).toBe(3);
    expect(q.canSubmit).toBe(false);
    const jobId = await makeJob(u.id, 99);
    const over = await recordSubmissionResult(u.id, { jobId, clientRef: "f:over", outcome: "CONFIRMED", detail: "ok" });
    expect(over.counted).toBe(false);
    expect(over.quotaExceeded).toBe(true);
  });

  it("an expired subscription falls back to the Free lifetime allowance", async () => {
    const u = await makeUser("q-expired@example.com", { expired: true });
    const q = await getQuota(u.id);
    expect(q.kind).toBe("lifetime");
    expect(q.limit).toBe(FREE_SUBMISSION_LIMIT);
  });
});
