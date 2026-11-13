import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current";
import { env } from "@/lib/env";
import { createPortalSession } from "@/lib/billing/stripe";

// Opens the Stripe Customer Portal (manage/cancel). Stripe mode only.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (env.BILLING_PROVIDER !== "stripe") {
    return NextResponse.json({ error: "Customer portal is only available in Stripe mode." }, { status: 400 });
  }
  try {
    const url = await createPortalSession(user, env.APP_URL);
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ error: "Could not open the billing portal." }, { status: 500 });
  }
}
