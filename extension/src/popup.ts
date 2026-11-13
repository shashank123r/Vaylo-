// Popup / side panel UI. Pure DOM; all privileged work happens in the background
// worker. Shows connection status, quota, detected fields, and an explicit
// outcome-reporting step. Never auto-submits.
declare const chrome: any;
// Baked in at build time (APP_URL). The backend origin is NOT user-configurable:
// it is invisible in the UI, so users never see or type it.
declare const __APP_URL__: string;
const BASE_URL = typeof __APP_URL__ !== "undefined" ? __APP_URL__ : "http://localhost:3000";

const $ = (id: string) => document.getElementById(id)!;
const send = (msg: any): Promise<any> => new Promise((res) => chrome.runtime.sendMessage(msg, res));
const esc = (s: string) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

let currentJobId: string | null = null;
let currentClientRef: string | null = null;

function quotaLine(q: any): string {
  if (!q) return "";
  if (q.subscribed) {
    const left = Math.max(0, q.remaining ?? 0);
    return `<span class="ok">Pro — ${left} of ${q.limit} successful today</span>` +
      (left === 0 ? ` · <span class="warn">daily limit reached, resets at midnight IST</span>` : "");
  }
  const left = Math.max(0, q.limit - q.used);
  return `Free submissions left: <strong>${left}</strong> of ${q.limit}` +
    (left === 0 ? ` · <span class="warn">upgrade to submit more</span>` : "");
}

async function refreshStatus() {
  const r = await send({ type: "status" });
  if (r?.connected) {
    $("connected").style.display = "block";
    $("disconnected").style.display = "none";
    $("acct").innerHTML = `Connected as <strong>${esc(r.email)}</strong>`;
    $("quota").innerHTML = quotaLine(r.quota);
  } else {
    $("connected").style.display = "none";
    $("disconnected").style.display = "block";
  }
}

// Be forgiving about what the user pastes: a copy can bring whitespace, surrounding
// text, or a stray non-ASCII character (smart quote, non-breaking space) that would
// otherwise break the Authorization header ("non ISO-8859-1 code point"). Extract the
// clean pairing token (jfx_ + base64url chars); fall back to stripping non-printable
// ASCII so we never send a header-breaking value.
function cleanCode(raw: string): string {
  const m = raw.match(/jfx_[A-Za-z0-9_-]+/);
  if (m) return m[0];
  return raw.replace(/[^\x21-\x7E]/g, "").trim();
}

async function connect() {
  const token = cleanCode(($("code") as HTMLInputElement).value);
  if (!token) return;
  if (!/^jfx_[A-Za-z0-9_-]+$/.test(token)) {
    $("connectMsg").innerHTML = `<span class="warn">That doesn't look like a pairing code. Use the Copy button on the Vaylo page, then paste here.</span>`;
    return;
  }
  $("connectMsg").textContent = "Connecting…";
  // The backend origin is baked in (BASE_URL); it is not sent from the UI.
  const r = await send({ type: "connect", token, baseUrl: BASE_URL });
  if (r?.ok) {
    $("connectMsg").textContent = "";
    await refreshStatus();
  } else {
    $("connectMsg").innerHTML = `<span class="warn">${esc(r?.error || "Connection failed.")}</span>`;
  }
}

