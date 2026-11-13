import "server-only";
import { db } from "@/lib/db";
import { isSubscribed, normalizeEmail, FREE_SUBMISSION_LIMIT } from "@/lib/billing/entitlement";
import { istDay, nextIstMidnight } from "@/lib/billing/day";
import type { Prisma, ReservationStatus } from "@prisma/client";

// Pro: up to 50 CONFIRMED SUCCESSFUL submissions per IST calendar day.
export const PRO_DAILY_LIMIT = 50;

type Tx = Prisma.TransactionClient;

function isSerializationError(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  const msg = e instanceof Error ? e.message : "";
  return code === "P2034" || /could not serialize|40001|deadlock/i.test(msg);
}

async function serializable<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  let lastErr: unknown;
  // Retry serialization/write-conflicts with jittered backoff so concurrent
  // reservations resolve under contention instead of thrashing.
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await db.$transaction(fn, { isolationLevel: "Serializable" });
    } catch (e) {
      lastErr = e;
      if (!isSerializationError(e)) throw e;
      await new Promise((r) => setTimeout(r, 15 + Math.floor(Math.random() * 40) * (attempt + 1)));
    }
  }
  throw lastErr;
}

// Statuses that HOLD capacity (cannot be re-used until released/reconciled).
const HELD: ReservationStatus[] = ["RESERVED", "CONFIRMED", "UNCERTAIN"];
const IN_FLIGHT: ReservationStatus[] = ["RESERVED", "UNCERTAIN"];

interface Availability {
  subscribed: boolean;
  limit: number;
  used: number; // confirmed successes (today for Pro, lifetime for Free)
  held: number; // in-flight reservations holding capacity
  available: number; // how many MORE can be reserved right now
  kind: "daily" | "lifetime";
  day?: string;
}

// Computes remaining capacity atomically inside a transaction. Pro counts CONFIRMED
// + in-flight reservations for TODAY (IST). Free uses the durable per-email lifetime
// allowance (survives account deletion) plus in-flight reservations.
async function availability(tx: Tx, userId: string, email: string, subscribed: boolean, now = new Date()): Promise<Availability> {
  if (subscribed) {
    const day = istDay(now);
    const [used, held] = await Promise.all([
      tx.submissionReservation.count({ where: { userId, day, status: "CONFIRMED" } }),
      tx.submissionReservation.count({ where: { userId, day, status: { in: HELD } } }),
    ]);
    return { subscribed, limit: PRO_DAILY_LIMIT, used, held, available: Math.max(0, PRO_DAILY_LIMIT - held), kind: "daily", day };
  }
  const allowance = await tx.emailAllowance.findUnique({ where: { email } });
  const used = allowance?.freeConfirmedUsed ?? 0; // confirmed lifetime (durable per email)
  const inFlight = await tx.submissionReservation.count({ where: { userId, status: { in: IN_FLIGHT } } });
  return {
    subscribed,
    limit: FREE_SUBMISSION_LIMIT,
    used,
    held: inFlight,
    available: Math.max(0, FREE_SUBMISSION_LIMIT - (used + inFlight)),
    kind: "lifetime",
  };
}

export interface ReserveResult {
  ok: boolean;
  status?: ReservationStatus; // current reservation status when ok
  idempotent?: boolean;
  reason?: "quota_reached" | "needs_reconcile";
  resetAt?: string; // ISO; when the daily quota next resets (Pro)
  remaining?: number;
}

