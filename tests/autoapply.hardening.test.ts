import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { signup } from "@/lib/auth/service";
import { db } from "@/lib/db";
import { processServerTask } from "@/lib/autoapply/worker";
import { enqueueTask, getRunStatus, resumeTask } from "@/lib/autoapply/queue";
import { ensureTailoredResume, resolveTailoredResumeFile } from "@/lib/autoapply/tailored-resume";
import type { ApplyInput, ApplyResult } from "@/lib/autoapply/engine";
import type { ResumeVersion } from "@prisma/client";
import { detectExpired } from "../extension/src/block";

async function makeUser(email: string, opts: { subscribed?: boolean } = {}) {
  const r = await signup({ email, password: "password123" });
  if (!r.ok) throw new Error("signup failed");
  if (opts.subscribed) await db.subscription.create({ data: { userId: r.user.id, tier: "PRO", provider: "dev", status: "active" } });
  return r.user;
}
async function makeJob(userId: string) {
  return db.job.create({ data: { userId, title: "Backend Engineer", company: "Acme", url: "https://boards.greenhouse.io/acme/jobs/1", source: "greenhouse" } });
}
async function makeServerTask(userId: string, jobId: string, autoSubmit: boolean, runId = "run_h") {
  const { task } = await enqueueTask(userId, {
    runId, jobId, company: "Acme", title: "Backend Engineer",
    jobUrl: "https://boards.greenhouse.io/acme/jobs/1", normalizedUrl: `n:${jobId}`,
    channel: "SERVER", idempotencyKey: `n:${jobId}`, clientRef: `aa:${jobId}`, autoSubmit, authorized: true,
  });
  return task;
}
function fakeApply(result: Partial<ApplyResult>): (i: ApplyInput) => Promise<ApplyResult> {
  return async () => ({ status: "failed", filled: [], skipped: [], fileUploaded: false, ...result });
}
const statusesOf = async (taskId: string) =>
  (await db.autoApplyTaskEvent.findMany({ where: { taskId }, select: { status: true } })).map((e) => e.status);

describe("tailored resume: immutable artifact, exact file, isolation, reuse", () => {
  // Fakes so we never call the real LLM / PDF browser.
  let tailorCalls = 0;
  const fakeTailor = async (userId: string, jobId: string): Promise<ResumeVersion> => {
    tailorCalls++;
    return db.resumeVersion.create({ data: { userId, jobId, label: "Tailored for Acme", contentMd: `# Resume for ${jobId}`, model: "fake" } });
  };
  const fakeRender = async (md: string) => Buffer.from(`PDF::${md}`);

  it("creates a per-job artifact, selects the exact file, isolates by user, and reuses on match", async () => {
    tailorCalls = 0;
    const user = await makeUser("tr1@example.com");
    const other = await makeUser("tr1b@example.com");
    const job = await makeJob(user.id);

    const v1 = await ensureTailoredResume(user.id, job.id, { tailor: fakeTailor, render: fakeRender });
    expect(v1.storageKey).toBeTruthy();
    expect(v1.fileHash).toBeTruthy();
    expect(v1.inputsHash).toBeTruthy();
    expect(tailorCalls).toBe(1);

    // The exact file resolves for the owner and its bytes match the recorded hash.
    const file = await resolveTailoredResumeFile(user.id, v1.id);
    expect(file).not.toBeNull();
    expect(file!.fileHash).toBe(v1.fileHash);

    // Isolation: another user cannot resolve this version's file.
    expect(await resolveTailoredResumeFile(other.id, v1.id)).toBeNull();

    // Reuse on identical inputs: same version returned, tailor NOT called again.
    const v2 = await ensureTailoredResume(user.id, job.id, { tailor: fakeTailor, render: fakeRender });
    expect(v2.id).toBe(v1.id);
    expect(tailorCalls).toBe(1);
  });

  it("will not resolve another job's artifact for this job (no cross-job file)", async () => {
    const user = await makeUser("tr2@example.com");
    const jobA = await makeJob(user.id);
    const jobB = await db.job.create({ data: { userId: user.id, title: "Frontend", company: "Beta", url: "https://jobs.lever.co/beta/2", source: "lever" } });
    const vA = await ensureTailoredResume(user.id, jobA.id, { tailor: fakeTailor, render: fakeRender });
    const vB = await ensureTailoredResume(user.id, jobB.id, { tailor: fakeTailor, render: fakeRender });
    expect(vA.id).not.toBe(vB.id);
    expect(vA.fileHash).not.toBe(vB.fileHash); // different content → different file
  });
});

