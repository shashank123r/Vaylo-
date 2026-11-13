// Background service worker. Holds the pairing token (in extension storage, not
// in any page), talks to the JobFlow backend, and coordinates the content script.
// The token is never injected into the page or sent to third-party sites.
import { runAutoApply } from "./autoapply-bg";
import { pollTasksOnce } from "./taskpoller";

declare const chrome: any;

// Periodic polling for queued server-created tasks, done via chrome.alarms so it
// survives the service worker being suspended. One task per tick (gentle); only
// runs while the extension is connected (a token is stored).
const TASK_ALARM = "vaylo-task-poll";
const TASK_POLL_MINUTES = 1;

async function ensureTaskPolling() {
  const { token } = await chrome.storage.local.get(["token"]);
  if (!token) return; // not connected -> don't poll
  try {
    const existing = await chrome.alarms?.get?.(TASK_ALARM);
    if (!existing) await chrome.alarms?.create?.(TASK_ALARM, { periodInMinutes: TASK_POLL_MINUTES });
  } catch {
    /* alarms unavailable: fall back to no background polling */
  }
}

async function stopTaskPolling() {
  try {
    await chrome.alarms?.clear?.(TASK_ALARM);
  } catch {
    /* ignore */
  }
}

chrome.alarms?.onAlarm?.addListener((alarm: any) => {
  if (alarm?.name !== TASK_ALARM) return;
  void pollTasksOnce(api);
});

// Re-arm polling when the browser starts or the extension loads, if still paired.
chrome.runtime?.onStartup?.addListener?.(() => void ensureTaskPolling());
chrome.runtime?.onInstalled?.addListener?.(() => void ensureTaskPolling());
// Replaced at build time with the deployed app origin (APP_URL); defaults to dev.
declare const __APP_URL__: string;
const DEFAULT_BASE = typeof __APP_URL__ !== "undefined" ? __APP_URL__ : "http://localhost:3000";

async function cfg(): Promise<{ baseUrl: string; token?: string }> {
  const { baseUrl, token } = await chrome.storage.local.get(["baseUrl", "token"]);
  return { baseUrl: baseUrl || DEFAULT_BASE, token };
}

async function api(path: string, init?: RequestInit): Promise<Response> {
  const { baseUrl, token } = await cfg();
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(baseUrl + path, { ...init, headers });
}

async function doFill(tabId: number) {
  const pr = await api("/api/ext/profile");
  if (pr.status === 401) return { ok: false, error: "Not connected. Pair the extension first." };
  if (!pr.ok) return { ok: false, error: `Backend error (${pr.status}).` };
  const { profile, quota } = await pr.json();

  const tab = await chrome.tabs.get(tabId);
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  const out = await chrome.tabs.sendMessage(tabId, { type: "jf-fill", profile });
  if (!out?.supported) return { ok: true, supported: false, url: tab.url, reason: out?.reason };

  let jobId: string | null = null;
  try {
    const jr = await api("/api/ext/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: out.company || "Unknown",
        title: out.title || "Unknown",
        url: tab.url,
        source: out.ats,
      }),
    });
    if (jr.ok) jobId = (await jr.json()).jobId;
  } catch {
    /* job upsert is best-effort; filling still happened */
  }
  return { ok: true, supported: true, jobId, quota, ...out };
}

// Long-lived connection used to stream auto-apply progress to the app page bridge
// (and to the side panel). Runs the whole flow in the user's own browser.
chrome.runtime.onConnect.addListener((port: any) => {
  if (port.name !== "autoapply") return;
  port.onMessage.addListener((msg: any) => {
    if (msg?.type !== "start") return;
    runAutoApply(api, msg.config || {}, (event) => {
      try {
        port.postMessage(event);
      } catch {
        /* port closed */
      }
    })
      .catch((e: any) => {
        try {
          port.postMessage({ phase: "error", error: String(e?.message ?? e) });
        } catch {
          /* ignore */
        }
      })
      .finally(() => {
        try {
          port.disconnect();
        } catch {
          /* ignore */
        }
      });
  });
});

chrome.runtime.onMessage.addListener((msg: any, _sender: any, sendResponse: (r: any) => void) => {
  (async () => {
    try {
      if (msg.type === "connect") {
        // Defense in depth: extract the clean token so a stray non-ASCII char from a
        // paste can never reach the Authorization header (which must be ISO-8859-1).
        const raw = String(msg.token ?? "");
        const token = raw.match(/jfx_[A-Za-z0-9_-]+/)?.[0] ?? raw.replace(/[^\x21-\x7E]/g, "").trim();
        await chrome.storage.local.set({ baseUrl: msg.baseUrl || DEFAULT_BASE, token });
        const r = await api("/api/ext/profile");
        if (!r.ok) {
          await chrome.storage.local.remove("token");
          throw new Error(r.status === 401 ? "Invalid or expired pairing code." : `Backend error (${r.status}).`);
        }
        const data = await r.json();
        void ensureTaskPolling(); // start draining queued tasks now that we're paired
        sendResponse({ ok: true, email: data.profile.email, quota: data.quota });
      } else if (msg.type === "status") {
        const { token } = await cfg();
        if (!token) return sendResponse({ ok: true, connected: false });
        const r = await api("/api/ext/profile");
        if (!r.ok) return sendResponse({ ok: true, connected: false });
        const data = await r.json();
        void ensureTaskPolling(); // re-arm polling if the SW was restarted
        sendResponse({ ok: true, connected: true, email: data.profile.email, quota: data.quota });
      } else if (msg.type === "disconnect") {
        await chrome.storage.local.remove("token");
        await stopTaskPolling();
        sendResponse({ ok: true });
      } else if (msg.type === "fill") {
        sendResponse(await doFill(msg.tabId));
      } else if (msg.type === "report") {
        const r = await api("/api/ext/applications/result", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(msg.payload),
        });
        const data = await r.json();
        sendResponse({ ok: r.ok, status: r.status, result: data });
      } else {
        sendResponse({ ok: false, error: "Unknown message" });
      }
    } catch (e: any) {
      sendResponse({ ok: false, error: String(e?.message ?? e) });
    }
  })();
  return true; // keep the message channel open for the async response
});