// Reserve one submission slot BEFORE attempting. Fail-closed and idempotent per
// (userId, clientRef). Prevents concurrent overshoot via a Serializable count.
export async function reserveSubmission(userId: string, clientRef: string, jobId?: string): Promise<ReserveResult> {
  return serializable(async (tx) => {
    const existing = await tx.submissionReservation.findUnique({ where: { userId_clientRef: { userId, clientRef } } });
    if (existing) {
      if (existing.status === "CONFIRMED") return { ok: true, idempotent: true, status: "CONFIRMED" };
      if (existing.status === "RESERVED") return { ok: true, idempotent: true, status: "RESERVED" };
      if (existing.status === "UNCERTAIN") return { ok: false, reason: "needs_reconcile", status: "UNCERTAIN" };
      // RELEASED (a prior confirmed failure): a retry may re-reserve the same ref.
    }

    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    const subscribed = await isSubscribed(userId, tx);
    const avail = await availability(tx, userId, normalizeEmail(user.email), subscribed);
    if (avail.available <= 0) {
      return {
        ok: false,
        reason: "quota_reached",
        resetAt: subscribed ? nextIstMidnight().toISOString() : undefined,
        remaining: 0,
      };
    }

    const day = istDay();
    if (existing) {
      await tx.submissionReservation.update({ where: { id: existing.id }, data: { status: "RESERVED", day, jobId: jobId ?? existing.jobId, reason: null } });
    } else {
      await tx.submissionReservation.create({ data: { userId, clientRef, jobId: jobId ?? null, day, status: "RESERVED" } });
    }
    return { ok: true, status: "RESERVED", remaining: avail.available - 1 };
  });
}

export interface FinalizeResult {
  counted: boolean;
  idempotent: boolean;
  quotaExceeded: boolean;
}

// Finalize a CONFIRMED success (reliable evidence). If a RESERVED reservation exists
// its capacity is already held, so it is simply finalized. If none exists (e.g. the
// extension reporting a user-completed submission), capacity is checked and a
// CONFIRMED reservation is created atomically. Writes the audit SubmissionResult and
// marks the Application submitted. Idempotent per (userId, clientRef).
export async function finalizeConfirmed(
  userId: string,
  input: { jobId: string; clientRef: string; evidence?: string },
): Promise<FinalizeResult> {
  return serializable(async (tx) => {
    // Idempotency: only a prior CONFIRMED success short-circuits. A prior UNCERTAIN
    // or FAILED record is allowed to be reconciled UP to a confirmed success here.
    const prior = await tx.submissionResult.findUnique({ where: { userId_clientRef: { userId, clientRef: input.clientRef } } });
    if (prior && prior.outcome === "CONFIRMED") return { counted: prior.counted, idempotent: true, quotaExceeded: false };

    const job = await tx.job.findFirst({ where: { id: input.jobId, userId } });
    if (!job) throw new Error("Job not found");
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    const email = normalizeEmail(user.email);
    const subscribed = await isSubscribed(userId, tx);

    const res = await tx.submissionReservation.findUnique({ where: { userId_clientRef: { userId, clientRef: input.clientRef } } });
    let counted = false;
    let quotaExceeded = false;

    if (res && (res.status === "RESERVED" || res.status === "UNCERTAIN")) {
      // Capacity already held by the reservation -> finalize it.
      await tx.submissionReservation.update({ where: { id: res.id }, data: { status: "CONFIRMED", evidence: input.evidence ?? null } });
      counted = true;
    } else if (res && res.status === "CONFIRMED") {
      counted = true; // already finalized
    } else {
      // No held reservation: check capacity and create a CONFIRMED reservation now.
      const avail = await availability(tx, userId, email, subscribed);
      if (avail.available > 0) {
        await tx.submissionReservation.upsert({
          where: { userId_clientRef: { userId, clientRef: input.clientRef } },
          update: { status: "CONFIRMED", day: istDay(), jobId: input.jobId, evidence: input.evidence ?? null },
          create: { userId, clientRef: input.clientRef, jobId: input.jobId, day: istDay(), status: "CONFIRMED", evidence: input.evidence ?? null },
        });
        counted = true;
      } else {
        quotaExceeded = true;
      }
    }

    // Free plan: a confirmed success consumes one lifetime allowance (durable per email).
    if (counted && !subscribed) {
      await tx.emailAllowance.upsert({ where: { email }, update: { freeConfirmedUsed: { increment: 1 } }, create: { email, freeConfirmedUsed: 1 } });
    }

    // Upsert the audit row so a reconciliation (prior UNCERTAIN/FAILED) updates it.
    await tx.submissionResult.upsert({
      where: { userId_clientRef: { userId, clientRef: input.clientRef } },
      create: { userId, jobId: input.jobId, clientRef: input.clientRef, outcome: "CONFIRMED", counted, detail: input.evidence ?? null },
      update: { outcome: "CONFIRMED", counted, detail: input.evidence ?? null },
    });

    if (counted) {
      const app = await tx.application.upsert({
        where: { jobId: input.jobId },
        update: { status: "SUBMITTED", confirmedByUser: true, submittedAt: new Date() },
        create: { userId, jobId: input.jobId, status: "SUBMITTED", confirmedByUser: true, submittedAt: new Date() },
      });
      await tx.applicationEvent.create({ data: { applicationId: app.id, type: "submitted", detail: "Confirmed submission (evidence)" } });
    }

    return { counted, idempotent: false, quotaExceeded };
  });
}

