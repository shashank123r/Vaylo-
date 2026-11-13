import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { AutoApplyChannel, AutoApplyTask, AutoApplyTaskStatus } from "@prisma/client";

// Durable Postgres-backed task queue for hybrid auto-apply. No in-memory state:
// everything a worker or the extension needs is a row. Claims use FOR UPDATE SKIP
// LOCKED + a visibility timeout (lockedUntil) so concurrent claimers never collide
// and a crashed/restarted worker's in-flight task is re-claimed once its lock
// expires. Per-user isolation is enforced on every read/write.

// Statuses whose holder owns a live lock (claimed and working). Past their
// lockedUntil they are considered abandoned and become re-claimable.
const HOLDS_LOCK: AutoApplyTaskStatus[] = ["CLAIMED", "OPENED", "AUTOFILLED"];
// Terminal-or-waiting statuses are never auto-reclaimed: SUBMITTED/FAILED are done;
// NEEDS_USER waits for the user; UNCERTAIN waits for reconciliation.
const DEFAULT_LOCK_MS = 120_000; // 2 min visibility timeout

export interface EnqueueInput {
  runId: string;
  jobId?: string | null;
  company: string;
  title: string;
  jobUrl: string;
  normalizedUrl: string;
  channel: AutoApplyChannel;
  idempotencyKey: string; // unique per user; dedupes the same job across runs
  clientRef: string; // links to the submission reservation / audit row
  autoSubmit?: boolean;
  authorized?: boolean;
  maxAttempts?: number;
}

// Enqueue a task, idempotently. A job already queued/in-flight/submitted is NOT
// re-enqueued (returns deduped=true). A previously FAILED task is reset to QUEUED so
// it can be retried.
export async function enqueueTask(
  userId: string,
  input: EnqueueInput,
): Promise<{ task: AutoApplyTask; deduped: boolean }> {
  const existing = await db.autoApplyTask.findUnique({
    where: { userId_idempotencyKey: { userId, idempotencyKey: input.idempotencyKey } },
  });
  if (existing) {
    if (existing.status === "FAILED") {
      const task = await db.autoApplyTask.update({
        where: { id: existing.id },
        data: {
          status: "QUEUED",
          attempts: 0,
          reason: null,
          evidence: null,
          lockedUntil: null,
          claimedBy: null,
          claimedAt: null,
          scheduledAt: new Date(),
          runId: input.runId,
        },
      });
      return { task, deduped: false };
    }
    return { task: existing, deduped: true };
  }
  const task = await db.autoApplyTask.create({
    data: {
      userId,
      runId: input.runId,
      jobId: input.jobId ?? null,
      company: input.company,
      title: input.title,
      jobUrl: input.jobUrl,
      normalizedUrl: input.normalizedUrl,
      channel: input.channel,
      idempotencyKey: input.idempotencyKey,
      clientRef: input.clientRef,
      autoSubmit: input.autoSubmit ?? false,
      authorized: input.authorized ?? false,
      maxAttempts: input.maxAttempts ?? 3,
    },
  });
  return { task, deduped: false };
}

export interface ClaimOpts {
  channel: AutoApplyChannel;
  workerId: string; // worker id, or "ext:<connectionId>"
  lockMs?: number;
  userId?: string; // REQUIRED for EXTENSION claims — scopes to the polling user
  now?: Date;
}

// Atomically claim the next eligible task for a channel: QUEUED, or an abandoned
// in-flight task whose lock expired (restart recovery). FOR UPDATE SKIP LOCKED means
// two workers never grab the same row. Returns null when nothing is claimable.
export async function claimNext(opts: ClaimOpts): Promise<AutoApplyTask | null> {
  const now = opts.now ?? new Date();
  const lockedUntil = new Date(now.getTime() + (opts.lockMs ?? DEFAULT_LOCK_MS));
  const userFilter = opts.userId ? Prisma.sql`AND "userId" = ${opts.userId}` : Prisma.empty;
  const rows = await db.$queryRaw<AutoApplyTask[]>(Prisma.sql`
    UPDATE "AutoApplyTask"
    SET status = 'CLAIMED', "claimedBy" = ${opts.workerId}, "claimedAt" = ${now},
        "lockedUntil" = ${lockedUntil}, attempts = attempts + 1, "updatedAt" = ${now}
    WHERE id = (
      SELECT id FROM "AutoApplyTask"
      WHERE channel = ${opts.channel}::"AutoApplyChannel"
        AND "scheduledAt" <= ${now}
        AND attempts < "maxAttempts"
        AND (
          status = 'QUEUED'
          OR (status IN ('CLAIMED','OPENED','AUTOFILLED') AND "lockedUntil" < ${now})
        )
        ${userFilter}
      ORDER BY "scheduledAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *;
  `);
  return rows[0] ?? null;
}

