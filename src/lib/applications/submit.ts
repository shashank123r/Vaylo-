import "server-only";
import { db } from "@/lib/db";
import type { SubmissionOutcome } from "@prisma/client";
import { finalizeConfirmed, markUncertain, releaseReservation } from "./reservation";

export interface RecordInput {
  jobId: string;
  clientRef: string;
  outcome: SubmissionOutcome;
  detail?: string;
}

export interface RecordResult {
  idempotent: boolean; // true if this clientRef was already recorded
  counted: boolean; // did it consume a quota slot (CONFIRMED only)
  quotaExceeded: boolean; // CONFIRMED but the daily (Pro) / lifetime (Free) limit is reached
  outcome: SubmissionOutcome;
}

/**
 * Records a submission outcome reported by the extension / API. Routes to the
 * shared, atomic, two-phase quota accounting:
 *  - CONFIRMED (reliable evidence) -> finalizeConfirmed: counts against the Pro
 *    daily limit (50/IST-day) or the Free lifetime allowance (3), fail-closed and
 *    idempotent. Never counts without evidence.
 *  - UNCERTAIN -> holds capacity (reconcile before retry; no duplicate).
 *  - FAILED -> releases capacity; never counts.
 * Idempotent per (userId, clientRef) across web, extension, workers and devices.
 */
export async function recordSubmissionResult(userId: string, input: RecordInput): Promise<RecordResult> {
  const existing = await db.submissionResult.findUnique({ where: { userId_clientRef: { userId, clientRef: input.clientRef } } });
  if (existing) {
    return { idempotent: true, counted: existing.counted, quotaExceeded: false, outcome: existing.outcome };
  }

  if (input.outcome === "CONFIRMED") {
    const r = await finalizeConfirmed(userId, { jobId: input.jobId, clientRef: input.clientRef, evidence: input.detail });
    return { idempotent: r.idempotent, counted: r.counted, quotaExceeded: r.quotaExceeded, outcome: "CONFIRMED" };
  }
  if (input.outcome === "UNCERTAIN") {
    await markUncertain(userId, input.clientRef, { jobId: input.jobId, reason: input.detail });
    return { idempotent: false, counted: false, quotaExceeded: false, outcome: "UNCERTAIN" };
  }
  await releaseReservation(userId, input.clientRef, { jobId: input.jobId, reason: input.detail });
  return { idempotent: false, counted: false, quotaExceeded: false, outcome: "FAILED" };
}
