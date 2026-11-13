"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Durable, server-side autonomous run: the server queues tasks and works them out of
// process (the server worker for supported public ATS; the user's extension for the
// rest). The user can start a run, leave, and come back to live statuses — the state
// lives in Postgres, not this page. All submission gating is server-side; this UI
// only sets the per-run authorization request.

const LS_KEY = "vaylo.autorun.runId";

type TaskStatus =
  | "QUEUED" | "CLAIMED" | "OPENED" | "AUTOFILLED" | "NEEDS_USER" | "SUBMITTED" | "UNCERTAIN" | "FAILED"
  | "DISCOVERED" | "MATCHED" | "APPLICATION_FORM_FOUND" | "FILLED_AND_VALIDATED" | "SUBMITTING"
  | "SUBMITTED_CONFIRMED" | "NEEDS_USER_ACTION" | "BLOCKED" | "EXPIRED";
// Statuses that need no more automatic work (done, or waiting on the user).
const TERMINAL: TaskStatus[] = ["SUBMITTED", "SUBMITTED_CONFIRMED", "FAILED", "EXPIRED", "NEEDS_USER", "NEEDS_USER_ACTION", "BLOCKED", "UNCERTAIN"];

const BADGE: Record<TaskStatus, { label: string; cls: string }> = {
  QUEUED: { label: "Queued", cls: "badge" },
  DISCOVERED: { label: "Discovered", cls: "badge" },
  MATCHED: { label: "Matched", cls: "badge" },
  CLAIMED: { label: "Starting", cls: "badge" },
  OPENED: { label: "Opened", cls: "badge" },
  APPLICATION_FORM_FOUND: { label: "Form found", cls: "badge" },
  AUTOFILLED: { label: "Filled", cls: "badge-success" },
  FILLED_AND_VALIDATED: { label: "Filled & validated", cls: "badge-success" },
  SUBMITTING: { label: "Submitting…", cls: "badge" },
  NEEDS_USER: { label: "Needs you", cls: "badge-warning" },
  NEEDS_USER_ACTION: { label: "Needs you", cls: "badge-warning" },
  BLOCKED: { label: "Blocked (sign-in/CAPTCHA)", cls: "badge-warning" },
  EXPIRED: { label: "Closed/expired", cls: "badge" },
  SUBMITTED: { label: "Submitted ✓", cls: "badge-success" },
  SUBMITTED_CONFIRMED: { label: "Submitted ✓ (confirmed)", cls: "badge-success" },
  UNCERTAIN: { label: "Unconfirmed", cls: "badge-warning" },
  FAILED: { label: "Failed", cls: "badge text-danger" },
};

interface RunItem {
  id: string;
  title: string;
  company: string;
  channel: "SERVER" | "EXTENSION";
  status: TaskStatus;
  reason?: string | null;
  evidence?: string | null;
  jobUrl: string;
}
interface RunFunnel {
  discovered: number;
  eligible: number;
  opened: number;
  formsReached: number;
  fieldsVerified: number;
  resumesUploaded: number;
  attempted: number;
  confirmed: number;
}
interface RunStatus {
  runId: string;
  total: number;
  byStatus: Record<string, number>;
  funnel: RunFunnel;
  items: RunItem[];
}
interface EnqueueResult {
  runId: string;
  liveSubmit: boolean;
  liveSubmitBlockedReason?: string;
  queued: number;
  deduped: number;
  skipped: number;
  channels: { server: number; extension: number };
}

