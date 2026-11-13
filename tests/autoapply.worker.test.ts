import { describe, it, expect } from "vitest";
import { signup } from "@/lib/auth/service";
import { db } from "@/lib/db";
import { decideChannel, isServerSubmittable } from "@/lib/autoapply/channel";
import { enqueueAutoApplyRun } from "@/lib/autoapply/enqueue";
import { enqueueTask } from "@/lib/autoapply/queue";
import { processServerTask, runWorkerLoop } from "@/lib/autoapply/worker";
import type { ApplyInput, ApplyResult } from "@/lib/autoapply/engine";
import type { JobListing } from "@/lib/jobs/provider";

async function makeUser(email: string, opts: { subscribed?: boolean } = {}) {
  const r = await signup({ email, password: "password123" });
  if (!r.ok) throw new Error("signup failed");
  if (opts.subscribed) {
    await db.subscription.create({ data: { userId: r.user.id, tier: "PRO", provider: "dev", status: "active" } });
  }
  return r.user;
}

const listing = (over: Partial<JobListing>): JobListing => ({
  id: "j",
  title: "Backend Engineer",
  company: "Acme",
  location: null,
  remote: null,
  employmentType: null,
  source: "test",
  sourceUrl: "https://boards.greenhouse.io/acme/jobs/1",
  postedAt: null,
  summary: null,
  description: "We use TypeScript.",
  salary: null,
  demo: false,
  ...over,
});

describe("channel policy (pure)", () => {
  it("routes public ATS to SERVER only when live submit is on; else EXTENSION", () => {
    expect(isServerSubmittable("https://boards.greenhouse.io/acme/jobs/1")).toBe(true);
    expect(isServerSubmittable("https://careers.acme.com/apply")).toBe(false);
    expect(decideChannel("https://boards.greenhouse.io/acme/jobs/1", { liveSubmit: true })).toBe("SERVER");
    expect(decideChannel("https://boards.greenhouse.io/acme/jobs/1", { liveSubmit: false })).toBe("EXTENSION");
    expect(decideChannel("https://careers.acme.com/apply", { liveSubmit: true })).toBe("EXTENSION");
  });
});

describe("enqueueAutoApplyRun gating + dedupe", () => {
  it("without a paid subscription, live submit is blocked and every task is EXTENSION (never server-submits)", async () => {
    const u = await makeUser("w1@example.com"); // not subscribed
    const res = await enqueueAutoApplyRun(
      u.id,
      { minScore: 0, maxApplications: 5, autoSubmit: true, authorized: true },
      { searchJobs: async () => [listing({ sourceUrl: "https://boards.greenhouse.io/acme/jobs/1" }), listing({ sourceUrl: "https://jobs.lever.co/acme/2", title: "Frontend Engineer" })] },
    );
    expect(res.liveSubmit).toBe(false); // fail-closed: not subscribed
    expect(res.liveSubmitBlockedReason).toMatch(/paid plan/i);
    expect(res.channels.server).toBe(0);
    expect(res.channels.extension).toBe(2);
    // The enqueued tasks must not be allowed to auto-submit.
    const tasks = await db.autoApplyTask.findMany({ where: { userId: u.id } });
    expect(tasks.every((t) => t.autoSubmit === false && t.channel === "EXTENSION")).toBe(true);
  });

  it("dedupes identical application URLs and skips excluded/low-match jobs", async () => {
    const u = await makeUser("w2@example.com");
    const res = await enqueueAutoApplyRun(
      u.id,
      { minScore: 0, maxApplications: 10, autoSubmit: false, authorized: false, exclusions: ["Staffing"] },
      {
        searchJobs: async () => [
          listing({ sourceUrl: "https://boards.greenhouse.io/acme/jobs/1" }),
          listing({ sourceUrl: "https://boards.greenhouse.io/acme/jobs/1?utm_source=x" }), // dup after normalize
          listing({ sourceUrl: "https://boards.greenhouse.io/staff/jobs/9", company: "Acme Staffing" }), // excluded
          listing({ sourceUrl: null as unknown as string, title: "No URL" }), // skipped
        ],
      },
    );
    expect(res.queued).toBe(1);
    expect(res.deduped).toBe(1);
    expect(res.skipped).toBe(2);
  });
});

