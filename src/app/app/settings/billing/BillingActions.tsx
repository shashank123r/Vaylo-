"use client";

import { useState } from "react";

export function BillingActions({
  provider,
  subscribed,
}: {
  provider: "dev" | "stripe" | "cashfree";
  subscribed: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(path: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      if (data.url) {
        // Stripe URLs are absolute; dev returns an internal path.
        window.location.href = data.url;
      } else {
        window.location.reload();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {!subscribed && (
          <button onClick={() => post("/api/billing/checkout")} disabled={busy} className="btn-primary">
            {provider === "dev" ? "Upgrade to Pro (dev)" : "Upgrade to Pro"}
          </button>
        )}
        {subscribed && provider === "stripe" && (
          <button onClick={() => post("/api/billing/portal")} disabled={busy} className="btn-secondary">
            Manage subscription
          </button>
        )}
        {subscribed && (provider === "dev" || provider === "cashfree") && (
          <button onClick={() => post("/api/billing/cancel")} disabled={busy} className="btn-secondary">
            {provider === "dev" ? "Cancel (dev)" : "Cancel"}
          </button>
        )}
      </div>
      {provider === "dev" && (
        <p className="mt-2 text-xs text-ink-muted">
          Development billing is active: upgrades grant Pro without any real payment and are clearly
          labeled. Configure Stripe keys to enable real checkout.
        </p>
      )}
      {provider === "cashfree" && !subscribed && (
        <p className="mt-2 text-xs text-ink-muted">
          Pro is ₹500 for 30 days via Cashfree. Access activates once the payment is confirmed. There is no
          auto-renewal — you can renew again when it expires.
        </p>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
