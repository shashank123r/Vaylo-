import "server-only";
import type { AutoApplyTask } from "@prisma/client";
import { buildAutofillProfile } from "@/lib/extension/profile";
import {
  reserveSubmission,
  finalizeConfirmed,
  markUncertain,
  releaseReservation,
} from "@/lib/applications/reservation";
import { claimNext, reportResult, recoverStuck } from "./queue";
import { runApplication, type ApplyInput, type ApplyResult } from "./engine";
import { resolveActiveResumeFile } from "./resume";
import { ensureTailoredResume, resolveTailoredResumeFile, shouldTailor } from "./tailored-resume";

// The single, bounded SERVER worker. It claims one SERVER task at a time, runs the
// existing apply engine (which launches Chromium on demand and CLOSES it after),
// updates the durable task + the two-phase submission reservation, and moves on.
// Concurrency is 1 by construction: the loop awaits each task before claiming the
// next, so there is never more than one Chromium alive. It survives restarts because
// all state is in Postgres — recoverStuck() re-queues tasks abandoned by a crash.

const RETRY_BACKOFF_MS = 60_000;

export interface WorkerDeps {
  // Injectable for tests so we never launch a real browser / LLM in unit tests.
  apply?: (input: ApplyInput) => Promise<ApplyResult>;
  resumePath?: string | null;
  // Resolve the per-job tailored resume artifact (exact file + version id). Defaults
  // to ensureTailoredResume + resolveTailoredResumeFile.
  tailored?: (userId: string, jobId: string) => Promise<{ path: string; resumeVersionId: string } | null>;
}

async function defaultTailored(userId: string, jobId: string): Promise<{ path: string; resumeVersionId: string } | null> {
  const version = await ensureTailoredResume(userId, jobId);
  const file = await resolveTailoredResumeFile(userId, version.id);
  return file ? { path: file.path, resumeVersionId: file.resumeVersionId } : null;
}

// Classifies a "paused" engine result into BLOCKED (login/CAPTCHA/anti-bot — a hard
// stop we never bypass) vs NEEDS_USER_ACTION (a required human answer).
function pausedStatus(reason?: string): "BLOCKED" | "NEEDS_USER_ACTION" {
  return /captcha|anti-bot|sign-?in|log ?in|mfa|verif|password/i.test(reason ?? "") ? "BLOCKED" : "NEEDS_USER_ACTION";
}