// A fake apply engine so the worker tests never launch a real browser.
function fakeApply(result: Partial<ApplyResult>): (i: ApplyInput) => Promise<ApplyResult> {
  return async () => ({ status: "failed", filled: [], skipped: [], fileUploaded: false, ...result });
}

async function makeServerTask(userId: string, autoSubmit: boolean) {
  const job = await db.job.create({ data: { userId, title: "Backend Engineer", company: "Acme", url: "https://boards.greenhouse.io/acme/jobs/1", source: "greenhouse" } });
  const { task } = await enqueueTask(userId, {
    runId: "run_w",
    jobId: job.id,
    company: "Acme",
    title: "Backend Engineer",
    jobUrl: "https://boards.greenhouse.io/acme/jobs/1",
    normalizedUrl: `n:${userId}`,
    channel: "SERVER",
    idempotencyKey: `n:${userId}`,
    clientRef: `aa:${job.id}`,
    autoSubmit,
    authorized: true,
  });
  return { job, task };
}

describe("worker processServerTask: evidence-based status + reservation lock-step", () => {
  it("SUBMITTED_CONFIRMED on confirmed evidence consumes one reservation", async () => {
    const u = await makeUser("w3@example.com", { subscribed: true });
    const { task } = await makeServerTask(u.id, true);
    await processServerTask(task, { apply: fakeApply({ status: "submitted_confirmed", evidence: "Application received" }), resumePath: null });
    const t = await db.autoApplyTask.findUnique({ where: { id: task.id } });
    expect(t!.status).toBe("SUBMITTED_CONFIRMED");
    const conf = await db.submissionReservation.count({ where: { userId: u.id, status: "CONFIRMED" } });
    expect(conf).toBe(1);
  });

  it("paused on login -> BLOCKED and RELEASES the reservation (no quota consumed)", async () => {
    const u = await makeUser("w4@example.com", { subscribed: true });
    const { task } = await makeServerTask(u.id, true);
    await processServerTask(task, { apply: fakeApply({ status: "paused", reason: "login required" }), resumePath: null });
    const t = await db.autoApplyTask.findUnique({ where: { id: task.id } });
    expect(t!.status).toBe("BLOCKED");
    expect(await db.submissionReservation.count({ where: { userId: u.id, status: "CONFIRMED" } })).toBe(0);
    expect(await db.submissionReservation.count({ where: { userId: u.id, status: "RELEASED" } })).toBe(1);
  });

  it("submit uncertain -> UNCERTAIN (holds the slot, prevents a duplicate retry)", async () => {
    const u = await makeUser("w5@example.com", { subscribed: true });
    const { task } = await makeServerTask(u.id, true);
    await processServerTask(task, { apply: fakeApply({ status: "submitted_uncertain", reason: "no confirmation seen" }), resumePath: null });
    const t = await db.autoApplyTask.findUnique({ where: { id: task.id } });
    expect(t!.status).toBe("UNCERTAIN");
    expect(await db.submissionReservation.count({ where: { userId: u.id, status: "UNCERTAIN" } })).toBe(1);
  });

  it("runWorkerLoop drains queued SERVER tasks (single concurrency) and stops", async () => {
    const u = await makeUser("w6@example.com", { subscribed: true });
    await makeServerTask(u.id, true);
    await runWorkerLoop({
      workerId: "test-worker",
      maxTasks: 1,
      deps: { apply: fakeApply({ status: "submitted_confirmed", evidence: "received" }), resumePath: null },
    });
    const remaining = await db.autoApplyTask.count({ where: { userId: u.id, status: "QUEUED" } });
    expect(remaining).toBe(0);
  });
});
