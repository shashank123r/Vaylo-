"use client";

import { useState } from "react";

export function PairingPanel({ initialConnected }: { initialConnected: boolean }) {
  const [token, setToken] = useState<string | null>(null);
  const [connected, setConnected] = useState(initialConnected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Copy that also works over plain HTTP. navigator.clipboard is only available in a
  // secure context (HTTPS/localhost); on an http:// host it is undefined, so we fall
  // back to a hidden textarea + execCommand so the Copy button never silently fails.
  function copyToken(value: string) {
    const done = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    };
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(value).then(done, () => fallbackCopy(value, done));
        return;
      }
    } catch {
      /* fall through */
    }
    fallbackCopy(value, done);
  }
  function fallbackCopy(value: string, done: () => void) {
    try {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      done();
    } catch {
      setError("Couldn't copy automatically — tap the code, select all, and copy it manually.");
    }
  }

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/extension/pair", { method: "POST" });
      if (!res.ok) throw new Error("Could not generate a code. Try signing in again.");
      const data = await res.json();
      setToken(data.token);
      setConnected(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/extension/revoke", { method: "POST" });
      if (!res.ok) throw new Error("Could not revoke.");
      setToken(null);
      setConnected(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Pairing</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Status:{" "}
            {connected ? (
              <span className="text-success">a pairing code is active</span>
            ) : (
              <span className="text-ink-muted">not paired</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={generate} disabled={busy} className="btn-primary">
            {connected ? "Regenerate code" : "Generate pairing code"}
          </button>
          {connected && (
            <button onClick={revoke} disabled={busy} className="btn-secondary">
              Revoke
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-danger/30 bg-brick-soft px-3 py-2 text-sm">{error}</div>
      )}

      {token && (
        <div className="mt-4">
          <p className="text-sm font-medium">Your pairing code — click Copy, then paste it into the extension:</p>
          <div className="mt-2 flex gap-2">
            <input
              readOnly
              value={token}
              onFocus={(e) => e.currentTarget.select()}
              onClick={(e) => e.currentTarget.select()}
              className="flex-1 rounded-md border border-stone-300 bg-surface-2 px-3 py-2 font-mono text-sm"
              aria-label="Pairing code"
            />
            <button className="btn-primary shrink-0" onClick={() => copyToken(token)}>
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            Paste the whole code (starts with <code>jfx_</code>). You stay paired after this — no need to redo
            it unless you revoke here or reinstall the extension. Treat it like a password.
          </p>
        </div>
      )}
    </div>
  );
}
