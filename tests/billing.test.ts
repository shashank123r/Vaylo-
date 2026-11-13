import { describe, it, expect } from "vitest";
import { signup } from "@/lib/auth/service";
import { createManualJob } from "@/lib/jobs/service";
import { recordSubmissionResult } from "@/lib/applications/submit";
import { getQuota } from "@/lib/billing/entitlement";
import { devUpgrade, devCancel } from "@/lib/billing/dev";
import { getStripe, verifyEvent, applyEvent } from "@/lib/billing/stripe";
import { getSubscription } from "@/lib/billing/subscription";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

let n = 0;
const ref = () => `cref-${Date.now()}-${n++}-aaaaaaaa`;

async function makeUser(email: string) {
  const r = await signup({ email, password: "password123" });
  if (!r.ok) throw new Error("signup failed");
  return r.user;
}
async function confirm(userId: string, jobUrl: string) {
  const job = await createManualJob(userId, { title: "ML", company: "Acme", url: jobUrl });
  return recordSubmissionResult(userId, { jobId: job.id, clientRef: ref(), outcome: "CONFIRMED" });
}

describe("lifetime free quota (per email)", () => {
  it("allows 3 confirmed then blocks, and does not reset on account recreation", async () => {
    const user = await makeUser("quota@example.com");
    for (let i = 0; i < 3; i++) expect((await confirm(user.id, `https://a.com/${i}`)).counted).toBe(true);
    const blocked = await confirm(user.id, "https://a.com/4");
    expect(blocked.counted).toBe(false);
    expect(blocked.quotaExceeded).toBe(true);
    expect((await getQuota(user.id)).used).toBe(3);

    // Delete the account and recreate with the SAME email -> allowance persists.
    await db.user.delete({ where: { id: user.id } });
    const recreated = await makeUser("quota@example.com");
    const q = await getQuota(recreated.id);
    expect(q.used).toBe(3);
    expect(q.canSubmit).toBe(false);
    expect((await confirm(recreated.id, "https://a.com/5")).quotaExceeded).toBe(true);
  });

  it("subscribed usage does not deplete the free allowance; cancellation keeps past usage", async () => {
    const user = await makeUser("sub@example.com");
    expect((await confirm(user.id, "https://b.com/1")).counted).toBe(true); // 1 free used
    await devUpgrade(user.id);
    for (let i = 0; i < 4; i++) expect((await confirm(user.id, `https://b.com/pro${i}`)).counted).toBe(true);
    const proQuota = await getQuota(user.id);
    expect(proQuota.subscribed).toBe(true);
    expect(proQuota.kind).toBe("daily"); // Pro is a daily quota now
    expect(proQuota.used).toBe(5); // 5 confirmed successes today (1 free + 4 pro)

    // Cancellation falls back to the Free LIFETIME allowance, with only the ONE
    // pre-upgrade free success consumed — subscribed usage never depleted it.
    await devCancel(user.id);
    const q = await getQuota(user.id);
    expect(q.subscribed).toBe(false);
    expect(q.kind).toBe("lifetime");
    expect(q.used).toBe(1); // past free usage preserved, not reset; Pro usage didn't deplete it
    expect(q.remaining).toBe(2);
  });
});

// Build a signed Stripe event payload offline using the SDK's test helpers.
function signed(evt: object) {
  const payload = JSON.stringify(evt);
  const header = getStripe().webhooks.generateTestHeaderString({
    payload,
    secret: env.STRIPE_WEBHOOK_SECRET!,
  });
  return { payload, header };
}
function subEvent(id: string, type: string, sub: Record<string, unknown>) {
  return { id, type, data: { object: { id: "sub_x", ...sub } } };
}
async function deliver(evt: object) {
  const { payload, header } = signed(evt);
  return applyEvent(verifyEvent(payload, header));
}

describe("stripe webhooks", () => {
  it("rejects a bad signature", () => {
    const { payload } = signed(subEvent("evt_bad", "customer.subscription.updated", {}));
    expect(() => verifyEvent(payload, "t=1,v1=deadbeef")).toThrow();
  });

  it("verifies, grants PRO on active subscription (out-of-order via metadata), and is idempotent", async () => {
    const user = await makeUser("wh@example.com");
    const future = Math.floor(Date.now() / 1000) + 30 * 86400;
    const evt = subEvent("evt_1", "customer.subscription.updated", {
      customer: "cus_wh1",
      status: "active",
      cancel_at_period_end: false,
      current_period_end: future,
      metadata: { userId: user.id },
    });
    const { payload, header } = signed(evt);
    const parsed = verifyEvent(payload, header);

    const first = await applyEvent(parsed);
    expect(first.handled).toBe(true);
    expect((await getQuota(user.id)).subscribed).toBe(true);
    expect((await getSubscription(user.id))?.stripeCustomerId).toBe("cus_wh1");

    // Replaying the same event id is a no-op.
    const second = await applyEvent(parsed);
    expect(second.duplicate).toBe(true);
  });

  it("reverts to free on cancellation and on payment failure", async () => {
    const user = await makeUser("wh2@example.com");
    const future = Math.floor(Date.now() / 1000) + 30 * 86400;
    await deliver(subEvent("evt_a", "customer.subscription.updated", {
      customer: "cus_wh2", status: "active", current_period_end: future, metadata: { userId: user.id },
    }));
    expect((await getQuota(user.id)).subscribed).toBe(true);

    await deliver(subEvent("evt_b", "customer.subscription.deleted", {
      customer: "cus_wh2", status: "canceled", metadata: { userId: user.id },
    }));
    expect((await getQuota(user.id)).subscribed).toBe(false);

    // Payment failure reverts entitlement to free too.
    const user2 = await makeUser("wh3@example.com");
    await deliver(subEvent("evt_c", "customer.subscription.updated", {
      customer: "cus_wh3", status: "active", current_period_end: future, metadata: { userId: user2.id },
    }));
    expect((await getQuota(user2.id)).subscribed).toBe(true);
    await deliver({ id: "evt_d", type: "invoice.payment_failed", data: { object: { customer: "cus_wh3" } } });
    expect((await getQuota(user2.id)).subscribed).toBe(false);
  });

  it("ignores events for an unknown customer (ownership isolation)", async () => {
    const evt = subEvent("evt_unknown", "customer.subscription.updated", {
      customer: "cus_nobody",
      status: "active",
      current_period_end: Math.floor(Date.now() / 1000) + 86400,
    });
    const { payload, header } = signed(evt);
    const res = await applyEvent(verifyEvent(payload, header));
    expect(res.handled).toBe(false);
    expect(res.detail).toMatch(/unknown customer/);
  });
});
