import "server-only";
import { setPro, setFree } from "./subscription";
import type { Subscription } from "@prisma/client";

// Development billing adapter. Clearly labeled: it grants PRO entitlement WITHOUT
// any real payment, for local development only. It never simulates a real charge
// and is only reachable when BILLING_PROVIDER=dev.
export async function devUpgrade(userId: string): Promise<Subscription> {
  const periodEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  return setPro(userId, { provider: "dev", status: "active", periodEnd });
}

export async function devCancel(userId: string): Promise<Subscription> {
  return setFree(userId, "canceled");
}