export function AutonomousRun({ defaultTitles, subscribed }: { defaultTitles: string; subscribed: boolean }) {
  const [runId, setRunId] = useState<string | null>(null);
  const [enqueue, setEnqueue] = useState<EnqueueResult | null>(null);
  const [status, setStatus] = useState<RunStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore the last run id so "come back later" works across refreshes.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) setRunId(saved);
    } catch {
      /* private mode / blocked storage: fine, just no restore */
    }
  }, []);

  const poll = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/autoapply/status?runId=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!res.ok) return;
      const data: RunStatus = await res.json();
      setStatus(data);
      const anyActive = data.items.some((i) => !TERMINAL.includes(i.status) && i.status !== "NEEDS_USER" && i.status !== "UNCERTAIN");
      if (anyActive) timer.current = setTimeout(() => poll(id), 4000);
    } catch {
      /* transient; the next manual refresh will catch up */
    }
  }, []);

  useEffect(() => {
    if (!runId) return;
    poll(runId);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [runId, poll]);

  async function start(formData: FormData) {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const exclusionsRaw = String(formData.get("exclusions") ?? "").trim();
      const body = {
        q: String(formData.get("q") ?? "").trim() || undefined,
        location: String(formData.get("location") ?? "").trim() || undefined,
        minScore: Number(formData.get("minScore")) || 40,
        maxApplications: Number(formData.get("maxApplications")) || 3,
        authorize: formData.get("authorize") === "on",
        exclusions: exclusionsRaw ? exclusionsRaw.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      };
      const res = await fetch("/api/autoapply/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start the run.");
      setEnqueue(data as EnqueueResult);
      setRunId(data.runId);
      try {
        localStorage.setItem(LS_KEY, data.runId);
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5" aria-label="Autonomous run">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-ink">Autonomous run (server)</h2>
        <span className="badge">Queued &amp; durable</span>
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        The server queues each job and works it in the background. Start it, close this tab, and come back —
        the statuses below are saved. Supported public forms (Greenhouse, Lever, Ashby) are handled
        server-side; everything else is filled in your browser by the extension when it is online.
      </p>

      <form action={start} className="mt-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="aq">Target titles / keywords</label>
            <input id="aq" name="q" defaultValue={defaultTitles} placeholder="e.g. Backend Engineer" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="aloc">Location</label>
            <input id="aloc" name="location" placeholder="Remote, Bengaluru…" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="amax">Max applications / run</label>
            <input id="amax" name="maxApplications" type="number" min={1} max={10} defaultValue={3} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="ascore">Minimum match score</label>
            <input id="ascore" name="minScore" type="number" min={0} max={100} defaultValue={40} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="aexcl">Exclude (comma-separated)</label>
            <input id="aexcl" name="exclusions" placeholder="staffing, agency…" className="input" />
          </div>
        </div>

        <label className="mt-4 flex items-start gap-2 text-sm">
          <input type="checkbox" name="authorize" className="mt-0.5 h-4 w-4 accent-brick" />
          <span>
            <strong>I authorize Vaylo to submit applications on my behalf for this run.</strong>
            <span className="mt-0.5 block text-xs text-ink-muted">
              Server-side submission happens only on supported public forms, and only when your plan allows
              it, the feature is enabled on this instance, and you authorize it here. Without all of those it
              fills/prepares applications instead. Nothing is ever counted as submitted without an on-page
              confirmation, and it always pauses for sign-in, CAPTCHA, or sensitive questions.
            </span>
          </span>
        </label>

        {!subscribed && (
          <p className="mt-3 rounded-md border border-stone-200 bg-surface-2 px-3 py-2 text-xs text-ink-muted">
            On the free plan this run never submits for you: tasks are queued and filled in your browser by
            the extension, and you submit each one yourself.{" "}
            <a className="underline" href="/app/settings/billing">Upgrade to Pro</a> for server-side submission on supported forms.
          </p>
        )}

        <button type="submit" disabled={busy} className="btn-primary mt-4">
          {busy ? "Queueing…" : "Queue autonomous run"}
        </button>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </form>

      {enqueue && (
        <p className="mt-4 text-sm text-ink-muted">
          Run <code className="rounded bg-canvas px-1">{enqueue.runId}</code> queued {enqueue.queued} job(s)
          {enqueue.channels.server > 0 && ` · ${enqueue.channels.server} server`}
          {enqueue.channels.extension > 0 && ` · ${enqueue.channels.extension} via your browser`}.
          {!enqueue.liveSubmit && enqueue.liveSubmitBlockedReason && (
            <span className="mt-1 block text-xs">Submission off this run: {enqueue.liveSubmitBlockedReason}</span>
          )}
        </p>
      )}

      {status && status.total > 0 && (
        <div className="mt-5">
          <h3 className="section-label">Progress</h3>
          <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-muted sm:grid-cols-4">
            {([
              ["Discovered", status.funnel.discovered],
              ["Opened", status.funnel.opened],
              ["Forms reached", status.funnel.formsReached],
              ["Fields verified", status.funnel.fieldsVerified],
              ["Resumes uploaded", status.funnel.resumesUploaded],
              ["Attempted", status.funnel.attempted],
              ["Confirmed", status.funnel.confirmed],
            ] as [string, number][]).map(([label, n]) => (
              <span key={label}>
                <strong className="tabular-nums text-ink">{n}</strong> {label.toLowerCase()}
              </span>
            ))}
          </div>
          <h3 className="section-label">Status</h3>
          <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200">
            {status.items.map((it) => {
              const b = BADGE[it.status] ?? BADGE.QUEUED;
              return (
                <li key={it.id} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{it.title}</p>
                    <p className="truncate text-xs text-ink-muted">
                      {it.company} · {it.channel === "SERVER" ? "server" : "your browser"}
                      {it.reason ? ` — ${it.reason}` : ""}
                    </p>
                  </div>
                  <span className={`${b.cls} shrink-0`}>{b.label}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-ink-faint">
            {Object.entries(status.byStatus).map(([k, v]) => `${v} ${BADGE[k as TaskStatus]?.label ?? k.toLowerCase()}`).join(" · ")}
          </p>
        </div>
      )}
    </section>
  );
}