export interface ReportInput {
  status: AutoApplyTaskStatus;
  evidence?: string | null;
  reason?: string | null;
  // When the status is FAILED and retries remain, requeue with this backoff instead
  // of marking it terminally FAILED.
  retryInMs?: number;
  lockMs?: number; // heartbeat: how long to extend the lock for an in-progress update
  // Durable pause/recovery + funnel instrumentation (all optional, persisted as given).
  stage?: string | null;
  recoveryUrl?: string | null;
  resumeVersionId?: string | null;
  fieldsFilled?: number;
  uploadVerified?: boolean;
}

// Statuses that extend the heartbeat lock (work is actively in progress).
const INFLIGHT: AutoApplyTaskStatus[] = [...HOLDS_LOCK, "APPLICATION_FORM_FOUND", "FILLED_AND_VALIDATED", "SUBMITTING"];

// Report progress/outcome for a claimed task. Enforces per-user ownership. In-flight
// statuses extend the lock (heartbeat); terminal/waiting statuses clear it. A
// retryable FAILED with attempts remaining is requeued with backoff. Every call
// appends an immutable event to the task's history.
export async function reportResult(taskId: string, userId: string, input: ReportInput): Promise<AutoApplyTask | null> {
  const task = await db.autoApplyTask.findFirst({ where: { id: taskId, userId } });
  if (!task) return null; // isolation: not this user's task (or gone)

  // Extra durable fields that apply regardless of the status branch.
  const extra = {
    ...(input.stage !== undefined ? { stage: input.stage } : {}),
    ...(input.recoveryUrl !== undefined ? { recoveryUrl: input.recoveryUrl } : {}),
    ...(input.resumeVersionId !== undefined ? { resumeVersionId: input.resumeVersionId } : {}),
    ...(input.fieldsFilled !== undefined ? { fieldsFilled: input.fieldsFilled } : {}),
    ...(input.uploadVerified !== undefined ? { uploadVerified: input.uploadVerified } : {}),
  };

  let updated: AutoApplyTask;
  if (input.status === "FAILED" && typeof input.retryInMs === "number" && task.attempts < task.maxAttempts) {
    updated = await db.autoApplyTask.update({
      where: { id: task.id },
      data: {
        status: "QUEUED",
        scheduledAt: new Date(Date.now() + input.retryInMs),
        lockedUntil: null,
        claimedBy: null,
        claimedAt: null,
        reason: input.reason ?? null,
        ...extra,
      },
    });
  } else {
    const holdsLock = INFLIGHT.includes(input.status);
    updated = await db.autoApplyTask.update({
      where: { id: task.id },
      data: {
        status: input.status,
        evidence: input.evidence ?? task.evidence,
        reason: input.reason ?? null,
        lockedUntil: holdsLock ? new Date(Date.now() + (input.lockMs ?? DEFAULT_LOCK_MS)) : null,
        ...extra,
      },
    });
  }

  // Append the real transition to the immutable event history.
  await db.autoApplyTaskEvent
    .create({ data: { taskId: task.id, userId, status: input.status, detail: input.reason ?? null } })
    .catch(() => {});
  return updated;
}

// Restart / crash recovery: abandoned in-flight tasks (lock expired) are either
// FAILED (no attempts left) or requeued (attempts remain). Safe to call on a loop.
export async function recoverStuck(now = new Date()): Promise<{ failed: number; requeued: number }> {
  const failed = await db.$executeRaw(Prisma.sql`
    UPDATE "AutoApplyTask"
    SET status = 'FAILED', reason = 'Exhausted retries after interruption', "lockedUntil" = NULL, "updatedAt" = ${now}
    WHERE status IN ('CLAIMED','OPENED','AUTOFILLED') AND "lockedUntil" < ${now} AND attempts >= "maxAttempts";
  `);
  const requeued = await db.$executeRaw(Prisma.sql`
    UPDATE "AutoApplyTask"
    SET status = 'QUEUED', "lockedUntil" = NULL, "claimedBy" = NULL, "updatedAt" = ${now}
    WHERE status IN ('CLAIMED','OPENED','AUTOFILLED') AND "lockedUntil" < ${now} AND attempts < "maxAttempts";
  `);
  return { failed: Number(failed), requeued: Number(requeued) };
}

