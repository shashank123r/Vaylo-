import "server-only";
import Stripe from "stripe";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { setPro, setFree, findUserByStripeCustomer } from "./subscription";
import type { User } from "@prisma/client";

let client: Stripe | null = null;
export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured (STRIPE_SECRET_KEY missing).");
  if (!client) client = new Stripe(env.STRIPE_SECRET_KEY);
  return client;
}

async function ensureCustomer(user: User): Promise<string> {
  const sub = await db.subscription.findUnique({ where: { userId: user.id } });
  if (sub?.stripeCustomerId) return sub.stripeCustomerId;
  const customer = await getStripe().customers.create({
    email: user.email,
    metadata: { userId: user.id },
  });
  await db.subscription.upsert({
    where: { userId: user.id },
    update: { stripeCustomerId: customer.id, provider: "stripe" },
    create: { userId: user.id, provider: "stripe", stripeCustomerId: customer.id },
  });
  return customer.id;
}

export async function createCheckoutSession(user: User, baseUrl: string): Promise<string> {
  if (!env.STRIPE_PRICE_PRO) throw new Error("STRIPE_PRICE_PRO is not configured.");
  const customer = await ensureCustomer(user);
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price: env.STRIPE_PRICE_PRO, quantity: 1 }],
    // We set BOTH client_reference_id and subscription metadata so events can be
    // tied to a user even if they arrive out of order. These come from the server.
    client_reference_id: user.id,
    subscription_data: { metadata: { userId: user.id } },
    success_url: `${baseUrl}/app/settings/billing?checkout=success`,
    cancel_url: `${baseUrl}/app/settings/billing?checkout=cancel`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

export async function createPortalSession(user: User, baseUrl: string): Promise<string> {
  const sub = await db.subscription.findUnique({ where: { userId: user.id } });
  if (!sub?.stripeCustomerId) throw new Error("No Stripe customer for this user yet.");
  const session = await getStripe().billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${baseUrl}/app/settings/billing`,
  });
  return session.url;
}

/** Verifies the Stripe signature and returns the parsed event. Throws on failure. */
export function verifyEvent(payload: string | Buffer, signature: string): Stripe.Event {
  if (!env.STRIPE_WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  return getStripe().webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
}

export interface ApplyResult {
  duplicate: boolean;
  handled: boolean;
  detail?: string;
}

function customerId(obj: { customer?: string | { id: string } | null }): string | null {
  const c = obj.customer;
  return typeof c === "string" ? c : (c?.id ?? null);
}

/**
 * Applies a verified Stripe event to our DB. Idempotent: the event id is recorded
 * first (unique), so replays are no-ops. Ownership is validated by mapping the
 * customer/metadata to a known user; unknown customers are ignored, never granted.
 */
export async function applyEvent(event: Stripe.Event): Promise<ApplyResult> {
  try {
    await db.webhookEvent.create({ data: { id: event.id, type: event.type } });
  } catch {
    return { duplicate: true, handled: false, detail: "already processed" };
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const userId = s.client_reference_id ?? (s.metadata?.userId as string | undefined);
      const cid = customerId(s);
      const subId = typeof s.subscription === "string" ? s.subscription : (s.subscription?.id ?? null);
      if (!userId) return { duplicate: false, handled: false, detail: "no userId on session" };
      await setPro(userId, { provider: "stripe", externalId: subId, stripeCustomerId: cid, status: "active" });
      return { duplicate: false, handled: true };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const cid = customerId(sub);
      const userId =
        (sub.metadata?.userId as string | undefined) ?? (cid ? await findUserByStripeCustomer(cid) : null);
      if (!userId) return { duplicate: false, handled: false, detail: "unknown customer" };
      const periodEndUnix = (sub as unknown as { current_period_end?: number }).current_period_end;
      const periodEnd = periodEndUnix ? new Date(periodEndUnix * 1000) : null;
      if (["active", "trialing"].includes(sub.status)) {
        await setPro(userId, {
          provider: "stripe",
          externalId: sub.id,
          stripeCustomerId: cid,
          status: sub.status,
          periodEnd,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        });
      } else {
        await setFree(userId, sub.status);
      }
      return { duplicate: false, handled: true };
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const cid = customerId(sub);
      const userId = (sub.metadata?.userId as string | undefined) ?? (cid ? await findUserByStripeCustomer(cid) : null);
      if (userId) await setFree(userId, "canceled");
      return { duplicate: false, handled: true };
    }
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      const cid = customerId(inv);
      const userId = cid ? await findUserByStripeCustomer(cid) : null;
      if (userId) await setFree(userId, "past_due");
      return { duplicate: false, handled: true };
    }
    default:
      return { duplicate: false, handled: false, detail: `unhandled: ${event.type}` };
  }
}

