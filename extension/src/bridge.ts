// Content script injected into the JobFlow app pages. It is the only channel
// between the web page and the extension: the page cannot open tabs or drive the
// browser itself, so it asks the extension (which can) to run auto-apply, and the
// extension streams progress back. No tokens or privileged data cross this bridge —
// only a run request and status updates the user can already see.
declare const chrome: any;

const EXT = "jobflow-ext";
const APP = "jobflow-app";

function announce() {
  window.postMessage({ source: EXT, type: "ready", version: chrome.runtime.getManifest().version }, window.location.origin);
}

// Accept only messages posted by THIS page to itself (same window + same origin),
// carrying our app marker. event.source===window already excludes cross-origin
// frames; the origin check is defense-in-depth.
function sanitizeConfig(raw: any) {
  const c = raw && typeof raw === "object" ? raw : {};
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
  const n = Number(c.maxApplications);
  return {
    q: str(c.q, 200),
    location: str(c.location, 120),
    maxApplications: Number.isFinite(n) ? Math.min(8, Math.max(1, Math.trunc(n))) : undefined,
  };
}

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const data = event.data;
  if (!data || data.source !== APP) return;

  if (data.type === "ping") {
    announce();
    return;
  }

  if (data.type === "autoapply-start") {
    const runId = typeof data.runId === "number" || typeof data.runId === "string" ? data.runId : 0;
    const port = chrome.runtime.connect({ name: "autoapply" });
    port.onMessage.addListener((m: any) => {
      window.postMessage({ source: EXT, type: "progress", event: m, runId }, window.location.origin);
    });
    port.onDisconnect.addListener(() => {
      window.postMessage({ source: EXT, type: "disconnected", runId }, window.location.origin);
    });
    port.postMessage({ type: "start", config: sanitizeConfig(data.config) });
  }
});

// Announce on load so the page can enable the "Run in my browser" control.
announce();
