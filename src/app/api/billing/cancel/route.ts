import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current";
import { env } from "@/lib/env";
import { devCancel } from "@/lib/billing/dev";
import { setFree } from "@/lib/billing/subscription";

// Reverts the user to the free plan. In Stripe mode cancellation flows through the
// Customer Portal + webhook, so this endpoint declines. In dev and Cashfree modes
// (Cashfree Pro is a one-time 30-day pass with no auto-renew) there is nothing to
// cancel at a provider, so we simply drop entitlement here.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (env.BILLING_PROVIDER === "stripe") {
    return NextResponse.json({ error: "Use the billing portal to cancel." }, { status: 400 });
  }
  if (env.BILLING_PROVIDER === "cashfree") {
    await setFree(user.id, "canceled");
    return NextResponse.json({ ok: true });
  }
  await devCancel(user.id);
  return NextResponse.json({ ok: true });
}