async function fillCurrentTab() {
  $("result").innerHTML = "Reading the page…";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const r = await send({ type: "fill", tabId: tab.id });
  if (!r?.ok) return void ($("result").innerHTML = `<span class="warn">${esc(r?.error || "Failed.")}</span>`);
  if (!r.supported) {
    $("result").innerHTML =
      `<div class="card"><strong>Unsupported page.</strong><p>${esc(r.reason || "This is not a supported application form.")} You can still apply manually.</p></div>`;
    return;
  }
  currentJobId = r.jobId ?? null;
  currentClientRef = (crypto as any).randomUUID();

  const filled = (r.filled || []).map((f: any) => `<li class="ok">${esc(f.label)}</li>`).join("");
  const skipped = (r.skipped || []).map((s: any) => `<li>${esc(s.label)} — <span class="muted">${esc(s.reason)}</span></li>`).join("");
  const failed = (r.failed || []).map((s: any) => `<li class="warn">${esc(s.label)} — ${esc(s.reason)}</li>`).join("");
  const errors = (r.validationErrors || [])
    .map((e: any) => `<li class="warn">${esc(e.label || "Form")} — ${esc(e.message)}</li>`)
    .join("");
  const fileNote = r.fileField
    ? `<p class="muted">Resume upload detected (“${esc(r.fileField.label)}”). For security, browsers require you to attach the file yourself.</p>`
    : "";
  const stepNote = r.multiStep
    ? `<div class="card" style="border-color:var(--warn)"><strong>Multi-step form.</strong> Fill this step, then click “${esc(r.nav?.nextLabel || "Next")}” on the page and run <em>Fill this application</em> again for the next step. Your progress is kept.</div>`
    : "";

  $("result").innerHTML = `
    ${stepNote}
    <div class="card">
      <div class="muted">${esc(r.ats)} · ${esc(r.title || "")} ${r.company ? "· " + esc(r.company) : ""}</div>
      <h3>Filled ${(r.filled || []).length} field(s)</h3>
      <ul>${filled || "<li class='muted'>None</li>"}</ul>
      ${failed ? `<h4>Could not fill</h4><ul>${failed}</ul>` : ""}
      ${errors ? `<h4>The site reported errors</h4><ul>${errors}</ul>` : ""}
      ${skipped ? `<h4>Left for you to review (${(r.skipped || []).length})</h4><ul>${skipped}</ul>` : ""}
      ${fileNote}
      <p class="muted">Review the form on the page, attach your resume, and submit it yourself. Vaylo never clicks submit for you.</p>
      ${currentJobId ? `<a class="link" href="${BASE_URL}/app/jobs/${currentJobId}" target="_blank">Open full workspace →</a>` : ""}
    </div>
    <div class="card">
      <h4>After you submit on the site</h4>
      <div class="row">
        <button data-outcome="CONFIRMED" class="btn primary">It was confirmed</button>
        <button data-outcome="FAILED" class="btn">It failed</button>
        <button data-outcome="UNCERTAIN" class="btn">Not sure</button>
      </div>
      <div id="reportMsg" class="muted"></div>
    </div>`;

  document.querySelectorAll("[data-outcome]").forEach((b) =>
    b.addEventListener("click", () => report((b as HTMLElement).dataset.outcome!)),
  );
}

async function report(outcome: string) {
  if (!currentJobId || !currentClientRef) {
    $("reportMsg").innerHTML = `<span class="warn">No job linked; open the workspace to record this.</span>`;
    return;
  }
  $("reportMsg").textContent = "Recording…";
  const r = await send({ type: "report", payload: { jobId: currentJobId, clientRef: currentClientRef, outcome } });
  if (!r?.ok) {
    $("reportMsg").innerHTML = `<span class="warn">${esc(r?.result?.error || r?.error || "Failed to record.")}</span>`;
    return;
  }
  const res = r.result;
  if (res.quotaExceeded) {
    $("reportMsg").innerHTML = `<span class="warn">Recorded, but this exceeds your free limit. Upgrade to count paid submissions.</span>`;
  } else if (res.idempotent) {
    $("reportMsg").innerHTML = `<span class="muted">Already recorded.</span>`;
  } else if (res.counted) {
    $("reportMsg").innerHTML = `<span class="ok">Confirmed and recorded.</span>`;
  } else {
    $("reportMsg").innerHTML = `<span class="muted">Recorded as ${esc(res.outcome)}. No quota used.</span>`;
  }
  await refreshStatus();
}

document.addEventListener("DOMContentLoaded", () => {
  $("connectBtn").addEventListener("click", connect);
  $("fillBtn").addEventListener("click", fillCurrentTab);
  $("disconnectBtn").addEventListener("click", async () => {
    await send({ type: "disconnect" });
    await refreshStatus();
  });
  refreshStatus();
});