describe("worker funnel transitions + evidence-based confirmation + quota", () => {
  it("submitted_confirmed → funnel stages, SUBMITTED_CONFIRMED, quota consumed", async () => {
    const user = await makeUser("hw1@example.com", { subscribed: true });
    const job = await makeJob(user.id);
    const task = await makeServerTask(user.id, job.id, true);
    await processServerTask(task, { apply: fakeApply({ status: "submitted_confirmed", evidence: "Application received", filled: [{ selector: "#e", label: "Email" }], fileUploaded: true }), resumePath: null });

    const t = await db.autoApplyTask.findUnique({ where: { id: task.id } });
    expect(t!.status).toBe("SUBMITTED_CONFIRMED");
    expect(t!.uploadVerified).toBe(true);
    const seen = await statusesOf(task.id);
    for (const s of ["APPLICATION_FORM_FOUND", "FILLED_AND_VALIDATED", "SUBMITTING", "SUBMITTED_CONFIRMED"]) expect(seen).toContain(s);
    expect(await db.submissionReservation.count({ where: { userId: user.id, status: "CONFIRMED" } })).toBe(1);

    const run = await getRunStatus(user.id, "run_h");
    expect(run.funnel.formsReached).toBe(1);
    expect(run.funnel.attempted).toBe(1);
    expect(run.funnel.confirmed).toBe(1);
  });

  it("submitted_uncertain → UNCERTAIN holds the reservation (no duplicate retry)", async () => {
    const user = await makeUser("hw2@example.com", { subscribed: true });
    const job = await makeJob(user.id);
    const task = await makeServerTask(user.id, job.id, true);
    await processServerTask(task, { apply: fakeApply({ status: "submitted_uncertain", reason: "no confirmation", filled: [{ selector: "#e", label: "Email" }] }), resumePath: null });
    expect((await db.autoApplyTask.findUnique({ where: { id: task.id } }))!.status).toBe("UNCERTAIN");
    expect(await db.submissionReservation.count({ where: { userId: user.id, status: "UNCERTAIN" } })).toBe(1);
  });

  it("expired → EXPIRED and releases the reservation (no quota consumed)", async () => {
    const user = await makeUser("hw3@example.com", { subscribed: true });
    const job = await makeJob(user.id);
    const task = await makeServerTask(user.id, job.id, true);
    await processServerTask(task, { apply: fakeApply({ status: "expired", reason: "closed" }), resumePath: null });
    expect((await db.autoApplyTask.findUnique({ where: { id: task.id } }))!.status).toBe("EXPIRED");
    expect(await db.submissionReservation.count({ where: { userId: user.id, status: "CONFIRMED" } })).toBe(0);
    expect(await db.submissionReservation.count({ where: { userId: user.id, status: "RELEASED" } })).toBe(1);
  });

  it("paused on CAPTCHA → BLOCKED with a recovery URL, reservation released", async () => {
    const user = await makeUser("hw4@example.com", { subscribed: true });
    const job = await makeJob(user.id);
    const task = await makeServerTask(user.id, job.id, true);
    await processServerTask(task, { apply: fakeApply({ status: "paused", reason: "A CAPTCHA / anti-bot check is present." }), resumePath: null });
    const t = await db.autoApplyTask.findUnique({ where: { id: task.id } });
    expect(t!.status).toBe("BLOCKED");
    expect(t!.recoveryUrl).toBeTruthy();
    expect(await db.submissionReservation.count({ where: { userId: user.id, status: "RELEASED" } })).toBe(1);
  });
});

describe("pause recovery + duplicate prevention", () => {
  it("resumeTask re-queues a BLOCKED task without a duplicate application", async () => {
    const user = await makeUser("rc1@example.com", { subscribed: true });
    const job = await makeJob(user.id);
    const task = await makeServerTask(user.id, job.id, true);
    await processServerTask(task, { apply: fakeApply({ status: "paused", reason: "sign-in required" }), resumePath: null });
    expect((await db.autoApplyTask.findUnique({ where: { id: task.id } }))!.status).toBe("BLOCKED");

    const r = await resumeTask(user.id, task.id);
    expect(r.ok).toBe(true);
    expect(r.task!.status).toBe("QUEUED");
    // No duplicate: still exactly one task + at most one application for the job.
    expect(await db.autoApplyTask.count({ where: { userId: user.id, jobId: job.id } })).toBe(1);
    expect(await db.application.count({ where: { userId: user.id, jobId: job.id } })).toBeLessThanOrEqual(1);
  });

  it("refuses to resume an UNCERTAIN task (must reconcile first — never resubmit)", async () => {
    const user = await makeUser("rc2@example.com", { subscribed: true });
    const job = await makeJob(user.id);
    const task = await makeServerTask(user.id, job.id, true);
    await processServerTask(task, { apply: fakeApply({ status: "submitted_uncertain", filled: [] }), resumePath: null });
    const r = await resumeTask(user.id, task.id);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("reconcile_first");
  });

  it("re-processing an already-confirmed task does not double-consume quota", async () => {
    const user = await makeUser("rc3@example.com", { subscribed: true });
    const job = await makeJob(user.id);
    const task = await makeServerTask(user.id, job.id, true);
    const apply = fakeApply({ status: "submitted_confirmed", evidence: "received", filled: [] });
    await processServerTask(task, { apply, resumePath: null });
    await processServerTask(task, { apply, resumePath: null }); // idempotent re-run
    expect(await db.submissionReservation.count({ where: { userId: user.id, status: "CONFIRMED" } })).toBe(1);
  });

  it("isolation: a user cannot resume another user's task", async () => {
    const a = await makeUser("rc4@example.com", { subscribed: true });
    const b = await makeUser("rc4b@example.com");
    const job = await makeJob(a.id);
    const task = await makeServerTask(a.id, job.id, true);
    await processServerTask(task, { apply: fakeApply({ status: "paused", reason: "login" }), resumePath: null });
    const r = await resumeTask(b.id, task.id);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not_found");
  });
});

describe("expired/closed detection (pure)", () => {
  const doc = (html: string) => new JSDOM(html).window.document;
  it("flags a closed/expired posting and not an open one", () => {
    expect(detectExpired(doc("<body><h1>SWE</h1><p>This position has been filled. We are no longer accepting applications.</p></body>"))).toMatch(/closed or expired/i);
    expect(detectExpired(doc("<body><h1>SWE</h1><p>This job is closed for applications.</p></body>"))).toMatch(/closed or expired/i);
    expect(detectExpired(doc("<body><form><input type='email'/></form><p>Apply now for this exciting role.</p></body>"))).toBeNull();
  });
});
