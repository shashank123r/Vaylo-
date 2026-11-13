import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { istDay, nextIstMidnight } from "./day";

// Lifetime FREE allowance: three CONFIRMED successful submissions per *email*,
// for life (not per month). The allowance is tracked in EmailAllowance keyed by
// normalized email, which is NOT tied to the User row — so deleting and
// recreating an account does not reset it. Only FREE confirmed successes consume
// it; subscribed usage does not, and failed/uncertain never do.
export const FREE_SUBMISSION_LIMIT = 3;

// Pro allowance: up to 50 CONFIRMED SUCCESSFUL submissions per IST calendar day.
export const PRO_DAILY_LIMIT = 50;

type Db = typeof db | Prisma.TransactionClient;

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function isSubscribed(userId: string, client: Db = db): Promise<boolean> {
  const sub = await client.subscription.findUnique({ where: { userId } });
  if (!sub || sub.tier !== "PRO") return false;
  // A status, when present, must be active/trialing. (Dev adapter sets "active".)
  if (sub.status && !ACTIVE_STATUSES.has(sub.status)) return false;
  // Period end, when present, must be in the future (handles expiry/cancellation).
  if (sub.periodEnd && sub.periodEnd.getTime() <= Date.now()) return false;
  return true;
}

/** Free confirmed successes already used by this email (survives account recreation). */
export async function usedForEmail(email: string, client: Db = db): Promise<number> {
  const row = await client.emailAllowance.findUnique({ where: { email: normalizeEmail(email) } });
  return row?.freeConfirmedUsed ?? 0;
}

export interface Quota {
  used: number; // confirmed successes (today for Pro, lifetime for Free)
  limit: number;
  subscribed: boolean;
  canSubmit: boolean;
  remaining: number; // how many more confirmed successes are currently available
  kind: "daily" | "lifetime";
  resetAt?: string; // ISO; when the daily quota next resets (Pro only)
}

export async function getQuota(userId: string, client: Db = db): Promise<Quota> {
  const user = await client.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  const subscribed = await isSubscribed(userId, client);

  if (subscribed) {
    // Daily (IST): confirmed today, with in-flight reservations also holding capacity.
    const day = istDay();
    const [used, held] = await Promise.all([
      client.submissionReservation.count({ where: { userId, day, status: "CONFIRMED" } }),
      client.submissionReservation.count({ where: { userId, day, status: { in: ["RESERVED", "CONFIRMED", "UNCERTAIN"] } } }),
    ]);
    const remaining = Math.max(0, PRO_DAILY_LIMIT - held);
    return { used, limit: PRO_DAILY_LIMIT, subscribed, remaining, canSubmit: remaining > 0, kind: "daily", resetAt: nextIstMidnight().toISOString() };
  }

  const used = await usedForEmail(user.email, client);
  const remaining = Math.max(0, FREE_SUBMISSION_LIMIT - used);
  return { used, limit: FREE_SUBMISSION_LIMIT, subscribed, remaining, canSubmit: used < FREE_SUBMISSION_LIMIT, kind: "lifetime" };
}
