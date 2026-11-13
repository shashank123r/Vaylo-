import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { verifyWebhookSignature, applyVerifiedWebhook } from "@/lib/billing/cashfree";
import { logger } from "@/lib/logger";

// Cashfree webhook receiver. The signature is ALWAYS verified against the raw
// body before anything is applied; Pro access is granted only from a verified +
// re-confirmed PAID event, never from a browser redirect. Processing is idempotent.
export async function POST(req: NextRequest) {
  if (env.BILLING_PROVIDER !== "cashfree") {
    return NextResponse.json({ error: "Cashfree billing is not enabled." }, { status: 404 });
  }

  const signature = req.headers.get("x-webhook-signature");
  const timestamp = req.headers.get("x-webhook-timestamp");
  const rawBody = await req.text(); // raw body required for signature verification
  if (!signature || !timestamp) {
    return NextResponse.json({ error: "Missing signature headers" }, { status: 400 });
  }
  if (!verifyWebhookSignature(rawBody, signature, timestamp)) {
    // Do not leak details; a bad signature is a 400.
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await applyVerifiedWebhook(payload);
    return NextResponse.json({ received: true, ...result });
  } catch (e) {
    logger.error({ err: String((e as Error)?.message ?? e) }, "cashfree webhook processing failed");
    // 500 so Cashfree retries; no internal details returned.
    return NextResponse.json({ error: "Processing error" }, { status: 500 });
  }
}
