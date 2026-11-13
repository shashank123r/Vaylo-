import "server-only";
import { db } from "@/lib/db";
import type { Subscription } from "@prisma/client";

// Low-level subscription row operations. Entitlement is always derived from this
// row by src/lib/billing/entitlement.ts; UI state is never trusted for access.

export interface ProInput {
  provider: "dev" | "stripe" | "cashfree";
  externalId?: string | null;
  stripeCustomerId?: string | null;
  status?: string | null;
  periodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
}

export async function setPro(userId: string, input: ProInput): Promise<Subscription> {
  const data = {
    tier: "PRO" as const,
    provider: input.provider,
    externalId: input.externalId ?? null,
    stripeCustomerId: input.stripeCustomerId ?? undefined,
    status: input.status ?? "active",
    periodEnd: input.periodEnd ?? null,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
  };
  return db.subscription.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });
}

/** Revert entitlement to free (keeps the row + any stripeCustomerId for history). */
export async function setFree(userId: string, status: string | null = "canceled"): Promise<Subscription> {
  return db.subscription.upsert({
    where: { userId },
    update: { tier: "FREE", status, cancelAtPeriodEnd: false },
    create: { userId, tier: "FREE", provider: "dev", status },
  });
}

export async function getSubscription(userId: string): Promise<Subscription | null> {
  return db.subscription.findUnique({ where: { userId } });
}

export async function findUserByStripeCustomer(stripeCustomerId: string): Promise<string | null> {
  const sub = await db.subscription.findUnique({ where: { stripeCustomerId } });
  return sub?.userId ?? null;
}
