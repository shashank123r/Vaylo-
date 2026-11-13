import { describe, it, expect } from "vitest";
import { signup } from "@/lib/auth/service";
import { db } from "@/lib/db";
import { enqueueTask, claimNext, reportResult, recoverStuck, getRunStatus } from "@/lib/autoapply/queue";
import type { AutoApplyChannel } from "@prisma/client";

async function makeUser(email: string) {
  const r = await signup({ email, password: "password123" });
  if (!r.ok) throw new Error("signup failed");
  return r.user;
}

function enq(userId: string, over: Partial<Parameters<typeof enqueueTask>[1]> = {}) {
  const key = over.idempotencyKey ?? `https://boards.greenhouse.io/acme/jobs/${Math.random().toString(36).slice(2)}`;
  return enqueueTask(userId, {
    runId: over.runId ?? "run_1",
    company: "Acme",
    title: "Engineer",
    jobUrl: key,
    normalizedUrl: key,
    channel: (over.channel ?? "SERVER") as AutoApplyChannel,
    idempotencyKey: key,
    clientRef: `aa:${key}`,
    ...over,
  });
}

describe("queue: idempotency / dedupe", () => {
  it("does not enqueue the same job twice; re-enqueues only a FAILED one", async () => {
    const u = await makeUser("q1@example.com");
    const a = await enq(u.id, { idempotencyKey: "k1", jobUrl: "k1", normalizedUrl: "k1" });
    expect(a.deduped).toBe(false);
    const b = await enq(u.id, { idempotencyKey: "k1", jobUrl: "k1", normalizedUrl: "k1" });
    expect(b.deduped).toBe(true);
    expect(b.task.id).toBe(a.task.id);
    const count = await db.autoApplyTask.count({ where: { userId: u.id } });
    expect(count).toBe(1);

    await db.autoApplyTask.update({ where: { id: a.task.id }, data: { status: "FAILED" } });
    const c = await enq(u.id, { idempotencyKey: "k1", jobUrl: "k1", normalizedUrl: "k1" });
    expect(c.deduped).toBe(false); // a FAILED task is reset to QUEUED for retry
    expect(c.task.status).toBe("QUEUED");
    expect(c.task.attempts).toBe(0);
  });
});

describe("queue: claim (FOR UPDATE SKIP LOCKED)", () => {
  it("hands each queued task to exactly one claimer, then returns null", async () => {
    const u = await makeUser("q2@example.com");
    await enq(u.id, { idempotencyKey: "a", jobUrl: "a", normalizedUrl: "a" });
    await enq(u.id, { idempotencyKey: "b", jobUrl: "b", normalizedUrl: "b" });

    const t1 = await claimNext({ channel: "SERVER", workerId: "w1" });
    const t2 = await claimNext({ channel: "SERVER", workerId: "w2" });
    const t3 = await claimNext({ channel: "SERVER", workerId: "w3" });
    expect(t1).not.toBeNull();
    expect(t2).not.toBeNull();
    expect(t1!.id).not.toBe(t2!.id);
    expect(t3).toBeNull(); // nothing left
    expect(t1!.status).toBe("CLAIMED");
    expect(t1!.attempts).toBe(1);
  });

  it("does not cross channels or users", async () => {
    const u = await makeUser("q3@example.com");
    const other = await makeUser("q3b@example.com");
    await enq(u.id, { idempotencyKey: "ext", jobUrl: "ext", normalizedUrl: "ext", channel: "EXTENSION" });
    // SERVER claim finds nothing (the only task is EXTENSION).
    expect(await claimNext({ channel: "SERVER", workerId: "w" })).toBeNull();
    // Another user cannot claim this user's EXTENSION task.
    expect(await claimNext({ channel: "EXTENSION", workerId: "ext:other", userId: other.id })).toBeNull();
    // The owner can.
    const mine = await claimNext({ channel: "EXTENSION", workerId: "ext:me", userId: u.id });
    expect(mine?.idempotencyKey).toBe("ext");
  });
});

