"use client";

import { useActionState } from "react";
import { runAutoSubmit, type AutoSubmitState } from "./submit-actions";

const STATUS_LABEL: Record<string, { text: string; tone: string }> = {
  confirmed: { text: "Submitted ✓ (confirmed)", tone: "text-success" },
  uncertain: { text: "Submitted (unconfirmed — verify)", tone: "text-warning" },
  prepared: { text: "Filled, not submitted", tone: "text-ink" },
  awaiting_user: { text: "Paused — needs you", tone: "text-warning" },
  failed: { text: "Could not apply", tone: "text-danger" },
  skipped_low_match: { text: "Skipped (low match)", tone: "text-ink-muted" },
  skipped_duplicate: { text: "Already applied", tone: "text-ink-muted" },
  skipped_no_url: { text: "Skipped (no form URL)", tone: "text-ink-muted" },
  quota_reached: { text: "Allowance reached", tone: "text-warning" },
};

export function AutoSubmitRun({ defaultTitles, subscribed }: { defaultTitles: string; subscribed: boolean }) {
  const [state, action, pending] = useActionState<AutoSubmitState | null, FormData>(runAutoSubmit, null);
  const s = state?.summary;

  return (
    <div>
      <form action={action} className="card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="q2">Target titles / keywords</label>
            <input id="q2" name="q" defaultValue={defaultTitles} placeholder="e.g. Machine Learning Engineer" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="minScore2">Minimum match score</label>
            <input id="minScore2" name="minScore" type="number" min={0} max={100} defaultValue={40} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="max2">Max applications / run</label>
            <input id="max2" name="maxApplications" type="number" min={1} max={10} defaultValue={3} className="input" />
          </div>
        </div>

        <label className="mt-4 flex items-start gap-2 text-sm">
          <input type="checkbox" name="authorize" className="mt-0.5 h-4 w-4 accent-brick" />
          <span>
            <strong>I authorize Vaylo to submit applications on my behalf for this run.</strong>
            <span className="mt-0.5 block text-xs text-ink-muted">
              It fills supported forms and uploads your resume, then submits only when it can — pausing on
              sign-in, CAPTCHA, or any question it should not answer for you. Nothing is submitted without
              this authorization, an active paid plan, and the feature being enabled on this instance.
            </span>
          </span>
        </label>

        {!subscribed && (
          <p className="mt-3 rounded-md border border-stone-200 bg-surface-2 px-3 py-2 text-xs text-ink-muted">
            Auto-submit is a paid feature. Without an active plan this run will <strong>prepare</strong>
            {" "}applications (fill them) but not submit. <a className="underline" href="/app/settings/billing">Upgrade</a>.
          </p>
        )}

        <button type="submit" disabled={pending} className="btn-primary mt-4">
          {pending ? "Running…" : "Run auto-apply"}
        </button>
        {pending && <p className="mt-2 text-xs text-ink-muted">Opening pages, filling, and (if authorized) submitting — this can take a minute.</p>}
      </form>

      {state?.error && <div className="mt-4 rounded-md border border-danger/30 bg-brick-soft px-3 py-2 text-sm">{state.error}</div>}

      {state?.needsProfile && (
        <div className="mt-4 rounded-md border border-brick/30 bg-brick-soft px-4 py-3 text-sm">
          <strong>Set up your profile first.</strong>
          <span className="mt-1 block text-ink-muted">
            We match jobs to your skills and experience. Add a few skills or upload a resume, then run
            auto-apply. <a href="/app/profile" className="underline">Go to your profile →</a>
          </span>
        </div>
      )}

      {s && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`badge ${s.liveSubmit ? "text-success" : ""}`}>
              {s.liveSubmit ? "Live submit: ON" : "Live submit: off (prepare mode)"}
            </span>
            <span className="badge">{s.discovered} found</span>
            <span className="badge">{s.attempted} attempted</span>
            {s.confirmed > 0 && <span className="badge text-success">{s.confirmed} submitted</span>}
            {s.uncertain > 0 && <span className="badge text-warning">{s.uncertain} unconfirmed</span>}
            {s.prepared > 0 && <span className="badge">{s.prepared} filled</span>}
            {s.awaitingUser > 0 && <span className="badge text-warning">{s.awaitingUser} need you</span>}
            {s.failed > 0 && <span className="badge text-danger">{s.failed} failed</span>}
            <span className="badge">{s.skipped} skipped</span>
          </div>
          {!s.liveSubmit && s.liveSubmitBlockedReason && (
            <p className="mt-2 text-xs text-ink-muted">Prepare mode: {s.liveSubmitBlockedReason}</p>
          )}
          {(() => {
            const lowMatch = s.items.filter((it) => it.status === "skipped_low_match").length;
            const shown = s.items.filter((it) => it.status !== "skipped_low_match").slice(0, 25);
            return (
              <>
                {lowMatch > 0 && (
                  <p className="mt-3 text-sm text-ink-muted">
                    {lowMatch} job{lowMatch === 1 ? "" : "s"} skipped as a low match. Add more skills or
                    refine your target roles on your <a href="/app/profile" className="underline">profile</a> to
                    match more.
                  </p>
                )}
                {shown.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {shown.map((it, i) => {
                const lab = STATUS_LABEL[it.status] ?? { text: it.status, tone: "text-ink-muted" };
                return (
                  <li key={i} className="card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{it.title}</p>
                        <p className="truncate text-sm text-ink-muted">{it.company}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="font-semibold tabular-nums">{it.score}</span>
                        <span className="text-xs text-ink-muted"> / 100</span>
                        <div className={`text-xs ${lab.tone}`}>{lab.text}</div>
                      </div>
                    </div>
                    {it.reason && <p className="mt-2 text-xs text-ink-muted">{it.reason}</p>}
                  </li>
                );
                    })}
                  </ul>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
