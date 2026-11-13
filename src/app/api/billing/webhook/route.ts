import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { verifyEvent, applyEvent } from "@/lib/billing/stripe";
import { logger } from "@/lib/logger";

// Stripe webhook receiver. Signature is ALWAYS verified; access is granted only
// from verified events, never from a browser redirect. Processing is idempotent.
export async function POST(req: NextRequest) {
  if (env.BILLING_PROVIDER !== "stripe") {
    return NextResponse.json({ error: "Stripe billing is not enabled." }, { status: 404 });
  }
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const payload = await req.text(); // raw body required for signature verification
  let event;
  try {
    event = verifyEvent(payload, signature);
  } catch {
    // Do not leak details; a bad signature is a 400.
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    const result = await applyEvent(event);
    return NextResponse.json({ received: true, ...result });
  } catch {
    logger.error({ eventType: event.type }, "webhook processing failed");
    // 500 so Stripe retries; no internal details returned.
    return NextResponse.json({ error: "Processing error" }, { status: 500 });
  }
}
