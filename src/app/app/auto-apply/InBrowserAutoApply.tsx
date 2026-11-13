"use client";

import { useEffect, useRef, useState } from "react";

type Phase = "idle" | "running" | "done" | "error";

interface LogLine {
  kind: "info" | "filled" | "needs" | "blocked" | "manual" | "error";
  text: string;
}

interface ExtEvent {
  phase?: string;
  message?: string;
  count?: number;
  scanned?: number;
  irrelevant?: number;
  opening?: number;
  title?: string;
  url?: string;
  status?: string;
  reason?: string;
  filledCount?: number;
  needsUpload?: boolean;
  error?: string;
  summary?: {
    discovered: number;
    irrelevant: number;
    attempted: number;
    filled: number;
    needsInput: number;
    blocked: number;
    manual: number;
    failed: number;
  };
}

const APP = "jobflow-app";
const EXT = "jobflow-ext";

export function InBrowserAutoApply({ defaultTitles }: { defaultTitles: string }) {
  const [detected, setDetected] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [log, setLog] = useState<LogLine[]>([]);
  const [summary, setSummary] = useState<ExtEvent["summary"] | null>(null);
  const runId = useRef(0);

  // Detect the extension via its content-script bridge.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== window || e.origin !== window.location.origin) return;
      const d = e.data;
      if (!d || d.source !== EXT) return;
      if (d.type === "ready") setDetected(true);
      if (d.type === "progress") handleEvent(d.event as ExtEvent);
      if (d.type === "disconnected") setPhase((p) => (p === "running" ? "done" : p));
    }
    window.addEventListener("message", onMessage);
    window.postMessage({ source: APP, type: "ping" }, window.location.origin);
    const t = setTimeout(() => window.postMessage({ source: APP, type: "ping" }, window.location.origin), 600);
    return () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(t);
    };
  }, []);

  function add(line: LogLine) {
    setLog((l) => [...l, line]);
  }

  function handleEvent(ev: ExtEvent) {
    switch (ev.phase) {
      case "searching":
        add({ kind: "info", text: ev.message || "Searching Google…" });
        break;
      case "discovered":
        add({
          kind: "info",
          text: `Found ${ev.count} real posting(s)${ev.irrelevant ? `, skipped ${ev.irrelevant} homepage/duplicate link(s)` : ""} from ${ev.scanned} result(s). Opening the best matches…`,
        });
        break;
      case "ranked":
        add({ kind: "info", text: `Opening ${ev.opening} result(s) in a tab group…` });
        break;
      case "opened":
        add({ kind: "info", text: `Opening: ${ev.title}` });
        break;
      case "crawled":
        add({ kind: "info", text: `Scanned the page — found ${ev.count} role(s), ranking by fit…` });
        break;
      case "drilling":
        add({ kind: "info", text: `Opening best match: ${ev.title}` });
        break;
      case "following":
        add({ kind: "info", text: `Following the apply link to the form…` });
        break;
      case "result":
        if (ev.status === "filled")
          add({ kind: "filled", text: `✓ Filled ${ev.filledCount ?? ""} field(s): ${ev.title}. Review & submit.` });
        else if (ev.status === "needs_input")
          add({ kind: "needs", text: `◐ ${ev.title}: ${ev.reason || "filled some fields; needs your input."}` });
        else if (ev.status === "blocked")
          add({ kind: "blocked", text: `⚠ ${ev.title}: ${ev.reason || "sign-in / verification required — do it yourself."}` });
        else if (ev.status === "manual")
          add({ kind: "manual", text: `○ ${ev.title}: ${ev.reason || "left open for manual apply."}` });
        else add({ kind: "error", text: `× ${ev.title}: ${ev.reason || "could not apply."}` });
        break;
      case "done":
        setSummary(ev.summary ?? null);
        setPhase("done");
        break;
      case "error":
        add({ kind: "error", text: ev.error || "Something went wrong." });
        setPhase("error");
        break;
    }
  }

  function run(formData: FormData) {
    setLog([]);
    setSummary(null);
    setPhase("running");
    runId.current += 1;
    const config = {
      q: String(formData.get("q") ?? "").trim() || undefined,
      location: String(formData.get("location") ?? "").trim() || undefined,
      maxApplications: Number(formData.get("maxApplications")) || 3,
      mode: String(formData.get("mode")) === "portal" ? "portal" : "google",
    };
    window.postMessage({ source: APP, type: "autoapply-start", config, runId: runId.current }, window.location.origin);
  }

  return (
    <div>
      <form
        action={run}
        className="card p-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="q">Target titles / keywords</label>
            <input id="q" name="q" defaultValue={defaultTitles} placeholder="e.g. Machine Learning Engineer" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="location">Location</label>
            <input id="location" name="location" placeholder="Any" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="maxApplications">How many to open / run</label>
            <input id="maxApplications" name="maxApplications" type="number" min={1} max={8} defaultValue={3} className="input" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="mode">Where to search</label>
            <select id="mode" name="mode" defaultValue="google" className="input">
              <option value="google">Across the web (search by your titles)</option>
              <option value="portal">This company&apos;s careers page (the tab you&apos;re on)</option>
            </select>
            <p className="mt-1 text-xs text-ink-muted">
              Choose “careers page” when you’re already on a company’s jobs site — Vaylo reads its
              listings, ranks them against your profile, opens the best fit, and fills the form.
            </p>
          </div>
        </div>

        <p className="mt-4 text-xs text-ink-muted">
          This runs in <strong>your</strong> browser so you can watch: it finds real postings, follows the
          official apply link, and opens the most relevant ones into one labeled{" "}
          <strong>“Vaylo auto-apply” tab group</strong>. It <strong>autofills any real application form</strong>{" "}
          from your profile — leaving unknown or sensitive questions for you — and keeps each tab open to
          review. It <strong>never submits for you</strong>, and pauses on sign-in or CAPTCHA (it never
          enters credentials or bypasses verification).
        </p>

        {detected ? (
          <button type="submit" disabled={phase === "running"} className="btn-primary mt-4">
            {phase === "running" ? "Running in your browser…" : "Run in my browser"}
          </button>
        ) : (
          <div className="mt-4 rounded-md border border-brick/30 bg-brick-soft px-3 py-2 text-sm">
            The Vaylo extension isn’t detected in this browser.{" "}
            <a href="/app/settings/extension" className="underline">Install &amp; connect it</a> to run auto-apply
            in your own browser, then reload this page.
          </div>
        )}
      </form>

      {(log.length > 0 || phase !== "idle") && (
        <div className="card mt-4 p-5">
          <h3 className="font-semibold">Live run</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {log.map((l, i) => (
              <li
                key={i}
                className={
                  l.kind === "filled"
                    ? "text-success"
                    : l.kind === "error"
                      ? "text-danger"
                      : l.kind === "manual"
                        ? "text-ink"
                        : "text-ink-muted"
                }
              >
                {l.text}
              </li>
            ))}
            {phase === "running" && <li className="text-ink-muted">…working</li>}
          </ul>
          {summary && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="badge">{summary.discovered} found</span>
              <span className="badge">{summary.attempted} opened</span>
              <span className="badge text-success">{summary.filled} filled</span>
              {summary.needsInput > 0 && <span className="badge">{summary.needsInput} need you</span>}
              {summary.blocked > 0 && <span className="badge">{summary.blocked} blocked</span>}
              {summary.manual > 0 && <span className="badge">{summary.manual} manual</span>}
              {summary.failed > 0 && <span className="badge text-danger">{summary.failed} failed</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