// Process ONE claimed SERVER task. Reserves capacity before submitting, maps the
// engine's evidence-based result to a durable status, and keeps the reservation and
// task in lock-step. Never throws (records FAILED instead).
export async function processServerTask(task: AutoApplyTask, deps: WorkerDeps = {}): Promise<void> {
  const apply = deps.apply ?? runApplication;
  const userId = task.userId;
  try {
    await reportResult(task.id, userId, { status: "OPENED", reason: "Opening the application form…", stage: "opened" });

    const profile = await buildAutofillProfile(userId);

    // Per-job tailored resume: pick the EXACT immutable artifact for this job and
    // record which version was chosen. Falls back to the active resume if tailoring
    // is unavailable. (Explicit deps.resumePath, e.g. in tests, overrides.)
    let resumePath = deps.resumePath !== undefined ? deps.resumePath : null;
    let resumeVersionId: string | null = null;
    // Tailor ONLY when enabled (Pro + toggle on). Otherwise fall through to the
    // standard uploaded resume below — no LLM call.
    if (deps.resumePath === undefined && task.jobId && (await shouldTailor(userId))) {
      try {
        const tfn = deps.tailored ?? defaultTailored;
        const t = await tfn(userId, task.jobId);
        if (t) {
          resumePath = t.path;
          resumeVersionId = t.resumeVersionId;
          await reportResult(task.id, userId, { status: "OPENED", resumeVersionId, reason: "Tailored resume prepared for this role." });
        }
      } catch {
        /* tailoring failed; fall back to the active resume below */
      }
    }
    if (resumePath === null && deps.resumePath === undefined) {
      resumePath = (await resolveActiveResumeFile(userId))?.path ?? null;
    }

    // Reserve a submission slot BEFORE attempting (only when this task may submit).
    let reserved = false;
    if (task.autoSubmit) {
      const r = await reserveSubmission(userId, task.clientRef, task.jobId ?? undefined);
      if (!r.ok && r.reason === "quota_reached") {
        await reportResult(task.id, userId, { status: "NEEDS_USER", reason: `Daily submission limit reached.${r.resetAt ? ` Resets ${r.resetAt}.` : ""}` });
        return;
      }
      if (!r.ok && r.reason === "needs_reconcile") {
        await reportResult(task.id, userId, { status: "UNCERTAIN", reason: "A previous attempt was ambiguous — reconcile it before retrying." });
        return;
      }
      if (r.idempotent && r.status === "CONFIRMED") {
        await reportResult(task.id, userId, { status: "SUBMITTED", reason: "Already submitted in a previous run." });
        return;
      }
      reserved = true;
    }

    const res = await apply({
      url: task.jobUrl,
      profile,
      resumePath,
      autoSubmit: task.autoSubmit,
      authorized: task.authorized,
    });

    const releaseIfHeld = async (reason: string) => {
      if (reserved) await releaseReservation(userId, task.clientRef, { jobId: task.jobId ?? undefined, reason });
    };
    const filledCount = res.filled.length;
    // Record the funnel stages this attempt actually reached (form found → fields
    // filled+validated → …) so the dashboard funnel is derived from real events.
    const markReachedForm = async () => {
      await reportResult(task.id, userId, { status: "APPLICATION_FORM_FOUND", stage: "form_found", reason: "Application form detected." });
      await reportResult(task.id, userId, { status: "FILLED_AND_VALIDATED", stage: "filled", fieldsFilled: filledCount, uploadVerified: res.fileUploaded, reason: `Filled ${filledCount} field(s); values validated.` });
    };

    switch (res.status) {
      case "submitted_confirmed":
        await markReachedForm();
        await reportResult(task.id, userId, { status: "SUBMITTING", stage: "submitting", reason: "Submitting…" });
        if (task.jobId) await finalizeConfirmed(userId, { jobId: task.jobId, clientRef: task.clientRef, evidence: res.evidence });
        await reportResult(task.id, userId, { status: "SUBMITTED_CONFIRMED", evidence: res.evidence ?? null, uploadVerified: res.fileUploaded, reason: "Submitted — confirmed by on-page evidence." });
        break;
      case "submitted_uncertain":
        await markReachedForm();
        await reportResult(task.id, userId, { status: "SUBMITTING", stage: "submitting", reason: "Submitting…" });
        await markUncertain(userId, task.clientRef, { jobId: task.jobId ?? undefined, reason: res.reason });
        await reportResult(task.id, userId, { status: "UNCERTAIN", reason: "Submit attempted but no confirmation seen — reconcile before any retry." });
        break;
      case "filled":
        await releaseIfHeld("Filled, not submitted");
        await markReachedForm();
        break;
      case "expired":
        await releaseIfHeld("Posting expired/closed");
        await reportResult(task.id, userId, { status: "EXPIRED", reason: res.reason || "This posting is closed or expired." });
        break;
      case "paused": {
        await releaseIfHeld(res.reason ?? "Needs a human");
        const st = pausedStatus(res.reason);
        await reportResult(task.id, userId, {
          status: st,
          stage: st === "BLOCKED" ? "blocked" : "needs_user",
          recoveryUrl: task.jobUrl,
          reason: res.reason || (st === "BLOCKED" ? "Login / CAPTCHA required — never bypassed." : "A human answer is required."),
        });
        break;
      }
      case "unsupported":
        await releaseIfHeld("No automatable form");
        await reportResult(task.id, userId, { status: "NEEDS_USER_ACTION", reason: "No form could be automated server-side — apply from your browser." });
        break;
      case "failed":
      default:
        await releaseIfHeld(res.reason ?? "Automation failed");
        await reportResult(task.id, userId, { status: "FAILED", reason: res.reason || "Automation failed.", retryInMs: RETRY_BACKOFF_MS });
        break;
    }
  } catch (e) {
    await reportResult(task.id, userId, {
      status: "FAILED",
      reason: String((e as Error)?.message ?? e),
      retryInMs: RETRY_BACKOFF_MS,
    }).catch(() => {});
  }
}

export interface WorkerLoopOpts {
  workerId: string;
  pollMs?: number;
  lockMs?: number;
  signal?: { aborted: boolean };
  deps?: WorkerDeps;
  // Test hook: stop after this many claimed tasks (undefined = run forever).
  maxTasks?: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// The claim loop. Single concurrency: one task fully processed before the next claim.
export async function runWorkerLoop(opts: WorkerLoopOpts): Promise<void> {
  const pollMs = opts.pollMs ?? 5_000;
  const lockMs = opts.lockMs ?? 120_000;
  let processed = 0;
  while (!opts.signal?.aborted) {
    try {
      await recoverStuck();
      const task = await claimNext({ channel: "SERVER", workerId: opts.workerId, lockMs });
      if (!task) {
        if (opts.maxTasks !== undefined) return; // tests: drain-and-exit
        await sleep(pollMs);
        continue;
      }
      await processServerTask(task, opts.deps ?? {});
      processed++;
      if (opts.maxTasks !== undefined && processed >= opts.maxTasks) return;
    } catch {
      await sleep(pollMs); // never let the loop die on a transient error
    }
  }
}
