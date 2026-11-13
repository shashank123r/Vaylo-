import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { getQuota, isSubscribed } from "@/lib/billing/entitlement";
import { InBrowserAutoApply } from "./InBrowserAutoApply";
import { AutonomousRun } from "./AutonomousRun";
import { PageHeader } from "@/components/ui";

export default async function AutoApplyPage() {
  const user = (await getCurrentUser())!;
  const [profile, resumeCount, quota, subscribed] = await Promise.all([
    db.profile.findUnique({ where: { userId: user.id }, include: { skills: true } }),
    db.resumeFile.count({ where: { userId: user.id } }),
    getQuota(user.id),
    isSubscribed(user.id),
  ]);
  const skillCount = profile?.skills.length ?? 0;
  const defaultTitles = (profile?.targetTitles ?? []).join(", ");

  const steps = subscribed
    ? [
        ["Discovers & matches", "Pulls real jobs from the connected source and scores each against your profile."],
        ["Fills & uploads", "Completes supported forms (Greenhouse, Lever, Ashby) and attaches your resume."],
        ["Submits on authorization", "Only when you authorize the run — otherwise it stops at “filled”."],
        ["Verifies by evidence", "Counts a success only with an on-page confirmation; failed and uncertain are recorded honestly."],
        ["Pauses, never bypasses", "Stops for sign-in, CAPTCHA, or any question it shouldn't answer for you."],
      ]
    : [
        ["Searches like you would", "Opens a tab and searches for your role across job boards."],
        ["Groups the best matches", "Collects the most relevant results into one labeled tab group you can watch."],
        ["Fills supported forms", "Completes Greenhouse, Lever, and Ashby forms from your approved profile."],
        ["Pauses, never bypasses", "Stops for CAPTCHA or sign-in, and tells you."],
        ["Never submits for you", "You review each filled form and submit it yourself."],
      ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Auto-apply"
        subtitle={
          subscribed
            ? "Pro discovers and matches jobs, fills supported forms, uploads your resume, and submits only when you authorize it — then verifies the outcome."
            : "On the free plan, auto-apply runs in your own browser: it searches, opens the best matches, and fills what it can. You review and submit each one yourself."
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* main column: one mode, by plan */}
        <div className="min-w-0 space-y-6">
          <section className="card p-5">
            <h2 className="section-label">How it works</h2>
            <ul className="space-y-3">
              {steps.map(([title, body]) => (
                <li key={title} className="flex gap-3">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brick" aria-hidden="true" />
                  <p className="text-sm leading-relaxed text-ink-muted">
                    <strong className="font-medium text-ink">{title}.</strong> {body}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {/* ONE run mode per plan: free = watch-it-fill in your browser (never
              submits); Pro = the durable, server-queued autonomous run (the
              authorize-to-submit checkbox lives here, so it only appears on Pro). */}
          {subscribed ? (
            <AutonomousRun defaultTitles={defaultTitles} subscribed={subscribed} />
          ) : (
            <InBrowserAutoApply defaultTitles={defaultTitles} />
          )}
        </div>

        {/* sidebar: plan + quota + readiness */}
        <aside className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-ink">{subscribed ? "Pro plan" : "Free plan"}</h2>
              <span className={subscribed ? "badge-success" : "badge"}>{subscribed ? "Pro" : "Free"}</span>
            </div>
            <p className="mt-4 text-[1.75rem] font-semibold tabular-nums tracking-tighter2 text-ink">
              {quota.remaining}
              <span className="text-base font-normal text-ink-faint"> / {quota.limit}</span>
            </p>
            <p className="stat-label">
              {subscribed ? "confirmed submissions left today" : "confirmed submissions left (lifetime)"}
            </p>
            {subscribed && quota.resetAt && (
              <p className="mt-1 text-xs text-ink-faint">Resets at midnight IST.</p>
            )}
            {!subscribed && (
              <Link href="/app/settings/billing" className="btn-accent mt-4 w-full no-underline">
                Upgrade to Pro
              </Link>
            )}
          </div>

          <div className="card p-5">
            <h2 className="section-label">Before you run</h2>
            <ul className="space-y-2.5 text-sm">
              <li className="flex items-center justify-between gap-2">
                <span className="text-ink-muted">Skills in profile</span>
                <span className={skillCount ? "badge-success" : "badge-warning"}>
                  {skillCount ? `${skillCount} added` : "Add some"}
                </span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="text-ink-muted">Resume</span>
                <span className={resumeCount ? "badge-success" : "badge-warning"}>
                  {resumeCount ? "Uploaded" : "Upload one"}
                </span>
              </li>
            </ul>
            <Link href="/app/profile" className="btn-secondary btn-sm mt-4 w-full no-underline">
              Edit profile
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
