import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current";
import { env } from "@/lib/env";
import { createCheckoutSession } from "@/lib/billing/stripe";
import { createCheckoutLink } from "@/lib/billing/cashfree";
import { devUpgrade } from "@/lib/billing/dev";

// Starts an upgrade. In Stripe mode returns a Checkout URL (access is granted only
// later, by a verified webhook). In dev mode performs a clearly-labeled dev upgrade.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  if (env.BILLING_PROVIDER === "stripe") {
    try {
      const url = await createCheckoutSession(user, env.APP_URL);
      return NextResponse.json({ url });
    } catch {
      return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });
    }
  }
  if (env.BILLING_PROVIDER === "cashfree") {
    try {
      const url = await createCheckoutLink(user, env.APP_URL);
      // Access is granted later by the verified webhook, not by this redirect.
      return NextResponse.json({ url });
    } catch {
      return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });
    }
  }
  // dev adapter: no real payment. FAIL CLOSED in production so a live instance
  // never hands out free Pro to real users — unless the operator explicitly opts
  // in (e.g. a staging-like instance). Local/staging (NODE_ENV!=production) is
  // always allowed.
  if (env.NODE_ENV === "production" && !env.ALLOW_DEV_BILLING) {
    return NextResponse.json(
      { error: "Billing is not configured for payments on this instance. Upgrades are disabled." },
      { status: 503 },
    );
  }
  await devUpgrade(user.id);
  return NextResponse.json({ url: "/app/settings/billing?upgraded=dev", dev: true });
}
