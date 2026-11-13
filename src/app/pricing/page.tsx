import Link from "next/link";
import { MarketingHeader } from "@/components/MarketingHeader";
import { getCurrentUser } from "@/lib/auth/current";
import { FREE_SUBMISSION_LIMIT, PRO_DAILY_LIMIT } from "@/lib/billing/entitlement";
import { IconCheck } from "@/components/icons";

const freeFeatures = [
  "Browse jobs and view full details",
  "Build your career profile",
  "Upload and manage resumes (PDF/DOCX)",
  "Tailored resumes and cover letters",
  "Chrome extension autofill on supported sites",
  `${FREE_SUBMISSION_LIMIT} confirmed successful applications, for life`,
];

const proFeatures = [
  "Everything in Free",
  `Up to ${PRO_DAILY_LIMIT} successful applications per day`,
  "Priority tailoring",
  "Manage or cancel anytime",
];

export const metadata = { title: "Pricing" };

export default async function PricingPage() {
  const user = await getCurrentUser();
  const upgradeHref = user ? "/app/settings/billing" : "/signup?next=/app/settings/billing";

  return (
    <>
      <MarketingHeader />
      <main className="mx-auto max-w-4xl px-5 py-16 sm:px-8">
        <div className="text-center">
          <span className="badge">Pricing</span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tighter2 sm:text-4xl">Start free. Upgrade when you need more.</h1>
          <p className="mt-2 text-ink-muted">
            Your {FREE_SUBMISSION_LIMIT} free confirmed applications are a lifetime allowance, not a
            monthly reset. Failed attempts never count.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          <div className="card p-6">
            <h2 className="text-lg font-semibold">Free</h2>
            <p className="mt-1 text-3xl font-semibold">
              $0<span className="text-base font-normal text-ink-muted"> forever</span>
            </p>
            <ul className="mt-5 space-y-2 text-sm">
              {freeFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <IconCheck width={16} height={16} className="mt-0.5 shrink-0 text-brick" aria-hidden="true" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link href={user ? "/app" : "/signup"} className="btn-secondary mt-6 w-full no-underline">
              {user ? "Go to app" : "Get started"}
            </Link>
          </div>

          <div className="card border-brick/40 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Pro</h2>
              <span className="badge border-brick/30 bg-brick-soft text-brick">Most popular</span>
            </div>
            <p className="mt-1 text-3xl font-semibold">
              ₹500<span className="text-base font-normal text-ink-muted"> / month</span>
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Up to {PRO_DAILY_LIMIT} confirmed successful applications per day, resetting at midnight IST
              (Asia/Kolkata). This is a daily cap on successes, not a guarantee that {PRO_DAILY_LIMIT} will
              always be available or that every attempt succeeds. Only applications the employer confirms
              count; failed, blocked, or ambiguous attempts don&rsquo;t.
            </p>
            <ul className="mt-5 space-y-2 text-sm">
              {proFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <IconCheck width={16} height={16} className="mt-0.5 shrink-0 text-brick" aria-hidden="true" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link href={upgradeHref} className="btn-accent mt-6 w-full no-underline">
              {user ? "Upgrade to Pro" : "Create account to upgrade"}
            </Link>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-ink-muted">
          No fake charges. Billing is handled by Stripe. Cancel anytime; your past usage is never
          reset and never resold.
        </p>
      </main>
    </>
  );
}
