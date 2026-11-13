import { describe, it, expect } from "vitest";
import { signup } from "@/lib/auth/service";
import { db } from "@/lib/db";
import { ensureTailoredResume } from "@/lib/autoapply/tailored-resume";
import { processServerTask } from "@/lib/autoapply/worker";
import { enqueueTask } from "@/lib/autoapply/queue";
import type { ApplyInput, ApplyResult } from "@/lib/autoapply/engine";
import type { ResumeVersion } from "@prisma/client";

async function makeUser(email: string, opts: { subscribed?: boolean; tailorPerJob?: boolean } = {}) {
  const r = await signup({ email, password: "password123" });
  if (!r.ok) throw new Error("signup failed");
  await db.profile.upsert({
    where: { userId: r.user.id },
    update: { tailorPerJob: !!opts.tailorPerJob },
    create: { userId: r.user.id, tailorPerJob: !!opts.tailorPerJob },
  });
  if (opts.subscribed) await db.subscription.create({ data: { userId: r.user.id, tier: "PRO", provider: "dev", status: "active" } });
  return r.user;
}
const job = (userId: string, title: string, url: string) =>
  db.job.create({ data: { userId, title, company: "Acme", url, source: "greenhouse" } });

let tailorCalls = 0;
const fakeTailor = async (userId: string, jobId: string): Promise<ResumeVersion> => {
  tailorCalls++;
  return db.resumeVersion.create({ data: { userId, jobId, label: `v${tailorCalls}`, contentMd: `# ${jobId} ${tailorCalls}`, model: "fake" } });
};
const fakeRender = async (md: string) => Buffer.from(`PDF::${md}`);
const deps = { tailor: fakeTailor, render: fakeRender };

describe("tailored resume reuse by role (cost cut)", () => {
  it("reuses one tailored resume across SAME-ROLE jobs; regenerates on profile change or different role", async () => {
    tailorCalls = 0;
    const u = await makeUser("lc1@example.com");
    const j1 = await job(u.id, "Backend Engineer", "https://boards.greenhouse.io/a/jobs/1");
    const j2 = await job(u.id, "Backend Engineer", "https://boards.greenhouse.io/b/jobs/2"); // same role, other company
    const j3 = await job(u.id, "Frontend Engineer", "https://boards.greenhouse.io/c/jobs/3"); // different role

    const v1 = await ensureTailoredResume(u.id, j1.id, deps);
    const v2 = await ensureTailoredResume(u.id, j2.id, deps);
    expect(v2.id).toBe(v1.id); // same role + unchanged inputs → cache hit, no new LLM call
    expect(tailorCalls).toBe(1);

    // Different role → regenerate.
    const v3 = await ensureTailoredResume(u.id, j3.id, deps);
    expect(v3.id).not.toBe(v1.id);
    expect(tailorCalls).toBe(2);

    // Profile change → the freshness hash changes → regenerate even for the same role.
    await db.profile.update({ where: { userId: u.id }, data: { headline: "changed" } });
    const v1b = await ensureTailoredResume(u.id, j1.id, deps);
    expect(v1b.id).not.toBe(v1.id);
    expect(tailorCalls).toBe(3);
  });
});

function fakeApply(result: Partial<ApplyResult>): (i: ApplyInput) => Promise<ApplyResult> {
  return async () => ({ status: "filled", filled: [], skipped: [], fileUploaded: false, ...result });
}
async function serverTask(userId: string, jobId: string) {
  const { task } = await enqueueTask(userId, {
    runId: "run_lc", jobId, company: "Acme", title: "Backend Engineer",
    jobUrl: "https://boards.greenhouse.io/a/jobs/1", normalizedUrl: `n:${jobId}`,
    channel: "SERVER", idempotencyKey: `n:${jobId}`, clientRef: `aa:${jobId}`, autoSubmit: false, authorized: false,
  });
  return task;
}

describe("tailor on/off toggle (zero LLM when off)", () => {
  it("OFF (default/free): no tailoring call — uses the standard resume path", async () => {
    let called = 0;
    const u = await makeUser("lc2@example.com", { subscribed: true, tailorPerJob: false });
    const j = await job(u.id, "Backend Engineer", "https://boards.greenhouse.io/a/jobs/1");
    const task = await serverTask(u.id, j.id);
    await processServerTask(task, {
      apply: fakeApply({ status: "filled" }),
      tailored: async () => { called++; return null; },
    });
    expect(called).toBe(0); // tailoring never invoked
  });

  it("ON (Pro + toggle): tailoring is invoked", async () => {
    let called = 0;
    const u = await makeUser("lc3@example.com", { subscribed: true, tailorPerJob: true });
    const j = await job(u.id, "Backend Engineer", "https://boards.greenhouse.io/a/jobs/1");
    const task = await serverTask(u.id, j.id);
    await processServerTask(task, {
      apply: fakeApply({ status: "filled" }),
      tailored: async () => { called++; return { path: "/tmp/x.pdf", resumeVersionId: "v" }; },
    });
    expect(called).toBe(1);
  });

  it("ON toggle but NOT subscribed → still no tailoring (paid feature)", async () => {
    let called = 0;
    const u = await makeUser("lc4@example.com", { subscribed: false, tailorPerJob: true });
    const j = await job(u.id, "Backend Engineer", "https://boards.greenhouse.io/a/jobs/1");
    const task = await serverTask(u.id, j.id);
    await processServerTask(task, {
      apply: fakeApply({ status: "filled" }),
      tailored: async () => { called++; return null; },
    });
    expect(called).toBe(0);
  });
});
