// Drains the user's QUEUED auto-apply tasks IN THEIR OWN BROWSER. When connected,
// the background worker polls GET /api/ext/tasks on an alarm, claims ONE task,
// opens it in a background tab, runs the same safe fill flow (animated cursor;
// NEVER submits — the user reviews and submits), and POSTs the real status back.
// Gentle by design: one task per tick, tabs opened inactive and grouped. If the
// user's browser is closed, nothing polls — tasks simply stay QUEUED server-side.
declare const chrome: any;

type Api = (path: string, init?: RequestInit) => Promise<Response>;

function waitForComplete(tabId: number, timeoutMs = 30000): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (id: number, info: any) => {
      if (id === tabId && info.status === "complete") finish();
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((t: any) => {
      if (t?.status === "complete") finish();
    });
    setTimeout(finish, timeoutMs);
  });
}

async function setBadge(text: string) {
  try {
    await chrome.action?.setBadgeText?.({ text });
    if (text) await chrome.action?.setBadgeBackgroundColor?.({ color: "#B84A3A" });
  } catch {
    /* badge is cosmetic */
  }
}

let queueGroupId: number | null = null;
async function groupTab(tabId: number) {
  try {
    if (queueGroupId == null) {
      queueGroupId = await chrome.tabs.group({ tabIds: [tabId] });
      await chrome.tabGroups.update(queueGroupId, { title: "Vaylo queue", color: "blue" });
    } else {
      await chrome.tabs.group({ groupId: queueGroupId, tabIds: [tabId] });
    }
  } catch {
    queueGroupId = null; // group may have been closed; recreate next time
  }
}

interface ReportExtra {
  stage?: string;
  recoveryUrl?: string;
  fieldsFilled?: number;
}
// Reports progress/outcome for a task (best-effort; never throws out).
async function report(api: Api, taskId: string, status: string, reason?: string, extra?: ReportExtra) {
  try {
    await api("/api/ext/tasks/result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, status, reason, ...extra }),
    });
  } catch {
    /* the task's lock will expire and it will be re-claimed later */
  }
}

// Claim and process ONE queued EXTENSION task. Returns true if it did work.
export async function processQueuedTask(api: Api, profile: unknown): Promise<boolean> {
  let claim: Response;
  try {
    claim = await api("/api/ext/tasks");
  } catch {
    return false;
  }
  if (!claim.ok) return false;
  const { task } = await claim.json();
  if (!task) return false;

  await setBadge("…");
  let tab: any;
  try {
    tab = await chrome.tabs.create({ url: task.url, active: false });
    await groupTab(tab.id);
    await report(api, task.id, "OPENED", "Opened in your browser.");
    await waitForComplete(tab.id);

    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    const out = await chrome.tabs.sendMessage(tab.id, { type: "jf-fill", profile });

    if (out?.blocked) {
      // Persist the stage + recovery URL so the user can finish verification and the
      // task resumes from here without restarting the run or duplicating anything.
      await report(api, task.id, "BLOCKED", out.reason || "Sign-in / verification required — do it yourself, then it resumes.", { stage: "blocked", recoveryUrl: tab?.url });
    } else if (out?.expired) {
      await report(api, task.id, "EXPIRED", out.reason || "This posting is closed/expired.");
    } else if (!out?.supported) {
      await report(api, task.id, "NEEDS_USER_ACTION", out?.reason || "No application form found — apply manually.");
    } else {
      const filled = (out.filled || []).length;
      const needs = (out.requiresAttention || 0) > 0 || out.needsUpload;
      await report(api, task.id, "APPLICATION_FORM_FOUND", "Application form detected.");
      // The extension NEVER submits — it fills and leaves it for the user to submit.
      await report(
        api,
        task.id,
        needs ? "NEEDS_USER_ACTION" : "FILLED_AND_VALIDATED",
        needs ? `Filled ${filled} field(s); attach your resume / answer the flagged questions, then submit.` : `Filled ${filled} field(s). Review and submit.`,
        { fieldsFilled: filled },
      );
    }
    return true;
  } catch (e: any) {
    if (task?.id) await report(api, task.id, "FAILED", String(e?.message ?? e));
    if (tab?.id) await chrome.tabs.remove(tab.id).catch(() => {});
    return true;
  } finally {
    await setBadge("");
  }
}

// One poll tick: fetch the approved profile, then process a single task (gentle).
export async function pollTasksOnce(api: Api): Promise<void> {
  let profile: unknown;
  try {
    const pr = await api("/api/ext/profile");
    if (!pr.ok) return; // not connected / expired
    profile = (await pr.json()).profile;
  } catch {
    return;
  }
  await processQueuedTask(api, profile);
}