describe("queue: retry with backoff + bounded attempts", () => {
  it("requeues a retryable failure until attempts are exhausted, honoring scheduledAt", async () => {
    const u = await makeUser("q4@example.com");
    await enq(u.id, { idempotencyKey: "r", jobUrl: "r", normalizedUrl: "r", maxAttempts: 2 });

    const t1 = await claimNext({ channel: "SERVER", workerId: "w" });
    expect(t1!.attempts).toBe(1);
    const req = await reportResult(t1!.id, u.id, { status: "FAILED", retryInMs: 50_000, reason: "transient" });
    expect(req!.status).toBe("QUEUED"); // requeued, not terminal

    // Not yet due: a claim now gets nothing.
    expect(await claimNext({ channel: "SERVER", workerId: "w", now: new Date() })).toBeNull();
    // Due in the future: claimable again.
    const future = new Date(Date.now() + 60_000);
    const t2 = await claimNext({ channel: "SERVER", workerId: "w", now: future });
    expect(t2!.attempts).toBe(2);
    // Second failure: attempts (2) == maxAttempts (2) -> terminal FAILED.
    const term = await reportResult(t2!.id, u.id, { status: "FAILED", retryInMs: 50_000, reason: "again" });
    expect(term!.status).toBe("FAILED");
    expect(await claimNext({ channel: "SERVER", workerId: "w", now: new Date(Date.now() + 120_000) })).toBeNull();
  });
});

describe("queue: restart / crash recovery", () => {
  it("re-queues an abandoned in-flight task once its lock expires", async () => {
    const u = await makeUser("q5@example.com");
    await enq(u.id, { idempotencyKey: "s", jobUrl: "s", normalizedUrl: "s", maxAttempts: 3 });
    const t = await claimNext({ channel: "SERVER", workerId: "crasher" });
    expect(t!.status).toBe("CLAIMED");
    // Simulate a crash: the worker died, its lock expires.
    await db.autoApplyTask.update({ where: { id: t!.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    const rec = await recoverStuck();
    expect(rec.requeued).toBe(1);
    const back = await db.autoApplyTask.findUnique({ where: { id: t!.id } });
    expect(back!.status).toBe("QUEUED"); // nothing lost — it will be re-claimed
  });

  it("fails an abandoned task that has no attempts left", async () => {
    const u = await makeUser("q6@example.com");
    const { task } = await enq(u.id, { idempotencyKey: "x", jobUrl: "x", normalizedUrl: "x", maxAttempts: 1 });
    await db.autoApplyTask.update({ where: { id: task.id }, data: { status: "OPENED", attempts: 1, lockedUntil: new Date(Date.now() - 1000) } });
    const rec = await recoverStuck();
    expect(rec.failed).toBe(1);
    const t = await db.autoApplyTask.findUnique({ where: { id: task.id } });
    expect(t!.status).toBe("FAILED");
  });
});

describe("queue: status transitions + isolation + run status", () => {
  it("tracks transitions, clears/holds the lock, and isolates by user", async () => {
    const u = await makeUser("q7@example.com");
    const other = await makeUser("q7b@example.com");
    await enq(u.id, { idempotencyKey: "t", jobUrl: "t", normalizedUrl: "t", runId: "runX" });
    const t = await claimNext({ channel: "SERVER", workerId: "w" });

    const opened = await reportResult(t!.id, u.id, { status: "OPENED" });
    expect(opened!.status).toBe("OPENED");
    expect(opened!.lockedUntil).not.toBeNull(); // in-progress holds the lock (heartbeat)

    const needs = await reportResult(t!.id, u.id, { status: "NEEDS_USER", reason: "login required" });
    expect(needs!.status).toBe("NEEDS_USER");
    expect(needs!.lockedUntil).toBeNull(); // waiting-for-user clears the lock

    // Another user cannot touch it.
    expect(await reportResult(t!.id, other.id, { status: "FAILED" })).toBeNull();

    const run = await getRunStatus(u.id, "runX");
    expect(run.total).toBe(1);
    expect(run.byStatus["NEEDS_USER"]).toBe(1);
  });
});

describe("queue: extension handoff survives a closed browser", () => {
  it("keeps an EXTENSION task queued until the extension claims it, then reports back", async () => {
    const u = await makeUser("q8@example.com");
    await enq(u.id, { idempotencyKey: "e", jobUrl: "e", normalizedUrl: "e", channel: "EXTENSION" });
    // Browser closed: nobody polls -> the task is still QUEUED (nothing lost).
    const still = await db.autoApplyTask.findFirst({ where: { userId: u.id, idempotencyKey: "e" } });
    expect(still!.status).toBe("QUEUED");
    // Extension reconnects and claims it.
    const claimed = await claimNext({ channel: "EXTENSION", workerId: `ext:${u.id}`, userId: u.id });
    expect(claimed!.status).toBe("CLAIMED");
    // Extension reports the user submitted it.
    const done = await reportResult(claimed!.id, u.id, { status: "SUBMITTED", evidence: "Application received" });
    expect(done!.status).toBe("SUBMITTED");
  });
});