// Resume a task that paused on a login wall / CAPTCHA / required human action, AFTER
// the user has cleared it. Re-queues the SAME task (same jobId, same clientRef) so it
// is re-attempted from its recovery URL — it NEVER creates a new Job/Application, and
// the reservation's idempotency prevents a duplicate submission. An UNCERTAIN task is
// refused: it must be reconciled first so we never resubmit an ambiguous application.
export async function resumeTask(
  userId: string,
  taskId: string,
): Promise<{ ok: boolean; reason?: string; task?: AutoApplyTask }> {
  const task = await db.autoApplyTask.findFirst({ where: { id: taskId, userId } });
  if (!task) return { ok: false, reason: "not_found" };
  if (task.status === "UNCERTAIN") return { ok: false, reason: "reconcile_first" };
  if (!(["BLOCKED", "NEEDS_USER_ACTION", "NEEDS_USER"] as AutoApplyTaskStatus[]).includes(task.status)) {
    return { ok: false, reason: "not_paused" };
  }
  const updated = await db.autoApplyTask.update({
    where: { id: task.id },
    data: {
      status: "QUEUED",
      scheduledAt: new Date(),
      lockedUntil: null,
      claimedBy: null,
      claimedAt: null,
      reason: `Resumed from ${task.stage ?? "pause"}`,
    },
  });
  await db.autoApplyTaskEvent
    .create({ data: { taskId: task.id, userId, status: "QUEUED", detail: `Resumed from ${task.stage ?? "pause"}` } })
    .catch(() => {});
  return { ok: true, task: updated };
}

export interface RunFunnel {
  discovered: number;
  eligible: number;
  opened: number;
  formsReached: number;
  fieldsVerified: number;
  resumesUploaded: number;
  attempted: number;
  confirmed: number;
}

export interface RunStatus {
  runId: string;
  total: number;
  byStatus: Record<string, number>;
  funnel: RunFunnel;
  items: Pick<
    AutoApplyTask,
    "id" | "title" | "company" | "channel" | "status" | "reason" | "evidence" | "jobUrl" | "stage" | "fieldsFilled" | "uploadVerified"
  >[];
}

const OPENED_PLUS: AutoApplyTaskStatus[] = [
  "OPENED", "APPLICATION_FORM_FOUND", "AUTOFILLED", "FILLED_AND_VALIDATED", "SUBMITTING",
  "SUBMITTED", "SUBMITTED_CONFIRMED", "UNCERTAIN", "NEEDS_USER", "NEEDS_USER_ACTION", "BLOCKED", "EXPIRED",
];
const FORM_PLUS: AutoApplyTaskStatus[] = [
  "APPLICATION_FORM_FOUND", "AUTOFILLED", "FILLED_AND_VALIDATED", "SUBMITTING", "SUBMITTED", "SUBMITTED_CONFIRMED", "UNCERTAIN",
];
const ATTEMPT_PLUS: AutoApplyTaskStatus[] = ["SUBMITTING", "SUBMITTED", "SUBMITTED_CONFIRMED", "UNCERTAIN"];
const CONFIRMED: AutoApplyTaskStatus[] = ["SUBMITTED", "SUBMITTED_CONFIRMED"];

// Persistent status tracking for a run (per-user isolated). The funnel is derived
// from the REAL event history (which stages each task actually reached) — never fabricated.
export async function getRunStatus(userId: string, runId: string): Promise<RunStatus> {
  const tasks = await db.autoApplyTask.findMany({
    where: { userId, runId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, title: true, company: true, channel: true, status: true,
      reason: true, evidence: true, jobUrl: true, stage: true, fieldsFilled: true, uploadVerified: true,
    },
  });
  const events = await db.autoApplyTaskEvent.findMany({
    where: { userId, task: { runId } },
    select: { taskId: true, status: true },
  });
  const seen = new Map<string, Set<AutoApplyTaskStatus>>();
  for (const e of events) {
    (seen.get(e.taskId) ?? seen.set(e.taskId, new Set()).get(e.taskId)!).add(e.status);
  }
  const ever = (id: string, of: AutoApplyTaskStatus[]) => {
    const s = seen.get(id);
    return !!s && of.some((x) => s.has(x));
  };

  const byStatus: Record<string, number> = {};
  const funnel: RunFunnel = { discovered: tasks.length, eligible: tasks.length, opened: 0, formsReached: 0, fieldsVerified: 0, resumesUploaded: 0, attempted: 0, confirmed: 0 };
  for (const t of tasks) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    if (ever(t.id, OPENED_PLUS)) funnel.opened++;
    if (ever(t.id, FORM_PLUS)) funnel.formsReached++;
    if (ever(t.id, ["FILLED_AND_VALIDATED"]) || t.fieldsFilled > 0) funnel.fieldsVerified++;
    if (t.uploadVerified) funnel.resumesUploaded++;
    if (ever(t.id, ATTEMPT_PLUS)) funnel.attempted++;
    if (ever(t.id, CONFIRMED)) funnel.confirmed++;
  }
  return { runId, total: tasks.length, byStatus, funnel, items: tasks };
}
