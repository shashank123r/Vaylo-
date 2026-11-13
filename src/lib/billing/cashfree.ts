import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { setPro } from "./subscription";
import type { User } from "@prisma/client";

// Cashfree Payments (India) adapter. We use the Payment Links API so the flow
// mirrors Stripe Checkout: the server creates a link and returns its hosted URL,
// the browser is redirected there, and Pro access is granted ONLY from a
// signature-verified webhook whose PAID status we then re-confirm against the
// Cashfree API. A browser redirect never grants access.
//
// Pricing: Pro is a one-time ₹500 charge that grants 30 days of access (no stored
// mandate / auto-renew yet — the user re-pays each month). This is intentional and
// honest; recurring auto-debit would require the Cashfree Subscriptions product.

const API_VERSION = "2023-08-01";
export const PRO_PRICE_INR = 500;
export const PRO_PERIOD_DAYS = 30;

function base(): string {
  return env.CASHFREE_ENV === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
}

function headers(): Record<string, string> {
  if (!env.CASHFREE_APP_ID || !env.CASHFREE_SECRET_KEY) {
    throw new Error("Cashfree is not configured (CASHFREE_APP_ID / CASHFREE_SECRET_KEY missing).");
  }
  return {
    "Content-Type": "application/json",
    "x-api-version": API_VERSION,
    "x-client-id": env.CASHFREE_APP_ID,
    "x-client-secret": env.CASHFREE_SECRET_KEY,
  };
}

// link_id carries the userId so a webhook can be mapped back to a user. A cuid
// contains no underscore, so the delimiter is unambiguous.
function makeLinkId(userId: string): string {
  return `vaylo_${userId}_${Date.now()}`;
}
function userIdFromLinkId(linkId: string): string | null {
  const m = /^vaylo_([^_]+)_\d+$/.exec(linkId);
  return m ? m[1]! : null;
}

/** Creates a Cashfree payment link and returns its hosted checkout URL. */
export async function createCheckoutLink(user: User, baseUrl: string): Promise<string> {
  const profile = await db.profile.findUnique({ where: { userId: user.id }, select: { phone: true } });
  // Cashfree requires a 10-digit customer phone. Fall back to a sandbox-valid
  // placeholder when the profile has none; this is only an identifier for the
  // gateway, not used to charge anything.
  const rawPhone = (profile?.phone ?? "").replace(/\D/g, "").slice(-10);
  const customerPhone = rawPhone.length === 10 ? rawPhone : "9999999999";
  const linkId = makeLinkId(user.id);

  const res = await fetch(`${base()}/links`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      link_id: linkId,
      link_amount: PRO_PRICE_INR,
      link_currency: "INR",
      link_purpose: "Vaylo Pro - 30 days",
      customer_details: {
        customer_phone: customerPhone,
        customer_email: user.email,
        customer_name: user.name ?? undefined,
      },
      link_notify: { send_sms: false, send_email: false },
      link_meta: {
        return_url: `${baseUrl}/app/settings/billing?checkout=success`,
        notify_url: `${baseUrl}/api/billing/cashfree/webhook`,
      },
    }),
  });

  const data = (await res.json().catch(() => ({}))) as { link_url?: string; message?: string };
  if (!res.ok || !data.link_url) {
    throw new Error(`Cashfree link creation failed (${res.status}): ${data.message ?? "no link_url"}`);
  }
  return data.link_url;
}

/**
 * Verifies the Cashfree webhook signature.
 * signature = base64( HMAC_SHA256( timestamp + rawBody, secretKey ) ).
 * Uses a constant-time comparison. Returns true only on an exact match.
 */
export function verifyWebhookSignature(rawBody: string, signature: string, timestamp: string): boolean {
  if (!env.CASHFREE_SECRET_KEY || !signature || !timestamp) return false;
  const expected = createHmac("sha256", env.CASHFREE_SECRET_KEY)
    .update(timestamp + rawBody)
    .digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Authoritatively fetches a link's status from Cashfree (never trust the payload alone). */
async function fetchLinkStatus(linkId: string): Promise<{ status: string; amountPaid: number }> {
  const res = await fetch(`${base()}/links/${encodeURIComponent(linkId)}`, { headers: headers() });
  const data = (await res.json().catch(() => ({}))) as { link_status?: string; link_amount_paid?: number };
  if (!res.ok) throw new Error(`Cashfree link fetch failed (${res.status}).`);
  return { status: data.link_status ?? "UNKNOWN", amountPaid: Number(data.link_amount_paid ?? 0) };
}

export interface ApplyResult {
  duplicate: boolean;
  handled: boolean;
  detail?: string;
}

/**
 * Applies a VERIFIED Cashfree webhook. The caller must have already checked the
 * signature. We re-fetch the link's authoritative status from Cashfree and grant
 * Pro only when it is PAID for at least the Pro price. Idempotent: the link id is
 * recorded first (unique), so webhook replays are no-ops.
 */
export async function applyVerifiedWebhook(payload: unknown): Promise<ApplyResult> {
  // Cashfree nests the link id differently across event shapes; probe the common spots.
  const p = payload as {
    data?: { link_id?: string; order?: { order_tags?: Record<string, string> } };
    link_id?: string;
  };
  const linkId = p?.data?.link_id ?? p?.link_id ?? null;
  if (!linkId) return { duplicate: false, handled: false, detail: "no link_id in payload" };

  const userId = userIdFromLinkId(linkId);
  if (!userId) return { duplicate: false, handled: false, detail: "unrecognized link_id" };

  // Confirm the user exists before doing anything (ignore unknown, never grant).
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return { duplicate: false, handled: false, detail: "unknown user" };

  // Authoritative status check — the signature proves authenticity, this proves PAID.
  const { status, amountPaid } = await fetchLinkStatus(linkId);
  if (status !== "PAID" || amountPaid < PRO_PRICE_INR) {
    return { duplicate: false, handled: false, detail: `not paid (status=${status}, paid=${amountPaid})` };
  }

  // Idempotency gate: first writer wins; replays short-circuit here.
  try {
    await db.webhookEvent.create({ data: { id: `cashfree_${linkId}`, type: "cashfree.link.paid" } });
  } catch {
    return { duplicate: true, handled: false, detail: "already processed" };
  }

  const periodEnd = new Date(Date.now() + PRO_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  await setPro(userId, { provider: "cashfree", externalId: linkId, status: "active", periodEnd });
  return { duplicate: false, handled: true };
}