// Confirmed FAILURE or not-submitted -> release the reservation (frees capacity).
// Records a FAILED audit row. Idempotent.
export async function releaseReservation(userId: string, clientRef: string, opts: { jobId?: string; reason?: string } = {}): Promise<void> {
  await serializable(async (tx) => {
    const res = await tx.submissionReservation.findUnique({ where: { userId_clientRef: { userId, clientRef } } });
    if (res && res.status !== "CONFIRMED") {
      await tx.submissionReservation.update({ where: { id: res.id }, data: { status: "RELEASED", reason: opts.reason ?? null } });
    }
    if (opts.jobId) {
      const prior = await tx.submissionResult.findUnique({ where: { userId_clientRef: { userId, clientRef } } });
      if (!prior) await tx.submissionResult.create({ data: { userId, jobId: opts.jobId, clientRef, outcome: "FAILED", counted: false, detail: opts.reason ?? null } });
    }
  });
}

// Ambiguous outcome -> hold capacity (UNCERTAIN) until reconciled. Does NOT free the
// slot, so a duplicate submission is not attempted. Records an UNCERTAIN audit row.
export async function markUncertain(userId: string, clientRef: string, opts: { jobId?: string; reason?: string } = {}): Promise<void> {
  await serializable(async (tx) => {
    const res = await tx.submissionReservation.findUnique({ where: { userId_clientRef: { userId, clientRef } } });
    if (res && (res.status === "RESERVED")) {
      await tx.submissionReservation.update({ where: { id: res.id }, data: { status: "UNCERTAIN", reason: opts.reason ?? null } });
    } else if (!res) {
      await tx.submissionReservation.create({ data: { userId, clientRef, jobId: opts.jobId ?? null, day: istDay(), status: "UNCERTAIN", reason: opts.reason ?? null } });
    }
    if (opts.jobId) {
      const prior = await tx.submissionResult.findUnique({ where: { userId_clientRef: { userId, clientRef } } });
      if (!prior) await tx.submissionResult.create({ data: { userId, jobId: opts.jobId, clientRef, outcome: "UNCERTAIN", counted: false, detail: opts.reason ?? null } });
    }
  });
}

// Reconcile an UNCERTAIN/ambiguous reservation to a definite outcome. This is how an
// ambiguous result is resolved before any retry, preventing duplicate applications.
export async function reconcileReservation(
  userId: string,
  clientRef: string,
  resolution: "confirmed" | "failed",
  opts: { jobId: string; evidence?: string; reason?: string },
): Promise<FinalizeResult | void> {
  if (resolution === "confirmed") return finalizeConfirmed(userId, { jobId: opts.jobId, clientRef, evidence: opts.evidence });
  await releaseReservation(userId, clientRef, { jobId: opts.jobId, reason: opts.reason });
}
