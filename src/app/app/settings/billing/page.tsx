import { getCurrentUser } from "@/lib/auth/current";
import { getQuota } from "@/lib/billing/entitlement";
import { getSubscription } from "@/lib/billing/subscription";
import { env } from "@/lib/env";
import { BillingActions } from "./BillingActions";
import { PageHeader } from "@/components/ui";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; upgraded?: string }>;
}) {
  const user = (await getCurrentUser())!;
  const sp = await searchParams;
  const [quota, sub] = await Promise.all([getQuota(user.id), getSubscription(user.id)]);
  const provider = env.BILLING_PROVIDER;

  return (
    <div className="mx-auto max-w-reading animate-fade-in">
      <PageHeader title="Plan & billing" subtitle="Your entitlement is always verified on the server." />

      {sp.checkout === "success" && (
        <div className="mb-4 rounded-md border border-success/30 bg-surface-2 px-3 py-2 text-sm text-success">
          Checkout complete. Your Pro access activates once the payment is confirmed.
        </div>
      )}
      {sp.upgraded === "dev" && (
        <div className="mb-4 rounded-md border border-warning/30 bg-surface-2 px-3 py-2 text-sm text-ink">
          Development upgrade applied (no real charge).
        </div>
      )}

      <div className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Current plan</h2>
          <span className="badge">{quota.subscribed ? "Pro" : "Free"}</span>
        </div>
        {quota.subscribed ? (
          <div className="mt-2 text-sm text-ink-muted">
            <p>
              Up to <strong>{quota.limit}</strong> successful applications per day.{" "}
              <strong>{quota.used}</strong> confirmed today, <strong>{quota.remaining}</strong> remaining.
            </p>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-stone-200">
              <div className="h-full bg-brick" style={{ width: `${Math.min(100, (quota.used / quota.limit) * 100)}%` }} />
            </div>
            {quota.resetAt && (
              <p className="mt-2 text-xs">Daily quota resets at midnight IST — next reset {new Date(quota.resetAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}.</p>
            )}
            {quota.remaining === 0 && (
              <p className="mt-2 text-warning">You&rsquo;ve reached today&rsquo;s successful-submission limit. New submissions resume after the reset; failed attempts never count.</p>
            )}
            {sub?.status && <p className="mt-1">Status: {sub.status}</p>}
            {sub?.cancelAtPeriodEnd && sub.periodEnd && (
              <p className="mt-1 text-warning">
                Cancels on {sub.periodEnd.toLocaleDateString()} (access continues until then).
              </p>
            )}
            {!sub?.cancelAtPeriodEnd && sub?.periodEnd && (
              <p className="mt-1">Renews {sub.periodEnd.toLocaleDateString()}.</p>
            )}
          </div>
        ) : (
          <div className="mt-2 text-sm text-ink-muted">
            <p>
              Free plan: <strong>{quota.used}</strong> of <strong>{quota.limit}</strong> lifetime confirmed
              submissions used, <strong>{quota.remaining}</strong> remaining.
            </p>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-stone-200">
              <div
                className="h-full bg-brick"
                style={{ width: `${(quota.used / quota.limit) * 100}%` }}
              />
            </div>
            {quota.remaining === 0 && (
              <p className="mt-3 text-warning">
                You have used your free allowance. Upgrade to Pro to submit more. Your past usage is
                preserved and never reset.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="card mt-6 p-5">
        <h2 className="font-semibold">{quota.subscribed ? "Manage subscription" : "Upgrade"}</h2>
        <div className="mt-3">
          <BillingActions provider={provider} subscribed={quota.subscribed} />
        </div>
      </div>

      <p className="mt-6 text-xs text-ink-muted">
        Browsing jobs, managing your profile and resumes, and viewing existing applications are always
        free and never require a subscription.
      </p>
    </div>
  );
}
